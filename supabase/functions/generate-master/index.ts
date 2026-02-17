import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { width, height, style, subStyle, intensity } = await req.json();

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing");

    console.log("Generating master canvas:", {
      width,
      height,
      style,
      subStyle,
      intensity
    });

    // Professional Style Routing with Industry-Grade Prompts
    let stylePrompt = "";
    
    if (style === "commercial") {
      const commercialStyles = {
        clean: `Create a professional commercial vehicle wrap design with clean, modern aesthetics:
- Bold 2-3 color palette with high contrast
- Large geometric color blocks with diagonal or curved divisions
- 30-45 degree angles for dynamic flow
- Clean negative space for branding areas
- Sharp, crisp edges and smooth gradients
- Professional color combinations (blue/white, orange/black, red/black)
- Modern, minimalist composition suitable for commercial vehicles`,

        bold: `Create a bold, attention-grabbing commercial wrap design:
- High-contrast color scheme (2-3 vibrant colors max)
- Large, thick geometric shapes creating strong visual impact
- Diagonal sweeps or angular divisions at 30-60 degree angles
- Bold stripes, chevrons, or arrow-like directional elements
- Clean, professional finish with sharp boundaries
- Color blocks that flow from one edge to opposite corners
- Strong visual hierarchy and movement`,

        patterned: `Create a sophisticated patterned commercial wrap:
- Repeating geometric patterns (hexagons, diamonds, or modern tessellations)
- Professional texture overlay (carbon fiber, brushed metal, or subtle gradients)
- 2-3 color maximum for clean execution
- Pattern density varies across panel for visual interest
- Clean borders and frame elements
- Modern, tech-forward aesthetic
- Balanced composition with patterned and solid areas`,

        premium: `Create a luxury premium commercial wrap design:
- Elegant metallic gradients (silver, gold, or bronze tones)
- Smooth, flowing curves and sweeping lines
- Subtle chrome or brushed metal effects
- Sophisticated 2-tone color palette
- Minimal, refined composition
- Elegant swooshes or wave-like elements
- High-end automotive finish appearance`
      };
      stylePrompt = commercialStyles[subStyle as keyof typeof commercialStyles] ?? commercialStyles.clean;
      
    } else if (style === "restyle") {
      stylePrompt = `Create a wild, artistic custom vehicle wrap design:
- Bold flame patterns with chrome/metallic outline effects
- Dynamic splatter or abstract artistic elements
- Aggressive honeycomb or geometric breakup patterns
- High-energy composition with movement and flow
- 2-3 vibrant colors with metallic accents
- Professional execution of artistic chaos
- Sharp details and clean edges even in complex patterns
- Racing-inspired aesthetic with artistic flair`;

    } else if (style === "anime") {
      stylePrompt = `Create a professional anime/manga-style vehicle wrap:
- Clean cel-shaded coloring with bold outlines
- Manga-style halftone patterns for depth
- Bold line work and sharp character silhouettes
- Dynamic composition with action-oriented layout
- Vibrant, saturated anime color palette
- Professional comic book style execution
- Clean integration of character art with geometric backgrounds
- Sharp, vector-quality finish`;

    } else if (style === "livery") {
      stylePrompt = `Create a professional motorsport livery wrap design:
- Sharp, angular geometric cuts inspired by racing graphics
- Aggressive diagonal lines and speed-oriented shapes
- Bold number placement areas and sponsor blocks
- 2-3 colors maximum for clear visibility at speed
- Dynamic swooshes suggesting forward motion
- Professional racing aesthetic (F1, NASCAR, Rally inspired)
- Clean, technical execution with precision edges
- Aerodynamic-looking line flow`;

    } else if (style === "racing") {
      stylePrompt = `Create an aggressive racing stripe vehicle wrap:
- Bold racing stripes (single or double) with dynamic angles
- Diagonal speed lines or motion blur effects
- Sharp geometric chevrons or arrow shapes
- High-contrast color combinations (black/red, white/blue, black/orange)
- Racing numbers integration areas
- Aggressive 25-45 degree angle swoops
- Professional motorsport finish
- Clean, technical precision in all lines`;

    } else if (style === "offroad") {
      stylePrompt = `Create a rugged off-road vehicle wrap design:
- Military-inspired camo patterns or terrain textures
- Cracked earth, mud splatter, or rugged texture effects
- Bold outdoor color palette (olive, tan, orange, black)
- Aggressive angular shapes suggesting durability
- Distressed or weathered appearance effects
- Adventure-themed composition
- Professional execution of rugged aesthetic
- Clean integration of texture and solid colors`;

    } else if (style === "highend") {
      stylePrompt = `Create a luxury high-end vehicle wrap design:
- Sophisticated satin gradients in premium colors
- Subtle metallic accents (rose gold, platinum, brushed aluminum)
- Elegant, flowing curves and smooth transitions
- Minimal, refined composition with maximum impact
- 2-tone luxury color palette
- Premium automotive finish appearance
- Smooth, professional gradient execution
- Understated elegance and sophistication`;
    }

    const intensityMap = {
      extreme: "Maximum visual impact - Bold, aggressive shapes filling the entire panel with high contrast and dramatic angles. Push the design to the limits while maintaining professional execution.",
      soft: "Subtle, refined approach - Gentle curves, smooth gradients, and elegant restraint. Sophisticated and understated with professional polish.",
      balanced: "Professional balance - Strong visual presence without overwhelming. Clean execution with appropriate contrast and well-proportioned elements."
    };

    const intensityPrompt = intensityMap[intensity as keyof typeof intensityMap] ?? intensityMap.balanced;

    const prompt = `You are a professional vehicle wrap designer creating a production-ready flat wrap panel.

CRITICAL REQUIREMENTS:
✓ This is a FLAT PANEL for printing - NO 3D perspective, NO vehicle shown
✓ Perfect rectangle format: ${width}" wide × ${height}" tall
✓ Edge-to-edge artwork that bleeds to all edges
✓ Professional print quality with sharp, clean execution
✓ Vector-like precision - crisp edges, smooth curves, clean gradients

DESIGN SPECIFICATIONS:
${stylePrompt}

INTENSITY LEVEL:
${intensityPrompt}

COMPOSITION RULES:
- Design flows across the ENTIRE rectangle
- Elements extend to and bleed off all four edges
- No borders or frames - full bleed artwork
- Strategic use of negative space for visual impact
- Professional color theory - limit to 2-3 main colors
- Clean, production-ready finish

TECHNICAL EXECUTION:
- Sharp, precise edges on all shapes
- Smooth, professional gradients (no banding)
- High-contrast elements for visibility
- Clean color separation for printing
- No text, logos, or specific branding
- Abstract/geometric design only

OUTPUT: A flat, rectangular wrap panel design ready for professional printing and installation on vehicles.`;


    const ai = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent",
      {
        method: "POST",
        headers: {
          "x-goog-api-key": GEMINI_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ["TEXT", "IMAGE"] }
        })
      }
    );

    if (!ai.ok) {
      const errorText = await ai.text();
      console.error("AI API error:", ai.status, errorText);
      throw new Error(`AI generation failed: ${errorText}`);
    }

    const json = await ai.json();
    let preview: string | null = null;
    const parts = json?.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.mimeType?.startsWith("image/")) {
        preview = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        break;
      }
    }

    if (!preview) throw new Error("No image returned from AI");

    return new Response(JSON.stringify({ preview }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error("generate-master error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), 
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});
