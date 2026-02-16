import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const formatPrompts: Record<string, string> = {
  story: `Generate an Instagram Story sequence (3-5 frames). For each frame provide:
- Frame number
- Overlay text (6-12 words max, punchy)
- Background suggestion (image/video type)
- CTA if applicable
- Transition recommendation`,
  
  reel_script: `Generate a Reel script with beat-by-beat timing:
- 0.0-0.8s: Hook (attention grabber)
- 0.8-2.0s: Value punch (main point)
- 2.0-4.0s: Supporting content
- 4.0-5.5s: Social proof or transformation
- 5.5-7.0s: CTA
Include overlay text suggestions and B-roll recommendations.`,
  
  caption: `Generate an Instagram caption with:
- Hook line (first line that appears before "more")
- 2-3 value sentences
- Call to action
- 5-10 relevant hashtags
Keep it conversational and engaging.`,
  
  paid_ad: `Generate Meta Ad copy with:
- 4 short primary texts (under 125 chars each)
- 2 long primary texts (under 280 chars each)
- 5 headlines (under 40 chars each)
- 3 CTAs
- Ad angle classification
All copy should be conversion-focused.`,
  
  carousel_slide: `Generate a 5-7 slide carousel:
- Slide 1: Hook/question
- Slides 2-5: Value points (one per slide)
- Final slide: CTA
Each slide should have headline + 1-2 lines of supporting text.`
};

const styleModifiers: Record<string, string> = {
  sabri: "Use Sabri Suby's direct-response style: problem-agitation-solution, urgency, scarcity, objection removal. Be bold and direct.",
  dara: "Use Dara Denney's UGC storytelling style: 'I didn't think this would work...', testimonial vibes, soft CTAs, relatable.",
  clean: "Use clean, professional style: clear value proposition, trust-building, straightforward benefits."
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { atom, format, style, organization_id, brand_voice } = await req.json();
    
    if (!atom || !format) {
      return new Response(JSON.stringify({ error: 'Atom and format required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const formatInstructions = formatPrompts[format] || formatPrompts.caption;
    const styleInstructions = styleModifiers[style] || styleModifiers.clean;

    let brandContext = "";
    if (brand_voice) {
      brandContext = `\n\nBrand Voice Guidelines:\n- Tone: ${brand_voice.tone || 'professional'}\n- Key phrases to use: ${brand_voice.vocabulary?.signature_phrases?.join(', ') || 'none specified'}`;
    }

    const systemPrompt = `You are an expert content creator for a vehicle wrap company. Generate micro-content based on the provided atom.

${styleInstructions}

${formatInstructions}
${brandContext}

Return the content in a structured JSON format appropriate for the format type.`;

    const userPrompt = `Content Atom:
Type: ${atom.atom_type}
Text: ${atom.original_text}
${atom.processed_text ? `Enhanced: ${atom.processed_text}` : ''}
Ad Angles: ${atom.ad_angles?.join(', ') || 'general'}
${atom.product_match ? `Product: ${atom.product_match}` : ''}

Generate ${format} content from this atom.`;

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required" }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    
    // Try to parse as JSON, otherwise return as structured text
    let output;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (jsonMatch) {
        output = JSON.parse(jsonMatch[0]);
      } else {
        output = { content, format };
      }
    } catch {
      output = { content, format };
    }

    console.log(`Generated ${format} content for atom type: ${atom.atom_type}`);

    return new Response(JSON.stringify({ 
      success: true, 
      format,
      style: style || 'clean',
      output
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in ai-generate-micro-content:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
