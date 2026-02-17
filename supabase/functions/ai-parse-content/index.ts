import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl =
      Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
    const supabaseKey =
      Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    if (!GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { contentFileId, imageUrl, fileType } = await req.json();

    if (!contentFileId || !imageUrl) {
      throw new Error("contentFileId and imageUrl are required");
    }

    console.log(`[ai-parse-content] Parsing content file: ${contentFileId}`);

    // For video files, we can't directly analyze — mark as needing visual analysis
    if (fileType === "video") {
      console.log(`[ai-parse-content] Video file — marking for visual analysis pipeline`);
      await supabase
        .from("content_files")
        .update({ ai_parsed_at: new Date().toISOString() })
        .eq("id", contentFileId);
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "video_needs_frame_analysis" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the image as base64
    let imageBase64 = "";
    let mimeType = "image/png";

    if (imageUrl.startsWith("http")) {
      const imgResponse = await fetch(imageUrl);
      if (!imgResponse.ok) throw new Error(`Failed to fetch image: ${imgResponse.status}`);
      mimeType = imgResponse.headers.get("content-type") || mimeType;
      const buffer = await imgResponse.arrayBuffer();
      const uint8 = new Uint8Array(buffer);
      let binary = "";
      const chunkSize = 8192;
      for (let i = 0; i < uint8.length; i += chunkSize) {
        const chunk = uint8.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
      }
      imageBase64 = btoa(binary);
    } else if (imageUrl.startsWith("data:")) {
      const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (matches) {
        mimeType = matches[1];
        imageBase64 = matches[2];
      }
    }

    if (!imageBase64) {
      throw new Error("Could not encode image to base64");
    }

    // Call Gemini to analyze the image — using text model for analysis (not image gen)
    const parsePrompt = `You are a content intelligence system for a vehicle wrap business. Analyze this image and return ONLY a JSON object with these fields:

{
  "vehicle_year": string or null,
  "vehicle_make": string or null,
  "vehicle_model": string or null,
  "vehicle_category": "car" | "truck" | "van" | "suv" | "trailer" | "bus" | "boat" | "motorcycle" | "fleet" | null,
  "wrap_type": "full_wrap" | "partial_wrap" | "color_change" | "commercial_graphics" | "decals" | "lettering" | null,
  "wrap_finish": "gloss" | "matte" | "satin" | "chrome" | "carbon_fiber" | "brushed" | null,
  "colors": ["#hex1", "#hex2", "#hex3"],
  "dominant_color": string,
  "content_type": "before_after" | "finished_wrap" | "in_progress" | "design_proof" | "render_3d" | "lifestyle" | "detail_shot" | "fleet_lineup" | "social_graphic" | "ad_creative" | "logo" | "other",
  "has_text": boolean,
  "text_content": [array of readable text strings],
  "has_logo": boolean,
  "brand_name": string or null,
  "industry": string or null,
  "mood": "professional" | "bold" | "playful" | "luxury" | "rugged" | "clean" | "aggressive",
  "quality_score": number 1-10,
  "is_before": boolean,
  "is_after": boolean,
  "has_vehicle": boolean,
  "background_type": "studio" | "outdoor" | "garage" | "parking_lot" | "street" | "showroom" | "digital",
  "usable_for": ["social_post", "carousel", "ad", "portfolio", "reel_clip", "before_after_pair", "testimonial"]
}

Be accurate. If you can't determine a field, use null. Return ONLY the JSON, no markdown.`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GEMINI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: parsePrompt },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${mimeType};base64,${imageBase64}`,
                  },
                },
              ],
            },
          ],
          temperature: 0.1,
          max_tokens: 1024,
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("[ai-parse-content] Gemini error:", response.status, errText);
      throw new Error(`AI parse failed: ${response.status}`);
    }

    const aiData = await response.json();
    const rawText = aiData?.choices?.[0]?.message?.content || "";

    // Parse JSON from response
    let parsedTags: any = {};
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedTags = JSON.parse(jsonMatch[0]);
      }
    } catch (parseErr) {
      console.error("[ai-parse-content] Failed to parse AI response:", parseErr);
      parsedTags = {
        parse_error: true,
        raw_response: rawText.substring(0, 500),
      };
    }

    // Build update payload — enhance existing columns, don't replace
    const updatePayload: any = {
      ai_parsed_at: new Date().toISOString(),
      // Merge into existing ai_labels
      ai_labels: parsedTags,
    };

    // Update vehicle_info if detected
    if (parsedTags.vehicle_make || parsedTags.vehicle_model) {
      updatePayload.vehicle_info = {
        make: parsedTags.vehicle_make,
        model: parsedTags.vehicle_model,
        year: parsedTags.vehicle_year,
        category: parsedTags.vehicle_category,
        wrap_type: parsedTags.wrap_type,
        wrap_finish: parsedTags.wrap_finish,
      };
    }

    // Update dominant_colors if detected
    if (parsedTags.colors && parsedTags.colors.length > 0) {
      updatePayload.dominant_colors = parsedTags.colors;
    }

    // Update content_category if detected
    if (parsedTags.content_type) {
      updatePayload.content_category = parsedTags.content_type;
    }

    // Build tags array from parsed data (merge with existing)
    const newTags: string[] = [];
    if (parsedTags.wrap_type) newTags.push(parsedTags.wrap_type);
    if (parsedTags.wrap_finish) newTags.push(parsedTags.wrap_finish);
    if (parsedTags.dominant_color) newTags.push(parsedTags.dominant_color);
    if (parsedTags.content_type) newTags.push(parsedTags.content_type);
    if (parsedTags.mood) newTags.push(parsedTags.mood);
    if (parsedTags.vehicle_category) newTags.push(parsedTags.vehicle_category);
    if (parsedTags.industry) newTags.push(parsedTags.industry);
    if (parsedTags.is_before) newTags.push("before");
    if (parsedTags.is_after) newTags.push("after");
    if (parsedTags.has_vehicle) newTags.push("vehicle");
    if (parsedTags.background_type) newTags.push(parsedTags.background_type);

    // Fetch existing tags to merge
    const { data: existing } = await supabase
      .from("content_files")
      .select("tags")
      .eq("id", contentFileId)
      .single();

    const existingTags: string[] = existing?.tags || [];
    const mergedTags = [...new Set([...existingTags, ...newTags])];
    updatePayload.tags = mergedTags;

    // Apply the update
    const { error: updateErr } = await supabase
      .from("content_files")
      .update(updatePayload)
      .eq("id", contentFileId);

    if (updateErr) {
      console.error("[ai-parse-content] DB update error:", updateErr);
      throw new Error(`Failed to save tags: ${updateErr.message}`);
    }

    console.log(
      `[ai-parse-content] Parsed and tagged content file ${contentFileId}`,
      `Tags: ${mergedTags.join(", ")}`
    );

    return new Response(
      JSON.stringify({ success: true, tags: parsedTags, mergedTags }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[ai-parse-content] Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
