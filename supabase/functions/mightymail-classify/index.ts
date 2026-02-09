// Mightymail Classify: AI-powered email classification and routing
// Uses Claude to categorize emails and auto-route to team members

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.26.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CLASSIFICATION_PROMPT = `You are an email classifier for WePrintWraps.com, a wholesale vehicle wrap printing company.

Analyze the email and classify it into ONE of these categories:
- quote_request: Customer asking for pricing, quotes, or wants to place an order
- escalation: Angry customer, complaint, problem with order, refund request
- bulk_order: Large order inquiry, fleet wraps, multiple vehicles
- sponsorship: Sponsorship requests, brand partnerships, event sponsorships
- affiliate: Affiliate program inquiries, influencer partnerships, sponsored artist requests
- file_submission: Customer sending design files, artwork, or proofs
- general: General inquiry, question, or doesn't fit other categories

Also extract:
- keywords: Key topics mentioned (max 5)
- urgency: low, medium, or high
- is_new_customer: true if they seem unfamiliar with WePrintWraps

Respond in JSON format only:
{
  "category": "category_name",
  "confidence": 0.0-1.0,
  "keywords": ["keyword1", "keyword2"],
  "urgency": "low|medium|high",
  "is_new_customer": true|false,
  "reasoning": "brief explanation"
}`;

interface ClassificationResult {
  category: string;
  confidence: number;
  keywords: string[];
  urgency: string;
  is_new_customer: boolean;
  reasoning: string;
}

async function classifyEmail(subject: string, body: string, from: string): Promise<ClassificationResult> {
  const anthropic = new Anthropic({
    apiKey: Deno.env.get('ANTHROPIC_API_KEY')!,
  });

  const emailContent = `
From: ${from}
Subject: ${subject}

${body?.substring(0, 2000) || 'No body content'}
`;

  const response = await anthropic.messages.create({
    model: 'claude-3-haiku-20240307',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `${CLASSIFICATION_PROMPT}\n\nEmail to classify:\n${emailContent}`
    }]
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  
  try {
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error('Failed to parse classification:', e);
  }

  // Default fallback
  return {
    category: 'general',
    confidence: 0.5,
    keywords: [],
    urgency: 'medium',
    is_new_customer: false,
    reasoning: 'Could not classify'
  };
}

async function getRoutingRules(supabase: any): Promise<any[]> {
  const { data, error } = await supabase
    .from('mightymail_routing_rules')
    .select('*')
    .eq('is_active', true)
    .order('priority', { ascending: true });
  
  return data || [];
}

function findAssignee(category: string, rules: any[]): { assignTo: string; escalationLevel: number } {
  for (const rule of rules) {
    if (rule.category_match?.includes(category)) {
      return {
        assignTo: rule.assign_to,
        escalationLevel: rule.escalation_level || 0
      };
    }
  }
  
  // Default: unassigned
  return { assignTo: '', escalationLevel: 0 };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get unprocessed emails
    const { data: emails, error: fetchError } = await supabase
      .from('mightymail_inbox')
      .select('*')
      .eq('is_processed', false)
      .eq('is_spam', false)
      .order('received_at', { ascending: true })
      .limit(20);

    if (fetchError) throw fetchError;
    if (!emails || emails.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No emails to process',
        processed: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rules = await getRoutingRules(supabase);
    console.log(`Processing ${emails.length} emails with ${rules.length} routing rules`);

    let processed = 0;
    const results: any[] = [];

    for (const email of emails) {
      try {
        // Classify with AI
        const classification = await classifyEmail(
          email.subject || '',
          email.body_preview || email.body_html || '',
          email.from_email || ''
        );

        // Find assignee based on rules
        const { assignTo, escalationLevel } = findAssignee(classification.category, rules);

        // Special case: escalations go to BOTH Brice and Lance
        // We store Brice as primary, Lance notified separately
        let primaryAssign = assignTo;
        let secondaryNotify: string | null = null;
        
        if (classification.category === 'escalation') {
          primaryAssign = 'brice@weprintwraps.com';
          secondaryNotify = 'lance@weprintwraps.com';
        }

        // Check if customer exists
        let customerId = null;
        let customerEmail = email.from_email;
        
        if (customerEmail) {
          const { data: existingCustomer } = await supabase
            .from('customers')
            .select('id')
            .eq('email', customerEmail)
            .single();
          
          if (existingCustomer) {
            customerId = existingCustomer.id;
          }
        }

        // Update email with classification
        const { error: updateError } = await supabase
          .from('mightymail_inbox')
          .update({
            category: classification.category,
            confidence: classification.confidence,
            keywords: classification.keywords,
            assigned_to: primaryAssign || null,
            assigned_at: primaryAssign ? new Date().toISOString() : null,
            escalation_level: escalationLevel,
            customer_id: customerId,
            customer_email: customerEmail,
            is_new_customer: classification.is_new_customer && !customerId,
            is_processed: true,
            processed_at: new Date().toISOString(),
          })
          .eq('id', email.id);

        if (updateError) {
          console.error(`Error updating email ${email.id}:`, updateError);
          continue;
        }

        // Log analytics
        await supabase.from('mightymail_analytics').insert({
          email_id: email.id,
          event_type: 'classified',
          event_data: {
            category: classification.category,
            confidence: classification.confidence,
            assignedTo: primaryAssign,
            reasoning: classification.reasoning
          }
        });

        // Create new customer if needed
        if (classification.is_new_customer && !customerId && customerEmail) {
          const { data: newCustomer, error: customerError } = await supabase
            .from('customers')
            .insert({
              email: customerEmail,
              name: email.from_name || customerEmail.split('@')[0],
              source: 'mightymail_inbox',
              notes: `Auto-created from email: ${email.subject}`
            })
            .select('id')
            .single();

          if (newCustomer && !customerError) {
            await supabase
              .from('mightymail_inbox')
              .update({ customer_id: newCustomer.id })
              .eq('id', email.id);
            
            console.log(`Created new customer: ${customerEmail}`);
          }
        }

        processed++;
        results.push({
          id: email.id,
          subject: email.subject,
          category: classification.category,
          assignedTo: primaryAssign,
          confidence: classification.confidence
        });

      } catch (emailError: any) {
        console.error(`Error processing email ${email.id}:`, emailError);
      }
    }

    // Trigger auto-quote for any quote_request emails
    const quoteRequests = results.filter(r => r.category === 'quote_request');
    if (quoteRequests.length > 0) {
      console.log(`Triggering auto-quote for ${quoteRequests.length} quote requests`);
      try {
        await fetch(`${supabaseUrl}/functions/v1/mightymail-autoquote`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({}),
        });
      } catch (e) {
        console.error('Auto-quote trigger failed:', e);
      }
    }

    // Trigger file routing for file_submission emails
    const fileSubmissions = results.filter(r => r.category === 'file_submission');
    if (fileSubmissions.length > 0) {
      console.log(`Triggering file routing for ${fileSubmissions.length} file submissions`);
      try {
        await fetch(`${supabaseUrl}/functions/v1/mightymail-files`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({}),
        });
      } catch (e) {
        console.error('File routing trigger failed:', e);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      processed,
      results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Classification error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
