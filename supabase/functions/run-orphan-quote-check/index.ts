// Orphan Quote Check - Scheduled function to detect unresolved quote requests
// Runs hourly to find conversations where customer requested quote but none was created
// Creates escalations + alerts internal team

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { emailsPaused, pausedResponse } from "../_shared/email-guard.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method !== "OPTIONS" && emailsPaused()) return pausedResponse(corsHeaders);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL') || Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  console.log('[OrphanQuoteCheck] Starting orphan quote detection...');

  try {
    // Find conversations with pricing/quote intent but no quote created
    // Criteria:
    // 1. Has chat_state.quote_requested = true OR stage = 'pricing_discussed'
    // 2. No quote_created flag
    // 3. Last message > 1 hour ago
    // 4. Not already escalated for this reason

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { data: orphanConversations, error: fetchError } = await supabase
      .from('conversations')
      .select('id, chat_state, contact_id, organization_id, last_message_at, metadata')
      .eq('channel', 'website')
      .lt('last_message_at', oneHourAgo)
      .is('escalated', false)
      .or('status.eq.open,status.is.null');

    if (fetchError) {
      console.error('[OrphanQuoteCheck] Fetch error:', fetchError);
      throw fetchError;
    }

    console.log(`[OrphanQuoteCheck] Checking ${orphanConversations?.length || 0} conversations...`);

    let escalationCount = 0;
    const escalations: string[] = [];

    for (const convo of orphanConversations || []) {
      const chatState = convo.chat_state as Record<string, unknown> || {};
      
      // Check if this looks like an orphan quote request
      const hasQuoteIntent = 
        chatState.quote_requested === true ||
        chatState.stage === 'pricing_discussed' ||
        chatState.stage === 'collecting_info' ||
        (chatState.calculated_price && !chatState.quote_created);

      const hasContact = chatState.customer_email || chatState.customer_name;
      const alreadyQuoted = chatState.quote_created === true;
      const alreadyEscalated = (chatState.escalations_sent as string[] || []).includes('orphan_quote');

      if (hasQuoteIntent && hasContact && !alreadyQuoted && !alreadyEscalated) {
        console.log(`[OrphanQuoteCheck] Found orphan quote request: ${convo.id}`, {
          email: chatState.customer_email,
          name: chatState.customer_name,
          stage: chatState.stage
        });

        // Create escalation
        await supabase
          .from('conversations')
          .update({ 
            escalated: true,
            escalation_reason: `Orphan Quote: Customer ${chatState.customer_name || chatState.customer_email} requested pricing but no quote was sent`,
            chat_state: {
              ...chatState,
              escalations_sent: [...(chatState.escalations_sent as string[] || []), 'orphan_quote'],
              orphan_quote_detected_at: new Date().toISOString()
            }
          })
          .eq('id', convo.id);

        // Create ai_action for alerting
        await supabase.from('ai_actions').insert({
          action_type: 'send_sms_alert',
          status: 'pending',
          organization_id: convo.organization_id,
          conversation_id: convo.id,
          action_payload: {
            phone: Deno.env.get('JACKSON_PHONE_NUMBER') || '+14807726003',
            message: `🚨 Orphan Quote: ${chatState.customer_name || chatState.customer_email} requested pricing but quote wasn't sent. Check Escalation Desk.`,
            reason: 'orphan_quote_detected'
          }
        });

        // Log event
        await supabase.from('conversation_events').insert({
          conversation_id: convo.id,
          event_type: 'escalation_sent',
          actor: 'system',
          payload: {
            escalation_type: 'orphan_quote',
            reason: 'Customer requested quote but none was created/sent',
            customer_email: chatState.customer_email,
            customer_name: chatState.customer_name,
            detected_at: new Date().toISOString()
          }
        });

        escalationCount++;
        escalations.push(convo.id);
      }
    }

    console.log(`[OrphanQuoteCheck] Complete. Created ${escalationCount} escalations.`);

    return new Response(JSON.stringify({
      success: true,
      checked: orphanConversations?.length || 0,
      escalations_created: escalationCount,
      escalated_conversation_ids: escalations
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[OrphanQuoteCheck] Error:', errorMessage);
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
