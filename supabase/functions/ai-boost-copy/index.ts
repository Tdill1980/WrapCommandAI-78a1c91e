import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BoostRequest {
  rawHeadline: string;
  rawBody?: string;
  rawCta?: string;
  formula: "ogilvy" | "sabri" | "dara" | "garyvee" | "aida" | "pas";
  buyerPersona?: "wrap_shop" | "fleet_manager" | "consumer" | "general";
  productContext?: string;
}

// Formula-specific prompts embedded for edge function
const FORMULA_PROMPTS: Record<string, string> = {
  ogilvy: `OGILVY FRAMEWORK:
- Lead with authority and facts, not excitement
- Use specific numbers and credible proof
- NEVER use exclamation marks
- Position as the obvious, trusted choice
- Headlines should be factual with specificity
- Confident invitation, not urgent demand`,

  sabri: `SABRI SUBY FRAMEWORK:
- Start with PAIN, never product
- Agitate: Make it urgent without being pushy
- Present solution with irresistible proof
- One clear CTA only
- Proof > Promise
- Specificity sells (exact numbers, timeframes)
- Trigger words: "Tired of", "Struggling with", "Finally", "Warning:"`,

  dara: `DARA DENNEY FRAMEWORK:
- Mirror the buyer's best self-image
- Authority over urgency ALWAYS
- Make it feel inevitable, not desperate
- Premium tone, never salesy
- Speak to identity, not just needs
- Confidence without arrogance
- Trigger words: "You're the kind of", "For those who", "When you're ready"`,

  garyvee: `GARY VEE FRAMEWORK:
- No fluff, no filler, no BS
- Speak like you're talking to a friend
- Make the obvious point nobody says
- Energy but not hype
- Short, declarative sentences
- Real talk, direct action
- Trigger words: "Look,", "Here's the thing:", "Stop overthinking."`,

  aida: `AIDA FRAMEWORK:
- Grab ATTENTION with pattern interrupt
- Build INTEREST with relevance to them
- Create DESIRE with visualization and proof
- Clear ACTION with urgency
- Each element flows to the next`,

  pas: `PAS FRAMEWORK:
- State the PROBLEM clearly and specifically
- AGITATE: Why it's costing them
- SOLVE: Your answer feels inevitable
- Keep it focused on ONE problem
- Proof makes the solution credible`
};

const PERSONA_CONTEXTS: Record<string, string> = {
  wrap_shop: "Target: WRAP SHOP OWNER - busy entrepreneur, values efficiency, professional quality, and making money from vehicle wraps.",
  fleet_manager: "Target: FLEET MANAGER - focused on ROI, brand visibility, vehicle protection, and professionalism for their fleet.",
  consumer: "Target: CONSUMER - wants their personal vehicle to look amazing, express personality, and stand out.",
  general: "Target: Business owner looking for vehicle branding solutions."
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      rawHeadline, 
      rawBody, 
      rawCta, 
      formula = "sabri",
      buyerPersona = "general",
      productContext = "vehicle wraps and graphics"
    }: BoostRequest = await req.json();

    if (!rawHeadline?.trim()) {
      return new Response(
        JSON.stringify({ success: false, error: "Headline is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    const formulaPrompt = FORMULA_PROMPTS[formula] || FORMULA_PROMPTS.sabri;
    const personaContext = PERSONA_CONTEXTS[buyerPersona] || PERSONA_CONTEXTS.general;

    const systemPrompt = `You are an elite direct-response copywriter trained by the masters: David Ogilvy, Sabri Suby, Dara Denney, and Gary Vaynerchuk.

${formulaPrompt}

${personaContext}

PRODUCT/SERVICE: ${productContext}

YOUR MISSION:
Transform the raw input copy into HIGH-CONVERTING Meta ad copy that:
1. Stops the scroll in 2 seconds
2. Creates emotional resonance with the exact buyer
3. Drives immediate action
4. Feels authentic, not salesy

CRITICAL RULES:
- NO generic marketing fluff
- NO emojis unless absolutely necessary
- NO hype words (amazing, incredible, revolutionary, game-changer)
- MUST match the formula's voice and energy exactly
- MUST be specific to vehicle wraps/graphics industry
- MUST create urgency without being desperate or pushy
- Headlines max 40 characters
- Primary text max 125 characters
- CTA max 4 words

OUTPUT FORMAT (JSON only, no markdown):
{
  "headline": "The enhanced headline",
  "primary_text": "The enhanced body copy",
  "cta": "The call to action",
  "hook_variations": ["Alt hook 1", "Alt hook 2"]
}`;

    const userPrompt = `Transform this raw copy into high-converting Meta ad copy:

RAW HEADLINE: ${rawHeadline}
${rawBody ? `RAW BODY: ${rawBody}` : ""}
${rawCta ? `RAW CTA: ${rawCta}` : ""}

Apply the ${formula.toUpperCase()} framework and return enhanced copy as JSON.`;

    console.log(`[ai-boost-copy] Formula: ${formula}, Persona: ${buyerPersona}`);

    const aiRes = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("[ai-boost-copy] AI error:", aiRes.status, errText);
      
      if (aiRes.status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI request failed: ${aiRes.status}`);
    }

    const json = await aiRes.json();
    const content = json.choices?.[0]?.message?.content || "{}";

    // Parse JSON from response
    let boosted;
    try {
      const cleanContent = content.replace(/```json\n?|\n?```/g, "").trim();
      boosted = JSON.parse(cleanContent);
    } catch (parseErr) {
      console.error("[ai-boost-copy] JSON parse error:", parseErr, content);
      // Fallback: return original with minor enhancement
      boosted = {
        headline: rawHeadline,
        primary_text: rawBody || rawHeadline,
        cta: rawCta || "Learn More",
        hook_variations: []
      };
    }

    console.log("[ai-boost-copy] Success:", { formula, headline: boosted.headline });

    return new Response(
      JSON.stringify({ 
        success: true, 
        boosted,
        formula_used: formula,
        original: { rawHeadline, rawBody, rawCta }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("[ai-boost-copy] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
