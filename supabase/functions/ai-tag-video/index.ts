import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Standardized tag vocabulary - these are the ONLY valid tags
const VALID_STYLE_TAGS = [
  "ugly_ads", "lo_fi", "raw", "behind_the_scenes", "authentic",
  "grid_style", "clean", "polished", "studio", "cinematic",
  "testimonial", "talking_head", "face_cam",
  "negative_marketing", "harsh", "aggressive",
  "before_after", "transformation",
  "b_roll", "process", "installation", "detail_shot",
  "product_focus", "hero_shot",
] as const;

const VALID_VISUAL_TAGS = [
  "handheld", "shaky", "phone_video", "vertical", "horizontal",
  "low_light", "natural_light", "studio_light",
  "no_color_grade", "color_graded", "high_contrast",
  "shop_environment", "garage", "outdoor", "indoor",
  "close_up", "wide_shot", "medium_shot",
  "motion", "static", "slow_motion",
  "vehicle", "wrap", "vinyl", "ppf", "tint",
] as const;

const VALID_QUALITY_TAGS = [
  "professional", "amateur", "unpolished", "imperfect",
  "high_resolution", "low_resolution",
  "good_audio", "no_audio", "poor_audio",
] as const;

interface TaggingResult {
  style_tags: string[];
  visual_tags: string[];
  quality_tags: string[];
  all_tags: string[];
  confidence: number;
  description: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("[ai-tag-video] ====== FUNCTION INVOKED ======");

  try {
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      console.error("[ai-tag-video] Missing GEMINI_API_KEY");
      return new Response(
        JSON.stringify({ error: "AI API key not configured" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { content_file_id, video_url, thumbnail_url, existing_tags = [], retag_prompt } = body;

    console.log("[ai-tag-video] Request:", {
      content_file_id,
      video_url: video_url?.substring(0, 60),
      thumbnail_url: thumbnail_url?.substring(0, 60),
      existing_tags,
      retag_prompt: retag_prompt?.substring(0, 100),
    });

    if (!content_file_id && !video_url) {
      return new Response(
        JSON.stringify({ error: "content_file_id or video_url required" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use thumbnail for analysis (more efficient than video frames)
    const imageToAnalyze = thumbnail_url || video_url;

    // Build the analysis prompt
    const systemPrompt = `You are a video content tagger for WePrintWraps, a B2B wrap printing company. 
Your job is to analyze video content and assign accurate tags from a controlled vocabulary.

CONTEXT: These videos are for social media ads and content. Common content includes:
- Vehicle wraps (vinyl, PPF, tint)
- Shop/garage footage
- Installation process
- Before/after transformations
- Testimonials

VALID STYLE TAGS (pick ALL that apply):
${VALID_STYLE_TAGS.join(', ')}

VALID VISUAL TAGS (pick ALL that apply):
${VALID_VISUAL_TAGS.join(', ')}

VALID QUALITY TAGS (pick ALL that apply):
${VALID_QUALITY_TAGS.join(', ')}

CRITICAL RULES:
1. ONLY use tags from the lists above - no custom tags
2. "ugly_ads" = deliberately raw, unpolished, lo-fi aesthetic (good for authenticity)
3. "grid_style" = clean, symmetrical, professional studio look
4. "b_roll" = supplementary footage, not main action
5. Be generous with tags - more is better than fewer
6. If unsure, lean toward the more authentic/raw tags`;

    // Build user prompt with optional correction guidance
    let userPrompt = `Analyze this video content and return tags.

${existing_tags.length > 0 ? `Existing manual tags: ${existing_tags.join(', ')}` : ''}`;

    // Add correction prompt if provided - this guides AI to fix misclassification
    if (retag_prompt) {
      userPrompt += `

IMPORTANT CORRECTION FROM HUMAN REVIEWER:
${retag_prompt}

Use this guidance to correct any previous misclassification. The human reviewer has seen the actual video.`;
    }

    userPrompt += `

Return a JSON object with these exact fields:
{
  "style_tags": ["tag1", "tag2"],
  "visual_tags": ["tag1", "tag2"],
  "quality_tags": ["tag1", "tag2"],
  "confidence": 0.85,
  "description": "Brief description of the content"
}

ONLY return valid JSON, nothing else.`;

    console.log("[ai-tag-video] Calling Lovable AI for analysis...");

    const messages: any[] = [
      { role: "system", content: systemPrompt },
    ];

    // If we have an image/thumbnail, include it
    if (imageToAnalyze) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: userPrompt },
          { type: "image_url", image_url: { url: imageToAnalyze } }
        ]
      });
    } else {
      messages.push({ role: "user", content: userPrompt });
    }

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GEMINI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gemini-2.5-flash',
        messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[ai-tag-video] AI API error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limited, try again later" }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: `AI API error: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content || "";

    console.log("[ai-tag-video] Raw AI response:", aiResponse.substring(0, 500));

    // Parse JSON from response
    let tagResult: TaggingResult;
    try {
      // Try to extract JSON from the response
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }
      tagResult = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error("[ai-tag-video] Failed to parse AI response:", parseError);
      // Fallback to basic tags
      tagResult = {
        style_tags: ["b_roll"],
        visual_tags: ["indoor"],
        quality_tags: ["amateur"],
        all_tags: ["b_roll", "indoor", "amateur"],
        confidence: 0.3,
        description: "Unable to analyze - using default tags"
      };
    }

    // Validate and filter tags to only include valid ones
    const validStyleTags = (tagResult.style_tags || []).filter(t => 
      VALID_STYLE_TAGS.includes(t as any)
    );
    const validVisualTags = (tagResult.visual_tags || []).filter(t => 
      VALID_VISUAL_TAGS.includes(t as any)
    );
    const validQualityTags = (tagResult.quality_tags || []).filter(t => 
      VALID_QUALITY_TAGS.includes(t as any)
    );

    const allTags = [...validStyleTags, ...validVisualTags, ...validQualityTags, ...existing_tags];
    const uniqueTags = [...new Set(allTags)];

    const result: TaggingResult = {
      style_tags: validStyleTags,
      visual_tags: validVisualTags,
      quality_tags: validQualityTags,
      all_tags: uniqueTags,
      confidence: tagResult.confidence || 0.7,
      description: tagResult.description || "",
    };

    console.log("[ai-tag-video] Final tags:", result);

    // If content_file_id provided, update the database
    if (content_file_id) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { error: updateError } = await supabase
        .from("content_files")
        .update({
          tags: uniqueTags,
          visual_tags: {
            style_tags: validStyleTags,
            visual_tags: validVisualTags,
            quality_tags: validQualityTags,
            ai_confidence: result.confidence,
            ai_description: result.description,
            tagged_at: new Date().toISOString(),
          },
        })
        .eq("id", content_file_id);

      if (updateError) {
        console.error("[ai-tag-video] DB update error:", updateError);
      } else {
        console.log("[ai-tag-video] Tags saved to content_files");
      }
    }

    return new Response(
      JSON.stringify({ success: true, ...result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[ai-tag-video] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
