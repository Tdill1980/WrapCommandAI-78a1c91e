import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      vehicleMake,
      vehicleModel,
      vehicleYear,
      vehicleType,
      colorHex,
      colorName,
      finishType,
      hasMetallicFlakes,
      customDesignUrl,
      designUrl,
      angle = "hero"
    } = await req.json();

    // For ApproveFlow projects without vehicle details, use generic vehicle rendering
    const isApproveFlowMode = !vehicleMake && designUrl;
    
    if (!isApproveFlowMode && (!vehicleMake || !vehicleModel || !vehicleType || !colorHex || !finishType)) {
      return new Response(
        JSON.stringify({ error: "Missing required fields for standard render mode" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    if (isApproveFlowMode && !designUrl) {
      return new Response(
        JSON.stringify({ error: "Design URL required for ApproveFlow mode" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build the rendering prompt
    let prompt;
    
    if (isApproveFlowMode) {
      // Generic vehicle rendering for ApproveFlow projects
      const angleDetails = {
        hero: "Front 3/4 view in a modern showroom with professional studio lighting. Dramatic shadows and highlights showcase the wrap perfectly.",
        side: "Perfect side profile view on a reflective surface with soft studio lighting that emphasizes the wrap's design.",
        rear: "Rear 3/4 view with backlit atmosphere, highlighting the complete wrap coverage.",
        detail: "Close-up detail shot focusing on the wrap design, showing texture and quality under natural lighting."
      };
      
      prompt = `Ultra photorealistic 3D render of a modern vehicle with the custom wrap design applied. `;
      prompt += `The wrap should cover the entire vehicle professionally. `;
      prompt += angleDetails[angle as keyof typeof angleDetails] || angleDetails.hero;
      prompt += ` Professional automotive photography, 8K resolution, ray-traced reflections, highly detailed. Apply this exact wrap design to the vehicle.`;
    } else {
      // Standard rendering with full vehicle details
      prompt = `Ultra photorealistic 3D render: ${vehicleYear || ""} ${vehicleMake} ${vehicleModel} ${vehicleType} with professional automotive vinyl wrap in ${colorName || colorHex} color (hex: ${colorHex}). `;
      
      // Add finish details
      prompt += `${finishType.charAt(0).toUpperCase() + finishType.slice(1)} finish${hasMetallicFlakes ? " with metallic flakes that shimmer in the light" : ""}. `;
      
      // Add custom design if present
      if (customDesignUrl) {
        prompt += "The wrap features a custom printed design overlay. ";
      }
      
      // Add angle-specific details
      const angleDetails = {
        hero: "Front 3/4 view in a modern showroom with professional studio lighting. Dramatic shadows and highlights showcase the wrap's finish perfectly.",
        side: "Perfect side profile view on a reflective surface with soft studio lighting that emphasizes the wrap's texture and color depth.",
        rear: "Rear 3/4 view with backlit atmosphere, highlighting the wrap coverage and color consistency across all panels.",
        detail: "Close-up detail shot focusing on body panel with the vinyl wrap, showing texture, finish quality, and color accuracy under natural lighting."
      };
      
      prompt += angleDetails[angle as keyof typeof angleDetails] || angleDetails.hero;
      prompt += " Professional automotive photography, 8K resolution, ray-traced reflections, highly detailed.";
    }

    const logName = isApproveFlowMode ? "ApproveFlow design" : `${vehicleMake} ${vehicleModel}`;
    console.log(`Generating ${angle} render for ${logName}`);

    const inputImageUrl = isApproveFlowMode ? designUrl : customDesignUrl;
    const messages: any[] = [
      {
        role: "system",
        content: "You are an expert automotive visualization AI specialized in creating photorealistic 3D renders of vehicles with custom vinyl wraps. Generate images that look like professional automotive photography."
      },
      {
        role: "user",
        content: inputImageUrl ? [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: inputImageUrl } }
        ] : prompt
      }
    ];

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-3-pro-image-preview",
        messages,
        modalities: ["image", "text"]
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "Failed to generate render" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageUrl) {
      console.error("No image in AI response");
      return new Response(
        JSON.stringify({ error: "Failed to generate image" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`${angle} render generated successfully`);

    return new Response(
      JSON.stringify({ 
        imageUrl,
        angle,
        prompt: prompt.substring(0, 200) + "..." // Return truncated prompt for reference
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in generate-color-render:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
