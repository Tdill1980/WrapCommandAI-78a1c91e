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

interface ProofEmailRequest {
  projectId: string;
  customerEmail: string;
  customerName: string;
  orderNumber: string;
  proofUrl: string;
  renderUrls?: Record<string, string>;
  portalUrl: string;
  productType?: string;
  vehicleInfo?: {
    year?: string;
    make?: string;
    model?: string;
  };
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
      proofUrl, 
      renderUrls,
      portalUrl,
      productType,
      vehicleInfo
    }: ProofEmailRequest = await req.json();

    console.log('Sending proof email to:', customerEmail);

    // Build vehicle info string if available
    let vehicleString = '';
    if (vehicleInfo && (vehicleInfo.year || vehicleInfo.make || vehicleInfo.model)) {
      vehicleString = [vehicleInfo.year, vehicleInfo.make, vehicleInfo.model].filter(Boolean).join(' ');
    }

    // Build render images HTML if available
    let renderImagesHtml = '';
    if (renderUrls && Object.keys(renderUrls).length > 0) {
      renderImagesHtml = `
        <div style="margin-top: 24px;">
          <h2 style="color: #a78bfa; margin-bottom: 16px; font-size: 16px; font-weight: 600;">3D Renders</h2>
          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            ${Object.entries(renderUrls).map(([angle, url]) => `
              <img src="${url}" alt="${angle} view" style="width: 180px; height: auto; border-radius: 8px; border: 1px solid #374151;" />
            `).join('')}
          </div>
        </div>
      `;
    }

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Your Design Proof is Ready</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #e5e7eb; margin: 0; padding: 0; background-color: #0f0f1a;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #1a1a2e;">
            ${getBrandedHeader()}
            
            <!-- Blue Banner -->
            <div style="background: linear-gradient(135deg, #2563eb 0%, #60a5fa 100%); padding: 30px; text-align: center;">
              <div style="font-size: 32px; margin-bottom: 8px;">🎨</div>
              <h1 style="color: white; margin: 0; font-size: 24px; font-weight: bold;">DESIGN PROOF READY</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">Order #${orderNumber}</p>
            </div>
            
            <div style="padding: 30px;">
              <p style="font-size: 16px; margin-bottom: 20px; color: #e5e7eb;">Hi ${customerName},</p>
              
              <p style="font-size: 16px; margin-bottom: 24px; color: #d1d5db;">
                Your design proof is ready for review!
              </p>

              ${(productType || vehicleString) ? `
              <!-- Order Details -->
              <div style="background: #0f0f1a; border: 1px solid #374151; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                ${productType ? `<p style="color: #9ca3af; font-size: 13px; margin: 0 0 4px 0;"><strong>Product:</strong> ${productType}</p>` : ''}
                ${vehicleString ? `<p style="color: #9ca3af; font-size: 13px; margin: 0;"><strong>Vehicle:</strong> ${vehicleString}</p>` : ''}
              </div>
              ` : ''}

              <!-- 2D Design Proof -->
              <h2 style="color: #60a5fa; margin-bottom: 16px; font-size: 16px; font-weight: 600;">2D Design Proof</h2>
              <div style="background: #0f0f1a; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
                <img src="${proofUrl}" alt="Design Proof" style="width: 100%; height: auto; border-radius: 8px; border: 1px solid #374151;" />
              </div>

              ${renderImagesHtml}

              <!-- Next Steps -->
              <div style="background: linear-gradient(135deg, rgba(96, 165, 250, 0.1) 0%, rgba(167, 139, 250, 0.1) 100%); border-left: 4px solid #60a5fa; padding: 16px 20px; border-radius: 0 8px 8px 0; margin: 24px 0;">
                <p style="margin: 0; font-size: 14px; color: #93c5fd;">
                  <strong>Next Steps:</strong><br>
                  Review the design and let us know if you'd like to approve it or request any changes.
                </p>
              </div>

              <!-- CTA Button -->
              <div style="text-align: center; margin: 30px 0;">
                <a href="${portalUrl}/proof" style="display: inline-block; background: linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                  View & Approve Design
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
        subject: `Your Design Proof is Ready - Order #${orderNumber}`,
        html: emailHtml,
      }),
    });

    const emailData = await emailResponse.json();
    
    if (!emailResponse.ok) {
      console.error('Resend API error:', emailData);
      throw new Error(emailData.message || 'Failed to send email');
    }

    console.log("Proof email sent successfully:", emailData);

    // Log email to database
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    await supabase.from('approveflow_email_logs').insert({
      project_id: projectId,
      email_type: 'proof_delivered',
      recipient_email: customerEmail,
      subject: `Your Design Proof is Ready - Order #${orderNumber}`,
      status: 'sent',
      provider: 'resend',
      metadata: {
        proof_url: proofUrl,
        has_3d_renders: !!renderUrls,
        portal_url: `${portalUrl}/proof`,
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
    console.error("Error in send-approveflow-proof function:", error);
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
