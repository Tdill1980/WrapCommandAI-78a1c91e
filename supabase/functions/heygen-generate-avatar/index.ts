// heygen-generate-avatar
// Starts HeyGen avatar-video renders using the user's OWN avatar + voice.
// Two voice modes per scene:
//   - audio-driven (recommended when you have a good avatar but no good voice clone):
//       provide `audio_url` -> the avatar lip-syncs to YOUR real recording (sounds exactly like you)
//   - text-to-speech: provide `input_text` (+ optional voice_id) -> avatar speaks a script
// Async; HeyGen notifies heygen-render-callback via webhook (mapped by callback_id).
// Uses the STABLE v2 generate endpoint -- to move to v3 Digital Twin, change ONLY
// buildHeyGenRequest() + the fetch URL.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface Scene { ref?: string; input_text?: string; audio_url?: string }

function buildHeyGenRequest(opts: {
  avatar_id: string; voice_id?: string; input_text?: string; audio_url?: string;
  background: string; width: number; height: number; callback_id: string;
}) {
  const url = "https://api.heygen.com/v2/video/generate";
  // audio-driven (your real voice) takes precedence over TTS when provided
  const voice = opts.audio_url
    ? { type: "audio", audio_url: opts.audio_url }
    : { type: "text", input_text: opts.input_text ?? "", ...(opts.voice_id ? { voice_id: opts.voice_id } : {}) };
  const body = {
    video_inputs: [{
      character: { type: "avatar", avatar_id: opts.avatar_id, avatar_style: "normal" },
      voice,
      background: opts.background === "transparent" ? { type: "transparent" } : { type: "color", value: opts.background },
    }],
    dimension: { width: opts.width, height: opts.height },
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
      : (body.input_text || body.audio_url) ? [{ input_text: body.input_text, audio_url: body.audio_url }] : [];
    if (scenes.length === 0) return json({ ok: false, error: "Provide scenes[] with input_text or audio_url" }, 400);

    const background = body.background || "#00FF00";
    const width = body.dimension?.width ?? 1080;
    const height = body.dimension?.height ?? 1920;
    const callbackUrl = `${SUPABASE_URL}/functions/v1/heygen-render-callback`;
    const results: any[] = [];

    for (const scene of scenes) {
      const hasVoice = scene.audio_url?.trim() || scene.input_text?.trim();
      if (!hasVoice) continue;

      const { data: jobRow, error: insErr } = await supabase.from("heygen_jobs").insert({
        organization_id: body.organization_id ?? null,
        ai_creative_id: body.ai_creative_id ?? null,
        scene_ref: scene.ref ?? null,
        avatar_id, voice_id: voice_id ?? null,
        input_text: scene.audio_url ? `[audio] ${scene.audio_url}` : scene.input_text!,
        status: "pending",
      }).select("id").single();
      if (insErr || !jobRow) { results.push({ scene: scene.ref, ok: false, error: insErr?.message || "row insert failed" }); continue; }

      const { url, body: hgBody } = buildHeyGenRequest({
        avatar_id, voice_id, input_text: scene.input_text, audio_url: scene.audio_url,
        background, width, height, callback_id: jobRow.id,
      });
      const hgRes = await fetch(url, { method: "POST", headers: { "X-Api-Key": HEYGEN_API_KEY, "Content-Type": "application/json" }, body: JSON.stringify(hgBody) });
      const hgJson = await hgRes.json().catch(() => ({}));
      const heygenVideoId = hgJson?.data?.video_id ?? hgJson?.video_id ?? null;
      if (!hgRes.ok || !heygenVideoId) {
        await supabase.from("heygen_jobs").update({ status: "failed", error: `HeyGen create failed: ${hgRes.status} ${JSON.stringify(hgJson)}`, request_payload: hgBody }).eq("id", jobRow.id);
        results.push({ scene: scene.ref, job_id: jobRow.id, ok: false, error: hgJson?.error || hgRes.status }); continue;
      }
      await supabase.from("heygen_jobs").update({ status: "processing", heygen_video_id: heygenVideoId, request_payload: hgBody }).eq("id", jobRow.id);
      results.push({ scene: scene.ref, job_id: jobRow.id, heygen_video_id: heygenVideoId, mode: scene.audio_url ? "audio-driven" : "tts", ok: true });
    }
    return json({ ok: true, callback_url: callbackUrl, jobs: results });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
