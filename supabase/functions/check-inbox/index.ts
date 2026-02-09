// Edge function to check/manage emails via Microsoft Graph
// No JWT verification - internal use only
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

async function getAccessToken() {
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const body = await req.json();
    const { action, query, folder = 'inbox', limit = 20, userEmail, emailId, emailIds } = body;
    const accessToken = await getAccessToken();
    
    // Default to hello@ but allow targeting any mailbox in tenant
    const targetEmail = userEmail || 'hello@weprintwraps.com';
    let url = '';
    
    if (action === 'search') {
      // Search emails (no orderby with search)
      url = `https://graph.microsoft.com/v1.0/users/${targetEmail}/mailFolders/${folder}/messages?$top=${limit}&$search="${query}"`;
    } else if (action === 'recent') {
      // Get recent emails
      url = `https://graph.microsoft.com/v1.0/users/${targetEmail}/mailFolders/${folder}/messages?$top=${limit}&$orderby=receivedDateTime desc`;
    } else if (action === 'stats') {
      // Get folder stats
      url = `https://graph.microsoft.com/v1.0/users/${targetEmail}/mailFolders`;
    } else if (action === 'get') {
      // Get specific email with full body
      if (!emailId) throw new Error('emailId required for get action');
      url = `https://graph.microsoft.com/v1.0/users/${targetEmail}/messages/${emailId}`;
    } else if (action === 'delete') {
      // Delete single email
      if (!emailId) throw new Error('emailId required for delete action');
      const delUrl = `https://graph.microsoft.com/v1.0/users/${targetEmail}/messages/${emailId}`;
      const delResponse = await fetch(delUrl, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      
      if (!delResponse.ok && delResponse.status !== 204) {
        const errData = await delResponse.json().catch(() => ({}));
        throw new Error(`Delete failed: ${JSON.stringify(errData)}`);
      }
      
      return new Response(JSON.stringify({ success: true, deleted: emailId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else if (action === 'deleteBatch') {
      // Delete multiple emails
      if (!emailIds || !Array.isArray(emailIds)) throw new Error('emailIds array required');
      
      const results = [];
      for (const id of emailIds) {
        const delUrl = `https://graph.microsoft.com/v1.0/users/${targetEmail}/messages/${id}`;
        const delResponse = await fetch(delUrl, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });
        results.push({ id, success: delResponse.ok || delResponse.status === 204 });
      }
      
      return new Response(JSON.stringify({ success: true, results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      throw new Error('Invalid action. Use: search, recent, stats, get, delete, deleteBatch');
    }
    
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`Graph API error: ${JSON.stringify(data)}`);
    }
    
    // Format output
    if (action === 'search' || action === 'recent') {
      const emails = data.value?.map((email: any) => ({
        id: email.id,
        subject: email.subject,
        from: email.from?.emailAddress?.address,
        to: email.toRecipients?.map((r: any) => r.emailAddress?.address),
        cc: email.ccRecipients?.map((r: any) => r.emailAddress?.address),
        receivedDateTime: email.receivedDateTime,
        preview: email.bodyPreview?.substring(0, 200),
        hasAttachments: email.hasAttachments,
      })) || [];
      
      return new Response(JSON.stringify({ success: true, count: emails.length, emails }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
