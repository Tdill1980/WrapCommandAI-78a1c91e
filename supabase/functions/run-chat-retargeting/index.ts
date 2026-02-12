import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WPW_ORG_ID = '51aa96db-c06d-41ae-b3cb-25b045c75caf';

// Day 3, Day 7, Final (Day 14) with 5% off
const RETARGET_STAGES = [
  { key: 'chat_day3', daysAfter: 3, label: 'Day 3' },
  { key: 'chat_day7', daysAfter: 7, label: 'Day 7' },
  { key: 'chat_final', daysAfter: 14, label: 'Final Offer' },
] as const;

interface ChatLead {
  id: string;
  created_at: string;
  chat_state: {
    customer_name?: string;
    customer_email?: string;
    customer_phone?: string;
    product_name?: string;
    product_key?: string;
    vehicle_year?: string;
    vehicle_make?: string;
    vehicle_model?: string;
    sqft?: number;
    finish_type?: string;
  };
}

// ============================================
// EMAIL TEMPLATES
// ============================================

function getDay3Email(lead: ChatLead): { subject: string; html: string } {
  const name = lead.chat_state.customer_name?.split(' ')[0] || 'there';
  const vehicle = lead.chat_state.vehicle_year && lead.chat_state.vehicle_make
    ? `${lead.chat_state.vehicle_year} ${lead.chat_state.vehicle_make} ${lead.chat_state.vehicle_model || ''}`.trim()
    : null;
  const product = lead.chat_state.product_name || 'custom vehicle wrap';

  return {
    subject: vehicle
      ? `Still thinking about wrapping your ${vehicle}?`
      : `Hey ${name} — still thinking about that wrap?`,
    html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0A0A0A;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0A0A0A;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#1A1A1A;border-radius:12px;overflow:hidden;">
  <tr><td style="background:linear-gradient(135deg,#e6007e 0%,#7c3aed 100%);padding:30px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:24px;">Hey ${name}!</h1>
    <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:15px;">We loved chatting with you</p>
  </td></tr>
  <tr><td style="padding:40px 30px;">
    <p style="color:#FFFFFF;font-size:16px;line-height:1.6;">
      A few days ago you stopped by and we chatted about ${vehicle ? `wrapping your <strong style="color:#00AFFF;">${vehicle}</strong>` : `a <strong style="color:#00AFFF;">${product}</strong>`}. Just wanted to check in — we're here if you have any questions!
    </p>
    <p style="color:#FFFFFF;font-size:16px;line-height:1.6;">
      Whether you need help with sizing, material options, or file prep — our team is ready to help you get started.
    </p>
    <h3 style="color:#4EEAFF;margin:25px 0 12px;font-size:16px;">Why WePrintWraps?</h3>
    <ul style="color:#ccc;font-size:14px;line-height:1.8;padding-left:20px;">
      <li><strong style="color:#fff;">Premium Materials</strong> — Avery, 3M, Oracal</li>
      <li><strong style="color:#fff;">Free File Review</strong> — We check your artwork before printing</li>
      <li><strong style="color:#fff;">Fast Turnaround</strong> — Most orders ship in 3-5 business days</li>
      <li><strong style="color:#fff;">Real Humans</strong> — Chat, call, or email us anytime</li>
    </ul>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:30px;">
      <tr><td align="center">
        <a href="https://weprintwraps.com/our-products/" style="display:inline-block;background:linear-gradient(135deg,#00AFFF 0%,#4EEAFF 100%);color:#000;text-decoration:none;padding:14px 40px;border-radius:8px;font-weight:bold;font-size:16px;">
          Browse Products
        </a>
      </td></tr>
    </table>
    <p style="color:#888;font-size:13px;margin-top:25px;text-align:center;">
      Or just reply to this email — Jordan from our team will get back to you personally.
    </p>
  </td></tr>
  <tr><td style="background-color:#0F0F0F;padding:20px;text-align:center;">
    <p style="color:#666;font-size:12px;margin:0;">© ${new Date().getFullYear()} WePrintWraps — <a href="https://weprintwraps.com" style="color:#666;text-decoration:underline;">weprintwraps.com</a></p>
    <p style="color:#555;font-size:11px;margin:8px 0 0;"><a href="https://weprintwraps.com/unsubscribe" style="color:#555;text-decoration:underline;">Unsubscribe</a></p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`,
  };
}

function getDay7Email(lead: ChatLead): { subject: string; html: string } {
  const name = lead.chat_state.customer_name?.split(' ')[0] || 'there';
  const vehicle = lead.chat_state.vehicle_year && lead.chat_state.vehicle_make
    ? `${lead.chat_state.vehicle_year} ${lead.chat_state.vehicle_make} ${lead.chat_state.vehicle_model || ''}`.trim()
    : null;

  return {
    subject: `${name}, your wrap project is waiting`,
    html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0A0A0A;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0A0A0A;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#1A1A1A;border-radius:12px;overflow:hidden;">
  <tr><td style="background:linear-gradient(135deg,#FFD700 0%,#FFA500 100%);padding:30px;text-align:center;">
    <h1 style="color:#000;margin:0;font-size:24px;">Don't Let Your Project Stall</h1>
    <p style="color:rgba(0,0,0,0.7);margin:8px 0 0;font-size:15px;">We're still here to help, ${name}</p>
  </td></tr>
  <tr><td style="padding:40px 30px;">
    <p style="color:#FFFFFF;font-size:16px;line-height:1.6;">
      It's been about a week since we chatted${vehicle ? ` about your <strong style="color:#00AFFF;">${vehicle}</strong>` : ''}. We know life gets busy — so we wanted to make sure you have everything you need.
    </p>

    <table width="100%" style="background-color:#252525;border-radius:8px;margin:20px 0;">
      <tr><td style="padding:20px;">
        <h3 style="color:#FFD700;margin:0 0 15px;font-size:16px;">Common Questions We Get:</h3>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:8px 0;color:#fff;font-size:14px;">📐 What size do I need?</td>
            <td style="padding:8px 0;color:#4EEAFF;font-size:14px;text-align:right;">We calculate it for you</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#fff;font-size:14px;border-top:1px solid #333;">🎨 Can you check my file?</td>
            <td style="padding:8px 0;color:#4EEAFF;font-size:14px;text-align:right;border-top:1px solid #333;">Free file review included</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#fff;font-size:14px;border-top:1px solid #333;">🚚 How fast does it ship?</td>
            <td style="padding:8px 0;color:#4EEAFF;font-size:14px;text-align:right;border-top:1px solid #333;">3-5 business days</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#fff;font-size:14px;border-top:1px solid #333;">🔧 Need design help?</td>
            <td style="padding:8px 0;color:#4EEAFF;font-size:14px;text-align:right;border-top:1px solid #333;">Our team can assist</td>
          </tr>
        </table>
      </td></tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:25px;">
      <tr>
        <td align="center" style="padding:5px;">
          <a href="https://weprintwraps.com/our-products/" style="display:inline-block;background:linear-gradient(135deg,#FFD700 0%,#FFA500 100%);color:#000;text-decoration:none;padding:14px 35px;border-radius:8px;font-weight:bold;font-size:15px;">
            Start Your Order
          </a>
        </td>
        <td align="center" style="padding:5px;">
          <a href="https://weprintwraps.com" style="display:inline-block;border:2px solid #FFD700;color:#FFD700;text-decoration:none;padding:12px 35px;border-radius:8px;font-weight:bold;font-size:15px;">
            Chat With Us
          </a>
        </td>
      </tr>
    </table>
  </td></tr>
  <tr><td style="background-color:#0F0F0F;padding:20px;text-align:center;">
    <p style="color:#666;font-size:12px;margin:0;">© ${new Date().getFullYear()} WePrintWraps — <a href="https://weprintwraps.com" style="color:#666;text-decoration:underline;">weprintwraps.com</a></p>
    <p style="color:#555;font-size:11px;margin:8px 0 0;"><a href="https://weprintwraps.com/unsubscribe" style="color:#555;text-decoration:underline;">Unsubscribe</a></p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`,
  };
}

