import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * Analyze Vehicle from 2D Proof Image
 *
 * Uses Gemini Vision to detect:
 * - Vehicle type (van, truck, car, SUV, trailer)
 * - Make/Model if visible
 * - Panel layout
 */

interface VehicleAnalysis {
  vehicleType: "van" | "truck" | "car" | "suv" | "trailer" | "unknown";
  vehicleCategory: string; // More specific: "cargo_van", "pickup_truck", "box_truck", etc.
  make: string | null;
  model: string | null;
  year: string | null;
  confidence: number;
  detectedPanels: string[];
  suggestedVehicle: string; // Full description for prompt
  reasoning: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { imageUrl } = await req.json();

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY");

    if (!imageUrl) throw new Error("imageUrl is required");

    console.log("[analyze-vehicle] Analyzing image:", imageUrl.substring(0, 100));

    // Fetch the image and convert to base64
    let imageBase64: string;
    let mimeType = "image/png";

    if (imageUrl.startsWith('data:')) {
      const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (matches) {
        mimeType = matches[1];
        imageBase64 = matches[2];
      } else {
        throw new Error("Invalid data URL format");
      }
    } else {
      const imgResponse = await fetch(imageUrl);
      if (!imgResponse.ok) throw new Error(`Failed to fetch image: ${imgResponse.status}`);
      mimeType = imgResponse.headers.get("content-type") || "image/png";
      const imgBuffer = await imgResponse.arrayBuffer();
      const uint8Array = new Uint8Array(imgBuffer);
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
      }
      imageBase64 = btoa(binary);
    }

    const analysisPrompt = `You are an expert vehicle wrap specialist analyzing a 2D proof image for a vehicle wrap.

TASK: Analyze this 2D wrap proof/mockup and determine what type of vehicle it is designed for.

ANALYZE THE IMAGE FOR:
1. VEHICLE TYPE - Look at the shape, proportions, and panel layout:
   - VAN: Tall rectangular body, sliding doors, cargo area (Transit, Sprinter, ProMaster)
   - TRUCK: Pickup with bed, cab + separate cargo bed (F-150, Silverado, RAM 1500)
   - BOX TRUCK: Large rectangular cargo box (like delivery trucks)
   - CAR: Standard sedan/coupe/hatchback shape
   - SUV: Taller vehicle with enclosed cargo area, 4+ doors
   - TRAILER: No cab, just cargo/flatbed

2. SPECIFIC MAKE/MODEL - Look for:
   - Body shape distinctive to certain manufacturers
   - Grille patterns, headlight shapes
   - Panel proportions
   - Door configurations (sliding doors = van, etc.)

3. PANEL LAYOUT - Identify which panels are shown:
   - driver_side, passenger_side, front, rear, roof, hood, tailgate

COMMON VEHICLE IDENTIFICATION:
- Ford Transit: Tall cargo van, distinctive front grille, sliding side door
- Mercedes Sprinter: Very tall/long cargo van, rounded front
- RAM ProMaster: Wide, boxy front, FWD cargo van
- Ford F-150: Pickup truck with separate bed
- Chevy Silverado: Pickup truck, distinctive grille
- RAM 1500: Pickup truck, crosshair grille

RESPOND IN THIS EXACT JSON FORMAT:
{
  "vehicleType": "van" | "truck" | "car" | "suv" | "trailer" | "unknown",
  "vehicleCategory": "cargo_van" | "pickup_truck" | "box_truck" | "sedan" | "suv" | "trailer" | "other",
  "make": "Ford" | "Chevy" | "RAM" | "Mercedes" | null,
  "model": "Transit" | "F-150" | "Sprinter" | "Silverado" | null,
  "year": "2024" | null,
  "confidence": 0.0-1.0,
  "detectedPanels": ["driver_side", "passenger_side", "rear", etc.],
  "suggestedVehicle": "2024 Ford Transit Cargo Van",
  "reasoning": "Explain how you identified the vehicle type"
}

CRITICAL:
- If the image shows a VAN (tall cargo vehicle with sliding doors), vehicleType MUST be "van"
- If the image shows a TRUCK (pickup with separate bed), vehicleType MUST be "truck"
- DO NOT confuse vans with trucks - they have completely different body shapes
- A Ford Transit is a VAN, not a truck
- A Ford F-150 is a TRUCK, not a van`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${GEMINI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          messages: [{
            role: "user",
            content: [
              { type: "text", text: analysisPrompt },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } }
            ]
          }],
          temperature: 0.1,
          max_tokens: 1024
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("[analyze-vehicle] Lovable API error:", response.status, error);
      throw new Error(`Vehicle analysis failed: ${error}`);
    }

    const data = await response.json();
    const textContent = data?.choices?.[0]?.message?.content;

    if (!textContent) {
      throw new Error("No analysis returned from Gemini");
    }

    console.log("[analyze-vehicle] Raw response:", textContent.substring(0, 500));

    // Parse the JSON from the response
    let analysis: VehicleAnalysis;
    try {
      // Extract JSON from the response (might be wrapped in markdown code blocks)
      const jsonMatch = textContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in response");
      analysis = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error("[analyze-vehicle] JSON parse error:", parseError);
      // Return a default unknown response
      analysis = {
        vehicleType: "unknown",
        vehicleCategory: "other",
        make: null,
        model: null,
        year: null,
        confidence: 0,
        detectedPanels: [],
        suggestedVehicle: "vehicle",
        reasoning: "Failed to parse vehicle analysis"
      };
    }

    console.log("[analyze-vehicle] Detected:", analysis.vehicleType, analysis.make, analysis.model);

    return new Response(JSON.stringify({
      success: true,
      analysis
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("[analyze-vehicle] Error:", err);
    return new Response(JSON.stringify({
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
      analysis: {
        vehicleType: "unknown",
        vehicleCategory: "other",
        make: null,
        model: null,
        year: null,
        confidence: 0,
        detectedPanels: [],
        suggestedVehicle: "vehicle",
        reasoning: "Analysis failed"
      }
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
