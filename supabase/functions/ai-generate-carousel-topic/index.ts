import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Brand voice prompts
const BRAND_VOICE_PROMPTS: Record<string, string> = {
  trade_dna: `TRADE DNA VOICE:
- Speak like an insider who's been in the industry for 20 years
- Use specific technical terms (mil thickness, cast vs calendered, post-heating)
- Reference real challenges only pros would know
- Build credibility through knowledge, not claims
- "We've wrapped 10,000+ vehicles and here's what nobody tells you..."`,

  pain_agitate: `PAIN → AGITATE VOICE:
- Start by naming the EXACT pain point your buyer feels right now
- Twist the knife - show them what this pain is COSTING them
- Make them feel understood, not attacked
- Then present your solution as the obvious answer
- "You're losing $47/day in missed impressions. Here's why..."`,

  us_vs_them: `US VS THEM VOICE:
- Draw a clear line: the old way vs the new way
- Position competitors/alternatives as the inferior choice
- Make the reader feel smart for considering your approach
- Not aggressive, but confident
- "While other shops cut corners, we..."`,

  educational: `EDUCATIONAL VOICE:
- Lead with genuine value - teach something useful
- Establish expertise through giving, not claiming
- Each slide should deliver an insight
- Build trust before any selling
- "Most people get this wrong about wrap care..."`,

  behind_scenes: `BEHIND THE SCENES VOICE:
- Humanize the brand - show real people, real process
- Authenticity over polish
- Let them feel like insiders
- Create connection through transparency
- "Here's what actually happens during a fleet wrap..."`,

  transformation: `TRANSFORMATION VOICE:
- Focus on the before/after journey
- Make them visualize themselves in the "after"
- Emotional storytelling with specific details
- Aspirational but achievable
- "From invisible to unforgettable: Watch this fleet transform..."`,
};

// Marketing style prompts
const MARKETING_STYLE_PROMPTS: Record<string, string> = {
  sabri: `SABRI SUBY STYLE:
- Direct response mastery - every word earns its place
- Problem-Agitate-Solution structure
- Specific numbers and timeframes ("in 48 hours", "saves $4,200/month")
- Stack proof: testimonials, case studies, guarantees
- One clear CTA - remove all friction
- NO fluff, NO corporate speak`,

  garyvee: `GARY VEE STYLE:
- Raw, punchy, zero-BS energy
- Short declarative sentences
- Speak like you're talking to a friend
- Make the obvious point nobody else says
- Energy but not hype - authentic fire
- "Look, here's the truth..."`,

  dara: `DARA DENNEY STYLE:
- Premium positioning, calm confidence
- Mirror the buyer's best self-image
- Authority over urgency - never desperate
- Exclusivity > availability
- Identity-based messaging
- "For shops who refuse to blend in..."`,

  ogilvy: `OGILVY STYLE:
- Factual authority, editorial elegance
- Specific numbers and credibility markers
- Headlines that intrigue, not hype
- Long-form when needed, never padded
- Position as the obvious, trusted choice
- NO exclamation marks, NO hype words`,

  hormozi: `ALEX HORMOZI STYLE:
- Value stacking - make the offer irresistible
- Logical frameworks and clear math
- "Here's exactly what you get..."
- Remove risk with guarantees
- Business owner to business owner
- Make them feel like they'd be stupid not to act`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { seedIdea, brandVoice, marketingStyle, brand, slideCount = 5 } = await req.json();

    if (!seedIdea) {
      throw new Error("Seed idea is required");
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const brandVoicePrompt = BRAND_VOICE_PROMPTS[brandVoice] || BRAND_VOICE_PROMPTS.pain_agitate;
    const stylePrompt = MARKETING_STYLE_PROMPTS[marketingStyle] || MARKETING_STYLE_PROMPTS.sabri;

    const systemPrompt = `You are an elite social media strategist and copywriter for vehicle wrap businesses.
Your job is to transform rough ideas into HIGH-CONVERTING carousel content for Instagram/Meta.

═══════════════════════════════════════════════════════════════
BRAND: ${brand?.toUpperCase() || "WRAP COMPANY"}
═══════════════════════════════════════════════════════════════

${brandVoicePrompt}

${stylePrompt}

═══════════════════════════════════════════════════════════════
CAROUSEL STRUCTURE RULES:
═══════════════════════════════════════════════════════════════

1. SLIDE 1 (HOOK): 
   - Stop the scroll in 2 seconds
   - Provocative statement, question, or statistic
   - Create curiosity gap - make them NEED to swipe

2. SLIDES 2-${slideCount - 1} (VALUE):
   - Each slide delivers ONE clear point
   - Build momentum - each slide earns the next
   - Use specific examples, numbers, proof
   - Headlines are punchy (max 8 words)

3. SLIDE ${slideCount} (CTA):
   - Clear call to action
   - Low friction next step
   - Create urgency without desperation

CRITICAL RULES:
- NO generic marketing fluff
- NO emojis in headlines (captions only)
- Every word must EARN its place
- Specificity > generality
- Headlines must work standalone

OUTPUT FORMAT (JSON):
{
  "title": "The carousel topic title for internal reference",
  "hook": "The scroll-stopping hook for slide 1",
  "slides": [
    { "headline": "Slide 1 headline", "body": "2-3 sentences of body copy" },
    { "headline": "Slide 2 headline", "body": "2-3 sentences of body copy" },
    // ... ${slideCount} slides total
  ],
  "cta": "The call to action for the final slide",
  "caption": "Instagram caption (include relevant hashtags)"
}`;

    const userPrompt = `Transform this rough idea into a ${slideCount}-slide carousel:

TOPIC: ${seedIdea}

Generate a complete carousel structure following the brand voice and marketing style specified.`;

    console.log("Generating carousel topic with:", { brandVoice, marketingStyle, brand });

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
          { role: "user", content: userPrompt },
        ],
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "{}";

    // Parse JSON from response
    let topic;
    try {
      const cleanContent = content.replace(/```json\n?|\n?```/g, "").trim();
      topic = JSON.parse(cleanContent);
    } catch (parseErr) {
      console.error("JSON parse error:", parseErr, content);
      throw new Error("Failed to parse AI response");
    }

    console.log("Generated topic:", topic.title);

    return new Response(
      JSON.stringify({ success: true, topic }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("Carousel topic generation error:", err);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
