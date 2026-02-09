// Mightymail Files: Route file attachments to Design Desk
// Extracts order numbers, links to customers, notifies Lance

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.26.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EXTRACTION_PROMPT = `Extract order/job information from this email about file submission for vehicle wraps.

Return JSON only:
{
  "order_number": "string or null (look for WPW-XXXX, order #, PO #, invoice #)",
  "vehicle": {
    "year": number or null,
    "make": "string or null",
    "model": "string or null"
  },
  "wrap_type": "full|partial|graphics|decals|lettering" or null,
  "is_rush": boolean,
  "notes": "any special instructions or details"
}`;

interface ExtractedInfo {
  order_number: string | null;
  vehicle: {
    year: number | null;
    make: string | null;
    model: string | null;
  };
  wrap_type: string | null;
  is_rush: boolean;
  notes: string;
}

async function extractFileInfo(subject: string, body: string): Promise<ExtractedInfo> {
  const anthropic = new Anthropic({
    apiKey: Deno.env.get('ANTHROPIC_API_KEY')!,
  });

  const response = await anthropic.messages.create({
    model: 'claude-3-haiku-20240307',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `${EXTRACTION_PROMPT}\n\nSubject: ${subject}\n\n${body?.substring(0, 2000) || ''}`
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

  return {
    order_number: null,
    vehicle: { year: null, make: null, model: null },
    wrap_type: null,
    is_rush: false,
    notes: ''
  };
}

async function getAccessToken(): Promise<string> {
  const tenantId = Deno.env.get('MICROSOFT_TENANT_ID');
  const clientId = Deno.env.get('MICROSOFT_CLIENT_ID');
  const clientSecret = Deno.env.get('MICROSOFT_CLIENT_SECRET');
  
  const response = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId!,
        client_secret: clientSecret!,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    }
  );
  
  const data = await response.json();
  return data.access_token;
}

async function getAttachmentDetails(accessToken: string, mailbox: string, messageId: string): Promise<any[]> {
  const url = `https://graph.microsoft.com/v1.0/users/${mailbox}/messages/${messageId}/attachments`;
  
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  
  if (!response.ok) return [];
  
  const data = await response.json();
  return data.value || [];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get file_submission emails with attachments that haven't been processed to design desk
    const { data: emails, error: fetchError } = await supabase
      .from('mightymail_inbox')
      .select('*')
      .eq('category', 'file_submission')
      .eq('has_attachments', true)
      .eq('is_processed', true)
      .order('received_at', { ascending: true })
      .limit(10);

    if (fetchError) throw fetchError;
    if (!emails || emails.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No file submissions to process',
        processed: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check which emails already have design_desk entries
    const emailIds = emails.map(e => e.id);
    const { data: existingDesk } = await supabase
      .from('design_desk')
      .select('source_id')
      .eq('source', 'mightymail')
      .in('source_id', emailIds);
    
    const processedIds = new Set(existingDesk?.map(d => d.source_id) || []);
    const toProcess = emails.filter(e => !processedIds.has(e.id));

    if (toProcess.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'All file submissions already processed',
        processed: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Processing ${toProcess.length} file submissions`);

    const accessToken = await getAccessToken();
    let processed = 0;
    const results: any[] = [];

    for (const email of toProcess) {
      try {
        // Extract info from email
        const extracted = await extractFileInfo(
          email.subject || '',
          email.body_html || email.body_preview || ''
        );

        // Get full attachment details from Graph API
        const attachments = await getAttachmentDetails(
          accessToken,
          email.mailbox,
          email.microsoft_id
        );

        // Filter to design files only
        const designFileTypes = [
          'application/pdf',
          'application/postscript',
          'application/illustrator',
          'image/png',
          'image/jpeg',
          'image/tiff',
          'application/x-photoshop',
          'image/vnd.adobe.photoshop',
          'application/zip',
          'application/x-rar-compressed'
        ];

        const designFiles = attachments.filter((att: any) => 
          designFileTypes.some(type => att.contentType?.includes(type)) ||
          /\.(pdf|ai|eps|psd|png|jpg|jpeg|tiff|tif|zip|rar)$/i.test(att.name)
        );

        if (designFiles.length === 0) {
          console.log(`No design files in ${email.id}, skipping`);
          continue;
        }

        // Look up customer
        let customerId = null;
        if (email.from_email) {
          const { data: customer } = await supabase
            .from('customers')
            .select('id')
            .eq('email', email.from_email)
            .single();
          customerId = customer?.id;
        }

        // Look up order if we have order number
        let shopflowId = null;
        if (extracted.order_number) {
          const { data: order } = await supabase
            .from('shopflow_orders')
            .select('id')
            .ilike('order_number', `%${extracted.order_number}%`)
            .single();
          shopflowId = order?.id;
        }

        // Create design desk entry
        const deskEntry = {
          source: 'mightymail',
          source_id: email.id,
          customer_email: email.from_email,
          customer_name: email.from_name,
          customer_id: customerId,
          order_number: extracted.order_number,
          shopflow_id: shopflowId,
          files: designFiles.map((att: any) => ({
            name: att.name,
            type: att.contentType,
            size: att.size,
            microsoft_id: att.id
          })),
          file_count: designFiles.length,
          vehicle_year: extracted.vehicle.year?.toString(),
          vehicle_make: extracted.vehicle.make,
          vehicle_model: extracted.vehicle.model,
          wrap_type: extracted.wrap_type,
          notes: extracted.notes || `From email: ${email.subject}`,
          status: 'pending',
          assigned_to: 'lance@weprintwraps.com',
          assigned_at: new Date().toISOString(),
          priority: extracted.is_rush ? 1 : 0
        };

        const { data: desk, error: deskError } = await supabase
          .from('design_desk')
          .insert(deskEntry)
          .select('id')
          .single();

        if (deskError) {
          console.error(`Design desk creation failed for ${email.id}:`, deskError);
          continue;
        }

        // Update email to mark as routed
        await supabase
          .from('mightymail_inbox')
          .update({ 
            assigned_to: 'lance@weprintwraps.com',
            assigned_at: new Date().toISOString()
          })
          .eq('id', email.id);

        // Log analytics
        await supabase.from('mightymail_analytics').insert({
          email_id: email.id,
          event_type: 'routed_design_desk',
          event_data: {
            design_desk_id: desk.id,
            file_count: designFiles.length,
            order_number: extracted.order_number
          }
        });

        processed++;
        results.push({
          email_id: email.id,
          design_desk_id: desk.id,
          files: designFiles.length,
          order_number: extracted.order_number
        });

      } catch (emailError: any) {
        console.error(`Error processing ${email.id}:`, emailError);
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
    console.error('File processing error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
