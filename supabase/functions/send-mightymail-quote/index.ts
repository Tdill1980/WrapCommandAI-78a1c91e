import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const supabase = createClient(
  Deno.env.get('EXTERNAL_SUPABASE_URL') || Deno.env.get("SUPABASE_URL")!,
  Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface QuoteEmailRequest {
  customerEmail: string;
  customerName: string;
  quoteData: {
    vehicle_year?: string;
    vehicle_make?: string;
    vehicle_model?: string;
    product_name?: string;
    sqft?: number;
    material_cost?: number;
    labor_cost?: number;
    quote_total: number;
    portal_url?: string;
  };
  tone?: string;
  design?: string;
  quoteId?: string;
  customerId?: string;
  offersInstallation?: boolean;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      customerEmail,
      customerName,
      quoteData,
      tone = "installer",
      design = "performance",
      quoteId,
      customerId,
      offersInstallation = true,
    }: QuoteEmailRequest = await req.json();

    if (!customerEmail || !quoteData.quote_total) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Get branding settings
    const { data: branding } = await supabase
      .from("email_branding")
      .select("*")
      .single();

    // Generate UTIM for tracking
    const emailId = crypto.randomUUID();
    const utim = quoteId && customerId 
      ? btoa(`${customerId}:${quoteId}:quote_sent:${emailId}:${Date.now()}:${tone}:${design}:mightymail`)
      : '';

    let emailHTML = renderEmailTemplate(tone, design, {
      customer_name: customerName,
      footer_text: branding?.footer_text || "",
      logo_url: branding?.logo_url || "",
      ...quoteData,
    }, offersInstallation);

    const subject = getSubjectLine(tone, quoteData);

    // Inject UTIM tracking if available
    if (utim) {
      const baseUrl = Deno.env.get("SUPABASE_URL")?.replace('/rest/v1', '') || '';
      emailHTML = emailHTML.replace(/\{\{utim\}\}/g, utim);
      
      // Add tracking pixel
      const trackingPixel = `<img src="${baseUrl}/functions/v1/track-email-open?utim=${utim}" width="1" height="1" style="display:none;" alt="" />`;
      emailHTML = emailHTML.replace('</body>', `${trackingPixel}</body>`);
    }

    const emailResponse = await resend.emails.send({
      from: branding?.sender_name
        ? `${branding.sender_name} <hello@weprintwraps.com>`
        : "WePrintWraps <hello@weprintwraps.com>",
      to: [customerEmail],
      subject: subject,
      html: emailHTML,
    });

    // Log email send
    await supabase.from("email_tracking").insert({
      customer_id: null,
      sequence_id: null,
      email_subject: subject,
      status: "sent",
      metadata: {
        tone,
        design,
        quote_total: quoteData.quote_total,
      },
    });

    console.log("Quote email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, emailResponse }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-mightymail-quote function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

function getSubjectLine(tone: string, quoteData: any): string {
  const vehicleDisplay = [quoteData.vehicle_year, quoteData.vehicle_make, quoteData.vehicle_model]
    .filter(Boolean)
    .join(' ') || 'Your Vehicle';
  
  return `Your Wrap Quote: ${vehicleDisplay} - $${Number(quoteData.quote_total).toFixed(2)}`;
}

// ============================================
// CANONICAL QUOTE EMAIL - Claude-style with rotating upsells
// Unified template matching create-quote-from-chat
// ============================================

// Rotating upsell helper - expanded for AOV optimization (5 high-value options)
function getRotatingUpsell(quoteId?: string) {
  const num = quoteId
    ? parseInt(quoteId.slice(-2), 16) % 5
    : Date.now() % 5;

  const upsells = [
    {
      title: "Save your installer hours - go Contour-Cut",
      body: "We'll cut your panels to shape so they peel and stick. Avery Contour-Cut at $6.32/sq ft. Most shops save 2-3 hours per vehicle.",
      link: "https://weprintwraps.com/our-products/avery-cut-contour-vinyl-graphics-54-roll-max-artwork-size-50/",
    },
    {
      title: "Complete the look with Window Perf",
      body: "Perforated window vinyl at $5.95/sq ft. Full graphics outside, clear visibility from inside. Add ~30 sq ft for rear window coverage.",
      link: "https://weprintwraps.com/our-products/perforated-window-vinyl-5050-unlaminated/",
    },
    {
      title: "Got more vehicles? Unlock volume pricing",
      body: "Add another vehicle and you could hit our next discount tier. 500+ sq ft = 5% off, 1,000+ = 10% off, 2,500+ = 15% off.",
      link: "https://weprintwraps.com/our-products/",
    },
    {
      title: "Need a custom design? Bundle and save",
      body: "Our design team creates full custom wraps for $750. Bundle with printing and save 5% on the whole order.",
      link: "https://weprintwraps.com/our-products/custom-vehicle-wrap-design/",
    },
    {
      title: "Got walls to wrap too?",
      body: "Wall Wrap vinyl at just $3.25/sq ft. Brand your shop, showroom, or office alongside your fleet.",
      link: "https://weprintwraps.com/our-products/wall-wrap-printed-vinyl/",
    },
  ];

  return upsells[num];
}

function renderEmailTemplate(
  tone: string,
  design: string,
  data: Record<string, any>,
  offersInstallation: boolean = true
): string {
  const vehicleDisplay = [data.vehicle_year, data.vehicle_make, data.vehicle_model]
    .filter(Boolean)
    .join(' ') || 'Your Vehicle';

  const cartUrl = data.portal_url || 'https://weprintwraps.com/our-products/';
  const total = Number(data.quote_total) || 0;
  const sqft = Number(data.sqft) || 0;
  const rate = sqft > 0 ? total / sqft : 5.27;
  const quoteNumber = data.quote_number || '';
  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  
  const upsell = getRotatingUpsell(data.quote_id);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f6f7f9;font-family:Inter,Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;">

    <!-- BLACK HEADER -->
    <div style="background:#000000;padding:16px 24px;">
      <div style="font-size:16px;font-weight:600;color:#ffffff;">
        WePrintWraps.com Quote
      </div>
    </div>

    <!-- BODY RESET -->
    <div style="background:#ffffff;color:#111827;font-family:Inter,Arial,sans-serif;font-size:14px;line-height:1.5;">

      <!-- ADD TO CART -->
      <div style="padding:24px;">
        <a href="${cartUrl}"
           style="display:inline-block;padding:12px 18px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">
          Add This Quote to Cart
        </a>
      </div>

      <!-- PRICE -->
      <div style="padding:0 24px 24px 24px;">
        <div style="font-size:13px;color:#6b7280;">Estimated Total</div>
        <div style="font-size:26px;font-weight:700;color:#111827;">
          $${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div style="font-size:13px;color:#6b7280;">
          ~${sqft} sq ft × $${rate.toFixed(2)} / sq ft
        </div>
      </div>

      <!-- PROJECT DETAILS -->
      <div style="padding:0 24px 24px 24px;">
        <div style="font-size:13px;color:#111827;font-weight:600;margin-bottom:4px;">Project Details</div>
        <div style="font-size:13px;color:#6b7280;">
          ${vehicleDisplay !== 'Your Vehicle' ? `<strong>Vehicle:</strong> ${vehicleDisplay}<br/>` : ''}
          ${sqft > 0 ? `<strong>Coverage:</strong> ${sqft} sq ft<br/>` : ''}
          <strong>Material:</strong> ${data.product_name || 'Premium Cast Vinyl'}<br/>
          <em style="color:#9ca3af;">Printed wrap material only. Installation not included.</em>
        </div>
      </div>

      <!-- UPSELL -->
      <div style="padding:0 24px 24px 24px;">
        <div style="background:#f9fafb;border-radius:8px;padding:16px;">
          <div style="font-size:13px;font-weight:600;color:#111827;margin-bottom:4px;">${upsell.title}</div>
          <div style="font-size:13px;color:#6b7280;margin-bottom:8px;">${upsell.body}</div>
          <a href="${upsell.link}" style="font-size:13px;color:#2563eb;text-decoration:none;">Learn more →</a>
        </div>
      </div>

      <!-- VOLUME PRICING -->
      <div style="padding:0 24px 24px 24px;">
        <div style="font-size:13px;font-weight:600;color:#111827;margin-bottom:8px;">Volume & Fleet Pricing</div>
        <ul style="margin:0;padding-left:18px;font-size:13px;color:#6b7280;line-height:1.8;">
          <li>500–999 sq ft → 5% off</li>
          <li>1,000–2,499 sq ft → 10% off</li>
          <li>2,500–4,999 sq ft → 15% off</li>
          <li>5,000+ sq ft → 20% off</li>
        </ul>
      </div>

      <!-- COMMERCIALPRO -->
      <div style="padding:0 24px 24px 24px;border-top:1px solid #e5e7eb;">
        <div style="padding-top:16px;font-size:13px;color:#6b7280;">
          Are you a wrap professional or managing fleet volume?<br/>
          <a href="https://weprintwraps.com/commercialpro" style="color:#2563eb;text-decoration:none;font-weight:600;">
            Learn more about CommercialPro™ →
          </a>
        </div>
      </div>
    </div>

      <!-- FOOTER -->
      <div style="padding:24px;background:#f6f7f9;font-size:12px;color:#6b7280;text-align:center;">
        Questions? Reply to this email or contact
        <a href="mailto:hello@weprintwraps.com" style="color:#2563eb;">hello@weprintwraps.com</a><br/><br/>
        — The WePrintWraps.com Team${quoteNumber ? `<br/><span style="font-size:11px;color:#9ca3af;">Quote #${quoteNumber}</span>` : ''}
      </div>

    </div>
  </div>
</body>
</html>
`;
}

// Legacy functions kept for compatibility but not used in new template
function getTonePreset(tone: string, offersInstallation: boolean) {
  return { buttonColor: "#0ea5e9", accentColor: "#60A5FA" };
}

function getDesignStyles(design: string) {
  return {
    backgroundColor: "#f6f7f9",
    containerColor: "#FFFFFF",
    headerGradient: "#000000",
    textColor: "#334155",
    headingColor: "#0f172a",
    bodyColor: "#64748b",
    cardColor: "#FFFFFF",
    borderColor: "#e5e7eb",
    footerColor: "#64748b",
    priceBoxGradient: "#0ea5e9",
  };
}

serve(handler);
