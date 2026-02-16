import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VideoAdRequest {
  video_url: string;
  placement: string;
  organization_id?: string;
  style_modifier?: "none" | "garyvee" | "sabrisuby" | "daradenney";
  auto_render?: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: VideoAdRequest = await req.json();
    const { video_url, placement, organization_id, style_modifier = "none", auto_render = false } = body;

    if (!video_url) {
      return new Response(JSON.stringify({ success: false, error: "video_url is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[ai-generate-video-ad] Starting pipeline for:", { video_url, placement, style_modifier });

    // Load TradeDNA voice profile if org provided
    let brandVoice: any = null;
    if (organization_id) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data: orgDna } = await supabase
        .from("organization_tradedna")
        .select("*")
        .eq("organization_id", organization_id)
        .single();

      if (orgDna) {
        brandVoice = orgDna;
        console.log("[ai-generate-video-ad] Loaded TradeDNA for org:", organization_id);
      }
    }

    // Build style modifier instructions
    const styleInstructions = getStyleInstructions(style_modifier);

    // Build the AI prompt for video ad generation
    const systemPrompt = `You are an expert Meta Ads copywriter specializing in high-converting video ads for the vehicle wrap industry.

${brandVoice ? `BRAND VOICE:
- Tone: ${brandVoice.tone || "professional"}
- Persona: ${brandVoice.persona || "expert wrap shop"}
- Vocabulary: ${JSON.stringify(brandVoice.vocabulary || {})}
- Sales Style: ${JSON.stringify(brandVoice.sales_style || {})}` : ""}

${styleInstructions}

PLACEMENT: ${placement}

Your task is to:
1. Analyze the video concept (assume it's a vehicle wrap transformation video)
2. Generate hook recommendations for first 3 seconds
3. Create 6 ad angles with complete copy
4. Suggest text overlays with timing
5. Recommend CTA placement

OUTPUT FORMAT (JSON):
{
  "video_analysis": {
    "concept": "Brief description of ideal video content",
    "hook_recommendation": "What to show/say in first 3 seconds",
    "key_moments": [
      { "timestamp": 3, "description": "Reveal moment" },
      { "timestamp": 8, "description": "Detail shot" }
    ],
    "thumbnail_recommendation": "Best frame for thumbnail"
  },
  "ad_copy": {
    "short_texts": ["4 primary texts under 125 chars each"],
    "long_texts": ["2 primary texts 200-450 chars each"],
    "headlines": ["5-10 headlines under 40 chars"],
    "descriptions": ["3 descriptions under 30 chars"],
    "cta": "GET_QUOTE",
    "angles": [
      {
        "name": "Direct",
        "primary_text": "Full primary text for this angle",
        "headline": "Headline for this angle"
      },
      {
        "name": "Emotional",
        "primary_text": "...",
        "headline": "..."
      },
      {
        "name": "Speed",
        "primary_text": "...",
        "headline": "..."
      },
      {
        "name": "Before/After",
        "primary_text": "...",
        "headline": "..."
      },
      {
        "name": "Authority",
        "primary_text": "...",
        "headline": "..."
      },
      {
        "name": "Social Proof",
        "primary_text": "...",
        "headline": "..."
      }
    ]
  },
  "overlays": [
    { "text": "Hook text overlay", "timing_start": 0, "timing_end": 3, "position": "center" },
    { "text": "CTA overlay", "timing_start": 12, "timing_end": 15, "position": "bottom" }
  ],
  "timeline": {
    "hook_text": "Main hook for video overlay",
    "cta_text": "Get Your Quote Today",
    "brand_colors": ["#000000", "#E1306C"]
  }
}`;

    const userPrompt = `Generate a complete Meta video ad package for a vehicle wrap shop.

Video URL: ${video_url}
Placement: ${placement}
Style: ${style_modifier === "none" ? "Standard professional" : style_modifier}

Create compelling, high-converting ad copy that:
- Stops the scroll in the first 3 seconds
- Uses pattern interrupts and curiosity hooks
- Drives quote requests and showroom visits
- Matches the ${placement} format requirements

Return ONLY valid JSON.`;

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    const aiResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("[ai-generate-video-ad] AI error:", errText);
      throw new Error(`AI generation failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    let content = aiData.choices?.[0]?.message?.content || "";

    // Clean JSON from markdown
    content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (parseErr) {
      console.error("[ai-generate-video-ad] JSON parse error:", content.substring(0, 500));
      throw new Error("Failed to parse AI response as JSON");
    }

    console.log("[ai-generate-video-ad] Successfully generated video ad package");

    // If auto_render is true, start the Creatomate render
    let render_id: string | undefined;
    if (auto_render && parsed.timeline) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { data: renderData } = await supabase.functions.invoke("render-video-reel", {
          body: {
            action: "start",
            video_url,
            headline: parsed.timeline.hook_text,
            subtext: parsed.timeline.cta_text,
            organization_id,
          },
        });

        if (renderData?.render_id) {
          render_id = renderData.render_id;
          console.log("[ai-generate-video-ad] Auto-render started:", render_id);
        }
      } catch (renderErr) {
        console.error("[ai-generate-video-ad] Auto-render failed:", renderErr);
        // Don't fail the whole request, just log it
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        video_analysis: parsed.video_analysis,
        ad_copy: parsed.ad_copy,
        overlays: parsed.overlays,
        timeline: parsed.timeline,
        render_id,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("[ai-generate-video-ad] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function getStyleInstructions(style: string): string {
  switch (style) {
    case "garyvee":
      return `STYLE: Gary Vee
- Raw, authentic, founder POV
- Fast-paced, punchy sentences
- Call out the audience directly
- Use "Look...", "Here's the thing...", "Stop scrolling..."
- Cultural references and zeitgeist awareness
- Volume over perfection mindset`;

    case "sabrisuby":
      return `STYLE: Sabri Suby (Direct Response)
- Problem-Agitation-Solution framework
- Hardcore objection handling
- Urgency and scarcity elements
- Specific numbers and proof points
- "If you're a [audience]..." pattern
- Clear, aggressive CTAs`;

    case "daradenney":
      return `STYLE: Dara Denney (UGC/Paid Social)
- "I didn't think this would work but..." hooks
- Testimonial/storytelling vibes
- Soft CTAs with curiosity
- Native to platform feel
- Meta/TikTok CPM optimization language
- "POV:", "This is your sign..." patterns`;

    default:
      return `STYLE: Professional wrap shop marketing
- Clear, confident messaging
- Focus on transformation and results
- Build trust through expertise
- Direct call-to-action`;
  }
}
