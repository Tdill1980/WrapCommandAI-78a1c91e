// Mightymail Auto-Quote: Extract vehicle info from emails and create quote drafts
// Phase 2: Drafts only (no auto-send) for testing

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.26.0";
import { calculateQuickQuote } from "../_shared/wpw-pricing.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EXTRACTION_PROMPT = `You are a vehicle wrap quote extraction specialist for WePrintWraps.com.

Extract the following information from the email. If not found, use null.

Return JSON only:
{
  "vehicle": {
    "year": number or null,
    "make": "string" or null,
    "model": "string" or null,
    "trim": "string" or null
  },
  "customer": {
    "name": "string" or null,
    "company": "string" or null,
    "phone": "string" or null
  },
  "wrap_details": {
    "type": "full|partial|color_change|commercial|graphics|decals" or null,
    "color": "string" or null,
    "finish": "gloss|matte|satin" or null,
    "quantity": number (default 1)
  },
  "urgency": "normal|rush" (default normal),
  "notes": "any special requests or details"
}

Be precise with vehicle info - year must be 4 digits (e.g., 2024), make is manufacturer (Ford, Chevy, etc.), model is specific model name.`;

interface ExtractedData {
  vehicle: {
    year: number | null;
    make: string | null;
    model: string | null;
    trim: string | null;
  };
  customer: {
    name: string | null;
    company: string | null;
    phone: string | null;
  };
  wrap_details: {
    type: string | null;
    color: string | null;
    finish: string | null;
    quantity: number;
  };
  urgency: string;
  notes: string;
}

async function extractQuoteDetails(subject: string, body: string, fromName: string): Promise<ExtractedData> {
  const anthropic = new Anthropic({
    apiKey: Deno.env.get('ANTHROPIC_API_KEY')!,
  });

  const emailContent = `
From: ${fromName}
Subject: ${subject}

${body?.substring(0, 3000) || 'No body content'}
`;

  const response = await anthropic.messages.create({
    model: 'claude-3-haiku-20240307',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `${EXTRACTION_PROMPT}\n\nEmail:\n${emailContent}`
    }]
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error('Failed to parse extraction:', e);
  }

  // Default fallback
  return {
    vehicle: { year: null, make: null, model: null, trim: null },
    customer: { name: fromName, company: null, phone: null },
    wrap_details: { type: null, color: null, finish: null, quantity: 1 },
    urgency: 'normal',
    notes: ''
  };
}

async function lookupVehicleSqft(supabase: any, year: number, make: string, model: string): Promise<number> {
  // Try exact match first
  const { data: vehicleData } = await supabase
    .from('vehicle_dimensions')
    .select('corrected_sqft')
    .ilike('make', make)
    .ilike('model', `%${model}%`)
    .gte('year_end', year)
    .lte('year_start', year)
    .limit(1)
    .single();

  if (vehicleData?.corrected_sqft) {
    return vehicleData.corrected_sqft;
  }

  // Fallback: any year same make/model
  const { data: fallback } = await supabase
    .from('vehicle_dimensions')
    .select('corrected_sqft')
    .ilike('make', make)
    .ilike('model', `%${model}%`)
    .limit(1)
    .single();

  return fallback?.corrected_sqft || 0;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get unprocessed quote_request emails
    const { data: emails, error: fetchError } = await supabase
      .from('mightymail_inbox')
      .select('*')
      .eq('category', 'quote_request')
      .is('quote_id', null)  // Not yet quoted
      .eq('is_processed', true)  // Already classified
      .order('received_at', { ascending: true })
      .limit(10);

    if (fetchError) throw fetchError;
    if (!emails || emails.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No quote requests to process',
        processed: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Processing ${emails.length} quote requests`);

    let processed = 0;
    const results: any[] = [];

    for (const email of emails) {
      try {
        // Extract details from email
        const extracted = await extractQuoteDetails(
          email.subject || '',
          email.body_html || email.body_preview || '',
          email.from_name || email.from_email || ''
        );

        console.log(`Extracted from ${email.id}:`, extracted);

        // Check if we have enough info for a quote
        const hasVehicle = extracted.vehicle.year && extracted.vehicle.make && extracted.vehicle.model;
        
        if (!hasVehicle) {
          // Mark as needs-info, can't auto-quote
          await supabase
            .from('mightymail_inbox')
            .update({ 
              quote_status: 'needs_info',
              keywords: [...(email.keywords || []), 'missing_vehicle_info']
            })
            .eq('id', email.id);
          
          results.push({
            id: email.id,
            status: 'needs_info',
            reason: 'Missing vehicle information'
          });
          continue;
        }

        // Lookup vehicle SQFT
        const sqft = await lookupVehicleSqft(
          supabase,
          extracted.vehicle.year!,
          extracted.vehicle.make!,
          extracted.vehicle.model!
        );

        // Calculate pricing
        let totalPrice = 0;
        let pricePerSqft = 5.27;
        let productName = 'Avery MPI 1105 EGRS with DOL 1460Z Lamination';

        if (sqft > 0) {
          const quoteCalc = calculateQuickQuote(sqft, 'avery');
          totalPrice = quoteCalc.materialCost;
          pricePerSqft = quoteCalc.pricePerSqft;
          productName = quoteCalc.productName;
        }

        // Create quote draft
        const draftData = {
          source_agent: 'mightymail',
          confidence: email.confidence || 0.85,
          customer_name: extracted.customer.name || email.from_name || 'Unknown',
          customer_email: email.from_email,
          customer_phone: extracted.customer.phone || null,
          vehicle_year: String(extracted.vehicle.year),
          vehicle_make: extracted.vehicle.make,
          vehicle_model: extracted.vehicle.model,
          material: productName,
          sqft: sqft,
          price_per_sqft: pricePerSqft,
          total_price: totalPrice * extracted.wrap_details.quantity,
          original_message: `Subject: ${email.subject}\n\n${email.body_preview || ''}`,
          source: 'mightymail_inbox',
          conversation_id: email.conversation_id,
          organization_id: null,
          status: 'draft',  // Always draft for review
          notes: JSON.stringify({
            wrap_type: extracted.wrap_details.type,
            color: extracted.wrap_details.color,
            finish: extracted.wrap_details.finish,
            quantity: extracted.wrap_details.quantity,
            urgency: extracted.urgency,
            customer_notes: extracted.notes,
            email_id: email.id
          })
        };

        const { data: draft, error: draftError } = await supabase
          .from('quote_drafts')
          .insert(draftData)
          .select('id')
          .single();

        if (draftError) {
          console.error(`Draft creation failed for ${email.id}:`, draftError);
          continue;
        }

        // Update email with quote link
        await supabase
          .from('mightymail_inbox')
          .update({ 
            quote_id: draft.id,
            quote_status: 'pending'
          })
          .eq('id', email.id);

        // Log analytics
        await supabase.from('mightymail_analytics').insert({
          email_id: email.id,
          event_type: 'quoted',
          event_data: {
            quote_id: draft.id,
            sqft,
            total_price: totalPrice,
            vehicle: extracted.vehicle
          }
        });

        processed++;
        results.push({
          id: email.id,
          status: 'quoted',
          quote_id: draft.id,
          vehicle: `${extracted.vehicle.year} ${extracted.vehicle.make} ${extracted.vehicle.model}`,
          sqft,
          price: totalPrice
        });

      } catch (emailError: any) {
        console.error(`Error processing ${email.id}:`, emailError);
        results.push({
          id: email.id,
          status: 'error',
          error: emailError.message
        });
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
    console.error('Auto-quote error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
