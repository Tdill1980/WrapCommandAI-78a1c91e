import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GridRenderRequest {
  templateId: string;
  gridSize: "3x3" | "4x4";
  searchBarText: string;
  headline?: string;
  subheadline?: string;
  cta?: string;
  imageUrls: string[];
  brand: "wpw" | "restylepro";
  outputSize: "1080x1080" | "1080x1350" | "1080x1920";
  organizationId?: string;
}

// Brand color palettes
const BRAND_COLORS = {
  wpw: {
    primary: "#0033FF",
    secondary: "#E81C2E",
    accent: "#FFFFFF",
    background: "#000000",
    searchBar: "#1A1A1A",
    searchBarText: "#FFFFFF",
  },
  restylepro: {
    primary: "#6366F1",
    secondary: "#22D3EE",
    accent: "#FFFFFF",
    background: "#0F0F23",
    searchBar: "#1E1E3F",
    searchBarText: "#FFFFFF",
  },
};

// Output dimensions
const OUTPUT_SIZES = {
  "1080x1080": { width: 1080, height: 1080 },
  "1080x1350": { width: 1080, height: 1350 },
  "1080x1920": { width: 1080, height: 1920 },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: GridRenderRequest & { action?: string; renderId?: string } = await req.json();

    // Status poll for an in-progress Creatomate render (mirrors render-static-ad).
    // The client hook (useGridAdRender) polls with { action: "status", renderId }.
    if (body.action === "status") {
      const creatomateApiKey = Deno.env.get("CREATOMATE_API_KEY");
      const renderId = body.renderId;
      if (!renderId) {
        return new Response(
          JSON.stringify({ error: "renderId required for status check" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (!creatomateApiKey) {
        return new Response(
          JSON.stringify({ error: "CREATOMATE_API_KEY not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const statusRes = await fetch(`https://api.creatomate.com/v1/renders/${renderId}`, {
        headers: { Authorization: `Bearer ${creatomateApiKey}` },
      });
      const statusData = await statusRes.json();

      return new Response(
        JSON.stringify({
          success: true,
          status: statusData.status,
          url: statusData.url || null,
          error: statusData.error_message || null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const {
      templateId,
      gridSize,
      searchBarText,
      headline,
      subheadline,
      cta,
      imageUrls,
      brand,
      outputSize,
    } = body;

    console.log("Rendering grid ad:", { templateId, gridSize, brand, outputSize, imageCount: imageUrls?.length });

    const colors = BRAND_COLORS[brand] || BRAND_COLORS.wpw;
    const dimensions = OUTPUT_SIZES[outputSize] || OUTPUT_SIZES["1080x1080"];
    const cellCount = gridSize === "3x3" ? 9 : 16;
    const gridCols = gridSize === "3x3" ? 3 : 4;

    // Validate images
    if (!imageUrls || imageUrls.length < cellCount) {
      return new Response(
        JSON.stringify({ 
          error: `Need ${cellCount} images for ${gridSize} grid, got ${imageUrls?.length || 0}` 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate grid layout
    const padding = 24;
    const searchBarHeight = 56;
    const gap = 8;
    const gridTop = padding + searchBarHeight + 16;
    const gridBottom = dimensions.height - padding - (cta ? 60 : 0);
    const gridHeight = gridBottom - gridTop;
    const gridWidth = dimensions.width - (padding * 2);
    const cellSize = (gridWidth - (gap * (gridCols - 1))) / gridCols;
    const gridRows = cellCount / gridCols;
    const actualGridHeight = (cellSize * gridRows) + (gap * (gridRows - 1));

    // Build Creatomate elements array
    const elements: any[] = [];

    // Background
    elements.push({
      type: "shape",
      name: "Background",
      fill: colors.background,
      x: "50%",
      y: "50%",
      width: "100%",
      height: "100%",
    });

    // Search Bar
    elements.push({
      type: "shape",
      name: "SearchBar",
      path: "M 0,24 A 24,24 0 0,1 24,0 L 976,0 A 24,24 0 0,1 1000,24 L 1000,32 A 24,24 0 0,1 976,56 L 24,56 A 24,24 0 0,1 0,32 Z",
      fill: colors.searchBar,
      x: `${padding}px`,
      y: `${padding}px`,
      width: `${dimensions.width - (padding * 2)}px`,
      height: `${searchBarHeight}px`,
      shadow_color: "rgba(0,0,0,0.3)",
      shadow_blur: 8,
      shadow_y: 4,
    });

    // Magnifying glass icon (left side of search bar)
    elements.push({
      type: "text",
      name: "SearchIcon",
      text: "🔍",
      x: `${padding + 16}px`,
      y: `${padding + 12}px`,
      font_size: 24,
    });

    // Search bar text
    elements.push({
      type: "text",
      name: "SearchBarText",
      text: searchBarText || "SEARCH",
      font_family: "Bebas Neue",
      font_size: 28,
      font_weight: "400",
      fill: colors.searchBarText,
      x: `${padding + 56}px`,
      y: `${padding + 14}px`,
      width: `${dimensions.width - (padding * 2) - 80}px`,
      text_align: "left",
    });

    // Grid cells with images
    for (let i = 0; i < cellCount; i++) {
      const row = Math.floor(i / gridCols);
      const col = i % gridCols;
      const x = padding + (col * (cellSize + gap));
      const y = gridTop + (row * (cellSize + gap));

      // Cell background
      elements.push({
        type: "shape",
        name: `CellBg_${i}`,
        fill: "#1A1A1A",
        x: `${x}px`,
        y: `${y}px`,
        width: `${cellSize}px`,
        height: `${cellSize}px`,
        border_radius: 8,
      });

      // Image in cell
      if (imageUrls[i]) {
        elements.push({
          type: "image",
          name: `Image_${i}`,
          source: imageUrls[i],
          x: `${x}px`,
          y: `${y}px`,
          width: `${cellSize}px`,
          height: `${cellSize}px`,
          fit: "cover",
          border_radius: 8,
        });
      }
    }

    // Headline (if provided)
    if (headline) {
      const headlineY = gridTop + actualGridHeight + 20;
      elements.push({
        type: "text",
        name: "Headline",
        text: headline,
        font_family: "Bebas Neue",
        font_size: 32,
        font_weight: "400",
        fill: colors.accent,
        x: "50%",
        y: `${headlineY}px`,
        width: `${dimensions.width - (padding * 2)}px`,
        text_align: "center",
        x_anchor: "50%",
      });
    }

    // Subheadline (if provided)
    if (subheadline) {
      const subY = gridTop + actualGridHeight + (headline ? 58 : 20);
      elements.push({
        type: "text",
        name: "Subheadline",
        text: subheadline,
        font_family: "Poppins",
        font_size: 18,
        font_weight: "400",
        fill: "rgba(255,255,255,0.7)",
        x: "50%",
        y: `${subY}px`,
        width: `${dimensions.width - (padding * 2)}px`,
        text_align: "center",
        x_anchor: "50%",
      });
    }

    // CTA button (if provided)
    if (cta) {
      const ctaY = dimensions.height - padding - 40;
      elements.push({
        type: "shape",
        name: "CTABg",
        fill: colors.primary,
        x: `${padding}px`,
        y: `${ctaY}px`,
        width: `${dimensions.width - (padding * 2)}px`,
        height: "40px",
        border_radius: 20,
      });
      elements.push({
        type: "text",
        name: "CTAText",
        text: cta,
        font_family: "Bebas Neue",
        font_size: 20,
        font_weight: "400",
        fill: "#FFFFFF",
        x: "50%",
        y: `${ctaY + 10}px`,
        width: `${dimensions.width - (padding * 2)}px`,
        text_align: "center",
        x_anchor: "50%",
      });
    }

    // Build Creatomate render request
    const creatomateApiKey = Deno.env.get("CREATOMATE_API_KEY");
    
    if (!creatomateApiKey) {
      // Return layout JSON for preview if no Creatomate key
      return new Response(
        JSON.stringify({
          success: true,
          preview: true,
          layout: {
            width: dimensions.width,
            height: dimensions.height,
            elements,
            gridSize,
            cellCount,
            colors,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call Creatomate API
    const renderResponse = await fetch("https://api.creatomate.com/v1/renders", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${creatomateApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        output_format: "png",
        width: dimensions.width,
        height: dimensions.height,
        elements,
      }),
    });

    if (!renderResponse.ok) {
      const errorText = await renderResponse.text();
      console.error("Creatomate error:", errorText);
      return new Response(
        JSON.stringify({ error: "Render failed", details: errorText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const renderResult = await renderResponse.json();
    console.log("Render started:", renderResult);

    return new Response(
      JSON.stringify({
        success: true,
        renderId: renderResult[0]?.id,
        status: renderResult[0]?.status,
        url: renderResult[0]?.url,
        layout: {
          width: dimensions.width,
          height: dimensions.height,
          gridSize,
          cellCount,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in render-grid-ad:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
