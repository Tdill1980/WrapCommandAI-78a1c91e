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
    console.log("[ai-generate-from-inspiration] Received request");
    
    const { 
      action, // "analyze_library" | "generate_hooks" | "generate_ad"
      mediaIds,
      adType, // "video" | "static" | "carousel"
      platform,
      objective,
      organizationId 
    } = await req.json();

    console.log(`[ai-generate-from-inspiration] Action: ${action}, mediaIds: ${mediaIds?.length || 0}, adType: ${adType}, platform: ${platform}`);

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      console.error("[ai-generate-from-inspiration] GEMINI_API_KEY is not configured");
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`[ai-generate-from-inspiration] Fetching inspiration files...`);

    // Fetch inspiration files from content_files
    let inspirationFiles = [];
    if (mediaIds && mediaIds.length > 0) {
      const { data } = await supabase
        .from("content_files")
        .select("*")
        .in("id", mediaIds);
      inspirationFiles = data || [];
    } else {
      // Get all inspiration files
      const { data } = await supabase
        .from("content_files")
        .select("*")
        .or("content_category.eq.inspiration,content_category.eq.raw")
        .order("created_at", { ascending: false })
        .limit(50);
      inspirationFiles = data || [];
    }

    console.log(`[ai-generate-from-inspiration] Found ${inspirationFiles.length} inspiration files`);

    // Build context from inspiration files
    const videoFiles = inspirationFiles.filter(f => f.file_type === "video");
    const imageFiles = inspirationFiles.filter(f => f.file_type === "image");

    const mediaContext = `
INSPIRATION LIBRARY ANALYSIS:
- Total Files: ${inspirationFiles.length}
- Videos: ${videoFiles.length} (${videoFiles.map(v => v.original_filename).join(", ")})
- Images: ${imageFiles.length} (${imageFiles.map(i => i.original_filename).join(", ")})
- Tags Found: ${[...new Set(inspirationFiles.flatMap(f => f.tags || []))].join(", ")}

FILE DETAILS:
${inspirationFiles.slice(0, 10).map(f => `- ${f.original_filename}: ${f.file_type}, tags: ${(f.tags || []).join(", ")}`).join("\n")}
`;

    // Load TradeDNA brand voice
    let brandVoice = "";
    if (organizationId) {
      const { data: tradeDna } = await supabase
        .from("organization_tradedna")
        .select("*")
        .eq("organization_id", organizationId)
        .single();

      if (tradeDna) {
        brandVoice = `
BRAND VOICE:
- Tone: ${tradeDna.tone || "professional"}
- Persona: ${tradeDna.persona || "industry expert"}
- Signature Phrases: ${JSON.stringify(tradeDna.vocabulary?.signature_phrases || [])}
- Words to Avoid: ${JSON.stringify(tradeDna.vocabulary?.words_to_avoid || [])}
- Sales Style: ${tradeDna.sales_style?.approach || "consultative"}
`;
      }
    }

    let result;

    if (action === "analyze_library") {
      console.log("[ai-generate-from-inspiration] Analyzing library patterns...");
      // Analyze patterns in the inspiration library
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
              content: `You are an expert content strategist analyzing a wrap shop's inspiration library. Identify patterns, successful hooks, and content themes that can be replicated.`
            },
            {
              role: "user",
              content: `Analyze this inspiration library and identify patterns:

${mediaContext}

Return insights about:
1. Common themes and hooks used
2. Content styles that appear successful
3. Recommendations for new content based on patterns
4. Hook formulas that could work for vehicle wraps`
            }
          ],
          tools: [{
            type: "function",
            function: {
              name: "analyze_inspiration",
              description: "Analyze inspiration library patterns",
              parameters: {
                type: "object",
                properties: {
                  themes: { type: "array", items: { type: "string" } },
                  hook_patterns: { type: "array", items: { type: "string" } },
                  content_styles: { type: "array", items: { type: "string" } },
                  recommendations: { type: "array", items: { type: "string" } },
                  hook_formulas: { 
                    type: "array", 
                    items: { 
                      type: "object",
                      properties: {
                        formula: { type: "string" },
                        example: { type: "string" },
                        best_for: { type: "string" }
                      }
                    } 
                  }
                },
                required: ["themes", "hook_patterns", "content_styles", "recommendations", "hook_formulas"]
              }
            }
          }],
          tool_choice: { type: "function", function: { name: "analyze_inspiration" } }
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[ai-generate-from-inspiration] AI API error: ${response.status} - ${errorText}`);
        if (response.status === 429) {
          throw new Error("Rate limit exceeded. Please try again later.");
        }
        if (response.status === 402) {
          throw new Error("AI credits exhausted. Please add funds to your workspace.");
        }
        throw new Error(`AI API error: ${response.status}`);
      }
      
      const aiData = await response.json();
      console.log("[ai-generate-from-inspiration] analyze_library AI response received");
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      result = toolCall?.function?.arguments ? JSON.parse(toolCall.function.arguments) : {};

    } else if (action === "generate_hooks") {
      console.log("[ai-generate-from-inspiration] Generating hooks...");
      // Generate fresh hooks based on inspiration
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
              content: `You are a viral content creator specializing in vehicle wraps. Generate attention-grabbing hooks that stop the scroll.
              
