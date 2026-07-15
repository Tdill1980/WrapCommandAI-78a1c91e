// supabase/functions/render-static-ad/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const CREATOMATE_API_KEY = Deno.env.get("CREATOMATE_API_KEY");
const CREATOMATE_API_URL = "https://api.creatomate.com/v1/renders";

// Template ID mapping for Creatomate templates
const TEMPLATE_MAP: Record<string, Record<string, string>> = {
  bold_premium: {
    "4:5": "bold_premium_4x5",
    "1:1": "bold_premium_1x1",
    "9:16": "bold_premium_9x16",
  },
  before_after: {
    "4:5": "before_after_4x5",
    "1:1": "before_after_1x1",
    "9:16": "before_after_9x16",
  },
  gradient_slick: {
    "4:5": "gradient_slick_4x5",
    "1:1": "gradient_slick_1x1",
    "9:16": "gradient_slick_9x16",
  },
  luxury_dark: {
    "4:5": "luxury_dark_4x5",
    "1:1": "luxury_dark_1x1",
    "9:16": "luxury_dark_9x16",
  },
  text_left_image_right: {
    "4:5": "text_left_image_right_4x5",
    "1:1": "text_left_image_right_1x1",
    "9:16": "text_left_image_right_9x16",
  },
  ugc_social_proof: {
    "4:5": "ugc_social_proof_4x5",
    "1:1": "ugc_social_proof_1x1",
    "9:16": "ugc_social_proof_9x16",
  },
};

