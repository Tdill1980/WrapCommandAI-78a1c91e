import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, fileUrl, fileId, trimStart, trimEnd, transcript } = await req.json();
    
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    console.log(`Processing video action: ${action} for file: ${fileId}`);

    let result: any = {};

    switch (action) {
      case 'auto_cut': {
        // AI analyzes content and suggests best cut points
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
                content: `You are a professional video editor AI. Analyze video content and suggest optimal cut points for engaging social media content. Return JSON with timestamps and reasoning.`
              },
              {
                role: "user",
                content: `Analyze this video content and provide cut recommendations for a 15-30 second reel.
                
Video URL: ${fileUrl}
${transcript ? `Transcript: ${transcript}` : ''}

Return a JSON object with:
- suggested_cuts: array of {start_seconds, end_seconds, description, hook_strength}
- best_moments: array of timestamps for highlight moments
- recommended_duration: optimal final video length
- pacing_notes: suggestions for rhythm and flow`
              }
            ],
            tools: [{
              type: "function",
              function: {
                name: "video_cut_analysis",
                description: "Return video cut analysis and recommendations",
                parameters: {
                  type: "object",
                  properties: {
                    suggested_cuts: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          start_seconds: { type: "number" },
                          end_seconds: { type: "number" },
                          description: { type: "string" },
                          hook_strength: { type: "string", enum: ["strong", "medium", "weak"] }
                        },
                        required: ["start_seconds", "end_seconds", "description", "hook_strength"]
                      }
                    },
                    best_moments: {
                      type: "array",
                      items: { type: "number" }
                    },
                    recommended_duration: { type: "number" },
                    pacing_notes: { type: "string" }
                  },
                  required: ["suggested_cuts", "best_moments", "recommended_duration", "pacing_notes"]
                }
              }
            }],
            tool_choice: { type: "function", function: { name: "video_cut_analysis" } }
          }),
        });

        if (!response.ok) {
          throw new Error(`AI request failed: ${response.status}`);
        }

        const aiResult = await response.json();
        const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
        if (toolCall?.function?.arguments) {
          result = JSON.parse(toolCall.function.arguments);
        }
        break;
      }

      case 'auto_captions': {
        // Generate SRT/VTT captions from transcript
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
                content: `You are a professional captioning AI. Generate accurate, well-timed captions in SRT and VTT formats. Each caption should be 2-3 words for maximum impact on social media.`
              },
              {
                role: "user",
                content: `Generate captions for this video content:

${transcript || 'No transcript provided - generate sample captions based on typical wrap shop content'}

Return both SRT and VTT format captions with proper timing. Make captions punchy and 2-3 words max per line for social media style.`
              }
            ],
            tools: [{
              type: "function",
              function: {
                name: "generate_captions",
                description: "Generate SRT and VTT caption files",
                parameters: {
                  type: "object",
                  properties: {
                    srt_content: { type: "string", description: "Full SRT file content" },
                    vtt_content: { type: "string", description: "Full VTT file content" },
                    caption_count: { type: "number" },
                    style_notes: { type: "string" }
                  },
                  required: ["srt_content", "vtt_content", "caption_count", "style_notes"]
                }
              }
            }],
            tool_choice: { type: "function", function: { name: "generate_captions" } }
          }),
        });

        if (!response.ok) {
          throw new Error(`AI request failed: ${response.status}`);
        }

        const aiResult = await response.json();
        const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
        if (toolCall?.function?.arguments) {
          result = JSON.parse(toolCall.function.arguments);
        }
        break;
      }

      case 'ai_enhance': {
        // Generate enhancement recommendations
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
                content: `You are a professional video colorist and editor. Analyze video content and provide specific enhancement recommendations for color grading, pacing, and effects.`
              },
              {
                role: "user",
                content: `Provide enhancement recommendations for this wrap shop video:

Video URL: ${fileUrl}
Trim range: ${trimStart}% to ${trimEnd}%

Suggest:
1. Color grading adjustments
2. Transition effects
3. Speed ramp opportunities
4. Music/beat sync points
5. Text overlay moments`
              }
            ],
            tools: [{
              type: "function",
              function: {
                name: "enhancement_recommendations",
                description: "Provide video enhancement recommendations",
                parameters: {
                  type: "object",
                  properties: {
                    color_grading: {
                      type: "object",
                      properties: {
                        contrast: { type: "string" },
                        saturation: { type: "string" },
                        temperature: { type: "string" },
                        lut_suggestion: { type: "string" }
                      }
                    },
                    transitions: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          timestamp: { type: "number" },
                          type: { type: "string" },
                          duration: { type: "number" }
                        }
                      }
                    },
                    speed_ramps: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          start: { type: "number" },
                          end: { type: "number" },
                          speed: { type: "number" }
                        }
                      }
                    },
                    text_overlays: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          timestamp: { type: "number" },
                          text: { type: "string" },
                          style: { type: "string" }
                        }
                      }
                    },
                    music_sync_points: {
                      type: "array",
                      items: { type: "number" }
                    }
                  },
                  required: ["color_grading", "transitions", "speed_ramps", "text_overlays", "music_sync_points"]
                }
              }
            }],
            tool_choice: { type: "function", function: { name: "enhancement_recommendations" } }
          }),
        });

        if (!response.ok) {
          throw new Error(`AI request failed: ${response.status}`);
        }

        const aiResult = await response.json();
        const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
        if (toolCall?.function?.arguments) {
          result = JSON.parse(toolCall.function.arguments);
        }
        break;
      }

      default:
        result = { error: `Unknown action: ${action}` };
    }

    console.log(`Video processing complete for action: ${action}`);

    return new Response(JSON.stringify({ success: true, action, result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in ai-video-process:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
