// heygen-render-callback
// Webhook receiver for HeyGen. HeyGen POSTs here when an avatar video finishes
// (success or failure). We map it back to the heygen_jobs row via `callback_id`
// (preferred) or `video_id`, and store the final video_url.
//
// Configure this URL as your HeyGen webhook endpoint, OR rely on the per-request
// callback set by heygen-generate-avatar. HeyGen webhook payloads vary by version,
// so we parse defensively.
//
// Deploy with verify_jwt = false (HeyGen cannot send a Supabase JWT). For hardening,
// add a shared-secret check via a query param or HeyGen signature header.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function pick<T = any>(obj: any, paths: string[]): T | undefined {
  for (const p of paths) {
    const v = p.split(".").reduce((acc: any, k) => (acc == null ? acc : acc[k]), obj);
    if (v !== undefined && v !== null) return v as T;
  }
  return undefined;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const payload = await req.json().catch(() => ({}));
    console.log("[heygen-render-callback] payload:", JSON.stringify(payload));

    // Map back to our row. callback_id is our heygen_jobs.id; video_id is HeyGen's.
    const callbackId = pick<string>(payload, [
      "event_data.callback_id", "callback_id", "data.callback_id",
    ]) || new URL(req.url).searchParams.get("job_id") || undefined;

    const heygenVideoId = pick<string>(payload, [
      "event_data.video_id", "video_id", "data.video_id",
    ]);

    const videoUrl = pick<string>(payload, [
      "event_data.url", "event_data.video_url", "url", "video_url", "data.video_url",
    ]);
    const thumbUrl = pick<string>(payload, [
      "event_data.thumbnail_url", "thumbnail_url", "data.thumbnail_url",
    ]);
    const duration = pick<number>(payload, ["event_data.duration", "duration", "data.duration"]);

    const eventType = String(pick(payload, ["event_type", "type", "status"]) ?? "");
    const failed = /fail|error/i.test(eventType) || (!videoUrl && /complete|success/i.test(eventType) === false && pick(payload, ["event_data.error", "error"]) != null);

    if (!callbackId && !heygenVideoId) {
      return json({ ok: false, error: "No callback_id or video_id in payload" }, 200);
    }

    const update: Record<string, unknown> = {
      callback_payload: payload,
      status: failed ? "failed" : videoUrl ? "completed" : "processing",
    };
    if (videoUrl) update.video_url = videoUrl;
    if (thumbUrl) update.thumbnail_url = thumbUrl;
    if (duration) update.duration_seconds = duration;
    if (failed) update.error = String(pick(payload, ["event_data.msg", "event_data.error", "error", "message"]) ?? "HeyGen reported failure");

    const query = supabase.from("heygen_jobs").update(update);
    const { data, error } = callbackId
      ? await query.eq("id", callbackId).select("id, status, video_url")
      : await query.eq("heygen_video_id", heygenVideoId!).select("id, status, video_url");

    if (error) {
      console.error("[heygen-render-callback] update error:", error);
      return json({ ok: false, error: error.message }, 200);
    }

    console.log("[heygen-render-callback] updated:", JSON.stringify(data));
    return json({ ok: true, updated: data });
  } catch (e) {
    console.error("[heygen-render-callback] error:", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200);
  }
});
