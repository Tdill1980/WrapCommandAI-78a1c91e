import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CHIEF_AIM, RESTYLEPRO_BRAND_BLOCK } from "../_shared/brand-os.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Brand-specific prompts for complete isolation
const BRAND_PROMPTS: Record<string, string> = {
  wpw: `You are the Senior Creative Director for WePrintWraps.com (WPW).

BRAND: B2B wholesale wrap printer
TONE: Confident, expert, premium quality, fast turnaround
AUDIENCE: Installers, wrap shops, fleet managers, business owners
USP: 3-Day Turnaround, FadeWraps™, Printed PPF, Wholesale pricing, Top-tier print quality
STYLE: High-contrast, bold text, direct response, case studies
GOAL: SALES + AUTHORITY

FORBIDDEN: Entertainment content, cinematic pacing, software promotion, consumer messaging`,

  wraptv: `You are the Senior Creative Director for WrapTV World.

BRAND: Entertainment & culture platform
TONE: Hype, bold, automotive-lifestyle, creator-focused
AUDIENCE: Car enthusiasts, installers, wrap culture fans
USP: Wrap industry entertainment, Creator spotlight, Viral content, Community culture
STYLE: Fast cuts, trends, memes, POV, high energy
GOAL: REACH + VIRALITY + CULTURE

FORBIDDEN: Direct sales, B2B messaging, cinematic editorial, software demos`,

  inkandedge: `You are the Senior Creative Director for Ink & Edge Magazine.

BRAND: Editorial automotive art publication
TONE: Elegant, cinematic, artistic, thoughtful
AUDIENCE: Designers, artists, visually-driven enthusiasts
USP: Art of wraps, High-end photography, Cinematic narratives, Magazine aesthetics
STYLE: Slow motion, black & white, macro shots, textured overlays, minimal text
GOAL: AESTHETIC IMPACT + BRAND STORY

FORBIDDEN: Fast-paced content, direct response, wholesale pricing, software demos`,

  software: `You are the Senior Creative Director for WrapCommand AI & RestylePro AI.

BRAND: SaaS AI suite for wrap shops
TONE: High authority, expert, friendly tech guide
AUDIENCE: Installers, shop owners, sales teams
USP: Close more deals with AI, Visualizer workflows, AI quoting, Automated follow-up
STYLE: Modern UI demos, neon accents, screen recordings, tech-forward
GOAL: APP SIGNUPS + PRODUCT EDUCATION

FORBIDDEN: Print/wholesale messaging, entertainment content, editorial style`,

  // Dedicated DesignProAI/RestyleProAI voice — sourced from _shared/brand-os.ts
  // (the same brand OS the restylepro-os generators use) so both projects
  // speak the identical positioning and chief aim.
  restylepro: `You are the Senior Creative Director for RestyleProAI / DesignProAI.

${RESTYLEPRO_BRAND_BLOCK}

${CHIEF_AIM}

GOAL: CATEGORY AUTHORITY + SIGNUPS

FORBIDDEN: Print/wholesale shop messaging (that's WePrintWraps), entertainment content, editorial style`
};

// Style modifier prompts - apply ON TOP of brand voice
const STYLE_MODIFIERS: Record<string, string> = {
  garyvee: `## STYLE MODIFIER: GARY VEE

Apply this style while keeping brand rules intact:

CORE ENERGY:
- Raw, authentic, punchy statements
- Values > tactics
- Short, emotional truths
- Conversational tone with conviction
- Fast-paced delivery
- "Here's the truth…" energy
- Documentation over creation

STRUCTURE:
- Open with a bold truth or hot take
- 2-3 rapid-fire value statements
- Close with actionable insight or motivation
- Pattern: Truth → Context → Action

LANGUAGE PATTERNS:
- "Look...", "Here's the thing...", "I don't care what anyone says..."
- "The only thing that matters is...", "You're sleeping on..."

PACING: Fast cuts, punchy 2-5 word statements, energy escalates`,

  sabrisuby: `## STYLE MODIFIER: SABRI SUBY

Apply this style while keeping brand rules intact:

CORE ENERGY:
- Hardcore direct-response marketing
- Problem → Agitation → Solution → CTA (PAS framework)
- Objection removal built into copy
- Social proof punch-ins
- Authority stacking
- Urgency frameworks

STRUCTURE:
- HOOK: Pattern interrupt in <3 seconds
- PROBLEM: Name their exact pain point
- AGITATE: Twist the knife, make pain vivid
- SOLUTION: Position product as the answer
- PROOF: Social proof / authority stack
- CTA: Clear, urgent, specific action

LANGUAGE PATTERNS:
- "Are you tired of...", "What if I told you..."
- "The #1 mistake [audience] makes...", "Stop scrolling if you..."

PACING: Hook in 1-2 seconds, rapid benefit stacking, urgency builds to CTA`,

  daradenney: `## STYLE MODIFIER: DARA DENNEY

Apply this style while keeping brand rules intact:

CORE ENERGY:
- Modern paid-social ad psychology
- UGC storytelling frameworks
- Testimonial/native vibes
- Soft, relatable CTAs
- Natural voiceover feel
- Optimized for CPM reduction

STRUCTURE:
- Open with relatable hook
- Share personal journey/struggle
- Discovery moment ("Then I found...")
- Product demo/benefit showcase
- Soft CTA or "I just had to share"

UGC STORY FRAMEWORKS:
- "I didn't think this would work…"
- "If you're like me…", "Before I found X…"
- "POV: You just discovered..."

PACING: Natural, not rushed, pause for emphasis on key benefits`
};

