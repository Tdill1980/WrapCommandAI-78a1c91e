import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const AI_KEY = Deno.env.get("GEMINI_API_KEY")!;

const systemPrompt = `
You are a world-class short-form video editor for YouTube, TikTok, Reels.

Given:
- Full transcript
- Scene segments
- Hook/Reel engineering logic
- Conversion psychology
- WPW brand knowledge (wrap reveals, satisfying POV, transformation)

Your job:
1. Identify ALL viable short-form clips from the video (NOT a fixed count — return EVERY good short).
2. Each clip should be 5–30 seconds.
3. Prefer clips with:
   - Strong visual reveal moments
   - High emotional reaction
   - Installer POV satisfying clips
   - Strong hooks
   - Before / After
   - Teaching compressed into bite-sized insights
   - Selling moments for WPW
4. Score each clip:
   - hook_strength (0–100)
   - virality_score (0–100)
   - ad_potential (boolean)
5. Suggest:
   - Captions (Sabri / Dara / Clean style)
   - Overlays (e.g., "WAIT FOR IT", "THE REVEAL")
   - CTAs (e.g., "Follow", "Order Printed Wraps")
   - Music vibes
6. Output JSON only with structure:

{
  "shorts": [
    {
      "id": "short_1",
      "title": "Installer POV satisfying peel",
      "start": 45.2,
      "end": 57.8,
      "duration": 12.6,
      "hook": "Watch this peel — it's insane",
      "hook_strength": 92,
      "virality_score": 88,
      "ad_potential": true,
      "overlay_suggestions": ["SO SATISFYING", "WPW"],
      "caption_suggestions": ["WATCH THIS 🔥", "This peel is CRAZY"],
      "cta": "Follow for more installs",
      "music_suggestion": "upbeat_energy"
    }
  ]
}
`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { job_id, scenes, transcript } = await req.json();

    if (!job_id || !scenes) {
      return new Response(JSON.stringify({ error: "job_id and scenes required" }), { 
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    console.log(`Generating shorts for job ${job_id} with ${scenes.length} scenes`);

    // Call AI to generate dynamic shorts
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
          {
            role: "user",
            content: `
Transcript:
${transcript}

Scenes:
${JSON.stringify(scenes, null, 2)}

Generate all viable shorts.`
          }
        ],
      }),
    });

    if (!aiRes.ok) {
      const errorText = await aiRes.text();
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required, please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      throw new Error(`AI error: ${errorText}`);
    }

    const aiJson = await aiRes.json();
    const content = aiJson.choices?.[0]?.message?.content || "{}";

    let shorts = [];
    try {
      const parsed = JSON.parse(content.match(/({[\s\S]*})/)?.[1] ?? "{}");
      shorts = parsed.shorts || [];
    } catch {
      console.error("Failed to parse AI response, using empty shorts array");
      shorts = [];
    }

    console.log(`Generated ${shorts.length} shorts for job ${job_id}`);

    // Save into database
    await supabase
      .from("youtube_editor_jobs")
      .update({
        shorts,
        processing_status: "complete"
      })
      .eq("id", job_id);

    return new Response(JSON.stringify({ success: true, shorts }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("yt-generate-shorts error:", err);

    return new Response(JSON.stringify({
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
      shorts: []
    }), { 
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