function getFinalEmail(lead: ChatLead): { subject: string; html: string } {
  const name = lead.chat_state.customer_name?.split(' ')[0] || 'there';
  const vehicle = lead.chat_state.vehicle_year && lead.chat_state.vehicle_make
    ? `${lead.chat_state.vehicle_year} ${lead.chat_state.vehicle_make} ${lead.chat_state.vehicle_model || ''}`.trim()
    : null;

  return {
    subject: `Last chance, ${name} — 5% off your first wrap order`,
    html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0A0A0A;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0A0A0A;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#1A1A1A;border-radius:12px;overflow:hidden;">
  <tr><td style="background:linear-gradient(135deg,#FF1493 0%,#FF4500 100%);padding:35px;text-align:center;">
    <p style="color:rgba(255,255,255,0.9);margin:0 0 5px;font-size:14px;letter-spacing:2px;text-transform:uppercase;">Exclusive Offer</p>
    <h1 style="color:#fff;margin:0;font-size:42px;font-weight:900;">5% OFF</h1>
    <p style="color:rgba(255,255,255,0.9);margin:8px 0 0;font-size:16px;">Your first order — just for you, ${name}</p>
  </td></tr>
  <tr><td style="padding:40px 30px;">
    <p style="color:#FFFFFF;font-size:16px;line-height:1.6;">
      We've been holding a spot for you${vehicle ? ` since you asked about wrapping your <strong style="color:#00AFFF;">${vehicle}</strong>` : ''}. This is your last nudge — and we're sweetening the deal.
    </p>

    <table width="100%" style="background:linear-gradient(135deg,#1a0a2e 0%,#2d1b4e 100%);border-radius:12px;margin:25px 0;border:1px solid #FF1493;">
      <tr><td style="padding:25px;text-align:center;">
        <p style="color:#FF69B4;font-size:13px;margin:0 0 8px;letter-spacing:2px;text-transform:uppercase;">Your Discount Code</p>
        <h2 style="color:#fff;margin:0;font-size:32px;font-weight:900;letter-spacing:4px;font-family:monospace;">WRAP5</h2>
        <p style="color:#ccc;font-size:14px;margin:10px 0 0;">5% off any product — enter at checkout</p>
        <p style="color:#FF69B4;font-size:12px;margin:8px 0 0;">Expires in 7 days</p>
      </td></tr>
    </table>

    <h3 style="color:#4EEAFF;margin:25px 0 12px;font-size:15px;">Most Popular With Chat Customers:</h3>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:10px;background:#252525;border-radius:8px 8px 0 0;">
          <a href="https://weprintwraps.com/our-products/avery-1105egrs-with-doz13607-lamination/" style="color:#00AFFF;text-decoration:none;font-size:14px;font-weight:bold;">Avery MPI 1105 Printed Wrap →</a>
          <p style="color:#888;font-size:12px;margin:4px 0 0;">Our #1 seller — gloss or matte lamination included</p>
        </td>
      </tr>
      <tr>
        <td style="padding:10px;background:#202020;">
          <a href="https://weprintwraps.com/our-products/perforated-window-vinyl-5050-unlaminated/" style="color:#00AFFF;text-decoration:none;font-size:14px;font-weight:bold;">Window Perf 50/50 →</a>
          <p style="color:#888;font-size:12px;margin:4px 0 0;">See-through vinyl for rear windows</p>
        </td>
      </tr>
      <tr>
        <td style="padding:10px;background:#252525;border-radius:0 0 8px 8px;">
          <a href="https://weprintwraps.com/our-products/cut-contour-decals-stickers/" style="color:#00AFFF;text-decoration:none;font-size:14px;font-weight:bold;">Cut Contour Decals →</a>
          <p style="color:#888;font-size:12px;margin:4px 0 0;">Custom die-cut stickers and decals</p>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:30px;">
      <tr><td align="center">
        <a href="https://weprintwraps.com/our-products/" style="display:inline-block;background:linear-gradient(135deg,#FF1493 0%,#FF4500 100%);color:#fff;text-decoration:none;padding:16px 50px;border-radius:8px;font-weight:bold;font-size:18px;">
          Use Code WRAP5 — Shop Now
        </a>
      </td></tr>
    </table>

    <p style="color:#888;font-size:13px;margin-top:20px;text-align:center;">
      This is the last email we'll send about this. No spam, ever.
    </p>
  </td></tr>
  <tr><td style="background-color:#0F0F0F;padding:20px;text-align:center;">
    <p style="color:#666;font-size:12px;margin:0;">© ${new Date().getFullYear()} WePrintWraps — <a href="https://weprintwraps.com" style="color:#666;text-decoration:underline;">weprintwraps.com</a></p>
    <p style="color:#555;font-size:11px;margin:8px 0 0;"><a href="https://weprintwraps.com/unsubscribe" style="color:#555;text-decoration:underline;">Unsubscribe</a></p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`,
  };
}

function getTemplate(stage: string, lead: ChatLead): { subject: string; html: string } {
  switch (stage) {
    case 'chat_day3': return getDay3Email(lead);
    case 'chat_day7': return getDay7Email(lead);
    case 'chat_final': return getFinalEmail(lead);
    default: return getDay3Email(lead);
  }
}

// ============================================
// MAIN HANDLER
// ============================================

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting chat lead retargeting...");

    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL') || Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Email service not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    const resend = new Resend(resendApiKey);

    // Fetch all website chat conversations with email, at least 3 days old, not converted
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

    const { data: conversations, error: convError } = await supabase
      .from('conversations')
      .select('id, created_at, chat_state')
      .eq('channel', 'website')
      .eq('organization_id', WPW_ORG_ID)
      .lte('created_at', threeDaysAgo)
      .in('status', ['active', 'closed', 'idle']);

    if (convError) {
      console.error("Error fetching conversations:", convError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to fetch conversations" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Filter to only leads with valid email
    const leads: ChatLead[] = (conversations || []).filter((c: ChatLead) =>
      c.chat_state?.customer_email &&
      !c.chat_state.customer_email.includes('@capture.local') &&
      c.chat_state.customer_email.includes('@')
    );

    console.log(`Found ${leads.length} chat leads eligible for retargeting (from ${conversations?.length || 0} total)`);

    // Get all existing retargeting logs in one query
    const leadIds = leads.map(l => l.id);
    const { data: existingLogs } = await supabase
      .from('email_tracking')
      .select('sent_to, subject, metadata')
      .in('metadata->>conversation_id', leadIds)
      .like('email_type', 'chat_%');

    // Build a set of already-sent stages per conversation
    const sentMap = new Map<string, Set<string>>();
    for (const log of existingLogs || []) {
      const convId = log.metadata?.conversation_id;
      const stage = log.metadata?.retarget_stage;
      if (convId && stage) {
        if (!sentMap.has(convId)) sentMap.set(convId, new Set());
        sentMap.get(convId)!.add(stage);
      }
    }

    // Also check if any of these leads have converted (have a quote with converted_to_order = true)
    const { data: convertedQuotes } = await supabase
      .from('quotes')
      .select('customer_email, converted_to_order')
      .eq('converted_to_order', true);

    const convertedEmails = new Set(
      (convertedQuotes || []).map((q: { customer_email: string }) => q.customer_email?.toLowerCase())
    );

    // Check command_contacts for unsubscribed
    const leadEmails = leads.map(l => l.chat_state.customer_email!);
    const { data: unsubscribed } = await supabase
      .from('command_contacts')
      .select('email')
      .in('email', leadEmails)
      .eq('email_unsubscribed', true);

    const unsubscribedEmails = new Set(
      (unsubscribed || []).map((c: { email: string }) => c.email?.toLowerCase())
    );

    const now = new Date();
    const results: { conversation_id: string; email: string; stage: string; status: string }[] = [];

    for (const lead of leads) {
      const email = lead.chat_state.customer_email!.toLowerCase();

      // Skip converted or unsubscribed
      if (convertedEmails.has(email) || unsubscribedEmails.has(email)) {
        continue;
      }

      const sent = sentMap.get(lead.id) || new Set();
      const ageMs = now.getTime() - new Date(lead.created_at).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);

      // Determine which email to send (send the LATEST eligible one not yet sent)
      let stageToSend: typeof RETARGET_STAGES[number] | null = null;

      for (const stage of RETARGET_STAGES) {
        if (ageDays >= stage.daysAfter && !sent.has(stage.key)) {
          stageToSend = stage;
          // Don't break — keep going to find the latest eligible stage
        }
      }

      if (!stageToSend) continue;

      console.log(`Sending ${stageToSend.key} to ${email} (conversation ${lead.id}, age: ${ageDays.toFixed(1)} days)`);

      try {
        const template = getTemplate(stageToSend.key, lead);

        const emailResult = await resend.emails.send({
          from: "WePrintWraps <hello@weprintwraps.com>",
          to: [lead.chat_state.customer_email!],
          subject: template.subject,
          html: template.html,
        });

        // Log to email_tracking
        await supabase.from('email_tracking').insert({
          quote_id: null,
          email_type: stageToSend.key,
          sent_to: lead.chat_state.customer_email,
          sent_at: now.toISOString(),
          subject: template.subject,
          status: 'sent',
          metadata: {
            conversation_id: lead.id,
            retarget_stage: stageToSend.key,
            resend_id: emailResult.data?.id || null,
            customer_name: lead.chat_state.customer_name || null,
            vehicle: lead.chat_state.vehicle_year
              ? `${lead.chat_state.vehicle_year} ${lead.chat_state.vehicle_make} ${lead.chat_state.vehicle_model}`
              : null,
            days_since_chat: Math.floor(ageDays),
          },
        });

        // Update command_contacts email count
        await supabase
          .from('command_contacts')
          .update({
            email_sends_count: supabase.rpc ? undefined : 1, // Will be incremented below
            last_email_sent_at: now.toISOString(),
          })
          .eq('email', lead.chat_state.customer_email);

        results.push({
          conversation_id: lead.id,
          email: lead.chat_state.customer_email!,
          stage: stageToSend.key,
          status: 'sent',
        });

        console.log(`Sent ${stageToSend.key} to ${lead.chat_state.customer_email}`);

      } catch (emailError) {
        console.error(`Failed to send ${stageToSend.key} to ${email}:`, emailError);
        results.push({
          conversation_id: lead.id,
          email: lead.chat_state.customer_email!,
          stage: stageToSend.key,
          status: 'failed',
        });
      }
    }

    const summary = {
      total_leads: leads.length,
      skipped_converted: [...convertedEmails].length,
      skipped_unsubscribed: [...unsubscribedEmails].length,
      emails_sent: results.filter(r => r.status === 'sent').length,
      emails_failed: results.filter(r => r.status === 'failed').length,
      by_stage: {
        chat_day3: results.filter(r => r.stage === 'chat_day3' && r.status === 'sent').length,
        chat_day7: results.filter(r => r.stage === 'chat_day7' && r.status === 'sent').length,
        chat_final: results.filter(r => r.stage === 'chat_final' && r.status === 'sent').length,
      },
    };

    console.log("Chat retargeting complete:", JSON.stringify(summary));

    return new Response(
      JSON.stringify({ success: true, summary, results }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: unknown) {
    console.error("Error in run-chat-retargeting:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