const MASTER_ROUTER = `BRAND ISOLATION DIRECTIVE — DO NOT MIX BRANDS

You must treat every brand as a completely separate company.
NEVER blend or cross-contaminate content between brands.

RULES:
1. Select ONLY the brand requested
2. Pull ONLY that brand's voice, USP, assets
3. Never mention other brands
4. Never reuse styles from wrong brand
5. CTA MUST match brand`;

const OUTPUT_FORMAT = `
YOU MUST OUTPUT A JSON OBJECT WITH:
{
  "hooks": ["hook1", "hook2", "hook3"],
  "reel_script": "10-20 second script",
  "beat_sheet": [
    {"timestamp": "0:00-0:02", "shot": "description", "transition": "cut/wipe/fade"}
  ],
  "overlay_text": ["text1", "text2", "text3"],
  "thumbnail_variants": ["variant1", "variant2", "variant3"],
  "voiceover_script": "full voiceover text",
  "captions": {
    "short": "under 20 words",
    "medium": "1 sentence",
    "long": "2-3 sentences"
  },
  "hashtags": ["hashtag1", "hashtag2"],
  "first_comment": "engagement driving comment",
  "cta": "brand-specific call to action",
  "canva_guide": "layout instructions for designers",
  "ab_variants": {
    "hook_a": "variant a",
    "hook_b": "variant b",
    "caption_a": "variant a",
    "caption_b": "variant b"
  },
  "style_applied": "style modifier name or none"
}

RULES:
- Always write in the selected brand voice
- Hooks must be scroll-stopping
- All content must match the media provided
- Do NOT hallucinate vehicles or brands
- Use real wrap terminology and installer vocabulary`;

function getBrandSystemPrompt(brand: string, style?: string): string {
  const brandPrompt = BRAND_PROMPTS[brand] || BRAND_PROMPTS.wpw;
  let prompt = `${MASTER_ROUTER}\n\nACTIVE BRAND: ${brand.toUpperCase()}\n\n${brandPrompt}\n\n${OUTPUT_FORMAT}`;
  
  // Apply style modifier if provided
  if (style && style !== 'none' && STYLE_MODIFIERS[style]) {
    prompt += `\n\n---\n\n${STYLE_MODIFIERS[style]}\n\nIMPORTANT: Apply the ${style.toUpperCase()} style modifier to structure, pacing, and persuasion while keeping ALL brand voice, CTAs, and restrictions intact. The brand rules are NON-NEGOTIABLE.`;
  }
  
  return prompt;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      brand = 'wpw',
      content_type = 'reel',
      goal = 'sell',
      platform = 'instagram',
      style = 'none',
      media_urls = [],
      transcript = '',
      tags = [],
      vehicle_info = {},
      additional_context = ''
    } = await req.json();

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    // Build the user prompt with all context
    const styleNote = style && style !== 'none' ? `\nSTYLE MODIFIER: ${style.toUpperCase()} — Apply this creator's structure and pacing while maintaining brand voice.` : '';
    
    const userPrompt = `Generate a ${content_type.toUpperCase()} content pack for ${brand.toUpperCase()}.

PLATFORM: ${platform}
GOAL: ${goal}${styleNote}

MEDIA CONTEXT:
- URLs: ${media_urls.join(', ') || 'No media provided'}
- Transcript: ${transcript || 'No transcript available'}
- Tags: ${tags.join(', ') || 'No tags'}
- Vehicle: ${vehicle_info.year || ''} ${vehicle_info.make || ''} ${vehicle_info.model || ''}

ADDITIONAL CONTEXT: ${additional_context}

Generate a complete content pack following the exact JSON structure specified. Make it scroll-stopping and conversion-focused for the ${brand} brand voice.`;

    console.log('Generating content for brand:', brand, 'type:', content_type, 'style:', style);

    // Get brand-specific system prompt with optional style modifier
    const systemPrompt = getBrandSystemPrompt(brand, style);

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GEMINI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content;

    if (!aiResponse) {
      throw new Error('No response from AI');
    }

    // Parse the JSON from the response
    let contentPack;
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = aiResponse.match(/```json\n?([\s\S]*?)\n?```/) || 
                        aiResponse.match(/```\n?([\s\S]*?)\n?```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : aiResponse;
      contentPack = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError);
      contentPack = { raw_response: aiResponse };
    }

    // Store in database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: project, error: insertError } = await supabase
      .from('content_projects')
      .insert({
        brand,
        project_type: content_type,
        goal,
        platform,
        ai_brief: userPrompt,
        ai_output: contentPack,
        status: 'ready'
      })
      .select()
      .single();

    if (insertError) {
      console.error('Database insert error:', insertError);
    }

    return new Response(JSON.stringify({ 
      success: true,
      content_pack: contentPack,
      project_id: project?.id
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-social-content:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
