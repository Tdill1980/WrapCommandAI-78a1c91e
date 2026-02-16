// supabase/functions/ai-generate-static-ad/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { loadVoiceProfile } from "../_shared/voice-engine-loader.ts";

interface StaticAdRequest {
  organization_id?: string;
  placement: string;
  mode: "template" | "ai";
  template_id?: string;
  headline: string;
  primary_text?: string;
  cta: string;
  media_url?: string;
  brand_colors?: string[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: StaticAdRequest = await req.json();
    const { organization_id, placement, mode, template_id, headline, primary_text, cta, media_url, brand_colors } = body;

    // Load brand voice for color/style preferences
    const voiceProfile = organization_id ? await loadVoiceProfile(organization_id) : null;
    const brandVoice = voiceProfile?.merged as Record<string, any> || {};
    const brandTone = brandVoice?.tone || "professional";

    // Define placement dimensions
    const placementSizes: Record<string, { width: number; height: number }> = {
      ig_feed: { width: 1080, height: 1350 },
      ig_story: { width: 1080, height: 1920 },
      ig_reels: { width: 1080, height: 1920 },
      fb_feed: { width: 1080, height: 1080 },
      fb_story: { width: 1080, height: 1920 },
      fb_16x9: { width: 1280, height: 720 },
    };

    const size = placementSizes[placement] || placementSizes.ig_feed;

    if (mode === "template") {
      // Template-based generation - return layout spec for Creatomate
      const templates: Record<string, object> = {
        bold_premium: {
          name: "Bold Premium",
          background: "solid",
          backgroundColor: brand_colors?.[0] || "#1a1a2e",
          layout: "full-bleed",
          headlinePosition: { x: 0.05, y: 0.08 },
          headlineStyle: { fontSize: 64, fontWeight: "bold", color: "#ffffff" },
          ctaPosition: { x: 0.7, y: 0.88 },
          ctaStyle: { backgroundColor: brand_colors?.[1] || "#e94560", padding: 16, borderRadius: 8 },
          imagePosition: { x: 0.5, y: 0.5 },
          imageFit: "cover",
        },
        before_after: {
          name: "Before/After Split",
          background: "split",
          splitDirection: "diagonal",
          leftColor: "#2d3436",
          rightColor: "#0984e3",
          layout: "split-compare",
          headlinePosition: { x: 0.5, y: 0.1 },
          ctaPosition: { x: 0.5, y: 0.9 },
        },
        gradient_slick: {
          name: "Gradient Slick",
          background: "gradient",
          gradientColors: brand_colors || ["#667eea", "#764ba2"],
          gradientDirection: 135,
          layout: "center-focus",
          headlinePosition: { x: 0.1, y: 0.15 },
          ctaPosition: { x: 0.5, y: 0.85 },
        },
        luxury_dark: {
          name: "Luxury Dark Mode",
          background: "solid",
          backgroundColor: "#0a0a0a",
          spotlightEffect: true,
          layout: "spotlight",
          headlinePosition: { x: 0.5, y: 0.12 },
          headlineStyle: { fontSize: 56, color: "#d4af37", fontWeight: "bold" },
          ctaPosition: { x: 0.5, y: 0.88 },
          ctaStyle: { backgroundColor: "#d4af37", color: "#0a0a0a" },
        },
        text_left_image_right: {
          name: "Text Left / Image Right",
          background: "solid",
          backgroundColor: "#ffffff",
          layout: "side-by-side",
          textSide: "left",
          imageSide: "right",
          headlinePosition: { x: 0.05, y: 0.3 },
          headlineStyle: { color: "#1a1a1a", fontSize: 48 },
          ctaPosition: { x: 0.15, y: 0.7 },
        },
        ugc_social_proof: {
          name: "UGC Social Proof",
          background: "solid",
          backgroundColor: "#fafafa",
          layout: "testimonial",
          quoteBubble: true,
          headlinePosition: { x: 0.5, y: 0.2 },
          imagePosition: { x: 0.5, y: 0.65 },
          ctaPosition: { x: 0.5, y: 0.92 },
        },
      };

      const template = templates[template_id || "bold_premium"] || templates.bold_premium;

      return new Response(
        JSON.stringify({
          success: true,
          output: {
            mode: "template",
            template_id: template_id || "bold_premium",
            layout: template,
            content: { headline, primary_text, cta, media_url },
            size,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // AI-composed generation
      const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
      
      const systemPrompt = `You are an AI graphic designer for Meta ads. Generate a JSON layout specification for a static ad.
      
Return ONLY valid JSON with this structure:
{
  "background": {
    "type": "gradient" | "solid" | "pattern",
    "colors": ["#hex1", "#hex2"],
    "direction": 135
  },
  "headline": {
    "text": "${headline}",
    "position": { "x": 0.1, "y": 0.15 },
    "style": { "fontSize": 56, "fontWeight": "bold", "color": "#ffffff", "textShadow": true }
  },
  "cta": {
    "text": "${cta}",
    "position": { "x": 0.5, "y": 0.85 },
    "style": { "backgroundColor": "#ff4757", "color": "#ffffff", "padding": 16, "borderRadius": 24 }
  },
  "image": {
    "position": { "x": 0.5, "y": 0.5 },
    "size": { "width": 0.8, "height": 0.6 },
    "mask": "rounded" | "circle" | "none",
    "shadow": true
  },
  "decorations": [
    { "type": "shape", "shape": "circle", "position": { "x": 0.9, "y": 0.1 }, "color": "#ffffff20", "size": 100 }
  ]
}

Design for vehicle wrap industry - bold, transformative, premium feel.
Brand tone: ${brandTone}`;

      const aiRes = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GEMINI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Create an eye-catching ${placement} ad layout for: "${headline}" with CTA "${cta}"` },
          ],
        }),
      });

      if (!aiRes.ok) {
        throw new Error(`AI API error: ${aiRes.status}`);
      }

      const json = await aiRes.json();
      const content = json.choices?.[0]?.message?.content || "{}";
      
      let parsed;
      try {
        const cleanContent = content.replace(/```json\n?|\n?```/g, "").trim();
        parsed = JSON.parse(cleanContent);
      } catch {
        parsed = { error: "Failed to parse AI layout" };
      }

      return new Response(
        JSON.stringify({
          success: true,
          output: {
            mode: "ai",
            layout: parsed,
            content: { headline, primary_text, cta, media_url },
            size,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("STATIC AD API ERROR:", err);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
