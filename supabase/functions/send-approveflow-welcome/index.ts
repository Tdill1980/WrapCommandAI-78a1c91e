import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { emailsPaused, pausedResponse } from "../_shared/email-guard.ts";

const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL') || Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const resendApiKey = Deno.env.get('RESEND_API_KEY');

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// OS CONSTANT - Timeline for first proof
const FIRST_PROOF_TIMELINE_DAYS = 10;

interface WelcomeEmailRequest {
  projectId: string;
  customerEmail: string;
  customerName: string;
  orderNumber: string;
  hasArtwork: boolean;
  artworkCount: number;
  designInstructions?: string;
  portalUrl: string;
}

// Shared branded header
const getBrandedHeader = () => `
  <div style="padding: 20px 30px; background: #1a1a2e;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td>
          <span style="font-size: 11px; font-weight: 600; color: #a78bfa; letter-spacing: 0.5px;">
            WrapCommandAI™ for WPW
          </span>
          <span style="color: #4b5563; margin: 0 8px;">|</span>
          <span style="font-size: 11px; font-weight: 500; color: #60a5fa; letter-spacing: 0.3px;">
            ApproveFlow™
          </span>
        </td>
      </tr>
    </table>
  </div>
`;

// Shared branded footer
const getBrandedFooter = () => `
  <div style="text-align: center; padding: 24px; background: #1a1a2e; border-top: 1px solid #374151;">
    <p style="font-size: 11px; color: #6b7280; margin: 0;">
      Powered by <span style="color: #a78bfa;">WrapCommand AI</span>
    </p>
  </div>
`;

