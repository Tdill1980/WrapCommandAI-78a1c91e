// Edge function to search/delete emails from any mailbox in the tenant
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    const { action, userEmail, query, emailId, emailIds, folder = 'inbox', limit = 50 } = await req.json();
    
    if (!userEmail) throw new Error('userEmail required');
    
    const accessToken = await getAccessToken();
    
    if (action === 'search') {
      const url = `https://graph.microsoft.com/v1.0/users/${userEmail}/mailFolders/${folder}/messages?$top=${limit}&$search="${query}"`;
      
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(`Graph API error: ${JSON.stringify(data)}`);
      
      const emails = data.value?.map((email: any) => ({
        id: email.id,
        subject: email.subject,
        from: email.from?.emailAddress?.address,
        receivedDateTime: email.receivedDateTime,
        preview: email.bodyPreview?.substring(0, 100),
      })) || [];
      
      return new Response(JSON.stringify({ success: true, count: emails.length, emails }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    if (action === 'delete') {
      if (!emailId) throw new Error('emailId required for delete');
      
      const url = `https://graph.microsoft.com/v1.0/users/${userEmail}/messages/${emailId}`;
      const response = await fetch(url, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      
      if (!response.ok && response.status !== 204) {
        const data = await response.json();
        throw new Error(`Delete failed: ${JSON.stringify(data)}`);
      }
      
      return new Response(JSON.stringify({ success: true, deleted: emailId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    if (action === 'deleteBatch') {
      if (!emailIds || !Array.isArray(emailIds)) throw new Error('emailIds array required');
      
      const results = [];
      for (const id of emailIds) {
        const url = `https://graph.microsoft.com/v1.0/users/${userEmail}/messages/${id}`;
        const response = await fetch(url, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });
        results.push({ id, success: response.ok || response.status === 204 });
      }
      
      return new Response(JSON.stringify({ success: true, results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    throw new Error('Invalid action. Use: search, delete, deleteBatch');
    
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
