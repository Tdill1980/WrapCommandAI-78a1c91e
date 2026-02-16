import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STYLE_PROMPTS = {
  sabri: `Generate captions in Sabri Suby direct-response style:
- UPPERCASE for emphasis
- Punchy, aggressive hooks
- Problem-agitation-solution flow
- Urgency and scarcity language
- Use 🔥 💰 ⚡ emojis sparingly
- Short, impactful phrases (2-5 words max)
- Examples: "THIS IS INSANE", "WAIT FOR IT", "WATCH THE REVEAL 🔥"`,

  dara: `Generate captions in Dara Denney UGC style:
- Lowercase, conversational tone
- Relatable and authentic
- "I didn't think this would work" vibes
- Soft CTAs, testimonial feel
- Use emojis naturally
- Storytelling pacing
- Examples: "wait for this...", "honestly obsessed", "the way this turned out 😍"`,

  clean: `Generate captions in clean minimal style:
- Professional and simple
- No emojis
- Sentence case
- Clear and direct
- Elegant pacing
- Examples: "Premium wrap finish", "The transformation", "Before and after"`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { video_url, style = "sabri", duration = 15, concept, hook, cta, prompt } = await req.json();
    
    // Use prompt OR concept as the main content anchor
    const userPrompt = (prompt || concept || "").trim();
    
    console.log("[ai-generate-captions] Input:", {
      style,
      duration,
      promptLen: userPrompt.length,
      hasHook: !!hook,
      hasCta: !!cta,
    });

    // Enforce minimum prompt length for quality output
    if (userPrompt.length < 3) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing prompt. Enter a real concept (e.g., 'Inside Ghost Industries Shop').",
          captions: [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");

    if (!apiKey) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    const stylePrompt = STYLE_PROMPTS[style as keyof typeof STYLE_PROMPTS] || STYLE_PROMPTS.sabri;

    // Build context from AI-provided data
    let contextInfo = `\nReel Concept: ${userPrompt}`;
    if (hook) contextInfo += `\nSuggested Hook: ${hook}`;
    if (cta) contextInfo += `\nSuggested CTA: ${cta}`;

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a viral reel caption generator for the vehicle wrap industry.

${stylePrompt}

Generate 4-6 timed captions for a ${duration}-second reel.
Each caption should appear at strategic moments for maximum retention.
${contextInfo}

Structure captions based on reel duration:
- Hook caption (0-2s) - grab attention immediately
- Tease/build-up captions (2s to ${Math.floor(duration * 0.6)}s) - show progress
- Reveal caption (${Math.floor(duration * 0.7)}s to ${Math.floor(duration * 0.85)}s) - showcase result
- CTA caption (${Math.floor(duration * 0.85)}s to ${duration}s) - call to action

IMPORTANT: Time captions proportionally to the actual ${duration}s duration.`,
          },
          {
            role: "user",
            content: `Generate viral captions for a vehicle wrap reel${video_url ? ` (video: ${video_url})` : ''}.
Duration: ${duration} seconds.
Style: ${style}.
${concept ? `Theme: ${concept}` : ''}
${hook ? `Use this hook concept: ${hook}` : ''}
${cta ? `End with CTA similar to: ${cta}` : ''}

Create engaging captions that will maximize watch time and engagement.`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_captions",
              description: "Return timed captions for the reel",
              parameters: {
                type: "object",
                properties: {
                  captions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        text: { type: "string", description: "Caption text" },
                        start: { type: "number", description: "Start time in seconds" },
                        end: { type: "number", description: "End time in seconds" },
                        emoji: { type: "string", description: "Optional emoji" },
                      },
                      required: ["text", "start", "end"],
                    },
                  },
                },
                required: ["captions"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_captions" } },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", errorText);
      
      // Return fallback captions scaled to duration
      const fallbackCaptions = [
        { text: hook || (style === "sabri" ? "WATCH THIS 🔥" : style === "dara" ? "wait for it..." : "The transformation"), start: 0, end: 2 },
        { text: style === "sabri" ? "THIS IS INSANE" : style === "dara" ? "honestly obsessed" : "Premium finish", start: 2, end: Math.min(4, duration * 0.3) },
        { text: style === "sabri" ? "THE REVEAL" : style === "dara" ? "the way this turned out 😍" : "Before and after", start: Math.floor(duration * 0.7), end: Math.floor(duration * 0.85) },
        { text: cta || (style === "sabri" ? "LINK IN BIO 💰" : style === "dara" ? "dm for info ✨" : "Contact us"), start: Math.floor(duration * 0.85), end: duration },
      ];
      
      return new Response(
        JSON.stringify({ success: true, captions: fallbackCaptions }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (toolCall?.function?.arguments) {
      const result = JSON.parse(toolCall.function.arguments);
      console.log(`Generated ${result.captions?.length || 0} captions for ${duration}s ${style} reel`);
      return new Response(
        JSON.stringify({ success: true, captions: result.captions }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error("Failed to generate captions");
  } catch (error: unknown) {
    console.error("ai-generate-captions error:", error);
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errMsg, captions: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
