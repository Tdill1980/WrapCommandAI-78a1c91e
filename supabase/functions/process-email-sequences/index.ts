// Process Email Sequences - CRON job to send scheduled sequence emails
// Checks enrollments, sends next email in sequence, updates metrics
// Part of MightyMail ecosystem wiring

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { emailsPaused, pausedResponse } from "../_shared/email-guard.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmailTemplate {
  subject: string;
  html: string;
  preview_text?: string;
}

serve(async (req) => {
  if (req.method !== "OPTIONS" && emailsPaused()) return pausedResponse(corsHeaders);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendKey = Deno.env.get('RESEND_API_KEY');
    
    if (!resendKey) {
      console.error('[process-email-sequences] RESEND_API_KEY not configured');
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[process-email-sequences] Starting sequence processing...');

    // Get active enrollments that might be due for email
    const { data: enrollments, error: enrollError } = await supabase
      .from('email_sequence_enrollments')
      .select(`
        id,
        contact_id,
        sequence_id,
        customer_email,
        customer_name,
        enrolled_at,
        emails_sent,
        last_email_sent_at,
        is_active,
        sequence:email_sequences(
          id,
          name,
          send_delay_days,
          emails,
          is_active
        )
      `)
      .eq('is_active', true)
      .is('unsubscribed_at', null)
      .is('completed_at', null);

    if (enrollError) {
      console.error('[process-email-sequences] Error fetching enrollments:', enrollError);
      throw enrollError;
    }

    console.log(`[process-email-sequences] Found ${enrollments?.length || 0} active enrollments`);

    let sent = 0;
    let skipped = 0;
    let completed = 0;
    const errors: string[] = [];

    for (const enrollment of enrollments || []) {
      const sequence = enrollment.sequence as any;
      
      // Skip if sequence is inactive or has no emails
      if (!sequence?.is_active) {
        skipped++;
        continue;
      }

      const emails = sequence.emails as EmailTemplate[] | null;
      if (!emails || !Array.isArray(emails) || emails.length === 0) {
        skipped++;
        continue;
      }

      // Check if next email is due
      const lastSent = enrollment.last_email_sent_at 
        ? new Date(enrollment.last_email_sent_at) 
        : new Date(enrollment.enrolled_at);
      const delayDays = sequence.send_delay_days || 1;
      const delayMs = delayDays * 24 * 60 * 60 * 1000;
      const nextSendAt = new Date(lastSent.getTime() + delayMs);

      if (new Date() < nextSendAt) {
        skipped++;
        continue;
      }

      // Get next email in sequence
      const nextEmailIndex = enrollment.emails_sent || 0;
      
      if (nextEmailIndex >= emails.length) {
        // Sequence complete
        await supabase
          .from('email_sequence_enrollments')
          .update({ 
            completed_at: new Date().toISOString(), 
            is_active: false 
          })
          .eq('id', enrollment.id);
        
        completed++;
        console.log(`[process-email-sequences] Completed sequence for ${enrollment.customer_email}`);
        continue;
      }

      const emailTemplate = emails[nextEmailIndex];
      
      if (!emailTemplate?.subject || !emailTemplate?.html) {
        console.warn(`[process-email-sequences] Invalid email template at index ${nextEmailIndex}`);
        skipped++;
        continue;
      }

      // Personalize email content
      const personalizedSubject = emailTemplate.subject
        .replace(/\{\{name\}\}/gi, enrollment.customer_name || 'there')
        .replace(/\{\{email\}\}/gi, enrollment.customer_email);
      
      const personalizedHtml = emailTemplate.html
        .replace(/\{\{name\}\}/gi, enrollment.customer_name || 'there')
        .replace(/\{\{email\}\}/gi, enrollment.customer_email);

      // Send email via Resend
      try {
        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'WePrintWraps <hello@weprintwraps.com>',
            to: [enrollment.customer_email],
            subject: personalizedSubject,
            html: personalizedHtml
          })
        });

        if (emailResponse.ok) {
          // Update enrollment
          await supabase
            .from('email_sequence_enrollments')
            .update({
              emails_sent: nextEmailIndex + 1,
              last_email_sent_at: new Date().toISOString()
            })
            .eq('id', enrollment.id);

          // Update contact metrics (if contact exists)
          if (enrollment.contact_id) {
            // Get current count and increment
            const { data: currentContact } = await supabase
              .from('contacts')
              .select('email_sends_count')
              .eq('id', enrollment.contact_id)
              .maybeSingle();
            
            const newCount = ((currentContact?.email_sends_count as number) || 0) + 1;
            
            await supabase
              .from('contacts')
              .update({
                last_email_sent_at: new Date().toISOString(),
                email_sends_count: newCount
              })
              .eq('id', enrollment.contact_id);
          }

          // Log to email_tracking
          await supabase
            .from('email_tracking')
            .insert({
              quote_id: null,
              email_type: 'sequence',
              sent_to: enrollment.customer_email,
              sent_at: new Date().toISOString(),
              subject: personalizedSubject,
              status: 'sent',
              metadata: {
                sequence_id: sequence.id,
                sequence_name: sequence.name,
                email_index: nextEmailIndex,
                enrollment_id: enrollment.id
              }
            });

          sent++;
          console.log(`[process-email-sequences] Sent email ${nextEmailIndex + 1} to ${enrollment.customer_email}`);
        } else {
          const errorText = await emailResponse.text();
          console.error(`[process-email-sequences] Failed to send to ${enrollment.customer_email}:`, errorText);
          errors.push(`${enrollment.customer_email}: ${errorText}`);
        }
      } catch (sendError) {
        console.error(`[process-email-sequences] Error sending to ${enrollment.customer_email}:`, sendError);
        errors.push(`${enrollment.customer_email}: ${sendError instanceof Error ? sendError.message : 'Unknown error'}`);
      }
    }

    const result = {
      success: true,
      processed: enrollments?.length || 0,
      sent,
      skipped,
      completed,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString()
    };

    console.log('[process-email-sequences] Complete:', result);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[process-email-sequences] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
