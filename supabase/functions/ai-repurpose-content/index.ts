import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      sourceFile,
      targetFormats,
      enhancements,
      brand,
      organizationId 
    } = await req.json();
    
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    console.log(`Repurposing content for formats: ${targetFormats?.join(', ')}`);

    // Load TradeDNA for brand voice
    let brandVoice = '';
    if (organizationId) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      const { data: tradeDna } = await supabase
        .from('organization_tradedna')
        .select('*')
        .eq('organization_id', organizationId)
        .single();
      
      if (tradeDna) {
        brandVoice = `
Brand Voice:
- Tone: ${tradeDna.tone || 'professional'}
- Sales Style: ${JSON.stringify(tradeDna.sales_style || {})}
`;
      }
    }

    const formatDescriptions: Record<string, string> = {
      reel: 'Instagram/TikTok Reel (9:16 vertical, 15-60 seconds, fast-paced with hooks)',
      story: 'Instagram Story (9:16 vertical, 15 seconds max, swipe-up CTA)',
      feed_post: 'Instagram Feed Post (1:1 or 4:5, longer caption, engagement-focused)',
      youtube_short: 'YouTube Short (9:16 vertical, 60 seconds max, educational or entertaining)',
      carousel: 'Instagram Carousel (1:1 or 4:5, 5-10 slides telling a story)'
    };

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
            content: `You are an expert content repurposing specialist for vehicle wrap and automotive customization businesses. Transform source content into optimized formats for different platforms while maintaining brand consistency.

${brandVoice}

Brand: ${brand || 'WPW'}`
          },
          {
            role: "user",
            content: `Repurpose this source content into multiple formats:

Source Content:
- File Type: ${sourceFile?.file_type || 'video'}
- Original Filename: ${sourceFile?.original_filename || 'Unknown'}
- Tags: ${sourceFile?.tags?.join(', ') || 'wrap, vehicle, automotive'}
- Transcript: ${sourceFile?.transcript || 'No transcript available'}

Target Formats: ${targetFormats?.map((f: string) => `${f} - ${formatDescriptions[f] || f}`).join('\n')}

Enhancements to apply: ${enhancements?.join(', ') || 'None specified'}

For each target format, provide:
1. Script/Copy adapted to that format's requirements
2. Hook line (attention-grabbing opener)
3. Recommended caption
4. Hashtags optimized for that platform
5. Best practices notes
6. Thumbnail text suggestions (if applicable)`
          }
        ],
        tools: [{
          type: "function",
          function: {
            name: "repurpose_content",
            description: "Generate repurposed content for multiple formats",
            parameters: {
              type: "object",
              properties: {
                formats: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      format_id: { type: "string" },
                      format_name: { type: "string" },
                      aspect_ratio: { type: "string" },
                      script: { type: "string" },
                      hook_line: { type: "string" },
                      caption: { type: "string" },
                      hashtags: { type: "array", items: { type: "string" } },
                      thumbnail_texts: { type: "array", items: { type: "string" } },
                      best_practices: { type: "string" },
                      estimated_duration: { type: "string" }
                    },
                    required: ["format_id", "format_name", "script", "hook_line", "caption", "hashtags"]
                  }
                },
                cross_platform_tips: { type: "string" },
                content_calendar_suggestion: { type: "string" }
              },
              required: ["formats", "cross_platform_tips", "content_calendar_suggestion"]
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "repurpose_content" } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI response error:', errorText);
      throw new Error(`AI request failed: ${response.status}`);
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    
    let result = {
      formats: [],
      cross_platform_tips: '',
      content_calendar_suggestion: ''
    };

    if (toolCall?.function?.arguments) {
      result = JSON.parse(toolCall.function.arguments);
    }

    console.log(`Generated ${result.formats.length} format variations`);

    return new Response(JSON.stringify({ 
      success: true,
      sourceFile,
      ...result 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in ai-repurpose-content:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
