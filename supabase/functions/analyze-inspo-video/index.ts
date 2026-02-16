import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { updateOrganizationStyle } from "../_shared/style-profile-loader.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { videoUrl, platform, organizationId } = await req.json();

    if (!videoUrl) {
      return new Response(
        JSON.stringify({ error: "videoUrl is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    console.log(`Analyzing video from ${platform}: ${videoUrl}`);

    // Enhanced prompt to extract style info that can be used for rendering
    const systemPrompt = `You are an expert video content analyst specializing in social media reels, TikToks, and short-form video content. Analyze the provided video URL and extract detailed style information that can be used to recreate this style in new videos.

Return a JSON object with the following structure:
{
  "pacing": {
    "cutsPerSecond": number (0.5-3),
    "averageClipLength": number (seconds),
    "rhythm": "slow" | "medium" | "fast" | "variable"
  },
  "color": {
    "palette": string[] (3-5 hex colors),
    "mood": string,
    "saturation": "muted" | "balanced" | "vibrant",
    "contrast": "low" | "medium" | "high"
  },
  "structure": {
    "hook": { "duration": number, "style": string },
    "body": { "duration": number, "style": string },
    "cta": { "duration": number, "style": string }
  },
  "overlays": {
    "textStyle": string,
    "fontSize": "small" | "medium" | "large",
    "fontWeight": "light" | "regular" | "bold",
    "position": "top" | "center" | "bottom",
    "animation": string
  },
  "typography": {
    "font_headline": string (font family name like "Bebas Neue", "Montserrat", "Impact"),
    "font_body": string (font family for body text),
    "font_weight": "400" | "500" | "600" | "700" | "800" | "900",
    "text_case": "uppercase" | "lowercase" | "capitalize" | "none"
  },
  "text_positions": {
    "hook_position": string (percentage like "15%", "20%"),
    "body_position": string (percentage like "50%"),
    "cta_position": string (percentage like "85%")
  },
  "colors": {
    "primary_text_color": string (hex color),
    "secondary_text_color": string (hex color),
    "accent_color": string (hex color),
    "shadow_color": string (rgba color)
  },
  "text_effects": {
    "text_shadow_enabled": boolean,
    "shadow_blur": number (pixels),
    "text_outline_enabled": boolean,
    "outline_width": number (pixels)
  },
  "hooks": string[] (3-5 hook phrases detected or suggested),
  "cta": string (call to action text),
  "music": {
    "genre": string,
    "energy": "low" | "medium" | "high",
    "bpm": number
  },
  "transitions": string[] (transition types used)
}

Be specific about fonts, colors, and positions. This analysis will be used to render new videos with the exact same style.`;

    const userPrompt = `Analyze this ${platform || "social media"} video: ${videoUrl}

Based on the URL and platform, provide a detailed style breakdown focusing on:
1. Typography - what fonts are used, are they bold/thin, uppercase/lowercase
2. Text positions - where do text overlays appear (top %, center, bottom %)
3. Colors - exact hex colors used for text, backgrounds, accents
4. Text effects - shadows, outlines, animations
5. Overall visual style that makes this content engaging

This is for vehicle wrap industry content creation.`;

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
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

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI API error: ${response.status}`);
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    // Parse JSON from response
    let analysis;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      // Return a default analysis structure
      analysis = {
        pacing: { cutsPerSecond: 1, averageClipLength: 3, rhythm: "medium" },
        color: { palette: ["#FF6B35", "#2E2E2E", "#FFFFFF"], mood: "energetic", saturation: "vibrant", contrast: "high" },
        structure: {
          hook: { duration: 3, style: "Problem statement" },
          body: { duration: 12, style: "Process showcase" },
          cta: { duration: 3, style: "Direct ask" }
        },
        overlays: { textStyle: "Bold sans-serif", fontSize: "large", fontWeight: "bold", position: "center", animation: "pop-in" },
        typography: { font_headline: "Bebas Neue", font_body: "Poppins", font_weight: "700", text_case: "uppercase" },
        text_positions: { hook_position: "15%", body_position: "50%", cta_position: "85%" },
        colors: { primary_text_color: "#FFFFFF", secondary_text_color: "#FF6B35", accent_color: "#FF6B35", shadow_color: "rgba(0,0,0,0.8)" },
        text_effects: { text_shadow_enabled: true, shadow_blur: 8, text_outline_enabled: false, outline_width: 0 },
        hooks: ["Watch this transformation", "You won't believe this", "Before vs After"],
        cta: "DM us for a quote",
        music: { genre: "Hip-hop/Electronic", energy: "high", bpm: 120 },
        transitions: ["Cut", "Zoom", "Whip pan"]
      };
    }

    // Store in database if organizationId provided
    if (organizationId) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Store analysis record
      await supabase.from("inspo_analyses").insert({
        organization_id: organizationId,
        source_url: videoUrl,
        platform: platform || "unknown",
        analysis_data: analysis,
        title: `${platform || "Video"} Analysis - ${new Date().toLocaleDateString()}`,
      });

      // UPDATE ORGANIZATION STYLE PROFILE for video rendering
      // Extract rendering-specific settings from the analysis
      const styleUpdate = {
        font_headline: analysis.typography?.font_headline || "Bebas Neue",
        font_body: analysis.typography?.font_body || "Poppins",
        font_weight: analysis.typography?.font_weight || "700",
        text_case: analysis.typography?.text_case || "uppercase",
        hook_position: analysis.text_positions?.hook_position || "15%",
        body_position: analysis.text_positions?.body_position || "50%",
        cta_position: analysis.text_positions?.cta_position || "85%",
        primary_text_color: analysis.colors?.primary_text_color || "#FFFFFF",
        secondary_text_color: analysis.colors?.secondary_text_color || analysis.color?.palette?.[0] || "#FF6B35",
        accent_color: analysis.colors?.accent_color || analysis.color?.palette?.[1] || "#FF6B35",
        shadow_color: analysis.colors?.shadow_color || "rgba(0,0,0,0.8)",
        text_shadow_enabled: analysis.text_effects?.text_shadow_enabled ?? true,
        shadow_blur: analysis.text_effects?.shadow_blur || 8,
        text_outline_enabled: analysis.text_effects?.text_outline_enabled ?? false,
        outline_width: analysis.text_effects?.outline_width || 0,
      };

      console.log("[analyze-inspo-video] Updating organization style profile:", styleUpdate);
      await updateOrganizationStyle(organizationId, styleUpdate, videoUrl);
    }

    return new Response(
      JSON.stringify({ success: true, analysis }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in analyze-inspo-video:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});