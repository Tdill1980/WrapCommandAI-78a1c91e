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
      brand, 
      platform, 
      format, 
      objective, 
      selectedMedia, 
      headline, 
      callToAction,
      organizationId 
    } = await req.json();
    
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    console.log(`Generating ad for brand: ${brand}, platform: ${platform}, format: ${format}`);

    // Load TradeDNA for brand voice if organizationId provided
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
Brand Voice Guidelines:
- Tone: ${tradeDna.tone || 'professional'}
- Persona: ${tradeDna.persona || 'industry expert'}
- Vocabulary: ${JSON.stringify(tradeDna.vocabulary || {})}
- Sales Style: ${JSON.stringify(tradeDna.sales_style || {})}
`;
      }
    }

    // Brand-specific defaults
    const brandDefaults: Record<string, any> = {
      wpw: {
        colors: 'black, white, red',
        style: 'Bold commercial typography',
        ctas: ['Order Your Wrap', 'Print in 1-2 Days', 'Get Your Quote', 'Start Your Project']
      },
      wraptv: {
        colors: 'vibrant, high-energy',
        style: 'Meme-friendly, bold text overlays',
        ctas: ['Watch Now', 'Subscribe', 'Join the Movement', 'Get Wrapped']
      },
      inkedge: {
        colors: 'black, white, minimal',
        style: 'Editorial, magazine aesthetic, serif typography',
        ctas: ['Discover More', 'Explore Collection', 'View Portfolio', 'Learn More']
      }
    };

    const brandConfig = brandDefaults[brand] || brandDefaults.wpw;

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
            content: `You are an expert social media ad copywriter specializing in vehicle wraps and automotive customization. Generate high-converting ad copy that matches the brand voice and platform requirements.

${brandVoice}

Brand: ${brand.toUpperCase()}
Brand Colors: ${brandConfig.colors}
Brand Style: ${brandConfig.style}
Suggested CTAs: ${brandConfig.ctas.join(', ')}`
          },
          {
            role: "user",
            content: `Create ad variations for:

Platform: ${platform}
Format: ${format}
Objective: ${objective}
User Headline Input: ${headline || 'Not provided'}
User CTA Input: ${callToAction || 'Not provided'}
Media Count: ${selectedMedia?.length || 0} items

Generate 3 complete ad variations, each with:
- Primary headline (punchy, attention-grabbing)
- Secondary headline (supporting value prop)
- Hook line (first 3 seconds for video)
- Body copy (platform-appropriate length)
- CTA button text
- Hashtags (5-10 relevant tags)
${format === 'carousel' ? '- Slide-by-slide copy for 5 carousel slides' : ''}`
          }
        ],
        tools: [{
          type: "function",
          function: {
            name: "generate_ad_variations",
            description: "Generate multiple ad copy variations",
            parameters: {
              type: "object",
              properties: {
                variations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      primary_headline: { type: "string" },
                      secondary_headline: { type: "string" },
                      hook_line: { type: "string" },
                      body_copy: { type: "string" },
                      cta_text: { type: "string" },
                      hashtags: { type: "array", items: { type: "string" } },
                      carousel_slides: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            headline: { type: "string" },
                            body: { type: "string" }
                          }
                        }
                      }
                    },
                    required: ["primary_headline", "secondary_headline", "hook_line", "body_copy", "cta_text", "hashtags"]
                  }
                },
                platform_tips: { type: "string" },
                best_posting_times: { type: "array", items: { type: "string" } }
              },
              required: ["variations", "platform_tips", "best_posting_times"]
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "generate_ad_variations" } }
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
      variations: [],
      platform_tips: '',
      best_posting_times: []
    };

    if (toolCall?.function?.arguments) {
      result = JSON.parse(toolCall.function.arguments);
    }

    console.log(`Generated ${result.variations.length} ad variations`);

    return new Response(JSON.stringify({ 
      success: true, 
      brand,
      platform,
      format,
      ...result 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in ai-generate-ad:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
