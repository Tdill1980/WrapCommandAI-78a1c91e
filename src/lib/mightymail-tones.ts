export interface EmailTone {
  id: string;
  label: string;
  description: string;
  subjectTemplate: string;
  bodyParagraphs: string[];
  closing: string;
  style: {
    headerColor: string;
    buttonColor: string;
    accentColor: string;
  };
}

// Print-only tones (for WePrintWraps.com - no installation)
export const printOnlyTones: Record<string, EmailTone> = {
  installer: {
    id: "installer",
    label: "Pro Print Tone",
    description: "Direct, technical, and professional. Perfect for installers, fleets, and commercial customers.",
    subjectTemplate: "Your Vehicle Wrap Print Quote for {{vehicle_make}} {{vehicle_model}}",
    bodyParagraphs: [
      "Your estimate is now ready with precise material and shipping details.",
      "All film selections are made using industry-standard materials and professional print specifications.",
      "This quote includes accurate SQFT calculations, panel layouts, and warranty-backed film options.",
      "If you have any questions regarding print quality, material specs, or shipping, we're here to help.",
    ],
    closing: "Thanks for trusting us with your vehicle wrap printing.",
    style: {
      headerColor: "#1F2937",
      buttonColor: "#3B82F6",
      accentColor: "#60A5FA",
    },
  },
  luxury: {
    id: "luxury",
    label: "Luxury Print Tone",
    description: "Smooth, elevated, and refined. Perfect for high-end vehicles and exotic clients.",
    subjectTemplate: "Your Premium Wrap Print Quote Awaits",
    bodyParagraphs: [
      "Your personalized wrap print proposal has been prepared with elevated attention to detail.",
      "We've curated this recommendation using top-tier films and premium printing specifications.",
      "Every element—finish, coverage, and precision—has been considered to deliver a refined, professional print.",
      "We look forward to printing a truly bespoke wrap for your vehicle.",
    ],
    closing: "Your vehicle deserves a flawless print — let's bring it to life.",
    style: {
      headerColor: "#0A0A0F",
      buttonColor: "#D4AF37",
      accentColor: "#F59E0B",
    },
  },
  hype: {
    id: "hype",
    label: "Hype Print Tone",
    description: "Aggressive, energetic, high-conviction. Perfect for drift builds, show cars, and restyle customers.",
    subjectTemplate: "🔥 Your Wrap Print Quote is Ready — Let's Transform This Ride!",
    bodyParagraphs: [
      "Your custom wrap print estimate is ready and it goes HARD.",
      "This setup was built to stand out — killer color options, elite-grade film, and precision printing.",
      "If you're ready to turn heads and steal the whole show… your print starts here.",
      "Spots fill fast. Lock it in and let's print greatness.",
    ],
    closing: "Let's make your vehicle impossible to ignore.",
    style: {
      headerColor: "#0A0A0F",
      buttonColor: "#00AFFF",
      accentColor: "#4EEAFF",
    },
  },
};

// Installer tones (for subdomain shops that offer installation)
export const emailTones: Record<string, EmailTone> = {
  installer: {
    id: "installer",
    label: "Pro Installer Tone",
    description: "Direct, technical, and professional. Perfect for installers, fleets, and commercial customers.",
    subjectTemplate: "Your Vehicle Wrap Quote for {{vehicle_make}} {{vehicle_model}}",
    bodyParagraphs: [
      "Your estimate is now ready with precise material and installation details.",
      "All film selections are made using industry-standard materials and professional specifications.",
      "This quote includes accurate SQFT calculations, install hour estimates, and warranty-backed film options.",
      "If you have any questions regarding fitment, panel layout, or film performance, we're here to help.",
    ],
    closing: "Thanks for trusting us with your vehicle wrap project.",
    style: {
      headerColor: "#1F2937",
      buttonColor: "#3B82F6",
      accentColor: "#60A5FA",
    },
  },
  luxury: {
    id: "luxury",
    label: "Luxury Auto Spa Tone",
    description: "Smooth, elevated, and refined. Perfect for high-end vehicles, exotic clients, and PPF customers.",
    subjectTemplate: "Your Premium Wrap Experience Awaits",
    bodyParagraphs: [
      "Your personalized wrap proposal has been prepared with elevated attention to detail.",
      "We've curated this recommendation using top-tier films and premium installation techniques.",
      "Every element—finish, coverage, and craftsmanship—has been considered to deliver a refined, elevated transformation.",
      "We look forward to creating a truly bespoke wrap experience for your vehicle.",
    ],
    closing: "Your vehicle deserves a flawless finish — let's bring it to life.",
    style: {
      headerColor: "#0A0A0F",
      buttonColor: "#D4AF37",
      accentColor: "#F59E0B",
    },
  },
  hype: {
    id: "hype",
    label: "Hype Restyler Tone",
    description: "Aggressive, energetic, high-conviction. Perfect for drift builds, show cars, and restyle customers.",
    subjectTemplate: "🔥 Your Wrap Quote is Ready — Let's Transform This Ride!",
    bodyParagraphs: [
      "Your custom wrap estimate is ready and it goes HARD.",
      "This setup was built to stand out — killer color options, elite-grade film, and pro-level installation.",
      "If you're ready to turn heads, melt timelines, and steal the whole show… your build starts here.",
      "Spots fill fast. Lock it in and let's wrap greatness.",
    ],
    closing: "Let's make your vehicle impossible to ignore.",
    style: {
      headerColor: "#0A0A0F",
      buttonColor: "#00AFFF",
      accentColor: "#4EEAFF",
    },
  },
};

