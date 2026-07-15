import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { file_url, organization_id, video_duration } = await req.json();

    if (!file_url) {
      return new Response(
        JSON.stringify({ error: "file_url is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // The frontend polls youtube_editor_jobs through RLS scoped to
    // organization_id = get_user_organization_id(). A NULL org row is
    // invisible to the poll, so the job would "process" forever from the
    // user's perspective. Fail fast instead.
    if (!organization_id) {
      return new Response(
        JSON.stringify({ error: "organization_id is required (job status is org-scoped)" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    console.log(`Starting YouTube analysis for file: ${file_url}`);

    // 1. Create job entry
    const { data: job, error: jobErr } = await supabase
      .from("youtube_editor_jobs")
      .insert({
        organization_id,
        source_file_url: file_url,
        duration_seconds: Number(video_duration) > 0 ? Math.round(Number(video_duration)) : null,
        processing_status: "transcribing",
      })
      .select()
      .single();

    if (jobErr) {
      console.error("Failed to create job:", jobErr);
      throw jobErr;
    }

    const job_id = job.id;
    console.log(`Created job ${job_id}`);

    // 2. Drive the pipeline ourselves: transcribe → scene-detect → shorts.
    //    (The old code kicked mux-upload and claimed "the MUX webhook will
    //    continue the pipeline" — mux-webhook has no youtube_editor_jobs
    //    handling, so every job was stuck at "transcribing" forever.)
    const runPipeline = async () => {
      try {
        // Transcribe — video-transcribe accepts { video_url } and returns { transcript }
        const transcribeRes = await supabase.functions.invoke("video-transcribe", {
          body: { video_url: file_url, include_timestamps: false },
        });
        const transcript: string = transcribeRes.data?.transcript || "";
        console.log(`[yt-analyze] transcript: ${transcript.length} chars`);

        await supabase
          .from("youtube_editor_jobs")
          .update({ transcript, processing_status: "analyzing" })
          .eq("id", job_id);

        // Scene detection — with a job_id it persists analysis_data and
        // chains yt-generate-shorts, which sets processing_status "complete".
        const sceneRes = await supabase.functions.invoke("yt-scene-detect", {
          body: { job_id, transcript, video_url: file_url, video_duration },
        });
        if (sceneRes.error) throw new Error(`scene-detect failed: ${sceneRes.error.message}`);
      } catch (e) {
        console.error(`[yt-analyze] pipeline failed for job ${job_id}:`, e);
        await supabase
          .from("youtube_editor_jobs")
          .update({ processing_status: "failed" })
          .eq("id", job_id);
      }
    };

    // Run in the background so the client gets the job_id immediately and polls.
    // deno-lint-ignore no-explicit-any
    const runtime = (globalThis as any).EdgeRuntime;
    if (runtime?.waitUntil) {
      runtime.waitUntil(runPipeline());
    } else {
      // Fallback: run inline (slower response, same result)
      await runPipeline();
    }

    return new Response(
      JSON.stringify({
        success: true,
        job_id,
        status: "transcribing",
        message: "Analysis started. Poll youtube_editor_jobs for status updates."
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("yt-analyze error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
