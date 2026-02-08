// Send email from hello@weprintwraps.com via Microsoft Graph
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
    const { to, subject, body, replyToId } = await req.json();
    
    if (!to || !subject || !body) {
      throw new Error('Missing required fields: to, subject, body');
    }
    
    const accessToken = await getAccessToken();
    const userEmail = 'hello@weprintwraps.com';
    
    // Build email message
    const message: any = {
      subject,
      body: {
        contentType: 'HTML',
        content: body,
      },
      toRecipients: [
        {
          emailAddress: { address: to },
        },
      ],
      from: {
        emailAddress: { address: userEmail, name: 'We Print Wraps' },
      },
    };
    
    let url: string;
    let method: string;
    
    if (replyToId) {
      // Reply to existing thread
      url = `https://graph.microsoft.com/v1.0/users/${userEmail}/messages/${replyToId}/reply`;
      method = 'POST';
      const replyBody = {
        message: {
          toRecipients: message.toRecipients,
        },
        comment: body,
      };
      
      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(replyBody),
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Graph API error: ${error}`);
      }
      
      return new Response(
        JSON.stringify({ success: true, message: 'Reply sent', to, subject }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // Send new email
      url = `https://graph.microsoft.com/v1.0/users/${userEmail}/sendMail`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message, saveToSentItems: true }),
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Graph API error: ${error}`);
      }
      
      return new Response(
        JSON.stringify({ success: true, message: 'Email sent', to, subject }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
  } catch (error) {
    console.error('[send-hello-email] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
