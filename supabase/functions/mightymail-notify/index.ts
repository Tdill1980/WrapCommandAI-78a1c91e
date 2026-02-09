// Mightymail Notify: Send email/SMS alerts when emails are routed to team members
// Escalations → Brice + Lance | Bulk/sponsorship/affiliate → Jackson

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Team contact info
const TEAM = {
  'brice@weprintwraps.com': { name: 'Brice', phone: null },
  'lance@weprintwraps.com': { name: 'Lance', phone: null },
  'jackson@weprintwraps.com': { name: 'Jackson', phone: '+14807726003' },
};

const CATEGORY_LABELS: Record<string, string> = {
  escalation: '🚨 ESCALATION',
  bulk_order: '📦 Bulk Order',
  sponsorship: '🤝 Sponsorship',
  affiliate: '👥 Affiliate',
  file_submission: '📁 File Submission',
  quote_request: '💰 Quote Request',
};

async function sendEmail(resend: any, to: string, subject: string, html: string) {
  try {
    await resend.emails.send({
      from: 'Mightymail <notifications@weprintwraps.com>',
      to: [to],
      subject,
      html,
    });
    console.log(`Email sent to ${to}`);
    return true;
  } catch (e) {
    console.error(`Email failed to ${to}:`, e);
    return false;
  }
}

async function sendSMS(supabaseUrl: string, supabaseKey: string, to: string, message: string) {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/send-sms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ to, message }),
    });
    console.log(`SMS sent to ${to}`);
    return response.ok;
  } catch (e) {
    console.error(`SMS failed to ${to}:`, e);
    return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

    // Get recently assigned emails that haven't been notified
    const { data: emails, error: fetchError } = await supabase
      .from('mightymail_inbox')
      .select('*')
      .not('assigned_to', 'is', null)
      .eq('is_processed', true)
      .order('assigned_at', { ascending: false })
      .limit(20);

    if (fetchError) throw fetchError;
    if (!emails || emails.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No emails to notify',
        notified: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check which have already been notified
    const emailIds = emails.map(e => e.id);
    const { data: notifiedEvents } = await supabase
      .from('mightymail_analytics')
      .select('email_id')
      .eq('event_type', 'notified')
      .in('email_id', emailIds);

    const notifiedIds = new Set(notifiedEvents?.map(e => e.email_id) || []);
    const toNotify = emails.filter(e => !notifiedIds.has(e.id));

    if (toNotify.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'All emails already notified',
        notified: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Notifying for ${toNotify.length} emails`);

    let notified = 0;
    const results: any[] = [];

    for (const email of toNotify) {
      const assignees = [email.assigned_to];
      
      // Escalations go to both Brice AND Lance
      if (email.category === 'escalation' && email.assigned_to === 'brice@weprintwraps.com') {
        assignees.push('lance@weprintwraps.com');
      }

      const categoryLabel = CATEGORY_LABELS[email.category] || email.category;
      const subject = `${categoryLabel}: ${email.subject || 'New email'}`;
      
      const html = `
        <div style="font-family: sans-serif; max-width: 600px;">
          <h2 style="color: #333;">${categoryLabel}</h2>
          <p><strong>From:</strong> ${email.from_name || ''} &lt;${email.from_email}&gt;</p>
          <p><strong>Subject:</strong> ${email.subject || '(no subject)'}</p>
          <p><strong>Mailbox:</strong> ${email.mailbox}</p>
          <hr style="border: 1px solid #eee; margin: 20px 0;">
          <p style="color: #666;">${email.body_preview?.substring(0, 300) || ''}...</p>
          <hr style="border: 1px solid #eee; margin: 20px 0;">
          <p>
            <a href="https://wrapcommandai.com/mightymail/inbox" 
               style="background: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
              View in Mightymail
            </a>
          </p>
        </div>
      `;

      for (const assignee of assignees) {
        const teamMember = TEAM[assignee as keyof typeof TEAM];
        
        // Send email notification
        await sendEmail(resend, assignee, subject, html);

        // Send SMS for urgent escalations
        if (email.category === 'escalation' && email.escalation_level >= 2 && teamMember?.phone) {
          const smsMessage = `🚨 URGENT: ${email.subject?.substring(0, 50) || 'Escalation'} from ${email.from_email}. Check Mightymail.`;
          await sendSMS(supabaseUrl, supabaseKey, teamMember.phone, smsMessage);
        }

        // SMS for Jackson on his categories
        if (assignee === 'jackson@weprintwraps.com' && teamMember?.phone) {
          if (['bulk_order', 'sponsorship', 'affiliate'].includes(email.category)) {
            const smsMessage = `${categoryLabel}: ${email.subject?.substring(0, 40) || 'New inquiry'} from ${email.from_email}`;
            await sendSMS(supabaseUrl, supabaseKey, teamMember.phone, smsMessage);
          }
        }
      }

      // Log notification
      await supabase.from('mightymail_analytics').insert({
        email_id: email.id,
        event_type: 'notified',
        event_data: { assignees, category: email.category }
      });

      notified++;
      results.push({ email_id: email.id, assignees });
    }

    return new Response(JSON.stringify({
      success: true,
      notified,
      results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Notify error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
