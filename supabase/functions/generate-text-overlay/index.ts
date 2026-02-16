import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Scene {
  sceneId: string;
  text?: string;
  start: number;
  end: number;
  purpose?: string;
  textPosition?: string;
  animation?: string;
}

interface RequestBody {
  scene: Scene;
  prompt?: string;
  brand?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("[generate-text-overlay] ====== FUNCTION INVOKED ======");

  try {
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      console.error("[generate-text-overlay] Missing GEMINI_API_KEY");
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: RequestBody = await req.json();
    const { scene, prompt = "", brand = "wpw" } = body;

    console.log("[generate-text-overlay] Request:", {
      sceneId: scene?.sceneId,
      existingText: scene?.text?.substring(0, 30),
      purpose: scene?.purpose,
      prompt: prompt?.substring(0, 50),
      brand,
    });

    if (!scene) {
      return new Response(
        JSON.stringify({ error: "Scene is required" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build the system prompt based on brand and purpose
    const purposeContext = {
      hook: "This is a HOOK scene - grab attention immediately with a provocative question or bold statement.",
      b_roll: "This is B-ROLL - reinforce the message with supporting text that builds credibility.",
      cta: "This is a CTA scene - create urgency and drive action.",
      content: "This is content - make it compelling and relevant.",
    };

    const fullPrompt = `You are an expert video marketing copywriter for WePrintWraps, a B2B print-on-demand company serving wrap installers.

BRAND VOICE:
- Direct, punchy, no fluff
- High-energy, sales-driven
- Speaks to wrap installers' pain points: slow turnarounds, missed deadlines, inconsistent quality
- Benefits: fast printing, color matching, reliable delivery

${purposeContext[scene.purpose as keyof typeof purposeContext] || purposeContext.content}

RULES:
- Maximum 6-8 words
- UPPERCASE preferred for impact
- No hashtags, emojis, or URLs
- Front-load the most important word
- Use active voice

${prompt ? `ADDITIONAL DIRECTION: ${prompt}` : ""}

${scene.text ? `CURRENT TEXT TO IMPROVE: "${scene.text}"` : ""}

Generate ONE short, punchy text overlay. Return ONLY the text, nothing else.

${scene.text
  ? `Improve or regenerate this overlay text: "${scene.text}"`
  : `Generate a text overlay for a ${scene.purpose || 'content'} scene (${scene.start}s - ${scene.end}s)`}`;

    console.log("[generate-text-overlay] Calling Lovable Gateway...");

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GEMINI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          messages: [{ role: 'user', content: fullPrompt }],
          max_tokens: 50,
          temperature: 0.8
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error("[generate-text-overlay] Lovable error:", errorData);
      return new Response(
        JSON.stringify({ error: `Lovable error: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const generatedText = data?.choices?.[0]?.message?.content?.trim() || "";

    // Clean up the response - remove quotes if present
    const cleanText = generatedText.replace(/^["']|["']$/g, '').trim();

    console.log("[generate-text-overlay] Generated:", cleanText);

    return new Response(
      JSON.stringify({ 
        text: cleanText,
        scene_id: scene.sceneId,
        original_text: scene.text,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[generate-text-overlay] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