const handler = async (req: Request): Promise<Response> => {
  if (req.method !== "OPTIONS" && emailsPaused()) return pausedResponse(corsHeaders);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      projectId, 
      customerEmail, 
      customerName, 
      orderNumber, 
      hasArtwork,
      artworkCount,
      designInstructions,
      portalUrl 
    }: WelcomeEmailRequest = await req.json();

    console.log('Sending welcome email to:', customerEmail, 'hasArtwork:', hasArtwork);

    const hasInstructions = designInstructions && designInstructions.trim().length > 20;
    
    let emailHtml: string;
    let subject: string;

    if (hasArtwork || hasInstructions) {
      // VERSION 1: Artwork/Instructions Received
      subject = `Order Received - We're Getting Started! #${orderNumber}`;
      
      emailHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Order Received</title>
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #e5e7eb; margin: 0; padding: 0; background-color: #0f0f1a;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #1a1a2e;">
              ${getBrandedHeader()}
              
              <!-- Green Banner -->
              <div style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); padding: 30px; text-align: center;">
                <div style="font-size: 32px; margin-bottom: 8px;">✅</div>
                <h1 style="color: white; margin: 0; font-size: 24px; font-weight: bold;">ORDER RECEIVED</h1>
                <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">Order #${orderNumber}</p>
              </div>
              
              <div style="padding: 30px;">
                <p style="font-size: 16px; margin-bottom: 20px; color: #e5e7eb;">Hi ${customerName},</p>
                
                <p style="font-size: 16px; margin-bottom: 24px; color: #d1d5db;">
                  Great news! We've received your order and are ready to get started on your custom design.
                </p>

                <!-- Status Box -->
                <div style="background: #0f0f1a; border: 1px solid #374151; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                  <div style="display: flex; align-items: center; margin-bottom: 12px;">
                    <span style="color: #10b981; margin-right: 12px; font-size: 18px;">✅</span>
                    <span style="color: #e5e7eb; font-size: 14px;">
                      <strong>Artwork Received:</strong> ${hasArtwork ? `${artworkCount} file${artworkCount > 1 ? 's' : ''}` : 'Not yet uploaded'}
                    </span>
                  </div>
                  <div style="display: flex; align-items: center;">
                    <span style="color: #10b981; margin-right: 12px; font-size: 18px;">✅</span>
                    <span style="color: #e5e7eb; font-size: 14px;">
                      <strong>Design Instructions:</strong> ${hasInstructions ? 'Received' : 'Not yet provided'}
                    </span>
                  </div>
                </div>

                <!-- Timeline -->
                <div style="background: linear-gradient(135deg, rgba(96, 165, 250, 0.1) 0%, rgba(167, 139, 250, 0.1) 100%); border-left: 4px solid #60a5fa; padding: 16px 20px; border-radius: 0 8px 8px 0; margin-bottom: 24px;">
                  <p style="margin: 0; font-size: 14px; color: #93c5fd;">
                    <strong>⏱️ Timeline:</strong> Your first design proof will be delivered within <strong>${FIRST_PROOF_TIMELINE_DAYS} business days</strong>.
                  </p>
                </div>

                <!-- CTA Button -->
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${portalUrl}" style="display: inline-block; background: linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                    View Your ApproveFlow Portal
                  </a>
                </div>

                <hr style="border: none; border-top: 1px solid #374151; margin: 30px 0;" />

                <p style="font-size: 14px; color: #9ca3af; margin: 0;">
                  Have questions? Simply reply to this email or chat with us in your portal.
                </p>
              </div>

              ${getBrandedFooter()}
            </div>
          </body>
        </html>
      `;
    } else {
      // VERSION 2: Artwork/Instructions Needed
      subject = `Action Needed - Upload Your Design Files #${orderNumber}`;
      
      emailHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Action Needed</title>
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #e5e7eb; margin: 0; padding: 0; background-color: #0f0f1a;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #1a1a2e;">
              ${getBrandedHeader()}
              
              <!-- Orange Banner -->
              <div style="background: linear-gradient(135deg, #d97706 0%, #f59e0b 100%); padding: 30px; text-align: center;">
                <div style="font-size: 32px; margin-bottom: 8px;">⚠️</div>
                <h1 style="color: white; margin: 0; font-size: 24px; font-weight: bold;">ACTION NEEDED</h1>
                <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">Order #${orderNumber}</p>
              </div>
              
              <div style="padding: 30px;">
                <p style="font-size: 16px; margin-bottom: 20px; color: #e5e7eb;">Hi ${customerName},</p>
                
                <p style="font-size: 16px; margin-bottom: 24px; color: #d1d5db;">
                  Your order has been received! To get started on your custom design, we need your design files.
                </p>

                <!-- What to Upload -->
                <div style="background: #0f0f1a; border: 1px solid #374151; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                  <p style="color: #e5e7eb; font-size: 14px; margin: 0 0 12px 0; font-weight: 600;">Please upload:</p>
                  <ul style="color: #d1d5db; font-size: 14px; margin: 0; padding-left: 20px;">
                    <li style="margin-bottom: 8px;">Logos, artwork, or reference images</li>
                    <li style="margin-bottom: 8px;">Design instructions or notes</li>
                    <li>Any inspiration photos or examples</li>
                  </ul>
                </div>

                <!-- CTA Button -->
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${portalUrl}" style="display: inline-block; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                    Upload Files Now
                  </a>
                </div>

                <!-- Timeline -->
                <div style="background: linear-gradient(135deg, rgba(96, 165, 250, 0.1) 0%, rgba(167, 139, 250, 0.1) 100%); border-left: 4px solid #60a5fa; padding: 16px 20px; border-radius: 0 8px 8px 0; margin-bottom: 24px;">
                  <p style="margin: 0; font-size: 14px; color: #93c5fd;">
                    <strong>⏱️ Timeline:</strong> Your first design proof will be delivered within <strong>${FIRST_PROOF_TIMELINE_DAYS} business days</strong> after we receive your files.
                  </p>
                </div>

                <hr style="border: none; border-top: 1px solid #374151; margin: 30px 0;" />

                <p style="font-size: 14px; color: #9ca3af; margin: 0;">
                  Have questions? Simply reply to this email or chat with us in your portal.
                </p>
              </div>

              ${getBrandedFooter()}
            </div>
          </body>
        </html>
      `;
    }

    // Send email via Resend API
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'WePrintWraps Design Team <hello@weprintwraps.com>',
        to: [customerEmail],
        subject: subject,
        html: emailHtml,
      }),
    });

    const emailData = await emailResponse.json();
    
    if (!emailResponse.ok) {
      console.error('Resend API error:', emailData);
      throw new Error(emailData.message || 'Failed to send email');
    }

    console.log("Welcome email sent successfully:", emailData);

    // Log email to database
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    await supabase.from('approveflow_email_logs').insert({
      project_id: projectId,
      email_type: hasArtwork || hasInstructions ? 'welcome_received' : 'welcome_action_needed',
      recipient_email: customerEmail,
      subject: subject,
      status: 'sent',
      provider: 'resend',
      metadata: {
        has_artwork: hasArtwork,
        artwork_count: artworkCount,
        has_instructions: hasInstructions,
        portal_url: portalUrl,
        email_id: emailData.id
      }
    });

    return new Response(JSON.stringify({ success: true, emailData }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-approveflow-welcome function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
