/**
 * render-reel-ffmpeg — self-hosted replacement for render-reel (Creatomate).
 *
 * SAME request/response contract as render-reel so it is a drop-in swap:
 *   Request:  { job_id, blueprint, music_url?, captions?, creative_id? }
 *   Response: { ok: true, final_url } | { ok: true, final_url: null, status: 'processing', job_id }
 *             | { ok: false, error }
 *
 * How it works (no vendor):
 *   1. Enqueue a reel_render_jobs row (status 'queued').
 *   2. Mark the video_edit_queue row 'rendering'.
 *   3. Best-effort "kick" the Railway ffmpeg worker so it starts immediately
 *      (the worker also polls, so a missed kick just adds a few seconds).
 *   4. Bounded wait: poll the job row for up to ~100s. Single-clip reels
 *      finish well within this, so the call feels synchronous and ReelBuilder
 *      gets { ok, final_url } exactly like before. If a longer render is still
 *      going when the wait ends, return status 'processing' — the worker still
 *      writes final_render_url to video_edit_queue when it finishes, and the
 *      UI's existing final_render_url handling picks it up.
 *
 * Secrets:
 *   RENDER_WORKER_URL   base URL of the Railway ffmpeg worker (optional; only
 *                       used for the immediate kick). Worker polls regardless.
 *   RENDER_WORKER_KEY   shared secret sent as x-worker-key on the kick.
 *   RENDER_BUCKET       storage bucket for output mp4 (default 'media-library').
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WAIT_MS = 100_000;   // bounded synchronous wait
const POLL_MS = 3_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const { job_id, blueprint, music_url, captions, creative_id } = body ?? {};
    if (!job_id) return json({ ok: false, error: "Missing job_id" }, 400);
    if (!blueprint?.scenes?.length) return json({ ok: false, error: "Blueprint has no scenes" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const bucket = Deno.env.get("RENDER_BUCKET") || "media-library";

    // 1. enqueue
    const { data: jobRow, error: insErr } = await supabase
      .from("reel_render_jobs")
      .insert({
        edit_queue_id: job_id,
        creative_id: creative_id ?? null,
        blueprint,
        music_url: music_url ?? null,
        captions: captions ?? [],
        bucket,
        status: "queued",
      })
      .select("id")
      .single();
    if (insErr) return json({ ok: false, error: `enqueue failed: ${insErr.message}` }, 500);
    const renderJobId = jobRow.id;

    // 2. mark the edit-queue row rendering (best effort)
    await supabase
      .from("video_edit_queue")
      .update({ render_status: "rendering", error_message: null })
      .eq("id", job_id);

    // 3. best-effort kick
    const workerUrl = Deno.env.get("RENDER_WORKER_URL");
    if (workerUrl) {
      try {
        await fetch(`${workerUrl.replace(/\/$/, "")}/kick`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-worker-key": Deno.env.get("RENDER_WORKER_KEY") || "",
          },
          body: JSON.stringify({ job_id: renderJobId }),
        });
      } catch (_) {
        // worker polls anyway
      }
    }

    // 4. bounded wait
    const deadline = Date.now() + WAIT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      const { data: j } = await supabase
        .from("reel_render_jobs")
        .select("status, final_url, thumbnail_url, error")
        .eq("id", renderJobId)
        .single();
      if (!j) continue;
      if (j.status === "complete") {
        return json({ ok: true, final_url: j.final_url, thumbnail_url: j.thumbnail_url, renderer: "ffmpeg", render_job_id: renderJobId });
      }
      if (j.status === "failed") {
        return json({ ok: false, error: j.error || "Render failed", renderer: "ffmpeg", render_job_id: renderJobId }, 500);
      }
    }

    // still rendering — the worker will finish and write final_render_url
    return json({
      ok: true,
      final_url: null,
      status: "processing",
      renderer: "ffmpeg",
      render_job_id: renderJobId,
      job_id,
    });
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
