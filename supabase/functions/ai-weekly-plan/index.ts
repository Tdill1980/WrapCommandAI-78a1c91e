import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadVoiceProfile } from "../_shared/voice-engine-loader.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { organization_id } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Load voice profile for brand context
    let brandContext = "";
    try {
      const voiceProfile = await loadVoiceProfile(organization_id);
      if (voiceProfile?.merged) {
        const vocab = voiceProfile.merged.vocabulary;
        const phrases = Array.isArray(vocab) ? vocab.join(", ") : 
          (typeof vocab === "object" && vocab !== null ? JSON.stringify(vocab) : "engaging, authentic");
        brandContext = `
Brand Voice: ${voiceProfile.merged.tone || "professional"}
Persona: ${voiceProfile.merged.persona || "automotive expert"}
Style: ${phrases}
`;
      }
    } catch (e) {
      console.log("Voice profile not found, using defaults");
    }

    // Get recent content for variety
    const { data: recentContent } = await supabase
      .from("content_queue")
      .select("content_type, title")
      .order("created_at", { ascending: false })
      .limit(10);

    const recentTypes = recentContent?.map((c) => c.content_type).join(", ") || "";

    const systemPrompt = `You are a content strategist for a vehicle wrap shop. Generate a week of engaging social media content.
${brandContext}

Consider:
- Mix of Reels, Static posts, Carousels, and Stories
- Trending wrap industry topics (chrome delete, color change, PPF)
- Before/after reveals
- Behind-the-scenes content
- Customer testimonials angles
- Educational content about wrap care

Recent content types used: ${recentTypes}
Avoid repeating similar content types consecutively.`;

    const userPrompt = `Generate a 7-day content plan for a vehicle wrap shop.

For each day, provide:
1. Content type (reel, static, carousel, story)
2. Title
3. Hook (attention-grabbing first line)
4. Brief script or description
5. Hashtags (5-7)
6. CTA
7. Platform (instagram, tiktok, both)

Return as JSON:
{
  "suggestions": [
    {
      "day": "Monday",
      "type": "reel",
      "title": "...",
      "hook": "...",
      "script": "...",
      "hashtags": ["..."],
      "cta": "...",
      "platform": "instagram"
    }
  ],
  "theme": "Weekly theme description"
}`;

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("GEMINI_API_KEY")}`,
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const result = await response.json();
    let planContent = result.choices?.[0]?.message?.content || "";

    // Clean markdown if present
    planContent = planContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let plan;
    try {
      plan = JSON.parse(planContent);
    } catch (e) {
      console.error("Failed to parse plan:", planContent);
      throw new Error("Invalid plan format from AI");
    }

    plan.generated_at = new Date().toISOString();

    return new Response(
      JSON.stringify({ success: true, plan }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Weekly plan error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
