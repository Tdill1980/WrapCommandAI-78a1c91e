import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AI_KEY = Deno.env.get("GEMINI_API_KEY")!;

const systemPrompt = `
You analyze YouTube-style long-form content and detect scene segments.

For each segment, identify:
- Hook moments (attention-grabbing openings)
- Teaching/value moments (educational content)
- Reveal moments (transformations, before/after)
- CTA moments (calls to action)
- Testimonial moments (social proof)
- Filler/dead air (low-value segments)
- High emotional/energy points

Return JSON only:
{
  "duration_estimate": number,
  "scenes": [
    {
      "id": number,
      "start": "MM:SS",
      "end": "MM:SS",
      "type": "hook" | "value" | "reveal" | "cta" | "testimonial" | "filler",
      "score": number (0-100),
      "text": "brief description",
      "energy_level": "low" | "medium" | "high"
    }
  ],
  "hook_score": number (0-100),
  "value_segments": number,
  "energy_spikes": number,
  "product_mentions": number,
  "chapters": [
    { "time": "MM:SS", "title": "Chapter title" }
  ]
}
`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { job_id, transcript, video_url, video_duration } = await req.json();

    // Allow either transcript or video_url
    if (!transcript && !video_url) {
      return new Response(
        JSON.stringify({ error: "transcript or video_url required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    console.log(`Detecting scenes for ${job_id || 'auto-split'}`);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // If no transcript but we have video_url, try to transcribe first.
    // video-transcribe accepts { video_url } and returns { transcript }.
    // (transcribe-audio requires base64 { audio } — calling it with a URL
    // always failed silently, which is why scene detection never worked.)
    let transcriptText = transcript || "";
    if (!transcriptText && video_url) {
      try {
        const transcribeRes = await supabase.functions.invoke("video-transcribe", {
          body: { video_url, include_timestamps: false }
        });
        transcriptText = transcribeRes.data?.transcript || "";
        console.log(`Got transcript of ${transcriptText.length} chars from video`);
      } catch (e) {
        console.warn("Transcription failed, using basic scene detection:", e);
      }
    }

    // If still no transcript, return basic time-based scenes scaled to the
    // actual video length (previously hardcoded 0–70s regardless of duration).
    if (!transcriptText) {
      console.log("No transcript available, returning basic scene structure");
      const dur = Number(video_duration) > 0 ? Number(video_duration) : 70;
      const seg = dur / 5;
      const toMMSS = (s: number) =>
        `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
      const types = ["hook", "value", "reveal", "value", "cta"];
      const labels = ["Opening hook", "Main content", "Key moment", "Details", "Closing"];
      const energies = ["high", "medium", "high", "medium", "medium"];
      const scores = [70, 60, 75, 55, 65];
      const fallbackScenes = Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        start: toMMSS(i * seg),
        end: toMMSS(Math.min((i + 1) * seg, dur)),
        start_seconds: Math.round(i * seg * 10) / 10,
        end_seconds: Math.round(Math.min((i + 1) * seg, dur) * 10) / 10,
        type: types[i],
        score: scores[i],
        text: labels[i],
        energy_level: energies[i],
      }));
      return new Response(
        JSON.stringify({ success: true, scenes: fallbackScenes, analysis: { scenes: fallbackScenes } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Analyzing transcript of ${transcriptText.length} chars`);

    // Call AI for scene detection
    const aiRes = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AI_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analyze this transcript and detect all scenes:\n\n${transcriptText}` }
        ]
      })
    });

    if (!aiRes.ok) {
      const errorText = await aiRes.text();
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      throw new Error(`AI error: ${errorText}`);
    }

    const aiJson = await aiRes.json();
    const content = aiJson.choices?.[0]?.message?.content || "{}";

    let analysisData = { scenes: [], hook_score: 0, value_segments: 0, chapters: [] };
    try {
      const parsed = JSON.parse(content.match(/({[\s\S]*})/)?.[1] ?? "{}");
      analysisData = parsed;
    } catch {
      console.error("Failed to parse AI response");
    }

    console.log(`Detected ${analysisData.scenes?.length || 0} scenes`);

    // Only update DB if we have a job_id
    if (job_id) {
      // Update job with analysis data
      await supabase
        .from("youtube_editor_jobs")
        .update({
          analysis_data: analysisData,
          processing_status: "generating_shorts"
        })
        .eq("id", job_id);

      // Trigger shorts generation
      await supabase.functions.invoke("yt-generate-shorts", {
        body: { 
          job_id, 
          scenes: analysisData.scenes || [], 
          transcript: transcriptText 
        }
      });
    }

    // Return scenes at the TOP LEVEL too — AutoSplit reads `scenes`, the
    // YouTube editor reads `analysis`. Previously the AI-success path only
    // returned `analysis.scenes`, so AutoSplit silently discarded real results.
    return new Response(
      JSON.stringify({ success: true, scenes: analysisData.scenes || [], analysis: analysisData }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("yt-scene-detect error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
