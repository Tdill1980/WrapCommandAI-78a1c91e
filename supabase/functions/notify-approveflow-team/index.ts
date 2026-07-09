// supabase/functions/notify-approveflow-team/index.ts
// ============================================
// ApproveFlow Team Notification - Alert Design Team
// ============================================
// Sends branded email notifications to the design team when
// customers approve proofs or request revisions.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { emailsPaused, pausedResponse } from "../_shared/email-guard.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface NotificationRequest {
  projectId: string;
  notificationType: 'approved' | 'revision_requested';
  customerName: string;
  orderNumber: string;
  notes?: string;
}

serve(async (req) => {
  if (req.method !== "OPTIONS" && emailsPaused()) return pausedResponse(corsHeaders);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectId, notificationType, customerName, orderNumber, notes }: NotificationRequest = await req.json();

    console.log(`[notify-approveflow-team] Sending ${notificationType} notification for order ${orderNumber}`);

    if (!projectId || !notificationType || !orderNumber) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get project and organization data
    const { data: project, error: projectErr } = await supabase
      .from("approveflow_projects")
      .select("*, organizations:organization_id(name, subdomain, notification_email)")
      .eq("id", projectId)
      .single();

    if (projectErr || !project) {
      console.error(`[notify-approveflow-team] Project not found:`, projectErr?.message);
      return new Response(
        JSON.stringify({ success: false, error: "Project not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get notification email (organization-level or fallback)
    const notificationEmail = project.organizations?.notification_email || 'design@weprintwraps.com';
    const orgName = project.organizations?.name || 'WePrintWraps';
    const timestamp = new Date().toLocaleString('en-US', { 
      timeZone: 'America/New_York',
      dateStyle: 'long',
      timeStyle: 'short'
    });

    // Build email content based on notification type
    const isApproval = notificationType === 'approved';
    
    const subject = isApproval 
      ? `✅ [APPROVED] Order #${orderNumber} - Customer approved the design!`
      : `⚠️ [REVISIONS NEEDED] Order #${orderNumber} - Customer requested changes`;

    const bannerColor = isApproval ? '#16a34a' : '#ea580c';
    const bannerIcon = isApproval ? '✓' : '⚠';
    const bannerText = isApproval ? 'DESIGN APPROVED' : 'REVISIONS REQUESTED';
    const messageText = isApproval 
      ? 'Great news! The customer has approved the design and it\'s ready for production.'
      : 'The customer has requested changes to the design. Please review their notes and prepare a revision.';

    const baseUrl = Deno.env.get("SUPABASE_URL")?.replace('.supabase.co', '') || 'https://app.wrapcommand.ai';
    const projectUrl = `${baseUrl}/approveflow/${projectId}`;

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <tr>
      <td>
        <!-- Banner -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: ${bannerColor}; border-radius: 8px 8px 0 0;">
          <tr>
            <td style="padding: 24px; text-align: center;">
              <span style="font-size: 32px; color: white;">${bannerIcon}</span>
              <h1 style="margin: 8px 0 0; font-size: 20px; font-weight: bold; color: white; letter-spacing: 0.5px;">
                ${bannerText}
              </h1>
            </td>
          </tr>
        </table>
        
        <!-- Content -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: white; border-radius: 0 0 8px 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 24px; font-size: 16px; color: #374151; line-height: 1.6;">
                ${messageText}
              </p>
              
              <!-- Order Details Card -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
                <tr>
                  <td style="padding: 20px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding: 4px 0;">
                          <span style="font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Customer</span>
                          <p style="margin: 4px 0 0; font-size: 16px; font-weight: 600; color: #111827;">${customerName || project.customer_name}</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 12px 0 4px;">
                          <span style="font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Order Number</span>
                          <p style="margin: 4px 0 0; font-size: 16px; font-weight: 600; color: #111827;">#${orderNumber}</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 12px 0 4px;">
                          <span style="font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Product</span>
                          <p style="margin: 4px 0 0; font-size: 16px; font-weight: 600; color: #111827;">${project.product_type || 'Vehicle Wrap'}</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 12px 0 4px;">
                          <span style="font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">${isApproval ? 'Approved At' : 'Requested At'}</span>
                          <p style="margin: 4px 0 0; font-size: 16px; font-weight: 600; color: #111827;">${timestamp}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              ${notes ? `
              <!-- Revision Notes -->
              <div style="margin-top: 24px;">
                <h3 style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: #374151; text-transform: uppercase; letter-spacing: 0.5px;">
                  Customer's Notes
                </h3>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
                  <tr>
                    <td style="padding: 16px;">
                      <p style="margin: 0; font-size: 15px; color: #92400e; line-height: 1.6; font-style: italic;">
                        "${notes}"
                      </p>
                    </td>
                  </tr>
                </table>
              </div>
              ` : ''}
              
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top: 32px;">
                <tr>
                  <td align="center">
                    <a href="${projectUrl}" style="display: inline-block; padding: 14px 32px; background-color: ${bannerColor}; color: white; font-size: 16px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                      ${isApproval ? 'View Approved Project' : 'View Project & Start Revisions'}
                    </a>
                  </td>
                </tr>
              </table>
              
              ${isApproval ? `
              <!-- Next Steps -->
              <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb;">
                <h3 style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: #374151;">Next Steps</h3>
                <ul style="margin: 0; padding: 0 0 0 20px; font-size: 14px; color: #6b7280; line-height: 1.8;">
                  <li>Production can begin immediately</li>
                  <li>Customer has signed off on final design</li>
                  <li>Print files are ready to release</li>
                </ul>
              </div>
              ` : ''}
            </td>
          </tr>
        </table>
        
        <!-- Footer -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top: 24px;">
          <tr>
            <td align="center" style="padding: 16px;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                WrapCommandAI™ for ${orgName} | ApproveFlow™
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    // Send email via Resend API
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'ApproveFlow <hello@weprintwraps.com>',
        to: [notificationEmail],
        subject: subject,
        html: emailHtml,
      }),
    });

    const emailResult = await emailResponse.json();

    console.log(`[notify-approveflow-team] Email sent to ${notificationEmail}:`, emailResult);

    // Log the email in approveflow_email_logs
    await supabase.from("approveflow_email_logs").insert({
      project_id: projectId,
      email_type: `team_notification_${notificationType}`,
      recipient_email: notificationEmail,
      subject: subject,
      status: 'sent',
      sent_at: new Date().toISOString(),
      provider: 'resend',
      metadata: {
        notification_type: notificationType,
        customer_name: customerName,
        order_number: orderNumber,
        notes: notes || null,
      },
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        emailSentTo: notificationEmail,
        notificationType 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e) {
    console.error(`[notify-approveflow-team] Error:`, e);
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
