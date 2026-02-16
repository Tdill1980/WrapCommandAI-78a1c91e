import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { shopName, websiteUrl, instagramHandle, specialties, additionalInfo } = await req.json();

    console.log("[analyze-brand-voice] Analyzing:", shopName);

    // Build context for AI analysis
    let contextData = `Shop Name: ${shopName}\n`;
    if (specialties?.length) {
      contextData += `Specialties: ${specialties.join(", ")}\n`;
    }
    if (additionalInfo) {
      contextData += `Additional Info: ${additionalInfo}\n`;
    }

    // Fetch website content if URL provided
    let websiteContent = "";
    if (websiteUrl) {
      try {
        const response = await fetch(websiteUrl, {
          headers: { "User-Agent": "WrapCommandAI Brand Analyzer" },
        });
        if (response.ok) {
          const html = await response.text();
          // Extract text content (simplified)
          websiteContent = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .slice(0, 5000);
          contextData += `\nWebsite Content:\n${websiteContent}\n`;
        }
      } catch (err) {
        console.log("[analyze-brand-voice] Could not fetch website:", err);
      }
    }

    // Call AI to analyze brand voice
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    const prompt = `You are a brand voice analyst specializing in automotive wrap shops. Analyze the provided business information and extract a comprehensive brand voice profile.

Return a JSON object with this exact structure:
{
  "tone": "one or two words describing overall tone (e.g., Professional, Friendly, Bold, Expert)",
  "energy": "one word (High, Medium, Calm, Intense)",
  "persona": "short description of brand personality (e.g., Expert Installer, Creative Artist, Trusted Pro)",
  "vocabulary": {
    "signature_phrases": ["list of 5-8 phrases they likely use or should use"],
    "words_to_avoid": ["list of 3-5 words that don't fit the brand"]
  },
  "sales_style": {
    "approach": "Consultative, Direct, Educational, or Relationship-focused",
    "urgency_level": "Low, Medium, or High",
    "cta_style": "Soft, Medium, or Direct"
  },
  "customer_profile": {
    "pain_points": ["list of 3-5 customer pain points they address"],
    "desires": ["list of 3-5 customer desires they fulfill"]
  },
  "sentence_style": {
    "length": "Short, Medium, or Varied",
    "complexity": "Simple, Moderate, or Sophisticated"
  }
}

Be specific to the wrap industry. If analyzing a shop that does full wraps, PPF, and tint, incorporate that into the voice. If they focus on high-end vehicles, reflect that premium positioning.

Analyze this wrap shop and create their brand voice profile:

${contextData}

Return ONLY the JSON object, no markdown.`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${GEMINI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[analyze-brand-voice] Lovable error:", errorText);
      throw new Error("AI analysis failed");
    }

    const data = await response.json();
    const textContent = data?.choices?.[0]?.message?.content || "{}";
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    const voiceProfile = JSON.parse(jsonMatch ? jsonMatch[0] : "{}");

    console.log("[analyze-brand-voice] Generated profile for:", shopName);

    return new Response(
      JSON.stringify({
        success: true,
        voiceProfile,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[analyze-brand-voice] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        // Return a default profile on error
        voiceProfile: {
          tone: "Professional",
          energy: "Medium",
          persona: "Expert Installer",
          vocabulary: {
            signature_phrases: [
              "Transform your ride",
              "Premium quality guaranteed",
              "Wrap it right the first time",
              "Your vision, our expertise",
            ],
            words_to_avoid: ["cheap", "basic", "discount"],
          },
          sales_style: {
            approach: "Consultative",
            urgency_level: "Medium",
            cta_style: "Medium",
          },
          customer_profile: {
            pain_points: [
              "Want to protect investment",
              "Looking for unique style",
              "Tired of factory paint",
            ],
            desires: [
              "Stand out from crowd",
              "Quality that lasts",
              "Professional results",
            ],
          },
          sentence_style: {
            length: "Medium",
            complexity: "Moderate",
          },
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200, // Return 200 with fallback profile
      }
    );
  }
});
