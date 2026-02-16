import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AutoTagRequest {
  file_id: string;
  file_url: string;
  file_type: string;
  original_filename?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const lovableApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!lovableApiKey) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    const body: AutoTagRequest = await req.json();
    const { file_id, file_url, file_type, original_filename } = body;

    if (!file_id || !file_url) {
      throw new Error("Missing required fields: file_id and file_url");
    }

    console.log(`[ai-auto-tag] Analyzing ${file_type} file: ${original_filename || file_id}`);

    let prompt: string;
    let messages: any[];

    if (file_type === "image") {
      prompt = `Analyze this image and provide relevant tags for a wrap/graphics business content library.

Consider:
1. Vehicle type (car, truck, van, motorcycle, etc.)
2. Vehicle make/model if identifiable
3. Wrap type (full wrap, partial wrap, color change, graphics, etc.)
4. Content type (before/after, process shot, finished product, installation, customer)
5. Colors present
6. Quality/mood (professional, raw, behind-scenes, showcase)
7. Any text/branding visible

Respond with JSON:
{
  "tags": ["tag1", "tag2", "tag3", ...],
  "vehicle_type": "car/truck/van/etc or null",
  "vehicle_make": "make or null",
  "vehicle_model": "model or null", 
  "content_type": "raw/finished/process/before-after/inspiration",
  "dominant_colors": ["color1", "color2"],
  "confidence": 0.0-1.0
}`;

      messages = [
        { role: "system", content: "You are an AI that analyzes images for a vehicle wrap business. Always respond with valid JSON." },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: file_url } }
          ]
        }
      ];
    } else if (file_type === "video") {
      // For videos, we analyze based on filename and any thumbnail
      prompt = `Based on this video filename and context, suggest relevant tags for a wrap/graphics business content library.

Filename: ${original_filename || "untitled"}

Consider typical video content for a wrap business:
1. Process videos (installation, printing, cutting)
2. Reveal/transformation videos
3. Customer testimonials
4. Tutorial/educational content
5. Behind-the-scenes
6. Showcase/portfolio
7. Social media content (reels, stories)

Respond with JSON:
{
  "tags": ["tag1", "tag2", "tag3", ...],
  "content_type": "raw/finished/process/tutorial/testimonial",
  "video_style": "cinematic/casual/timelapse/talking-head/b-roll",
  "suggested_use": ["reel", "story", "ad", "youtube"],
  "confidence": 0.0-1.0
}`;

      messages = [
        { role: "system", content: "You are an AI that analyzes video content for a vehicle wrap business. Always respond with valid JSON." },
        { role: "user", content: prompt }
      ];
    } else {
      // Audio or other
      prompt = `Based on this audio filename, suggest relevant tags.

Filename: ${original_filename || "untitled"}

Consider:
1. Music type (energetic, chill, dramatic, etc.)
2. Potential use (background, intro, transition)
3. Mood

Respond with JSON:
{
  "tags": ["tag1", "tag2", "tag3", ...],
  "audio_type": "music/voiceover/sfx",
  "mood": "energetic/chill/dramatic/upbeat/emotional",
  "confidence": 0.0-1.0
}`;

      messages = [
        { role: "system", content: "You are an AI that analyzes audio content. Always respond with valid JSON." },
        { role: "user", content: prompt }
      ];
    }

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: file_type === "image" ? "gemini-2.5-flash" : "gemini-2.5-flash",
        messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[ai-auto-tag] AI API error: ${response.status} - ${errorText}`);
      throw new Error(`AI API error: ${response.status}`);
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    // Extract JSON from response
    let parsedResult;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsedResult = jsonMatch ? JSON.parse(jsonMatch[0]) : { tags: [] };
    } catch {
      console.error("[ai-auto-tag] Failed to parse AI response:", content);
      parsedResult = { tags: [] };
    }

    console.log(`[ai-auto-tag] Generated tags: ${parsedResult.tags?.join(", ")}`);

    // Update the content_files record with suggested tags
    const updateData: Record<string, any> = {
      ai_labels: parsedResult,
    };

    // If we have high confidence tags, auto-apply them
    if (parsedResult.confidence >= 0.7 && parsedResult.tags?.length > 0) {
      updateData.tags = parsedResult.tags.slice(0, 10); // Limit to 10 tags
    }

    // Update content category if detected
    if (parsedResult.content_type) {
      updateData.content_category = parsedResult.content_type;
    }

    // Update dominant colors if detected
    if (parsedResult.dominant_colors) {
      updateData.dominant_colors = parsedResult.dominant_colors;
    }

    // Update vehicle info if detected
    if (parsedResult.vehicle_type || parsedResult.vehicle_make) {
      updateData.vehicle_info = {
        type: parsedResult.vehicle_type,
        make: parsedResult.vehicle_make,
        model: parsedResult.vehicle_model
      };
    }

    const { error: updateError } = await supabase
      .from("content_files")
      .update(updateData)
      .eq("id", file_id);

    if (updateError) {
      console.error("[ai-auto-tag] Failed to update file:", updateError);
    }

    return new Response(JSON.stringify({
      success: true,
      file_id,
      tags: parsedResult.tags || [],
      content_type: parsedResult.content_type,
      confidence: parsedResult.confidence,
      full_analysis: parsedResult
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("[ai-auto-tag] Error:", error);
    return new Response(JSON.stringify({ 
      error: error?.message || "Unknown error",
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
