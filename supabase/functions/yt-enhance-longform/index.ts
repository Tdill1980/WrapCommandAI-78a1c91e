import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AI_KEY = Deno.env.get("GEMINI_API_KEY")!;

const systemPrompt = `
You are a professional video editor analyzing long-form content for enhancement opportunities.

Analyze the transcript and provide detailed editing suggestions:

1. **Pacing Analysis**
   - Identify slow/dragging sections
   - Identify rushed sections
   - Suggest tempo adjustments

2. **Filler Word Detection**
   - Find "um", "uh", "like", "you know", "basically", "actually", "literally"
   - Provide timestamps for each occurrence
   - Calculate filler word density

3. **Dead Air Detection**
   - Find pauses longer than 2 seconds
   - Suggest cuts or speed ramps

4. **Emotional Beats**
   - Identify high-energy moments
   - Identify low-energy/calm moments
   - Map emotional arc of the video

5. **B-Roll Cues**
   - Suggest moments where B-roll would enhance the video
   - Describe what type of B-roll would work

6. **Text Overlay Moments**
   - Identify key points that should have text on screen
   - Suggest overlay text content

7. **Chapter Markers**
   - Create YouTube-style chapters
   - Each chapter with timestamp and title

8. **Overall Quality Score**
   - Pacing score (0-100)
   - Engagement potential (0-100)
   - Production quality suggestions

Return JSON only:
{
  "pacing": {
    "overall_score": number,
    "slow_sections": [{ "start": "MM:SS", "end": "MM:SS", "suggestion": "string" }],
    "rushed_sections": [{ "start": "MM:SS", "end": "MM:SS", "suggestion": "string" }]
  },
  "filler_words": {
    "total_count": number,
    "density_per_minute": number,
    "instances": [{ "word": "string", "timestamp": "MM:SS" }]
  },
  "dead_air": {
    "total_seconds": number,
    "instances": [{ "start": "MM:SS", "duration": number, "suggestion": "cut" | "speed_ramp" | "keep" }]
  },
  "emotional_beats": {
    "arc_type": "building" | "roller_coaster" | "declining" | "flat",
    "high_points": [{ "timestamp": "MM:SS", "description": "string", "energy": number }],
    "low_points": [{ "timestamp": "MM:SS", "description": "string" }]
  },
  "broll_cues": [
    { "timestamp": "MM:SS", "duration": number, "suggestion": "string", "type": "product" | "action" | "environment" | "reaction" }
  ],
  "text_overlays": [
    { "timestamp": "MM:SS", "text": "string", "style": "title" | "stat" | "quote" | "cta" }
  ],
  "chapters": [
    { "time": "00:00", "title": "string" }
  ],
  "quality_scores": {
    "pacing": number,
    "engagement": number,
    "clarity": number,
    "production_notes": ["string"]
  }
}
`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { job_id, transcript } = await req.json();

    if (!job_id || !transcript) {
      return new Response(
        JSON.stringify({ error: "job_id and transcript required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    console.log(`Analyzing long-form enhancements for job ${job_id}`);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Call AI for enhancement analysis
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
          { role: "user", content: `Analyze this video transcript for enhancement opportunities:\n\n${transcript}` }
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

    let enhancementData = {};
    try {
      const parsed = JSON.parse(content.match(/({[\s\S]*})/)?.[1] ?? "{}");
      enhancementData = parsed;
    } catch {
      console.error("Failed to parse AI response");
      enhancementData = { error: "Failed to parse enhancement data" };
    }

    console.log(`Generated enhancements for job ${job_id}`);

    // Update job with enhancement data
    await supabase
      .from("youtube_editor_jobs")
      .update({
        enhancement_data: enhancementData
      })
      .eq("id", job_id);

    return new Response(
      JSON.stringify({ success: true, enhancements: enhancementData }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("yt-enhance-longform error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
