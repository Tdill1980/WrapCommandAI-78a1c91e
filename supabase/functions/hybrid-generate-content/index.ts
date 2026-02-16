// Hybrid Content Generation Edge Function
// Generates content using Auto/Hybrid/Exact modes with Voice Engine integration
// Supports locked campaign prompts for disciplined content execution

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadVoiceProfile } from "../_shared/voice-engine-loader.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================================
// CAMPAIGN CONFIGURATIONS - IMMUTABLE AT RUNTIME
// These are locked system prompts that CANNOT be overridden by request body
// ============================================================================

const CAMPAIGN_CONFIGS: Record<string, {
  id: string;
  name: string;
  forbiddenPhrases: string[];
  buildSystemPrompt: (contentType: string) => string;
}> = {
  "january_2026_new_year": {
    id: "january_2026_new_year",
    name: "January 2026 — New Year. New Systems. Better Wrap Jobs.",
    forbiddenPhrases: [
      "level up", "game changer", "don't miss out", "crushing it", "smash that",
      "link in bio", "drop a comment", "fire", "lit", "viral", "blow up",
      "grind", "hustle", "boss", "slay"
    ],
    buildSystemPrompt: (contentType: string) => {
      const reelSchema = contentType === 'reel' ? `
REEL CREATION RULES
Output ONLY this structure:
{
  "type": "reel",
  "mode": "meta | organic",
  "title": "",
  "intent_preset": "",
  "overlay_style": "poppins_premium | poppins_bold",
  "caption_style": "dara",
  "music_style": "none",
  "overlays": [
    { "text": "", "start": 0.0, "end": 1.8 },
    { "text": "", "start": 1.8, "end": 4.0 },
    { "text": "", "start": 4.0, "end": 6.5 }
  ],
  "caption": "",
  "cta": ""
}

Overlays must:
- Be short (under 50 chars)
- Be declarative
- Be premium
- Never sound like an ad from TikTok
` : '';

      const staticSchema = contentType === 'static' ? `
STATIC CREATION RULES
{
  "type": "static",
  "headline": "",
  "subtext": "",
  "caption": "",
  "cta": ""
}
` : '';

      const carouselSchema = contentType === 'carousel' ? `
CAROUSEL CREATION RULES
{
  "type": "carousel",
  "slides": [
    { "headline": "", "subtext": "" }
  ],
  "caption": ""
}
` : '';

      return `Role:
You are the Content Studio AI for WePrintWraps (WPW).
Your job is to create executable content drafts that obey system rules.
You do NOT invent strategy. You execute a locked campaign.

GLOBAL CONSTRAINTS (NON-NEGOTIABLE)
- No autopilot claims
- No vibe-based content
- No music by default (music_style = none)
- No influencer language
- No hip hop / trend culture
- No rendering - output drafts only
- Everything must be professional, premium, and calm

If you cannot meet constraints, fail loud.

CAMPAIGN LOCK (DO NOT DEVIATE)
Campaign Name: January 2026 - New Year. New Systems. Better Wrap Jobs.
Target Buyer: Professional wrap shops handling commercial and fleet work.

Core Offers (ONLY):
- CommercialPro quote system
- Bulk discounts
- Premium Wrap Guarantee
- 1-2 day production
- RestylePro AI previews

BRAND VOICE RULES
Default voice: DARA_PREMIUM x OGILVY
- Authority over urgency
- Identity mirroring
- Risk removal
- Systemized advantage

Allowed voices (preset IDs only):
- DARA_PREMIUM
- WPW_COMMERCIAL
- INK_EDGE_EDITORIAL

Do not use Sabri hype here.

CONTENT MODES (EXPLICIT)

MODE 1 - META AD
Purpose: conversion
Tone: calm, confident, professional
CTA allowed

MODE 2 - ORGANIC
Purpose: authority, education, recognition
Soft CTA only

${reelSchema}${staticSchema}${carouselSchema}

FORBIDDEN PHRASES
Never generate:
- "level up"
- "game changer"
- "don't miss out"
- "crushing it"
- "smash that"
- emojis
- slang
- creator advice
- social growth tips

QUALITY CHECK BEFORE OUTPUT
Before returning content, verify:
- Would a professional wrap shop owner respect this?
- Does it feel inevitable, not loud?
- Does it sell certainty, not excitement?

If not, rewrite.

Return ONLY valid JSON. No markdown, no explanations.`;
    }
  }
};

