import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      panelUrl, 
      vehicleModelId, 
      angle = 'front', 
      finish = 'gloss', 
      environment = 'studio',
      selectedPanels = [] // Array of panel names to apply wrap to
    } = await req.json();

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing");

    // Fetch vehicle data from database
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: vehicle, error: vehicleError } = await supabase
      .from("vehicle_models")
      .select("*")
      .eq("id", vehicleModelId)
      .single();

    if (vehicleError || !vehicle) {
      console.error("Vehicle not found:", vehicleError);
      throw new Error("Vehicle not found in database");
    }

    console.log("Generating 3D render for:", vehicle.year, vehicle.make, vehicle.model, `(${angle}, ${finish}, ${environment})`);

    // Parse panel geometry for smart wrap application
    const panelGeometry = vehicle.panel_geometry?.panels || [];
    const panelsToApply = selectedPanels.length > 0 ? selectedPanels : panelGeometry.map((p: any) => p.name);

    // Build panel application instructions
    let panelInstructions = "";
    if (panelGeometry.length > 0 && panelsToApply.length > 0) {
      panelInstructions = `\n\nPANEL APPLICATION INSTRUCTIONS:
Apply the wrap design to the following vehicle panels: ${panelsToApply.join(", ")}

Panel Geometry Reference:
${panelGeometry
  .filter((p: any) => panelsToApply.includes(p.name))
  .map((p: any) => `- ${p.name}: ${p.width_in}" wide × ${p.height_in}" tall (${p.orientation})`)
  .join("\n")}

WRAP APPLICATION RULES:
✓ Position artwork naturally according to vehicle body lines
✓ For SIDE PANELS: Stretch design horizontally along vehicle length, maintain height proportions
✓ For HOOD/ROOF: Center design and scale to fit panel dimensions
✓ For REAR panels: Apply vertically centered, respecting panel height
✓ Mirror side_1 design to side_2 for symmetry
✓ Wrap smoothly across doors, fenders, and body gaps
✓ Maintain design continuity and professional installation appearance
✓ Stretch artwork minimally - preserve design integrity
✓ Flow design along natural vehicle contours and body lines`;
    }

    // Determine camera angle from vehicle data
    let cameraAngle = vehicle.angle_front || 'front 3/4 view, 45-degree angle';
    if (angle === 'side') cameraAngle = vehicle.angle_side || 'side profile view, 90-degree angle';
    if (angle === 'rear') cameraAngle = vehicle.angle_rear || 'rear 3/4 view, 45-degree angle';
    if (angle === 'front-close') cameraAngle = vehicle.angle_front_close || 'front close-up view, straight on';

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

    // Build professional wrap application prompt
    const prompt = `You are a professional vehicle wrap installer and 3D visualization expert.

TASK:
Apply the provided flat wrap panel design to a ${vehicle.year} ${vehicle.make} ${vehicle.model} vehicle, creating a photorealistic 3D render showing accurate wrap installation.

VEHICLE SPECIFICATIONS:
- Vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model}
- Camera angle: ${cameraAngle}
- Wrap finish: ${finishDescription}
- Environment: ${environmentDescription}
${panelInstructions}

CRITICAL WRAP APPLICATION RULES:
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

${vehicle.render_prompt || 'Emphasize accurate vehicle proportions and professional wrap installation appearance.'}`;

    const ai = await fetch(
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
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: panelUrl } }
              ]
            }
          ],
          modalities: ["image"]
        })
      }
    );

    if (!ai.ok) {
      const errorText = await ai.text();
      console.error("AI API error:", ai.status, errorText);
      throw new Error(`3D generation failed: ${errorText}`);
    }

    const json = await ai.json();
    const render = json?.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!render) throw new Error("No 3D render returned");

    console.log("3D render generated successfully for:", vehicle.make, vehicle.model, angle);

    return new Response(JSON.stringify({ render }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error("generate-3d error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});