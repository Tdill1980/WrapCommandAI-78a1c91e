// Purchase Twilio phone numbers for OpenClaw agents
// Creates 3 new phone numbers for Wren, Echo, and Marketing agents

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PhoneNumber {
  phoneNumber: string;
  sid: string;
  friendlyName: string;
  accountSid: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Allow GET requests for easy testing
    const body = req.method === 'GET' ? {} : await req.json();
    const { count = 3, areaCode = '415' } = body;

    // Get Twilio credentials from environment
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');

    if (!twilioAccountSid || !twilioAuthToken) {
      return new Response(JSON.stringify({
        error: 'Missing Twilio credentials',
        missing: {
          TWILIO_ACCOUNT_SID: !twilioAccountSid,
          TWILIO_AUTH_TOKEN: !twilioAuthToken,
        }
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const auth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
    const purchasedNumbers: PhoneNumber[] = [];

    console.log(`[PurchaseTwilio] Attempting to purchase ${count} numbers...`);

    // First, search for available numbers
    const searchUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/AvailablePhoneNumbers/US/Local.json?AreaCode=${areaCode}&Limit=10`;
    
    const searchResponse = await fetch(searchUrl, {
      headers: {
        'Authorization': `Basic ${auth}`,
      },
    });

    if (!searchResponse.ok) {
      const error = await searchResponse.json();
      throw new Error(`Failed to search numbers: ${error.message || error.error_message}`);
    }

    const searchResult = await searchResponse.json();
    const availableNumbers = searchResult.available_phone_numbers || [];

    if (availableNumbers.length === 0) {
      return new Response(JSON.stringify({
        error: `No available phone numbers found in area code ${areaCode}`,
        suggestion: 'Try different area codes like 213, 310, 415, or 619'
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[PurchaseTwilio] Found ${availableNumbers.length} available numbers`);

    // Purchase the requested number of phone numbers
    const agents = ['Wren', 'Echo', 'Marketing'];
    
    for (let i = 0; i < Math.min(count, availableNumbers.length, agents.length); i++) {
      const number = availableNumbers[i];
      const agentName = agents[i];

      // Purchase the number
      const purchaseUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers.json`;
      
      const formData = new URLSearchParams();
      formData.append('PhoneNumber', number.phone_number);
      formData.append('FriendlyName', `${agentName} Agent - OpenClaw`);
      
      const purchaseResponse = await fetch(purchaseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      if (purchaseResponse.ok) {
        const purchaseResult = await purchaseResponse.json();
        purchasedNumbers.push({
          phoneNumber: purchaseResult.phone_number,
          sid: purchaseResult.sid,
          friendlyName: purchaseResult.friendly_name,
          accountSid: purchaseResult.account_sid
        });
        console.log(`[PurchaseTwilio] ✅ Purchased ${purchaseResult.phone_number} for ${agentName}`);
      } else {
        const error = await purchaseResponse.json();
        console.error(`[PurchaseTwilio] ❌ Failed to purchase ${number.phone_number}: ${error.message}`);
      }

      // Small delay between purchases
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return new Response(JSON.stringify({
      success: true,
      purchased: purchasedNumbers.length,
      numbers: purchasedNumbers,
      next_steps: [
        "Set up WhatsApp Business for each number",
        "Configure OpenClaw agents to use their respective numbers",
        "Test messaging to each agent"
      ]
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[PurchaseTwilio] Error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});