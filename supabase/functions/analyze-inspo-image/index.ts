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
    const { imageUrl, organizationId, contentFileId } = await req.json();

    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: "Image URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Enhanced AI Vision prompt for RENDERING-READY style extraction
    const systemPrompt = `You are an expert visual designer analyzing Canva templates and social media ads.
Your job is to extract EXACT visual style specifications that can be used for video rendering.

Analyze this image and extract:

1. TYPOGRAPHY - Extract exact font characteristics:
   - Font family (identify specific fonts like "Bebas Neue", "Poppins", "Montserrat", "Impact", "Oswald")
   - Font weight (light/regular/medium/bold/black/900)
   - Text case (uppercase/lowercase/capitalize/mixed)

2. TEXT POSITIONING - Identify where text is placed:
   - Hook/headline position (% from top, e.g. "15%", "20%", "10%")
   - Body text position (% from top, e.g. "50%", "45%")
   - CTA/bottom text position (% from top, e.g. "85%", "80%", "90%")
   - Text alignment (left/center/right)

3. COLORS - Extract exact hex codes:
   - Primary text color (main headline color)
   - Secondary text color (body/CTA color)
   - Accent color (highlights, underlines)
   - Shadow color if present

4. TEXT EFFECTS:
   - Has text shadow? (true/false)
   - Shadow blur amount (1-20)
   - Has text outline/stroke? (true/false)
   - Outline width if present (1-5)

5. ANIMATION STYLE (infer from design):
   - Text animation type (fade_in/slide_up/scale_pop/typewriter/none)
   - Reveal style (scale_pop/fade/slide/zoom)

6. LAYOUT:
   - Safe zone width (how much horizontal space text uses: "60%", "70%", "80%")

Return JSON ONLY with this exact structure:
{
  "styleName": "Descriptive name like 'Bold Impact Style' or 'Clean Minimal'",
  
  "rendering": {
    "font_headline": "Bebas Neue",
    "font_body": "Poppins",
    "font_weight": "bold",
    "text_case": "uppercase",
    
    "hook_position": "15%",
    "body_position": "50%",
    "cta_position": "85%",
    "text_alignment": "center",
    
    "primary_text_color": "#FFFFFF",
    "secondary_text_color": "#FFFFFF",
    "accent_color": "#FF6B35",
    "shadow_color": "rgba(0,0,0,0.8)",
    
    "text_shadow_enabled": true,
    "shadow_blur": 10,
    "text_outline_enabled": false,
    "outline_width": 2,
    
    "text_animation": "fade_in",
    "reveal_style": "scale_pop",
    
    "safe_zone_width": "70%"
  },
  
  "colorPalette": ["#hex1", "#hex2", "#hex3", "#hex4"],
  "hooks": ["Any visible text hooks/headlines"],
  "cta": "Call-to-action text if visible",
  "marketingAngle": "Brief description of marketing approach",
  "recommendations": ["2-3 tips for recreating this style"]
}

Be PRECISE with:
- Font identification (look at letter shapes, serifs, weight)
- Color hex codes (extract actual colors from image)
- Position percentages (measure where text sits vertically)
- Shadow/outline detection (look for glow, drop shadow, strokes)`;

    console.log("[analyze-inspo-image] Analyzing image:", imageUrl);

    // Call Lovable AI with image
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
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this image and extract its visual style for video rendering. Focus on fonts, colors, text positions, and effects. Return valid JSON only.",
              },
              {
                type: "image_url",
                image_url: { url: imageUrl },
              },
            ],
          },
        ],
        max_tokens: 2500,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("[analyze-inspo-image] AI API error:", errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit reached. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "AI analysis failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
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
      console.error("[analyze-inspo-image] JSON parse error:", parseError);
      analysis = {
        styleName: "Analyzed Style",
        rendering: {
          font_headline: "Bebas Neue",
          font_body: "Poppins",
          font_weight: "bold",
          text_case: "uppercase",
          hook_position: "15%",
          body_position: "50%",
          cta_position: "85%",
          text_alignment: "center",
          primary_text_color: "#FFFFFF",
          secondary_text_color: "#FFFFFF",
          accent_color: "#FF6B35",
          shadow_color: "rgba(0,0,0,0.8)",
          text_shadow_enabled: true,
          shadow_blur: 10,
          text_outline_enabled: false,
          outline_width: 2,
          text_animation: "fade_in",
          reveal_style: "scale_pop",
          safe_zone_width: "70%",
        },
        colorPalette: ["#FFFFFF", "#000000", "#FF6B35"],
        hooks: [],
        cta: "",
        marketingAngle: "General marketing",
        recommendations: ["Use similar color scheme", "Match typography style"],
        rawResponse: content,
      };
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Save to inspo_analyses table
    if (organizationId) {
      const { error: insertError } = await supabase
        .from("inspo_analyses")
        .insert({
          organization_id: organizationId,
          source_url: imageUrl,
          platform: "upload",
          analysis_data: analysis,
          title: analysis.styleName || "Analyzed Style",
        });

      if (insertError) {
        console.error("[analyze-inspo-image] Failed to save analysis:", insertError);
      }

      // UPDATE ORGANIZATION STYLE PROFILE with extracted rendering settings
      if (analysis.rendering) {
        try {
          await updateOrganizationStyle(organizationId, {
            style_name: analysis.styleName,
            font_headline: analysis.rendering.font_headline,
            font_body: analysis.rendering.font_body,
            font_weight: analysis.rendering.font_weight,
            text_case: analysis.rendering.text_case,
            hook_position: analysis.rendering.hook_position,
            body_position: analysis.rendering.body_position,
            cta_position: analysis.rendering.cta_position,
            primary_text_color: analysis.rendering.primary_text_color,
            secondary_text_color: analysis.rendering.secondary_text_color,
            accent_color: analysis.rendering.accent_color,
            shadow_color: analysis.rendering.shadow_color,
            text_shadow_enabled: analysis.rendering.text_shadow_enabled,
            shadow_blur: analysis.rendering.shadow_blur,
            text_outline_enabled: analysis.rendering.text_outline_enabled,
            outline_width: analysis.rendering.outline_width,
            text_animation: analysis.rendering.text_animation,
            reveal_style: analysis.rendering.reveal_style,
            safe_zone_width: analysis.rendering.safe_zone_width,
            text_alignment: analysis.rendering.text_alignment,
          }, imageUrl);
          console.log("[analyze-inspo-image] Updated org style profile with extracted style");
        } catch (styleErr) {
          console.error("[analyze-inspo-image] Failed to update style profile:", styleErr);
        }
      }
    }

    console.log("[analyze-inspo-image] Analysis complete:", analysis.styleName);

    return new Response(
      JSON.stringify({ success: true, analysis }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[analyze-inspo-image] Error:", error);
    const message = error instanceof Error ? error.message : "Analysis failed";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
