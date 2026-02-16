import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, source_type, organization_id, products } = await req.json();
    
    if (!text || text.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'No text provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    // Build product context if available
    let productContext = "";
    if (products && products.length > 0) {
      productContext = `\n\nAvailable products for matching:\n${products.map((p: any) => 
        `- ${p.product_name} (${p.category || 'general'}): $${p.price_per_sqft || p.flat_price || 'varies'}`
      ).join('\n')}`;
    }

    const systemPrompt = `You are an expert content atomizer for a vehicle wrap company. Your job is to break down any text input into small, actionable content atoms that can be used for:
- Instagram stories
- Reels scripts
- Captions
- Paid Meta ads
- Carousels
- Product campaigns

For each atom, identify:
1. The atom type: faq, pricing, feature, benefit, testimonial, objection, hook, cta, pain_point, script, idea, caption, ad_copy
2. The original text (cleaned up if needed)
3. Suggested ad angles: emotional, authority, speed, social_proof, value, scarcity, transformation
4. Suggested output formats: story, reel_script, caption, paid_ad, carousel_slide, static_post
5. Product match if applicable (from the product list)
6. Relevant tags for categorization

Return a JSON object with an "atoms" array. Each atom should have:
{
  "atom_type": string,
  "original_text": string,
  "processed_text": string (enhanced/cleaned version),
  "ad_angles": string[],
  "suggested_formats": string[],
  "product_match": string | null,
  "tags": string[]
}

Break the content into as many useful atoms as possible. Even a single FAQ should become multiple atoms (the question, the answer, a hook version, etc.).
${productContext}`;

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
          { role: "user", content: `Source type: ${source_type || 'general'}\n\nContent to atomize:\n\n${text}` }
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required, please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    
    // Parse JSON from response
    let atoms = [];
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        atoms = parsed.atoms || [];
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      // Return raw content as a single atom
      atoms = [{
        atom_type: "idea",
        original_text: text.substring(0, 500),
        processed_text: content,
        ad_angles: ["value"],
        suggested_formats: ["caption"],
        product_match: null,
        tags: [source_type || "general"]
      }];
    }

    console.log(`Atomized content into ${atoms.length} atoms`);

    return new Response(JSON.stringify({ 
      success: true, 
      atoms,
      count: atoms.length 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in ai-atomize-content:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
