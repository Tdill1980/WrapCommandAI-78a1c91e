import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ExtractedStyle {
  font_headline?: string;
  font_body?: string;
  primary_text_color?: string;
  accent_color?: string;
  background_style?: string;
  text_position?: string;
  text_animation?: string;
  layout?: string;
}

interface StaticRequest {
  template: string;
  headline: string;
  bodyText?: string;
  ctaText?: string;
  brand?: string;
  platform?: string;
  contentPurpose?: string;
  slideCount?: number;
  // NEW: Style reference from uploaded example
  styleReference?: {
    imageUrl: string;
    extractedStyle: ExtractedStyle;
  };
  // NEW: Wrapped vehicle photo to feature
  wrappedVehicleUrl?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: StaticRequest = await req.json();
    const { 
      template, headline, bodyText, ctaText, brand, platform, contentPurpose, slideCount,
      styleReference, wrappedVehicleUrl 
    } = body;

    if (!headline) {
      return new Response(
        JSON.stringify({ error: "headline is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    console.log(`Generating static content: template=${template}, headline=${headline}, hasStyleRef=${!!styleReference}, hasVehicle=${!!wrappedVehicleUrl}`);

    // For carousels, we generate multiple slides
    const isCarousel = slideCount && slideCount > 1;
    let lastImageError: string | null = null;
    
    // Build style instructions based on reference
    const styleInstructions = styleReference?.extractedStyle ? `
STYLE REFERENCE (MATCH THIS EXACTLY):
- Headline Font: ${styleReference.extractedStyle.font_headline || "Bold Sans-Serif"}
- Body Font: ${styleReference.extractedStyle.font_body || "Clean Sans-Serif"}
- Primary Text Color: ${styleReference.extractedStyle.primary_text_color || "#FFFFFF"}
- Accent Color: ${styleReference.extractedStyle.accent_color || "#FF6B35"}
- Background Style: ${styleReference.extractedStyle.background_style || "Dark gradient"}
- Text Position: ${styleReference.extractedStyle.text_position || "Center"}
- Layout: ${styleReference.extractedStyle.layout || "Centered with visual hierarchy"}

CRITICAL: Match this style reference exactly - fonts, colors, positioning, and overall aesthetic.
` : "";

    const vehicleInstructions = wrappedVehicleUrl ? `
VEHICLE PHOTO TO FEATURE:
This design should prominently feature the wrapped vehicle from this photo: ${wrappedVehicleUrl}
The vehicle wrap is the star - make sure it's visible and impressive.
` : "";

    const singlePostSchema = `{
  "layout": {
    "background_type": "gradient" | "solid" | "image",
    "background_value": string (gradient CSS or hex color),
    "elements": [
      {
        "type": "text" | "shape" | "icon",
        "content": string,
        "position": { "x": number (0-100%), "y": number (0-100%) },
        "style": {
          "fontSize": number,
          "fontWeight": "400" | "600" | "700" | "800",
          "color": string (hex),
          "textAlign": "left" | "center" | "right"
        }
      }
    ]
  },
  "dimensions": { "width": 1080, "height": 1080 },
  "colorPalette": string[] (3-5 hex colors used),
  "caption": string (Instagram caption for this post),
  "hashtags": string[] (5-10 relevant hashtags)
}`;

    // Carousel schema is DIFFERENT and must be valid JSON — the old template
    // wrapped a single object in "slides": [ with a dangling brace.
    const carouselSchema = `{
  "slides": [
    {
      "slide_number": number (1-${slideCount}),
      "headline": string (short punchy headline for this slide),
      "body": string (1-2 sentence supporting copy for this slide),
      "visual_direction": string (what the slide graphic should show)
    }
  ],
  "carousel_caption": string (one Instagram caption for the whole carousel),
  "hashtags": string[] (5-10 relevant hashtags),
  "cta": string (final-slide call to action)
}`;

    const systemPrompt = `You are an expert social media graphic designer specializing in ${brand || "vehicle wrap"} industry content.
Create ${isCarousel ? `a ${slideCount}-slide carousel` : "a single static post"} design specification that is visually compelling and optimized for ${platform || "Instagram"}.

${styleInstructions}
${vehicleInstructions}

Return a JSON object with EXACTLY this shape:
${isCarousel ? carouselSchema : singlePostSchema}

For ${brand || "vehicle wrap"} content:
- Use bold, high-contrast typography
- Include strong visual hierarchy
- Colors should match industry aesthetic (blacks, metallic accents, vibrant brand colors)
- Make text punchy and scannable`;

    const userPrompt = `Create a ${isCarousel ? `${slideCount}-slide carousel` : "static post"} design for:

Template Style: ${template}
Headline: ${headline}
${bodyText ? `Body Text: ${bodyText}` : ""}
${ctaText ? `CTA: ${ctaText}` : ""}
Brand: ${brand || "WPW"}
Platform: ${platform || "Instagram"}
Purpose: ${contentPurpose || "organic"}
${styleReference ? "IMPORTANT: Match the uploaded style reference exactly!" : ""}
${wrappedVehicleUrl ? "IMPORTANT: Feature the uploaded wrapped vehicle prominently!" : ""}

Make it visually striking and optimized for engagement.`;

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
      const errorText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    // Parse the JSON from response
    let design;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        design = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found");
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      // Return a fallback design
      design = {
        layout: {
          background_type: "gradient",
          background_value: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
          elements: [
            {
              type: "text",
              content: headline,
              position: { x: 50, y: 35 },
              style: { fontSize: 48, fontWeight: "800", color: "#FFFFFF", textAlign: "center" }
            },
            {
              type: "text", 
              content: bodyText || "",
              position: { x: 50, y: 55 },
              style: { fontSize: 24, fontWeight: "400", color: "#E0E0E0", textAlign: "center" }
            },
            {
              type: "text",
              content: ctaText || "Learn More",
              position: { x: 50, y: 80 },
              style: { fontSize: 28, fontWeight: "700", color: "#FF6B35", textAlign: "center" }
            }
          ]
        },
        dimensions: { width: 1080, height: 1080 },
        colorPalette: ["#1a1a2e", "#16213e", "#0f3460", "#FF6B35", "#FFFFFF"],
        caption: headline + (bodyText ? `\n\n${bodyText}` : ""),
        hashtags: ["#vehiclewrap", "#carwrap", "#vinylwrap", "#transformation", "#automotive"]
      };
    }

    // Build enhanced image prompt with style reference and vehicle
    const styleColors = styleReference?.extractedStyle
      ? `Use these exact colors: primary=${styleReference.extractedStyle.primary_text_color || "#FFFFFF"}, accent=${styleReference.extractedStyle.accent_color || "#FF6B35"}`
      : "Colors: Dark professional theme with orange/red accents";

    const generateImage = async (headlineText: string, subText?: string, cta?: string, visualDirection?: string): Promise<string | null> => {
      const imagePrompt = `Create a professional social media graphic for a vehicle wrap business:
- Style: ${template}
- Headline text: "${headlineText}"
${subText ? `- Subtext: "${subText}"` : ""}
${cta ? `- Call to action: "${cta}"` : ""}
${visualDirection ? `- Visual direction: ${visualDirection}` : ""}
- Brand: ${brand || "WPW"}
- ${styleColors}
${wrappedVehicleUrl ? `- IMPORTANT: Feature this wrapped vehicle prominently in the design (reference: ${wrappedVehicleUrl})` : ""}
- Make it bold, modern, and suitable for Instagram
- 1:1 square aspect ratio
- High contrast text that's easy to read
- Professional automotive industry aesthetic
Ultra high resolution.`;

      const imageResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GEMINI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gemini-2.5-flash-image",
          messages: [
            { role: "user", content: imagePrompt }
          ],
          modalities: ["image", "text"]
        }),
      });
      if (!imageResponse.ok) {
        lastImageError = `HTTP ${imageResponse.status}: ${(await imageResponse.text()).slice(0, 500)}`;
        console.warn("Image generation failed:", lastImageError);
        return null;
      }
      const imageData = await imageResponse.json();
      const url = imageData.choices?.[0]?.message?.images?.[0]?.image_url?.url || null;
      if (!url) lastImageError = `no image in response: ${JSON.stringify(imageData).slice(0, 500)}`;
      return url;
    };

    // ===== CAROUSEL: one image per slide + carousel-level caption =====
    if (isCarousel && Array.isArray(design.slides) && design.slides.length > 0) {
      const slideSpecs = design.slides.slice(0, Math.min(slideCount!, 6));
      const slides = [];
      for (const [i, slide] of slideSpecs.entries()) {
        const preview = await generateImage(
          slide.headline || `${headline} — ${i + 1}`,
          slide.body,
          i === slideSpecs.length - 1 ? (design.cta || ctaText) : undefined,
          slide.visual_direction
        );
        slides.push({
          slide_number: slide.slide_number ?? i + 1,
          headline: slide.headline,
          caption: slide.body,
          preview_url: preview,
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          mode: "carousel",
          design,
          slides,
          carousel_caption: design.carousel_caption || headline,
          hashtags: design.hashtags || [],
          cta: design.cta || ctaText || null,
          // Back-compat fields (single-post consumers)
          imageUrl: slides[0]?.preview_url || null,
          caption: design.carousel_caption || headline,
          image_error: lastImageError,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== SINGLE POST (unchanged behavior) =====
    const imageUrl = await generateImage(headline, bodyText, ctaText);

    return new Response(
      JSON.stringify({
        success: true,
        design,
        imageUrl,
        caption: design.caption,
        hashtags: design.hashtags
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in ai-generate-static:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
