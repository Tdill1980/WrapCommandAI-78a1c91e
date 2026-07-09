import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { emailsPaused, pausedResponse } from "../_shared/email-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Quote {
  id: string;
  quote_number: string;
  customer_name: string;
  customer_email: string;
  vehicle_year: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  total_price: number;
  status: string;
  follow_up_count: number;
  created_at: string;
}

interface RetargetingLog {
  email_type: string;
}

// Email templates
function getEmailTemplate(type: string, quote: Quote): { subject: string; html: string } {
  const vehicleText = quote.vehicle_year && quote.vehicle_make && quote.vehicle_model 
    ? `${quote.vehicle_year} ${quote.vehicle_make} ${quote.vehicle_model}` 
    : 'your vehicle';
  const price = quote.total_price?.toFixed(2) || '0.00';

  const templates: Record<string, { subject: string; html: string }> = {
    reminder_1hr: {
      subject: `Still thinking about wrapping ${vehicleText}?`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #0A0A0A; font-family: Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0A0A0A; padding: 40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color: #1A1A1A; border-radius: 12px; overflow: hidden;">
        <tr><td style="background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%); padding: 30px; text-align: center;">
          <h1 style="color: #000; margin: 0; font-size: 24px;">Don't Leave Your Quote Behind!</h1>
        </td></tr>
        <tr><td style="padding: 40px 30px;">
          <p style="color: #FFFFFF; font-size: 16px; line-height: 1.6;">
            Hey! We noticed you started a quote for <strong style="color: #00AFFF;">${vehicleText}</strong> but didn't finish.
          </p>
          <p style="color: #FFFFFF; font-size: 16px; line-height: 1.6;">
            Your estimated price of <strong style="color: #4EEAFF;">$${price}</strong> is waiting for you. Complete your quote now and let's get you wrapped!
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 30px;">
            <tr><td align="center">
              <a href="https://weprintwraps.com/quote" style="display: inline-block; background: linear-gradient(135deg, #00AFFF 0%, #4EEAFF 100%); color: #000; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-weight: bold;">
                Complete My Quote
              </a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="background-color: #0F0F0F; padding: 20px; text-align: center;">
          <p style="color: #666; font-size: 12px; margin: 0;">© 2025 WePrintWraps</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    },
    followup_4hr: {
      subject: `Your ${vehicleText} wrap quote expires soon`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #0A0A0A; font-family: Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0A0A0A; padding: 40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color: #1A1A1A; border-radius: 12px; overflow: hidden;">
        <tr><td style="background: linear-gradient(135deg, #00AFFF 0%, #4EEAFF 100%); padding: 30px; text-align: center;">
          <h1 style="color: #000; margin: 0; font-size: 24px;">Your Quote is Ready!</h1>
        </td></tr>
        <tr><td style="padding: 40px 30px;">
          <p style="color: #FFFFFF; font-size: 16px; line-height: 1.6;">
            Your quote for <strong style="color: #00AFFF;">${vehicleText}</strong> is ready and waiting.
          </p>
          <table width="100%" style="background-color: #252525; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <tr>
              <td style="color: #888; font-size: 14px;">Quote Number</td>
              <td style="color: #00AFFF; font-size: 16px; font-weight: bold; text-align: right;">${quote.quote_number}</td>
            </tr>
            <tr>
              <td style="color: #888; font-size: 14px; padding-top: 10px;">Total</td>
              <td style="color: #4EEAFF; font-size: 20px; font-weight: bold; text-align: right; padding-top: 10px;">$${price}</td>
            </tr>
          </table>
          <p style="color: #FFFFFF; font-size: 16px; line-height: 1.6;">
            Have questions? Reply to this email or call us at <strong style="color: #00AFFF;">(555) 123-4567</strong>.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 30px;">
            <tr><td align="center">
              <a href="https://weprintwraps.com" style="display: inline-block; background: linear-gradient(135deg, #00AFFF 0%, #4EEAFF 100%); color: #000; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-weight: bold;">
                Let's Do This
              </a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="background-color: #0F0F0F; padding: 20px; text-align: center;">
          <p style="color: #666; font-size: 12px; margin: 0;">© 2025 WePrintWraps</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    },
    upsell_24hr: {
      subject: `Transform ${vehicleText} into a mobile billboard`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #0A0A0A; font-family: Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0A0A0A; padding: 40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color: #1A1A1A; border-radius: 12px; overflow: hidden;">
        <tr><td style="background: linear-gradient(135deg, #FF1493 0%, #FF69B4 100%); padding: 30px; text-align: center;">
          <h1 style="color: #FFF; margin: 0; font-size: 24px;">Own a Business?</h1>
        </td></tr>
        <tr><td style="padding: 40px 30px;">
          <p style="color: #FFFFFF; font-size: 16px; line-height: 1.6;">
            Your quote for <strong style="color: #00AFFF;">${vehicleText}</strong> got us thinking...
          </p>
          <p style="color: #FFFFFF; font-size: 16px; line-height: 1.6;">
            Did you know vehicle wraps are the most cost-effective form of advertising? Turn your ride into a 24/7 mobile billboard.
          </p>
          <h3 style="color: #4EEAFF; margin: 30px 0 15px;">Check out CommercialPro:</h3>
          <ul style="color: #FFFFFF; font-size: 14px; line-height: 1.8; padding-left: 20px;">
            <li>Professional design services</li>
            <li>Fleet pricing available</li>
            <li>ApprovePro 3D previews</li>
            <li>Nationwide installation network</li>
          </ul>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 30px;">
            <tr><td align="center">
              <a href="https://commercialpro.weprintwraps.com" style="display: inline-block; background: linear-gradient(135deg, #FF1493 0%, #FF69B4 100%); color: #FFF; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-weight: bold;">
                Explore CommercialPro
              </a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="background-color: #0F0F0F; padding: 20px; text-align: center;">
          <p style="color: #666; font-size: 12px; margin: 0;">© 2025 WePrintWraps</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    },
  };

  return templates[type] || templates.followup_4hr;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method !== "OPTIONS" && emailsPaused()) return pausedResponse(corsHeaders);
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting quote follow-up processing...");

    // Initialize clients
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

    // Fetch quotes eligible for follow-up
    const { data: quotes, error: quotesError } = await supabase
      .from('quotes')
      .select('*')
      .eq('auto_retarget', true)
      .eq('converted_to_order', false)
      .in('status', ['submitted', 'pending', 'sent', 'started'])
      .lt('follow_up_count', 3);

    if (quotesError) {
      console.error("Error fetching quotes:", quotesError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to fetch quotes" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Found ${quotes?.length || 0} quotes eligible for follow-up`);

    const results: { quote_id: string; email_type: string; status: string }[] = [];
    const now = new Date();

    for (const quote of quotes || []) {
      // Get existing retargeting logs for this quote
      const { data: logs } = await supabase
        .from('quote_retargeting_log')
        .select('email_type')
        .eq('quote_id', quote.id);

      const sentTypes = new Set((logs || []).map((l: RetargetingLog) => l.email_type));
      const quoteAge = now.getTime() - new Date(quote.created_at).getTime();
      const hoursOld = quoteAge / (1000 * 60 * 60);

      let emailToSend: string | null = null;

      // Determine which email to send based on timing
      if (hoursOld >= 24 && !sentTypes.has('upsell_24hr')) {
        emailToSend = 'upsell_24hr';
      } else if (hoursOld >= 4 && !sentTypes.has('followup_4hr')) {
        emailToSend = 'followup_4hr';
      } else if (hoursOld >= 1 && quote.status === 'started' && !sentTypes.has('reminder_1hr')) {
        emailToSend = 'reminder_1hr';
      }

      if (emailToSend && quote.customer_email) {
        console.log(`Sending ${emailToSend} to ${quote.customer_email} for quote ${quote.quote_number}`);

        try {
          const template = getEmailTemplate(emailToSend, quote);
          const emailResult = await resend.emails.send({
            from: "WePrintWraps <hello@weprintwraps.com>",
            to: [quote.customer_email],
            subject: template.subject,
            html: template.html,
          });

          // Log the send
          await supabase.from('quote_retargeting_log').insert({
            quote_id: quote.id,
            email_type: emailToSend,
            resend_id: emailResult.data?.id || null,
            status: 'sent',
          });

          // Update quote
          await supabase.from('quotes').update({
            follow_up_count: (quote.follow_up_count || 0) + 1,
            last_follow_up_sent: now.toISOString(),
            updated_at: now.toISOString(),
          }).eq('id', quote.id);

          results.push({ quote_id: quote.id, email_type: emailToSend, status: 'sent' });
          console.log(`Successfully sent ${emailToSend} for quote ${quote.quote_number}`);

        } catch (emailError) {
          console.error(`Failed to send ${emailToSend} for quote ${quote.quote_number}:`, emailError);
          results.push({ quote_id: quote.id, email_type: emailToSend, status: 'failed' });
        }
      }
    }

    console.log(`Processed ${results.length} follow-up emails`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        results,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: unknown) {
    console.error("Error in run-quote-followups:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
