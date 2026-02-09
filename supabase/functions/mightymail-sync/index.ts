// Mightymail Sync: Pull emails from all WPW mailboxes and sync to database
// Mailboxes: hello@, design@, support@ weprintwraps.com
// Runs every 5 minutes via cron

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAILBOXES = [
  'hello@weprintwraps.com',
  'design@weprintwraps.com', 
  'support@weprintwraps.com'
];

async function getAccessToken(): Promise<string> {
  const tenantId = Deno.env.get('MICROSOFT_TENANT_ID');
  const clientId = Deno.env.get('MICROSOFT_CLIENT_ID');
  const clientSecret = Deno.env.get('MICROSOFT_CLIENT_SECRET');
  
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Missing Microsoft credentials');
  }
  
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  });
  
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Token error: ${JSON.stringify(data)}`);
  }
  
  return data.access_token;
}

interface GraphEmail {
  id: string;
  conversationId: string;
  subject: string;
  bodyPreview: string;
  body?: { content: string; contentType: string };
  from: { emailAddress: { address: string; name: string } };
  toRecipients: Array<{ emailAddress: { address: string; name: string } }>;
  ccRecipients?: Array<{ emailAddress: { address: string; name: string } }>;
  hasAttachments: boolean;
  receivedDateTime: string;
}

async function fetchEmails(accessToken: string, mailbox: string, limit: number = 50): Promise<GraphEmail[]> {
  // Get recent emails from inbox
  const url = `https://graph.microsoft.com/v1.0/users/${mailbox}/mailFolders/inbox/messages?$top=${limit}&$orderby=receivedDateTime desc&$select=id,conversationId,subject,bodyPreview,from,toRecipients,ccRecipients,hasAttachments,receivedDateTime`;
  
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  
  if (!response.ok) {
    const error = await response.json();
    console.error(`Error fetching ${mailbox}:`, error);
    return [];
  }
  
  const data = await response.json();
  return data.value || [];
}

async function fetchEmailBody(accessToken: string, mailbox: string, messageId: string): Promise<string> {
  const url = `https://graph.microsoft.com/v1.0/users/${mailbox}/messages/${messageId}?$select=body`;
  
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  
  if (!response.ok) return '';
  
  const data = await response.json();
  return data.body?.content || '';
}

async function fetchAttachments(accessToken: string, mailbox: string, messageId: string): Promise<any[]> {
  const url = `https://graph.microsoft.com/v1.0/users/${mailbox}/messages/${messageId}/attachments?$select=id,name,contentType,size`;
  
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

    const accessToken = await getAccessToken();
    
    let totalSynced = 0;
    let totalSkipped = 0;
    const results: Record<string, { synced: number; skipped: number; errors: string[] }> = {};

    for (const mailbox of MAILBOXES) {
      results[mailbox] = { synced: 0, skipped: 0, errors: [] };
      
      try {
        const emails = await fetchEmails(accessToken, mailbox);
        console.log(`Fetched ${emails.length} emails from ${mailbox}`);
        
        for (const email of emails) {
          // Check if already synced
          const { data: existing } = await supabase
            .from('mightymail_inbox')
            .select('id')
            .eq('microsoft_id', email.id)
            .single();
          
          if (existing) {
            results[mailbox].skipped++;
            totalSkipped++;
            continue;
          }
          
          // Fetch full body for new emails
          const bodyHtml = await fetchEmailBody(accessToken, mailbox, email.id);
          
          // Fetch attachments if any
          let attachments: any[] = [];
          if (email.hasAttachments) {
            attachments = await fetchAttachments(accessToken, mailbox, email.id);
          }
          
          // Insert into database
          const { error: insertError } = await supabase
            .from('mightymail_inbox')
            .insert({
              microsoft_id: email.id,
              conversation_id: email.conversationId,
              mailbox: mailbox,
              folder: 'inbox',
              subject: email.subject,
              body_preview: email.bodyPreview?.substring(0, 500),
              body_html: bodyHtml,
              from_email: email.from?.emailAddress?.address,
              from_name: email.from?.emailAddress?.name,
              to_emails: email.toRecipients?.map(r => r.emailAddress) || [],
              cc_emails: email.ccRecipients?.map(r => r.emailAddress) || [],
              has_attachments: email.hasAttachments,
              attachments: attachments.map(a => ({
                id: a.id,
                name: a.name,
                contentType: a.contentType,
                size: a.size
              })),
              received_at: email.receivedDateTime,
              is_processed: false,
            });
          
          if (insertError) {
            console.error(`Error inserting email ${email.id}:`, insertError);
            results[mailbox].errors.push(insertError.message);
          } else {
            results[mailbox].synced++;
            totalSynced++;
            
            // Log analytics event
            const { data: inserted } = await supabase
              .from('mightymail_inbox')
              .select('id')
              .eq('microsoft_id', email.id)
              .single();
            
            if (inserted) {
              await supabase.from('mightymail_analytics').insert({
                email_id: inserted.id,
                event_type: 'received',
                event_data: { mailbox, from: email.from?.emailAddress?.address }
              });
            }
          }
        }
      } catch (mailboxError: any) {
        console.error(`Error processing ${mailbox}:`, mailboxError);
        results[mailbox].errors.push(mailboxError.message);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      summary: {
        totalSynced,
        totalSkipped,
        mailboxes: results
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Sync error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
