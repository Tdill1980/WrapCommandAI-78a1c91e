// Twilio SMS Webhook - Routes incoming SMS to correct OpenClaw agents
// Maps phone numbers to agents: Wren, Echo, Blaze

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Agent phone number mapping
const AGENT_NUMBERS = {
  '+14159807629': 'main',        // Wren 🐦
  '+14152379064': 'social-agent', // Echo 💬
  '+14157798407': 'marketing-agent' // Blaze 🔥
};

const AGENT_NAMES = {
  'main': 'Wren',
  'social-agent': 'Echo', 
  'marketing-agent': 'Blaze'
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log(`[TwilioSMS] Webhook received: ${req.method}`);
    
    // Parse Twilio webhook data (form-encoded)
    const formData = await req.formData();
    const twilioData: { [key: string]: string } = {};
    
    for (const [key, value] of formData.entries()) {
      twilioData[key] = value.toString();
    }

    const {
      From: fromNumber,
      To: toNumber,
      Body: messageBody,
      MessageSid: messageSid
    } = twilioData;

    console.log(`[TwilioSMS] From: ${fromNumber}, To: ${toNumber}, Body: "${messageBody}"`);

    // Determine which agent this message is for
    const agentId = AGENT_NUMBERS[toNumber as keyof typeof AGENT_NUMBERS];
    const agentName = AGENT_NAMES[agentId as keyof typeof AGENT_NAMES];

    if (!agentId) {
      console.error(`[TwilioSMS] Unknown phone number: ${toNumber}`);
      return new Response(
        '<Response><Message>Unknown agent number</Message></Response>',
        { 
          headers: { 'Content-Type': 'text/xml' },
          status: 400 
        }
      );
    }

    console.log(`[TwilioSMS] Routing message to agent: ${agentName} (${agentId})`);

    // TODO: Forward message to OpenClaw agent
    // This would integrate with OpenClaw's messaging system
    // For now, we'll just log it and send a response

    // Log the message for debugging
    console.log(`[TwilioSMS] Message for ${agentName}: "${messageBody}"`);

    // Send auto-response for testing
    const responseMessage = `Hi! This is ${agentName} ${agentId === 'main' ? '🐦' : agentId === 'social-agent' ? '💬' : '🔥'}. I received your message: "${messageBody}". SMS routing is working! (This is a test response - full integration coming soon)`;

    // Return TwiML response to send SMS back
    const twiml = `
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${responseMessage}</Message>
</Response>`;

    return new Response(twiml, {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'text/xml' 
      }
    });

  } catch (error) {
    console.error('[TwilioSMS] Error:', error);
    
    const errorTwiml = `
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Error processing message</Message>
</Response>`;

    return new Response(errorTwiml, {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'text/xml' 
      },
      status: 500
    });
  }
});