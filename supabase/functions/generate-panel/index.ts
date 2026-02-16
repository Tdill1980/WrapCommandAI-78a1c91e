import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, style, size } = await req.json();

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing");

    // FadeWrap™ Sizing Logic
    const sizeMap: Record<string, { w: number; h: number }> = {
      small:  { w: 144, h: 59.5 },
      medium: { w: 172, h: 59.5 },
      large:  { w: 200, h: 59.5 },
      xl:     { w: 240, h: 59.5 }
    };

    const panel = sizeMap[size.toLowerCase()];
    if (!panel) throw new Error("Invalid size");

    const aiPrompt = `
Generate a print-ready rectangular wrap panel design.
Panel size: ${panel.w} inches by ${panel.h} inches.
Aspect ratio must match exactly.

Design Style: ${style}
Creative Direction: ${prompt}

Rules:
- Full edge-to-edge coverage.
- No vehicle in frame.
- Must be install-friendly.
- High contrast, clean edges.
- Must look like a real wrap panel.
- Rectangular output only.

Output a SINGLE flat design image.
    `;

    const aiRes = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GEMINI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gemini-3-pro-image-preview",
          messages: [{ role: "user", content: aiPrompt }],
          modalities: ["image"]
        })
      }
    );

    if (!aiRes.ok) {
      const error = await aiRes.text();
      console.error("AI API error:", aiRes.status, error);
      throw new Error(`Panel generation failed: ${error}`);
    }

    const data = await aiRes.json();
    const imageUrl = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageUrl) throw new Error("No panel generated");

    console.log("Panel generated successfully:", panel);

    return new Response(JSON.stringify({
      panel_url: imageUrl,
      panel_width_in: panel.w,
      panel_height_in: panel.h
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("generate-panel error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
