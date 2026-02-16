// supabase/functions/ai-generate-meta-ads/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { loadVoiceProfile } from "../_shared/voice-engine-loader.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { organization_id, placement, media_url } = await req.json();

    // Load brand voice from TradeDNA
    const voiceProfile = organization_id
      ? await loadVoiceProfile(organization_id)
      : null;

    const brandVoice = voiceProfile?.merged || {
      tone: "professional",
      persona: "automotive expert",
      vocabulary: { signature_phrases: [] as string[] },
    };

    const tone = brandVoice.tone || "confident";
    const persona = brandVoice.persona || "wrap industry pro";
    const vocab = brandVoice.vocabulary;
    const signaturePhrases = vocab && typeof vocab === "object" && "signature_phrases" in vocab 
      ? (vocab as { signature_phrases: string[] }).signature_phrases 
      : [];
    const styleWords = signaturePhrases.slice(0, 5).join(", ") || "";

    const systemPrompt = `You are the META ADS ENGINE for paid Facebook + Instagram ads.
STRICTLY return valid JSON with this exact structure:
{
  "short_texts": ["text1", "text2", "text3", "text4"],
  "long_texts": ["text1", "text2"],
  "headlines": ["h1", "h2", "h3", "h4", "h5"],
  "descriptions": ["d1", "d2", "d3"],
  "cta": "GET_QUOTE",
  "angles": [
    {"name": "Direct Offer", "primary_text": "...", "headline": "..."},
    {"name": "Emotional", "primary_text": "...", "headline": "..."},
    {"name": "Speed", "primary_text": "...", "headline": "..."},
    {"name": "Before/After", "primary_text": "...", "headline": "..."},
    {"name": "Authority", "primary_text": "...", "headline": "..."},
    {"name": "Social Proof", "primary_text": "...", "headline": "..."}
  ]
}

Write in this brand voice:
- Tone: ${tone}
- Persona: ${persona}
- Vocabulary: ${styleWords}

Generate:
- 4 SHORT primary texts (60–125 chars) - scroll-stopping hooks
- 2 LONG primary texts (200–450 chars) - storytelling with problem → solution → CTA
- 5 headlines (max 40 chars each)
- 3 descriptions (max 30 chars each)
- CTA recommendation from: SHOP_NOW, ORDER_NOW, GET_QUOTE, LEARN_MORE, BOOK_NOW, CONTACT_US
- 6 angle variants with unique primary_text and headline for each`;

    const userPrompt = `Create Meta ad copy for this media:
URL: ${media_url || "Vehicle wrap showcase video/image"}
Placement: ${placement}

Focus on vehicle wrap transformation psychology - turning ordinary vehicles into head-turners.
Use language that converts wrap customers.`;

    const aiRes = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("GEMINI_API_KEY")}`,
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

    if (!aiRes.ok) {
      const errorText = await aiRes.text();
      console.error("AI API error:", aiRes.status, errorText);
      throw new Error(`AI API error: ${aiRes.status}`);
    }

    const json = await aiRes.json();
    const content = json.choices?.[0]?.message?.content || "{}";
    
    // Parse JSON from response (handle markdown code blocks)
    let parsed;
    try {
      const cleanContent = content.replace(/```json\n?|\n?```/g, "").trim();
      parsed = JSON.parse(cleanContent);
    } catch (parseErr) {
      console.error("JSON parse error:", parseErr, content);
      throw new Error("Failed to parse AI response as JSON");
    }

    // Build structured output_payload for multi-platform export
    const outputPayload = {
      meta: {
        short_texts: parsed.short_texts || [],
        long_texts: parsed.long_texts || [],
        headlines: parsed.headlines || [],
        descriptions: parsed.descriptions || [],
        cta_button: parsed.cta || "LEARN_MORE",
        angles: parsed.angles || [],
        video_url: media_url || null,
        placement: placement,
      },
      csv: {
        headers: ["Primary Text", "Headline", "Description", "CTA", "Media URL"],
        rows: (parsed.angles || []).map((angle: any) => ({
          "Primary Text": angle.primary_text || "",
          "Headline": angle.headline || "",
          "Description": parsed.descriptions?.[0] || "",
          "CTA": parsed.cta || "LEARN_MORE",
          "Media URL": media_url || "",
        })),
      },
      generated_at: new Date().toISOString(),
    };

    return new Response(
      JSON.stringify({ success: true, output: parsed, output_payload: outputPayload }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("META ADS API ERROR:", err);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
