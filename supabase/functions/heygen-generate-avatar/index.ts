// heygen-generate-avatar
// Kicks off HeyGen avatar-video renders for one or more storyboard scenes using
// the user's OWN avatar + voice clone. Async: HeyGen renders in the background and
// notifies heygen-render-callback via webhook (mapped back by `callback_id`).
//
// Request body:
// {
//   organization_id?: uuid,
//   ai_creative_id?:  uuid,
//   avatar_id?: string,        // falls back to HEYGEN_AVATAR_ID secret
//   voice_id?:  string,        // falls back to HEYGEN_VOICE_ID  secret
//   background?: string,       // hex (default green-screen '#00FF00' for chroma-key) | 'transparent'
//   dimension?: { width:number, height:number },
//   scenes: [{ ref?: string, input_text: string }]   // OR a single { input_text }
// }
//
// NOTE ON API VERSION: this calls the STABLE v2 generate endpoint
// (https://api.heygen.com/v2/video/generate), supported through 2026-10-31 and with
// a schema we can write correctly today. To move to the v3 "Digital Twin" endpoint,
// change ONLY buildHeyGenRequest() + the fetch URL below — nothing else.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface Scene { ref?: string; input_text: string }

// ---- The one place to swap for v3 Digital Twin ----
function buildHeyGenRequest(opts: {
  avatar_id: string; voice_id?: string; input_text: string;
  background: string; width: number; height: number; callback_id: string;
}) {
  const url = "https://api.heygen.com/v2/video/generate";
  const body = {
    video_inputs: [
      {
        character: { type: "avatar", avatar_id: opts.avatar_id, avatar_style: "normal" },
        voice: { type: "text", input_text: opts.input_text, ...(opts.voice_id ? { voice_id: opts.voice_id } : {}) },
        background:
          opts.background === "transparent"
            ? { type: "transparent" }
            : { type: "color", value: opts.background },
      },
    ],
    dimension: { width: opts.width, height: opts.height },
    // HeyGen echoes callback_id back in the webhook payload -> we map it to our row.
    callback_id: opts.callback_id,
  };
  return { url, body };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const HEYGEN_API_KEY = Deno.env.get("HEYGEN_API_KEY");
    if (!HEYGEN_API_KEY) return json({ ok: false, error: "Missing HEYGEN_API_KEY secret" }, 400);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const body = await req.json().catch(() => ({}));
    const avatar_id = body.avatar_id || Deno.env.get("HEYGEN_AVATAR_ID");
    const voice_id = body.voice_id || Deno.env.get("HEYGEN_VOICE_ID");
    if (!avatar_id) return json({ ok: false, error: "Missing avatar_id (and no HEYGEN_AVATAR_ID secret)" }, 400);

    const scenes: Scene[] = Array.isArray(body.scenes)
      ? body.scenes
      : body.input_text
      ? [{ input_text: body.input_text }]
      : [];
    if (scenes.length === 0) return json({ ok: false, error: "Provide scenes[] or input_text" }, 400);

    const background = body.background || "#00FF00"; // green screen -> chroma-key in Creatomate
    const width = body.dimension?.width ?? 1080;
    const height = body.dimension?.height ?? 1920;

    const callbackUrl = `${SUPABASE_URL}/functions/v1/heygen-render-callback`;
    const results: any[] = [];

    for (const scene of scenes) {
      if (!scene.input_text?.trim()) continue;

      // 1) create the tracking row first so we have a stable id to use as callback_id
      const { data: jobRow, error: insErr } = await supabase
        .from("heygen_jobs")
        .insert({
          organization_id: body.organization_id ?? null,
          ai_creative_id: body.ai_creative_id ?? null,
          scene_ref: scene.ref ?? null,
          avatar_id,
          voice_id: voice_id ?? null,
          input_text: scene.input_text,
          status: "pending",
        })
        .select("id")
        .single();

      if (insErr || !jobRow) {
        results.push({ scene: scene.ref, ok: false, error: insErr?.message || "row insert failed" });
        continue;
      }

      // 2) ask HeyGen to render
      const { url, body: hgBody } = buildHeyGenRequest({
        avatar_id, voice_id, input_text: scene.input_text,
        background, width, height, callback_id: jobRow.id,
      });

      const hgRes = await fetch(url, {
        method: "POST",
        headers: { "X-Api-Key": HEYGEN_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify(hgBody),
      });
      const hgJson = await hgRes.json().catch(() => ({}));
      const heygenVideoId = hgJson?.data?.video_id ?? hgJson?.video_id ?? null;

      if (!hgRes.ok || !heygenVideoId) {
        await supabase.from("heygen_jobs").update({
          status: "failed",
          error: `HeyGen create failed: ${hgRes.status} ${JSON.stringify(hgJson)}`,
          request_payload: hgBody,
        }).eq("id", jobRow.id);
        results.push({ scene: scene.ref, job_id: jobRow.id, ok: false, error: hgJson?.error || hgRes.status });
        continue;
      }

      await supabase.from("heygen_jobs").update({
        status: "processing",
        heygen_video_id: heygenVideoId,
        request_payload: hgBody,
      }).eq("id", jobRow.id);

      results.push({ scene: scene.ref, job_id: jobRow.id, heygen_video_id: heygenVideoId, ok: true });
    }

    return json({ ok: true, callback_url: callbackUrl, jobs: results });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
