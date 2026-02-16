import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { image } = await req.json();
    
    if (!image) {
      return new Response(
        JSON.stringify({ error: "No image provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    // Use Gemini vision to extract VIN
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a VIN extraction specialist. Extract the Vehicle Identification Number (VIN) from images.
            
Rules:
- VINs are exactly 17 characters
- Valid characters: A-Z (except I, O, Q) and 0-9
- Common locations: driver side door jamb, dashboard near windshield, engine block
- Return ONLY the VIN with no extra text
- If you cannot find a valid VIN, return "NOT_FOUND"
- Be careful with similar characters: 0/O, 1/I, 8/B, 5/S`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract the VIN from this image. Return only the 17-character VIN or NOT_FOUND."
              },
              {
                type: "image_url",
                image_url: { url: image }
              }
            ]
          }
        ],
        max_tokens: 50,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("Failed to process image");
    }

    const data = await response.json();
    const extractedText = data.choices?.[0]?.message?.content?.trim() || "";
    
    // Validate VIN format
    const vinRegex = /^[A-HJ-NPR-Z0-9]{17}$/;
    const cleanVin = extractedText.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
    
    if (vinRegex.test(cleanVin)) {
      return new Response(
        JSON.stringify({ vin: cleanVin, raw: extractedText }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ vin: null, raw: extractedText, message: "Could not extract valid VIN" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("VIN extraction error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
