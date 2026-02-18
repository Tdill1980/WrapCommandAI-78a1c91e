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

    // Fetch panel image and convert to base64 for native Gemini API
    const userParts: any[] = [{ text: proofPrompt }];
    try {
      const imgRes = await fetch(panelUrl);
      if (imgRes.ok) {
        const imgMime = imgRes.headers.get("content-type") || "image/png";
        const imgBuf = await imgRes.arrayBuffer();
        const uint8 = new Uint8Array(imgBuf);
        let binary = "";
        const chunkSize = 8192;
        for (let i = 0; i < uint8.length; i += chunkSize) {
          const chunk = uint8.subarray(i, i + chunkSize);
          binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
        }
        userParts.push({ inlineData: { mimeType: imgMime, data: btoa(binary) } });
      }
    } catch (imgErr) {
      console.error("Failed to fetch panel image:", imgErr);
    }

    const aiRes = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent",
      {
        method: "POST",
        headers: {
          "x-goog-api-key": GEMINI_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: userParts }],
          generationConfig: { responseModalities: ["TEXT", "IMAGE"] }
        })
      }
    );

    if (!aiRes.ok) {
      const error = await aiRes.text();
      console.error("AI API error:", aiRes.status, error);
      throw new Error(`3D proof generation failed: ${error}`);
    }

    const data = await aiRes.json();
    let render: string | null = null;
    const resParts = data?.candidates?.[0]?.content?.parts || [];
    for (const part of resParts) {
      if (part.inlineData?.mimeType?.startsWith("image/")) {
        render = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        break;
      }
    }

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