// Helper to get the right tones based on offersInstallation flag
export function getTonePresets(offersInstallation: boolean): Record<string, EmailTone> {
  return offersInstallation ? emailTones : printOnlyTones;
}

// Rotating upsell helper - expanded for AOV optimization
// Cycles through 5 high-value upsells to push AOV toward $1,000+
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
      body: "Add another vehicle and you could hit our next discount tier. 500+ sq ft = 5% off, 1,000+ = 10% off, 2,500+ = 15% off. Fleet orders save big.",
      link: "https://weprintwraps.com/our-products/",
    },
    {
      title: "Need a custom design? Bundle and save",
      body: "Our design team creates full custom wraps for $750. Bundle with printing and save 5% on the whole order. One invoice, one project.",
      link: "https://weprintwraps.com/our-products/custom-vehicle-wrap-design/",
    },
    {
      title: "Got walls to wrap too?",
      body: "Wall Wrap vinyl at just $3.25/sq ft. Brand your shop, showroom, or office. Bundle with your vehicle order for one easy shipment.",
      link: "https://weprintwraps.com/our-products/wall-wrap-printed-vinyl/",
    },
  ];

  return upsells[num];
}

export function renderEmailTemplate(
  tone: string,
  design: string,
  data: Record<string, any>
): string {
  // Use the professional WePrintWraps quote template
  // Matches the edge function template exactly
  const vehicleDisplay = [data.vehicle_year, data.vehicle_make, data.vehicle_model]
    .filter(Boolean)
    .join(' ') || 'Your Vehicle';

  const cartUrl = data.portal_url || 'https://weprintwraps.com/our-products/';
  const total = Number(data.quote_total) || 0;
  const sqft = Number(data.sqft) || 0;
  const rate = sqft > 0 ? total / sqft : 5.27;
  const quoteNumber = data.quote_number || '';

  const upsell = getRotatingUpsell(data.quote_id);

  // Professional WePrintWraps Quote Template
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f6f7f9;font-family:Inter,Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;">

    <!-- BLACK HEADER - WePrintWraps Branding -->
    <div style="background:#000000;padding:16px 24px;">
      <div style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">
        WEPRINTWRAPS.COM
      </div>
      <div style="font-size:12px;color:#888888;margin-top:4px;">
        Professional Vehicle Wrap Printing
      </div>
    </div>

    <!-- BODY -->
    <div style="background:#ffffff;color:#111827;font-family:Inter,Arial,sans-serif;font-size:14px;line-height:1.5;">

      <!-- ADD TO CART CTA -->
      <div style="padding:24px;">
        <a href="${cartUrl}"
           style="display:inline-block;padding:14px 24px;background:#e6007e;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">
          Add This Quote to Cart
        </a>
      </div>

      <!-- PRICE SECTION -->
      <div style="padding:0 24px 24px 24px;">
        <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Estimated Total</div>
        <div style="font-size:32px;font-weight:700;color:#111827;margin:4px 0;">
          $${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div style="font-size:13px;color:#6b7280;">
          ~${sqft} sq ft × $${rate.toFixed(2)} / sq ft
        </div>
      </div>

      <!-- PROJECT DETAILS -->
      <div style="padding:0 24px 24px 24px;">
        <div style="background:#f9fafb;border-radius:8px;padding:20px;border-left:4px solid #e6007e;">
          <div style="font-size:14px;color:#111827;font-weight:600;margin-bottom:12px;">Project Details</div>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            ${vehicleDisplay !== 'Your Vehicle' ? `
            <tr>
              <td style="padding:8px 0;color:#6b7280;border-bottom:1px solid #e5e7eb;">Vehicle</td>
              <td style="padding:8px 0;color:#111827;text-align:right;font-weight:500;border-bottom:1px solid #e5e7eb;">${vehicleDisplay}</td>
            </tr>` : ''}
            ${sqft > 0 ? `
            <tr>
              <td style="padding:8px 0;color:#6b7280;border-bottom:1px solid #e5e7eb;">Coverage</td>
              <td style="padding:8px 0;color:#111827;text-align:right;font-weight:500;border-bottom:1px solid #e5e7eb;">${sqft} sq ft</td>
            </tr>` : ''}
            <tr>
              <td style="padding:8px 0;color:#6b7280;border-bottom:1px solid #e5e7eb;">Material</td>
              <td style="padding:8px 0;color:#111827;text-align:right;font-weight:500;border-bottom:1px solid #e5e7eb;">${data.product_name || 'Premium Cast Vinyl'}</td>
            </tr>
            ${data.material_cost ? `
            <tr>
              <td style="padding:8px 0;color:#6b7280;border-bottom:1px solid #e5e7eb;">Material Cost</td>
              <td style="padding:8px 0;color:#111827;text-align:right;font-weight:500;border-bottom:1px solid #e5e7eb;">$${Number(data.material_cost).toFixed(2)}</td>
            </tr>` : ''}
            ${data.labor_cost && Number(data.labor_cost) > 0 ? `
            <tr>
              <td style="padding:8px 0;color:#6b7280;border-bottom:1px solid #e5e7eb;">Labor</td>
              <td style="padding:8px 0;color:#111827;text-align:right;font-weight:500;border-bottom:1px solid #e5e7eb;">$${Number(data.labor_cost).toFixed(2)}</td>
            </tr>` : ''}
            <tr>
              <td style="padding:12px 0 8px;color:#111827;font-weight:600;font-size:15px;">Total</td>
              <td style="padding:12px 0 8px;color:#e6007e;text-align:right;font-weight:700;font-size:18px;">$${total.toFixed(2)}</td>
            </tr>
          </table>
          <div style="margin-top:12px;font-size:12px;color:#9ca3af;font-style:italic;">
            Printed wrap material only. Installation not included.
          </div>
        </div>
      </div>

      <!-- UPSELL SECTION -->
      <div style="padding:0 24px 24px 24px;">
        <div style="background:#fef3c7;border-radius:8px;padding:16px;">
          <div style="font-size:13px;font-weight:600;color:#92400e;margin-bottom:4px;">${upsell.title}</div>
          <div style="font-size:13px;color:#78350f;margin-bottom:8px;">${upsell.body}</div>
          <a href="${upsell.link}" style="font-size:13px;color:#e6007e;text-decoration:none;font-weight:500;">Learn more →</a>
        </div>
      </div>

      <!-- VOLUME PRICING -->
      <div style="padding:0 24px 24px 24px;">
        <div style="font-size:14px;font-weight:600;color:#111827;margin-bottom:12px;">Volume & Fleet Pricing</div>
        <table style="width:100%;font-size:13px;color:#6b7280;">
          <tr><td style="padding:4px 0;">500–999 sq ft</td><td style="text-align:right;color:#059669;font-weight:500;">5% off</td></tr>
          <tr><td style="padding:4px 0;">1,000–2,499 sq ft</td><td style="text-align:right;color:#059669;font-weight:500;">10% off</td></tr>
          <tr><td style="padding:4px 0;">2,500–4,999 sq ft</td><td style="text-align:right;color:#059669;font-weight:500;">15% off</td></tr>
          <tr><td style="padding:4px 0;">5,000+ sq ft</td><td style="text-align:right;color:#059669;font-weight:500;">20% off</td></tr>
        </table>
      </div>

      <!-- COMMERCIALPRO CTA -->
      <div style="padding:0 24px 24px 24px;border-top:1px solid #e5e7eb;">
        <div style="padding-top:20px;font-size:13px;color:#6b7280;">
          Are you a wrap professional or managing fleet volume?<br/>
          <a href="https://weprintwraps.com/commercialpro" style="color:#e6007e;text-decoration:none;font-weight:600;">
            Learn more about CommercialPro™ →
          </a>
        </div>
      </div>
    </div>

    <!-- FOOTER -->
    <div style="padding:24px;background:#111827;font-size:12px;color:#9ca3af;text-align:center;">
      Questions? Reply to this email or contact
      <a href="mailto:hello@weprintwraps.com" style="color:#e6007e;">hello@weprintwraps.com</a><br/><br/>
      — The WePrintWraps.com Team
      ${quoteNumber ? `<br/><span style="font-size:11px;color:#6b7280;">Quote #${quoteNumber}</span>` : ''}
    </div>

  </div>
</body>
</html>
`;
}

// Legacy functions kept for compatibility
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
  };
}
