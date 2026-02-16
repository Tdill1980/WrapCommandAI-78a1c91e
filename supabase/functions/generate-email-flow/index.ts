import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FLOW_TEMPLATES = {
  winback: {
    name: "7-Day Winback Sequence",
    description: "Re-engage customers who haven't purchased in 30+ days",
    trigger: "customer_inactive_30d",
    stepCount: 5,
  },
  nurture: {
    name: "New Lead Nurture",
    description: "Welcome and educate new leads about wrap services",
    trigger: "new_lead",
    stepCount: 4,
  },
  abandoned_cart: {
    name: "Abandoned Cart Recovery",
    description: "Recover abandoned carts with compelling follow-ups",
    trigger: "cart_abandoned",
    stepCount: 3,
  },
  quote_followup: {
    name: "Quote Follow-Up Sequence",
    description: "Follow up on quotes that haven't converted",
    trigger: "quote_sent",
    stepCount: 4,
  },
  commercial: {
    name: "Commercial Wrap Funnel",
    description: "Target businesses for fleet and commercial wraps",
    trigger: "commercial_lead",
    stepCount: 5,
  },
  upsell: {
    name: "Post-Purchase Upsell",
    description: "Cross-sell and upsell to existing customers",
    trigger: "order_completed",
    stepCount: 3,
  },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { flowType, brand, persona, productFocus } = await req.json();
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    const template = FLOW_TEMPLATES[flowType as keyof typeof FLOW_TEMPLATES] || FLOW_TEMPLATES.nurture;
    
    const brandVoices: Record<string, string> = {
      wpw: "Professional, industry-leading, premium quality. WePrintWraps.com is the #1 wrap print provider.",
      wraptv: "Entertaining, hype, creator-focused. WrapTV is where wrap culture lives.",
      inkandedge: "Editorial, sophisticated, artistic. Ink & Edge celebrates the art of vehicle transformation.",
    };
    const brandVoice = brandVoices[brand] || brandVoices.wpw;

    const systemPrompt = `You are MightyMail AI, an expert email marketing system for the vehicle wrap industry.
Brand voice: ${brandVoice}
${persona ? `Target persona: ${persona}` : ''}
${productFocus ? `Product focus: ${productFocus}` : ''}

Generate a ${template.stepCount}-step email sequence for: ${template.description}

Each email must:
- Have compelling subject lines (under 50 chars)
- Include preview text
- Use professional HTML formatting with inline styles
- Include clear CTAs
- Build urgency progressively
- Match the brand voice exactly

Return JSON with this structure:
{
  "name": "Flow name",
  "description": "Flow description",
  "trigger": "${template.trigger}",
  "steps": [
    {
      "step_number": 1,
      "delay_hours": 0,
      "subject": "Subject line",
      "preview_text": "Preview text",
      "body_html": "<html>...</html>",
      "body_text": "Plain text version"
    }
  ]
}`;

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
          { role: 'user', content: `Generate a ${flowType} email sequence for ${brand}. ${persona ? `Persona: ${persona}. ` : ''}${productFocus ? `Focus on: ${productFocus}` : ''}` }
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Credits exhausted' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error('No content in AI response');
    }

    const flowData = JSON.parse(content);

    return new Response(JSON.stringify(flowData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Generate flow error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
