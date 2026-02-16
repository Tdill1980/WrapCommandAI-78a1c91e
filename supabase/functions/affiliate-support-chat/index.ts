import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ChatRequest {
  founderId: string;
  founderName: string;
  message: string;
  conversationHistory: Array<{ role: string; content: string }>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    const { founderId, founderName, message, conversationHistory }: ChatRequest = await req.json();

    console.log(`[Evan Porter] Chat from affiliate ${founderName} (${founderId}): ${message}`);

    const systemPrompt = `You are Evan Porter, an AI Affiliate Operations Manager for MightyAffiliate, the affiliate program for WePrintWraps.com and related products.

Your personality:
- Friendly, supportive, and enthusiastic about helping affiliates succeed
- Professional but approachable - use casual language when appropriate
- Proactive with suggestions and tips
- Knowledgeable about affiliate marketing, commissions, content creation

Products affiliates can promote:
1. WePrintWraps.com - Premium wrap printing (2.5% commission)
2. WrapCommand AI - Wrap shop management software (20% commission)
3. DesignProAI - AI wrap design tool (20% commission)
4. The Closer by DesignProAI - Sales accelerator (10% commission)
5. Ink & Edge Magazine - Industry magazine (20% commission)

Key information you can help with:
- Commission rates and payout schedules (monthly, via Stripe Connect)
- How to upload and submit content for ads
- Tips for maximizing affiliate earnings
- Tracking links and QR codes
- Using the digital business card feature
- Best practices for promoting products

Current context:
- Affiliate Name: ${founderName}
- They're using the MightyAffiliate dashboard

Keep responses concise but helpful. Use emojis sparingly. If they ask about something you can't help with, suggest they reach out to support@weprintwraps.com.`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...conversationHistory.slice(-10).map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content
      })),
      { role: "user", content: message }
    ];

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content || "I'm having trouble processing that. Could you rephrase your question?";

    console.log(`[Evan Porter] Response to ${founderName}: ${aiResponse.substring(0, 100)}...`);

    return new Response(JSON.stringify({ response: aiResponse }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Evan Porter] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      response: "I apologize, I'm experiencing a brief technical issue. Please try again in a moment!"
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