// Dimensions for each aspect ratio
const DIMENSIONS: Record<string, { width: number; height: number }> = {
  "4:5": { width: 1080, height: 1350 },
  "1:1": { width: 1080, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    // Status check for polling
    if (action === "status") {
      const { render_id } = body;
      if (!render_id) {
        return new Response(
          JSON.stringify({ success: false, error: "render_id required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const statusRes = await fetch(`${CREATOMATE_API_URL}/${render_id}`, {
        headers: { Authorization: `Bearer ${CREATOMATE_API_KEY}` },
      });

      const statusData = await statusRes.json();

      return new Response(
        JSON.stringify({
          success: true,
          status: statusData.status,
          progress: statusData.progress || 0,
          url: statusData.url || null,
          error: statusData.error_message || null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Start render
    if (action === "start") {
      const {
        mode,
        template_id,
        aspect_ratio = "4:5",
        headline,
        cta,
        media_url,
        layout_json,
        brand_colors,
      } = body;

      const dims = DIMENSIONS[aspect_ratio] || DIMENSIONS["4:5"];
      let renderPayload: Record<string, unknown>;

      if (mode === "template" && template_id) {
        // Template-based rendering
        const templateKey = TEMPLATE_MAP[template_id]?.[aspect_ratio];
        
        if (!templateKey) {
          // Fallback: generate elements-based render
          renderPayload = buildElementsPayload(dims, headline, cta, media_url, brand_colors);
        } else {
          renderPayload = {
            template_id: templateKey,
            modifications: {
              "Headline.text": headline || "Transform Your Ride",
              "CTA.text": cta || "Get Quote",
              ...(media_url && { "Vehicle.source": media_url }),
            },
          };
        }
      } else if (mode === "ai" && layout_json) {
        // AI-composed rendering using layout spec
        renderPayload = convertLayoutToElements(layout_json, dims, headline, cta, media_url);
      } else {
        // Default elements-based render
        renderPayload = buildElementsPayload(dims, headline, cta, media_url, brand_colors);
      }

      console.log("Creatomate render payload:", JSON.stringify(renderPayload));

      const renderRes = await fetch(CREATOMATE_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${CREATOMATE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(renderPayload),
      });

      if (!renderRes.ok) {
        const errorText = await renderRes.text();
        console.error("Creatomate error:", errorText);
        throw new Error(`Creatomate API error: ${renderRes.status}`);
      }

      const renderData = await renderRes.json();
      const renderId = Array.isArray(renderData) ? renderData[0]?.id : renderData.id;

      return new Response(
        JSON.stringify({
          success: true,
          render_id: renderId,
          status: "pending",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("render-static-ad error:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function buildElementsPayload(
  dims: { width: number; height: number },
  headline?: string,
  cta?: string,
  mediaUrl?: string,
  brandColors?: string[]
) {
  const primaryColor = brandColors?.[0] || "#E1306C";
  const bgColor = brandColors?.[1] || "#000000";

  return {
    output_format: "png",
    width: dims.width,
    height: dims.height,
    elements: [
      {
        type: "rectangle",
        width: "100%",
        height: "100%",
        fill_color: bgColor,
      },
      ...(mediaUrl
        ? [
            {
              type: "image",
              source: mediaUrl,
              fit: "cover",
              width: "100%",
              height: "100%",
              opacity: 0.85,
            },
          ]
        : []),
      {
        type: "rectangle",
        width: "100%",
        height: "100%",
        fill_color: "#00000060",
      },
      {
        type: "text",
        text: headline || "Transform Your Ride",
        font_family: "Montserrat",
        font_weight: 800,
        font_size: Math.round(dims.width * 0.075),
        fill_color: "#ffffff",
        x: "50%",
        y: "15%",
        width: "90%",
        text_align: "center",
        line_height: 1.1,
      },
      {
        type: "text",
        text: cta || "Get Quote",
        font_family: "Montserrat",
        font_weight: 700,
        font_size: Math.round(dims.width * 0.045),
        fill_color: "#ffffff",
        background_color: primaryColor,
        padding: 28,
        border_radius: 16,
        x: "50%",
        y: "88%",
        width: "55%",
        text_align: "center",
      },
    ],
  };
}

function convertLayoutToElements(
  layout: Record<string, unknown>,
  dims: { width: number; height: number },
  headline?: string,
  cta?: string,
  mediaUrl?: string
) {
  const elements: Record<string, unknown>[] = [];
  const bg = (layout.background as string) || "#1a1a2e";
  const palette = (layout.colorPalette as string[]) || ["#E1306C", "#833AB4"];

  // Background
  if (bg.includes("gradient")) {
    elements.push({
      type: "rectangle",
      width: "100%",
      height: "100%",
      fill_color: palette[0] || "#1a1a2e",
    });
  } else {
    elements.push({
      type: "rectangle",
      width: "100%",
      height: "100%",
      fill_color: bg,
    });
  }

  // Vehicle image
  if (mediaUrl) {
    const imgLayout = layout.layout as string || "center";
    let imgX = "50%";
    let imgWidth = "90%";

    if (imgLayout.includes("right")) {
      imgX = "70%";
      imgWidth = "55%";
    } else if (imgLayout.includes("left")) {
      imgX = "30%";
      imgWidth = "55%";
    }

    elements.push({
      type: "image",
      source: mediaUrl,
      fit: "contain",
      x: imgX,
      y: "55%",
      width: imgWidth,
      height: "70%",
    });
  }

  // Headline
  const headlinePos = layout.headlinePosition as { x?: number; y?: number } || {};
  elements.push({
    type: "text",
    text: headline || "Transform Your Ride",
    font_family: "Montserrat",
    font_weight: 800,
    font_size: Math.round(dims.width * 0.07),
    fill_color: "#ffffff",
    x: headlinePos.x ? `${headlinePos.x * 100}%` : "50%",
    y: headlinePos.y ? `${headlinePos.y * 100}%` : "12%",
    width: "85%",
    text_align: "center",
    line_height: 1.1,
  });

  // CTA
  const ctaPos = layout.ctaPosition as { x?: number; y?: number } || {};
  elements.push({
    type: "text",
    text: cta || "Get Quote",
    font_family: "Montserrat",
    font_weight: 700,
    font_size: Math.round(dims.width * 0.042),
    fill_color: "#ffffff",
    background_color: palette[0] || "#E1306C",
    padding: 26,
    border_radius: 14,
    x: ctaPos.x ? `${ctaPos.x * 100}%` : "50%",
    y: ctaPos.y ? `${ctaPos.y * 100}%` : "90%",
    width: "50%",
    text_align: "center",
  });

  return {
    output_format: "png",
    width: dims.width,
    height: dims.height,
    elements,
  };
}