${brandVoice}`
            },
            {
              role: "user",
              content: `Based on this inspiration library:

${mediaContext}

Generate 10 FRESH, ORIGINAL hooks for wrap shop content. These should:
- Stop the scroll in the first 1-3 seconds
- Be relevant to vehicle customization/wraps
- Match the style patterns seen in the inspiration
- Be usable for both video and static content`
            }
          ],
          tools: [{
            type: "function",
            function: {
              name: "generate_hooks",
              description: "Generate fresh content hooks",
              parameters: {
                type: "object",
                properties: {
                  hooks: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        text: { type: "string" },
                        type: { type: "string", enum: ["question", "statement", "before_after", "reveal", "problem_solution", "social_proof"] },
                        best_for: { type: "string", enum: ["video", "static", "both"] },
                        energy_level: { type: "string", enum: ["calm", "medium", "high"] }
                      },
                      required: ["text", "type", "best_for", "energy_level"]
                    }
                  }
                },
                required: ["hooks"]
              }
            }
          }],
          tool_choice: { type: "function", function: { name: "generate_hooks" } }
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[ai-generate-from-inspiration] AI API error: ${response.status} - ${errorText}`);
        if (response.status === 429) {
          throw new Error("Rate limit exceeded. Please try again later.");
        }
        if (response.status === 402) {
          throw new Error("AI credits exhausted. Please add funds to your workspace.");
        }
        throw new Error(`AI API error: ${response.status}`);
      }
      
      const aiData = await response.json();
      console.log("[ai-generate-from-inspiration] generate_hooks AI response received");
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      result = toolCall?.function?.arguments ? JSON.parse(toolCall.function.arguments) : { hooks: [] };

    } else if (action === "generate_ad") {
      console.log("[ai-generate-from-inspiration] Generating ad package...");
      // Generate complete ad content using inspiration + selected media
      const selectedMedia = mediaIds?.length > 0 
        ? inspirationFiles.filter(f => mediaIds.includes(f.id))
        : inspirationFiles.slice(0, 3);

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
              content: `You are an expert ad creator for vehicle wrap shops. Create high-converting ads that use the user's actual media assets.

${brandVoice}

The user has uploaded media that should be used in the ad. Reference their specific files and create content around them.`
            },
            {
              role: "user",
              content: `Create a ${adType || "video"} ad for ${platform || "Instagram"}.

OBJECTIVE: ${objective || "Drive engagement and inquiries"}

USER'S MEDIA TO USE:
${selectedMedia.map(m => `- ${m.original_filename} (${m.file_type}): ${m.file_url}`).join("\n")}

INSPIRATION CONTEXT:
${mediaContext}

Create a complete ad package with:
1. 3 hook variations (first 3 seconds text/audio)
2. Script/copy for the full ad
3. Text overlays with timestamps
4. Call-to-action options
5. Caption with hashtags
6. How to use each uploaded media file in the ad`
            }
          ],
          tools: [{
            type: "function",
            function: {
              name: "create_ad_package",
              description: "Create complete ad package",
              parameters: {
                type: "object",
                properties: {
                  ad_type: { type: "string" },
                  platform: { type: "string" },
                  hooks: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        text: { type: "string" },
                        voiceover: { type: "string" },
                        visual_direction: { type: "string" }
                      }
                    }
                  },
                  script: {
                    type: "object",
                    properties: {
                      intro: { type: "string" },
                      body: { type: "string" },
                      cta: { type: "string" },
                      total_duration: { type: "string" }
                    }
                  },
                  text_overlays: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        timestamp: { type: "string" },
                        text: { type: "string" },
                        style: { type: "string" }
                      }
                    }
                  },
                  cta_options: { type: "array", items: { type: "string" } },
                  caption: { type: "string" },
                  hashtags: { type: "array", items: { type: "string" } },
                  media_usage: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        filename: { type: "string" },
                        usage: { type: "string" },
                        timestamp: { type: "string" }
                      }
                    }
                  }
                },
                required: ["hooks", "script", "text_overlays", "cta_options", "caption", "hashtags", "media_usage"]
              }
            }
          }],
          tool_choice: { type: "function", function: { name: "create_ad_package" } }
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[ai-generate-from-inspiration] AI API error: ${response.status} - ${errorText}`);
        if (response.status === 429) {
          throw new Error("Rate limit exceeded. Please try again later.");
        }
        if (response.status === 402) {
          throw new Error("AI credits exhausted. Please add funds to your workspace.");
        }
        throw new Error(`AI API error: ${response.status}`);
      }
      
      const aiData = await response.json();
      console.log("[ai-generate-from-inspiration] generate_ad AI response received");
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      result = toolCall?.function?.arguments ? JSON.parse(toolCall.function.arguments) : {};
      result.selected_media = selectedMedia;
    }

    console.log(`[ai-generate-from-inspiration] Success - returning result for action: ${action}`);
    return new Response(
      JSON.stringify({ success: true, action, ...result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in ai-generate-from-inspiration:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
