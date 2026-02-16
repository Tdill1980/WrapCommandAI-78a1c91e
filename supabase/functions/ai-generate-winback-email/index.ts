import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WinbackRequest {
  inactivityDays: number;
  offerType: 'percent_off' | 'dollar_off' | 'free_shipping' | 'bundle';
  offerValue: number;
  urgencyLevel: 'soft' | 'medium' | 'aggressive';
  emailNumber?: number; // 1, 2, or 3 in sequence
  customerFirstName?: string;
  designToken?: {
    backgroundColor: string;
    headlineColor: string;
    accentColor: string;
    ctaColor: string;
    textColor: string;
    headlineFont: string;
    bodyFont: string;
    logoUrl?: string;
    footerHtml?: string;
  };
}

const defaultDesignToken = {
  backgroundColor: '#0A0A0A',
  headlineColor: '#FF1493',
  accentColor: '#FFD700',
  ctaColor: '#00AFFF',
  textColor: '#FFFFFF',
  headlineFont: 'Bebas Neue',
  bodyFont: 'Inter',
  logoUrl: 'https://weprintwraps.com/wp-content/uploads/2024/01/wpw-logo-white.png',
  footerHtml: '<p style="color: #666; font-size: 12px; text-align: center; margin-top: 30px;">WePrintWraps.com | Premium Wrap Printing<br/>Questions? hello@weprintwraps.com</p>'
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      inactivityDays = 30, 
      offerType = 'percent_off', 
      offerValue = 10,
      urgencyLevel = 'soft',
      emailNumber = 1,
      customerFirstName = 'there',
      designToken = defaultDesignToken
    }: WinbackRequest = await req.json();

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    // Merge with defaults
    const design = { ...defaultDesignToken, ...designToken };

    // Build the offer string
    let offerString = '';
    switch (offerType) {
      case 'percent_off':
        offerString = `${offerValue}% OFF your next order`;
        break;
      case 'dollar_off':
        offerString = `$${offerValue} OFF your next order`;
        break;
      case 'free_shipping':
        offerString = 'FREE SHIPPING on your next order';
        break;
      case 'bundle':
        offerString = `${offerValue}% OFF when you bundle`;
        break;
    }

    // Build urgency messaging based on level
    const urgencyMessages = {
      soft: {
        preheader: "We've got something special for you...",
        cta: "See What's New",
        urgency: ""
      },
      medium: {
        preheader: "Your exclusive deal won't last forever!",
        cta: "Claim Your Discount",
        urgency: "Offer expires in 48 hours!"
      },
      aggressive: {
        preheader: "⏰ FINAL CALL - This is it!",
        cta: "USE CODE NOW",
        urgency: "🚨 EXPIRES AT MIDNIGHT 🚨"
      }
    };

    const urgency = urgencyMessages[urgencyLevel];

    // Email sequence messaging
    const sequenceContent = {
      1: {
        subjectPrefix: "🔹",
        theme: "reconnection",
        tone: "We miss having you around! It's been a while since your last order, and we wanted to reach out with something special."
      },
      2: {
        subjectPrefix: "⚡",
        theme: "fomo",
        tone: "Don't let this slip away! We upgraded your offer because we really want you back."
      },
      3: {
        subjectPrefix: "🚨",
        theme: "last_chance",
        tone: "This is your FINAL chance. After today, this exclusive offer disappears forever."
      }
    };

    const sequence = sequenceContent[emailNumber as 1 | 2 | 3] || sequenceContent[1];

    const systemPrompt = `You are an expert email copywriter for WePrintWraps.com, a premium vehicle wrap printing company. You write in the brand voice: confident, industry-expert, slightly edgy, professional but not corporate.

Your task is to generate a WinBack email for customers who haven't ordered in ${inactivityDays} days.

DESIGN REQUIREMENTS:
- Dark background aesthetic (Ink & Edge magazine style)
- Hot pink (#FF1493) for headlines - bold, eye-catching
- Yellow (#FFD700) for accents and highlights
- Blue (#00AFFF) for CTA buttons
- Clean, magazine-quality layout

EMAIL DETAILS:
- This is email #${emailNumber} in a 3-email sequence
- Theme: ${sequence.theme}
- Offer: ${offerString}
- Urgency Level: ${urgencyLevel}
- Customer first name: ${customerFirstName}

Generate a complete email with:
1. Subject line (include emoji, under 50 chars)
2. Preheader text (under 100 chars)
3. Headline (short, punchy, under 10 words)
4. Body copy (2-3 short paragraphs, conversational)
5. CTA text (action-oriented, under 5 words)
6. Promo code if applicable

Return as JSON:
{
  "subject": "...",
  "preheader": "...",
  "headline": "...",
  "bodyParagraphs": ["...", "...", "..."],
  "ctaText": "...",
  "promoCode": "COMEBACK${offerValue}"
}`;

    console.log('Generating winback email for:', { inactivityDays, offerType, offerValue, urgencyLevel, emailNumber });

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GEMINI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Generate the winback email content. Tone: ${sequence.tone}` }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResult = await response.json();
    const aiContent = aiResult.choices?.[0]?.message?.content || '';
    
    // Parse JSON from AI response
    let emailContent;
    try {
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        emailContent = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in AI response');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiContent);
      // Fallback content
      emailContent = {
        subject: `${sequence.subjectPrefix} Hey ${customerFirstName}, we miss you!`,
        preheader: urgency.preheader,
        headline: "IT'S BEEN A WHILE",
        bodyParagraphs: [
          `Hey ${customerFirstName}! We noticed it's been ${inactivityDays} days since your last order with WePrintWraps.`,
          `We've got new products, better prices, and the same premium quality you love. To welcome you back, here's an exclusive offer just for you:`,
          `${offerString}. ${urgency.urgency}`
        ],
        ctaText: urgency.cta,
        promoCode: `COMEBACK${offerValue}`
      };
    }

    // Generate full HTML email
    const html = generateEmailHtml(emailContent, design, urgencyLevel);

    console.log('Generated winback email successfully');

    return new Response(
      JSON.stringify({
        success: true,
        content: emailContent,
        html,
        metadata: {
          inactivityDays,
          offerType,
          offerValue,
          urgencyLevel,
          emailNumber,
          generatedAt: new Date().toISOString()
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error generating winback email:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function generateEmailHtml(
  content: {
    subject: string;
    preheader: string;
    headline: string;
    bodyParagraphs: string[];
    ctaText: string;
    promoCode?: string;
  },
  design: typeof defaultDesignToken,
  urgencyLevel: string
): string {
  const urgencyBanner = urgencyLevel === 'aggressive' 
    ? `<div style="background: ${design.accentColor}; color: #000; text-align: center; padding: 10px; font-weight: bold; font-family: ${design.bodyFont}, sans-serif;">
        🚨 FINAL HOURS - THIS OFFER EXPIRES AT MIDNIGHT 🚨
      </div>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${content.subject}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&display=swap');
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: ${design.backgroundColor}; font-family: ${design.bodyFont}, Arial, sans-serif;">
  <!-- Preheader -->
  <div style="display: none; max-height: 0; overflow: hidden;">
    ${content.preheader}
  </div>
  
  ${urgencyBanner}
  
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: ${design.backgroundColor};">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px;">
          
          <!-- Logo -->
          ${design.logoUrl ? `
          <tr>
            <td align="center" style="padding-bottom: 30px;">
              <img src="${design.logoUrl}" alt="WePrintWraps" width="200" style="display: block;">
            </td>
          </tr>
          ` : ''}
          
          <!-- Headline -->
          <tr>
            <td align="center" style="padding-bottom: 20px;">
              <h1 style="font-family: '${design.headlineFont}', Impact, sans-serif; font-size: 48px; color: ${design.headlineColor}; margin: 0; letter-spacing: 2px; text-transform: uppercase;">
                ${content.headline}
              </h1>
            </td>
          </tr>
          
          <!-- Body Content -->
          ${content.bodyParagraphs.map(p => `
          <tr>
            <td style="padding: 10px 20px;">
              <p style="font-family: ${design.bodyFont}, Arial, sans-serif; font-size: 16px; line-height: 1.6; color: ${design.textColor}; margin: 0;">
                ${p}
              </p>
            </td>
          </tr>
          `).join('')}
          
          <!-- Promo Code -->
          ${content.promoCode ? `
          <tr>
            <td align="center" style="padding: 30px 20px;">
              <div style="background: linear-gradient(135deg, ${design.headlineColor}22, ${design.accentColor}22); border: 2px dashed ${design.accentColor}; border-radius: 8px; padding: 20px; display: inline-block;">
                <p style="font-family: ${design.bodyFont}, sans-serif; font-size: 14px; color: ${design.textColor}; margin: 0 0 10px 0;">USE CODE AT CHECKOUT:</p>
                <p style="font-family: '${design.headlineFont}', Impact, sans-serif; font-size: 32px; color: ${design.accentColor}; margin: 0; letter-spacing: 3px;">${content.promoCode}</p>
              </div>
            </td>
          </tr>
          ` : ''}
          
          <!-- CTA Button -->
          <tr>
            <td align="center" style="padding: 30px 20px;">
              <a href="https://weprintwraps.com/shop/?promo=${content.promoCode || ''}" 
                 style="display: inline-block; background: ${design.ctaColor}; color: #000; font-family: '${design.headlineFont}', Impact, sans-serif; font-size: 24px; text-decoration: none; padding: 16px 48px; border-radius: 4px; letter-spacing: 2px; text-transform: uppercase; font-weight: bold;">
                ${content.ctaText}
              </a>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding-top: 40px; border-top: 1px solid #333;">
              ${design.footerHtml || ''}
              <p style="font-family: ${design.bodyFont}, sans-serif; font-size: 11px; color: #666; text-align: center; margin-top: 20px;">
                You're receiving this because you previously ordered from WePrintWraps.com<br/>
                <a href="{{unsubscribe_url}}" style="color: #666;">Unsubscribe</a>
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
