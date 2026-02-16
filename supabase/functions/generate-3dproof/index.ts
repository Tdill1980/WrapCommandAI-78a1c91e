import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { vehicle, panelUrl, angle = 'front', finish = 'gloss', environment = 'studio' } = await req.json();
    
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY");

    console.log("Generating 3D proof for:", vehicle, `(${angle}, ${finish}, ${environment})`);

    // Determine finish description
    const finishMap: Record<string, string> = {
      gloss: 'high-gloss finish with sharp reflections and mirror-like surface quality',
      satin: 'satin finish with soft reflections and smooth matte sheen',
      matte: 'matte finish with no reflections, deep rich color, flat surface appearance'
    };
    const finishDescription = finishMap[finish] || finishMap.gloss;

    // Determine environment description
    const environmentMap: Record<string, string> = {
      studio: 'dark concrete studio, professional lighting with soft shadows, clean modern backdrop',
      white: 'white cyclorama studio, bright even lighting, seamless white background',
      desert: 'desert landscape, golden hour lighting, sand dunes and dramatic sky',
      city: 'urban cityscape at night, neon lights, wet reflective pavement',
      garage: 'industrial garage, dramatic spot lighting, tool boxes and equipment in background',
      showroom: 'luxury showroom, spotlights, polished floor reflections, modern architecture'
    };
    const environmentDescription = environmentMap[environment] || environmentMap.studio;

    // Camera angle description
    const angleMap: Record<string, string> = {
      front: 'front 3/4 view at 45-degree angle',
      side: 'side profile view at 90-degree angle',
      rear: 'rear 3/4 view at 45-degree angle',
      'front-close': 'front close-up view, straight on'
    };
    const cameraAngle = angleMap[angle] || angleMap.front;

    const proofPrompt = `You are a professional vehicle wrap installer and 3D visualization expert.

TASK:
Generate a photorealistic 3D wrap proof showing the provided wrap panel design applied to a ${vehicle}.

VEHICLE: ${vehicle}
CAMERA ANGLE: ${cameraAngle}
WRAP FINISH: ${finishDescription}
ENVIRONMENT: ${environmentDescription}

WRAP APPLICATION RULES:
✓ Apply the flat panel artwork as a professionally installed vehicle wrap
✓ Map design to vehicle body panels using natural installation flow
✓ Wrap continuously across body lines, doors, fenders, and panels
✓ Maintain design proportions - avoid excessive stretching or distortion
✓ Show realistic wrap adhesion following vehicle contours and curves
✓ Keep design elements aligned and continuous across panel gaps
✓ Position artwork according to vehicle body lines and natural wrap zones
✓ For horizontal panels (sides): stretch design along vehicle length
✓ For vertical panels (rear): apply design vertically centered
✓ Show professional installation quality with no bubbles or imperfections

RENDERING QUALITY:
✓ Photorealistic vehicle render with accurate body shape
✓ Show correct ${finish} wrap finish with appropriate reflections
✓ Emphasize wrapped panels with proper lighting
✓ Accurate shadows, reflections, and material properties
✓ Clean, professional automotive photography aesthetic
✓ No cartoon style, no fisheye distortion, no unrealistic proportions

CRITICAL: The wrap pattern must appear seamlessly applied to the entire vehicle body, maintaining the design's integrity while following the natural curves and lines of the ${vehicle}.`;

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
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: proofPrompt },
                { type: "image_url", image_url: { url: panelUrl } }
              ]
            }
          ],
          modalities: ["image"]
        })
      }
    );

    if (!aiRes.ok) {
      const error = await aiRes.text();
      console.error("AI API error:", aiRes.status, error);
      throw new Error(`3D proof generation failed: ${error}`);
    }

    const data = await aiRes.json();
    const render = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!render) throw new Error("No 3D proof generated");

    console.log("3D proof generated successfully for:", vehicle, angle);

    return new Response(JSON.stringify({ render }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("generate-3dproof error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