// Validate and clean output against forbidden phrases
function validateCampaignOutput(output: string, forbiddenPhrases: string[]): {
  cleaned: string;
  violations: string[];
} {
  const violations: string[] = [];
  let cleaned = output;
  
  for (const phrase of forbiddenPhrases) {
    const regex = new RegExp(phrase, 'gi');
    if (regex.test(cleaned)) {
      violations.push(phrase);
      // Don't remove - just flag for logging
    }
  }
  
  // Check for emojis
  const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
  if (emojiRegex.test(cleaned)) {
    violations.push('emojis');
    cleaned = cleaned.replace(emojiRegex, '');
  }
  
  return { cleaned, violations };
}

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      organization_id,
      mode = 'auto',
      content_type = 'reel',
      hybrid_brief = '',
      references = '',
      assets = '',
      media_url = '',
      // Campaign context - CANNOT override system prompt
      campaign_id = null,
      content_mode = 'meta', // 'meta' or 'organic'
      intent_preset = '',
      title = '',
    } = body;

    // SECURITY: Reject any attempt to pass custom systemPrompt
    if (body.systemPrompt || body.system_prompt) {
      console.warn("[hybrid-generate-content] Blocked attempt to override system prompt");
      return new Response(
        JSON.stringify({ success: false, error: "System prompt override not allowed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "GEMINI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Determine which prompt to use
    let systemPrompt: string;
    let activeCampaign: typeof CAMPAIGN_CONFIGS[string] | null = null;

    if (campaign_id && CAMPAIGN_CONFIGS[campaign_id]) {
      // USE LOCKED CAMPAIGN PROMPT
      activeCampaign = CAMPAIGN_CONFIGS[campaign_id];
      systemPrompt = activeCampaign.buildSystemPrompt(content_type);
      console.log(`[hybrid-generate-content] Using locked campaign: ${activeCampaign.name}`);
    } else {
      // FALLBACK: Load TradeDNA + brand voice
      let brandContext = "";
      
      try {
        if (organization_id) {
          const voiceProfile = await loadVoiceProfile(organization_id);
          
          const merged = voiceProfile?.merged || {};
          const overlays = merged.overlays || voiceProfile?.brand_defaults?.brand_overlays || {};
          
          brandContext = `
BRAND VOICE PROFILE:
- Tone: ${merged.tone || 'professional, confident'}
- Energy: ${merged.energy || 'high-performance'}
- Persona: ${merged.persona || 'industry expert'}
- CTA Style: ${merged.cta_style || 'action-driven'}
- Humor Level: ${merged.humor_level || 0.2}
- Primary Color: ${overlays.primary_color || '#00AFFF'}
- Secondary Color: ${overlays.secondary_color || '#4EEAFF'}
`;
        }
      } catch (err) {
        console.warn("[hybrid-generate-content] Could not load voice profile:", err);
      }

      systemPrompt = `You are the HYBRID CONTENT ENGINE for a vehicle wrap industry creative platform.
${brandContext}

You create content packages that include scripts, hooks, captions, hashtags, and CTAs.
Always output valid JSON only, no markdown or explanations.

Content should match the brand voice and be optimized for the target platform.
For wrap shops: focus on transformation, quality, turnaround time, and visual impact.`;
    }

    // Build user prompt
    const userPrompt = activeCampaign 
      ? `
CAMPAIGN: ${activeCampaign.name}
MODE: ${content_mode.toUpperCase()}
CONTENT TYPE: ${content_type}
TITLE: ${title || '(Generate appropriate title)'}
INTENT PRESET: ${intent_preset || '(Infer from brief)'}

BRIEF/INSTRUCTIONS:
${hybrid_brief || "(Execute based on title and intent)"}

${references ? `REFERENCE STYLE:\n${references}` : ''}
${assets ? `ASSETS AVAILABLE:\n${assets}` : ''}

Generate the ${content_type} draft now. Return ONLY valid JSON.`
      : `
MODE: ${mode.toUpperCase()}
CONTENT TYPE: ${content_type}

${mode === 'auto' ? `
AUTO MODE INSTRUCTIONS:
- Generate a complete creative package based on the media provided
- Choose the best hook, storyline, and pacing
- Optimize for engagement and conversions
` : ''}

${mode === 'hybrid' ? `
HYBRID MODE INSTRUCTIONS:
- Follow the BRIEF exactly
- Use references for style/tone inspiration
- Use assets for visual planning
- Stay on brand with the voice profile
` : ''}

${mode === 'exact' ? `
EXACT MODE INSTRUCTIONS:
- Follow user instructions precisely
- Only enhance and optimize, don't change core message
- Focus on polishing and rendering quality
` : ''}

BRIEF/INSTRUCTIONS:
${hybrid_brief || "(No brief provided - use best judgment for auto mode)"}

REFERENCE URLS:
${references || "(None provided)"}

ASSETS:
${assets || "(None provided)"}

MEDIA URL:
${media_url || "(None provided)"}

OUTPUT REQUIREMENTS:
Return a JSON object with these keys:
{
  "hook": "Opening hook text (first 1-3 seconds)",
  "script": "Full script or frame descriptions",
  "caption": "Social media caption",
  "hashtags": ["array", "of", "hashtags"],
  "cta": "Call to action text",
  "overlays": [
    { "text": "Overlay text", "time": "0-2s", "style": "bold" }
  ],
  "media_plan": {
    "cuts": [{ "description": "Scene 1", "duration": "0-3s" }],
    "color_palette": ["#000000", "#FFFFFF"],
    "layout_template": "vertical_reel",
    "music_suggestion": "upbeat, energetic"
  }
}
`;

    // Call Lovable AI with retry logic for transient errors
    const MAX_RETRIES = 2;
    let aiResponse: Response | null = null;
    let lastError: string | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        aiResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${GEMINI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gemini-2.5-flash",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
          }),
        });

        if (aiResponse.ok) {
          break; // Success, exit retry loop
        }

        // Handle non-retryable errors immediately
        if (aiResponse.status === 429) {
          return new Response(
            JSON.stringify({ success: false, error: "Rate limit exceeded, please try again later" }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (aiResponse.status === 402) {
          return new Response(
            JSON.stringify({ success: false, error: "AI credits exhausted" }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Retryable errors (503, 500, etc.)
        lastError = `AI API error: ${aiResponse.status}`;
        if (attempt < MAX_RETRIES) {
          console.log(`[hybrid-generate-content] Retry ${attempt + 1}/${MAX_RETRIES} after ${lastError}`);
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); // Exponential backoff
        }
      } catch (fetchErr) {
        lastError = fetchErr instanceof Error ? fetchErr.message : "Network error";
        if (attempt < MAX_RETRIES) {
          console.log(`[hybrid-generate-content] Retry ${attempt + 1}/${MAX_RETRIES} after ${lastError}`);
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }

    if (!aiResponse || !aiResponse.ok) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "AI service temporarily unavailable. Please try again in a moment.",
          details: lastError
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResult = await aiResponse.json();
    let output = aiResult.choices?.[0]?.message?.content || "";

    // Clean up output - remove markdown code blocks if present
    output = output.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    // Validate campaign output if active
    let violations: string[] = [];
    if (activeCampaign) {
      const validation = validateCampaignOutput(output, activeCampaign.forbiddenPhrases);
      output = validation.cleaned;
      violations = validation.violations;
      
      if (violations.length > 0) {
        console.warn(`[hybrid-generate-content] Forbidden phrase violations: ${violations.join(', ')}`);
      }
    }

    // Save to content_queue with campaign metadata
    try {
      await supabase.from("content_queue").insert({
        organization_id,
        content_type,
        mode: activeCampaign ? content_mode : mode,
        ai_prompt: hybrid_brief,
        ai_metadata: { 
          references, 
          assets, 
          media_url,
          campaign_id: activeCampaign?.id || null,
          intent_preset,
          violations: violations.length > 0 ? violations : null,
        },
        script: output,
        status: "draft",
      });
    } catch (dbErr) {
      console.error("[hybrid-generate-content] Failed to save to queue:", dbErr);
      // Don't fail the request if DB insert fails
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        output,
        campaign_id: activeCampaign?.id || null,
        violations: violations.length > 0 ? violations : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("[hybrid-generate-content] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
