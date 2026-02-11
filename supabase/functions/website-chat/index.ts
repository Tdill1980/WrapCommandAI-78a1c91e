// =====================================================
// ⚠️⚠️⚠️ LOCKED - DO NOT MODIFY - FINAL V3.1 ⚠️⚠️⚠️
// =====================================================
// Last Updated: February 5, 2026
// VERSION: 3.3 - OpenAI API (gpt-4o) + Anthropic fallback + retry logic
//
// FEATURES (LOCKED - ALL 13 CONFIRMED):
// 1. ✅ PRINT ONLY - NO INSTALLATION enforced
// 2. ✅ 4-field collection (name, email, phone, shop name)
// 3. ✅ Auto-email quote on every pricing
// 4. ✅ Smart vehicle fallback with estimates
// 5. ✅ Trailer handling (asks for dimensions)
// 6. ✅ Window clarification (perf vs cut vinyl)
// 7. ✅ Fade wrap with URL
// 8. ✅ Design service pricing ($750)
// 9. ✅ Bulk discount tiers (5-20% based on sqft)
// 10. ✅ Dimension-based pricing
// 11. ✅ Complete FAQ knowledge
// 12. ✅ All product URLs
// 13. ✅ NO coupon codes
//
// AI PROVIDER: OpenAI API (gpt-4o) with Anthropic Claude fallback
// DATABASE: External Supabase (EXTERNAL_SUPABASE_URL)
// ORG ID: 51aa96db-c06d-41ae-b3cb-25b045c75caf
//
// ⚠️ ANY MODIFICATION REQUIRES EXPLICIT APPROVAL ⚠️
// Contact: @jackson or @trish before ANY changes
// =====================================================

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { getVehicleSqFt, VehicleSqFtResult } from "../_shared/mighty-vehicle-sqft.ts";

// ============================================
// AI API RETRY + FALLBACK CONFIGURATION
// ============================================
// Retry with exponential backoff, then fall back to Anthropic if OpenAI is rate-limited
async function callAIWithRetry(
  openaiApiKey: string,
  model: string,
  maxTokens: number,
  messages: Array<{ role: string; content: string }>,
  maxRetries = 3
): Promise<{ content: string | null; provider: string }> {
  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');

  // Try OpenAI with retries
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ model, max_tokens: maxTokens, messages })
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || null;
        return { content, provider: `openai/${model}` };
      }

      const status = response.status;
      const errorBody = await response.text();
      console.error(`[AI Retry] OpenAI attempt ${attempt + 1}/${maxRetries} failed: ${status} ${errorBody}`);

      // Only retry on 429 (rate limit) or 5xx (server error)
      if (status !== 429 && status < 500) {
        break; // Don't retry on 4xx errors (except 429)
      }

      // Exponential backoff: 1s, 2s, 4s
      if (attempt < maxRetries - 1) {
        const backoffMs = Math.pow(2, attempt) * 1000;
        console.log(`[AI Retry] Waiting ${backoffMs}ms before retry...`);
        await new Promise(r => setTimeout(r, backoffMs));
      }
    } catch (e) {
      console.error(`[AI Retry] OpenAI attempt ${attempt + 1} network error:`, e);
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
      }
    }
  }

  // Fallback to Anthropic Claude if OpenAI exhausted
  if (anthropicApiKey) {
    console.log('[AI Retry] OpenAI exhausted, falling back to Anthropic Claude...');
    try {
      // Convert OpenAI message format to Anthropic format
      const systemMsg = messages.find(m => m.role === 'system')?.content || '';
      const chatMessages = messages.filter(m => m.role !== 'system').map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }));

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicApiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: maxTokens,
          system: systemMsg,
          messages: chatMessages
        })
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.content?.[0]?.text || null;
        console.log('[AI Retry] Anthropic fallback succeeded');
        return { content, provider: 'anthropic/claude-sonnet-4-5-20250929' };
      }

      const errorBody = await response.text();
      console.error('[AI Retry] Anthropic fallback failed:', response.status, errorBody);
    } catch (e) {
      console.error('[AI Retry] Anthropic fallback error:', e);
    }
  } else {
    console.warn('[AI Retry] No ANTHROPIC_API_KEY configured for fallback');
  }

  return { content: null, provider: 'none' };
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================
// ⚠️ CRITICAL IDENTITY - DO NOT MODIFY
// ============================================
const WPW_IDENTITY = `
⚠️⚠️⚠️ CRITICAL IDENTITY RULE - NEVER VIOLATE ⚠️⚠️⚠️

WePrintWraps.com is a PRINT SHOP ONLY.

WE DO:
✅ Print vehicle wraps
✅ Ship nationwide (FREE on orders $750+)
✅ Offer design services ($750)
✅ Free file review

WE DO NOT:
❌ Install wraps - WE HAVE NO INSTALLATION TEAM
❌ Do local pickup - shipping only
❌ Visit customer locations
❌ Offer any in-person services

IF ASKED ABOUT INSTALLATION:
Say EXACTLY: "No, we're a print shop - we print and ship. You'll need a local installer to apply the wrap. I can help you find one in your area if you'd like!"

🚫 NEVER SAY:
- "We offer installation"
- "Our installation team"
- "We can install"
- "We'll come to you"

THIS IS NON-NEGOTIABLE. VIOLATING THIS LOSES CUSTOMER TRUST.
`;

// ============================================
// INLINED: WPW Team Config
// ============================================
const WPW_TEAM: Record<string, { name: string; email: string; role: string; phone?: string }> = {
  bulk: { name: 'Jackson', email: 'jackson@weprintwraps.com', role: 'Bulk/Fleet Sales', phone: '+14807726003' },
  design: { name: 'Grant', email: 'grant@weprintwraps.com', role: 'Design Services' },
  quality: { name: 'Trish', email: 'trish@weprintwraps.com', role: 'Quality/Escalations', phone: '+16233135418' },
  support: { name: 'Lance', email: 'lance@weprintwraps.com', role: 'Customer Support' },
};

const SILENT_CC = 'trish@weprintwraps.com';
const ESCALATION_SMS_PHONE = '+14807726003'; // Jackson

function detectEscalation(message: string): string | null {
  const lower = message.toLowerCase();
  if (/\b(bulk|fleet|multiple.*vehicle|[5-9]\d*\s*vehicle|volume|wholesale)\b/i.test(lower)) return 'bulk';
  if (/\b(design|artwork|help.*with.*file|create.*wrap|need.*design)\b/i.test(lower)) return 'design';
  if (/\b(wrong|damaged|issue|problem|complaint|unhappy|angry|disappointed|refund|terrible|awful|unacceptable)\b/i.test(lower)) return 'quality';
  if (/\b(callback|call.*back|phone|speak.*someone|talk.*person|human|manager|supervisor)\b/i.test(lower)) return 'support';
  return null;
}

// Detect unhappy/frustrated customers who need follow-up
function detectUnhappyCustomer(message: string): { isUnhappy: boolean; reason: string } {
  const lower = message.toLowerCase();
  
  const unhappyPatterns = [
    { pattern: /shipping.*(\$\d+|cost|expensive|too much|increased)/i, reason: 'shipping_complaint' },
    { pattern: /price.*(\$\d+|too high|expensive|increased|went up)/i, reason: 'price_complaint' },
    { pattern: /waiting|waited|no response|haven't heard|been \d+ (day|week)/i, reason: 'waiting_complaint' },
    { pattern: /frustrated|angry|upset|disappointed|unhappy/i, reason: 'expressed_frustration' },
    { pattern: /wrong|mistake|error|incorrect|messed up/i, reason: 'order_issue' },
    { pattern: /refund|money back|cancel/i, reason: 'refund_request' },
    { pattern: /used to be|it was|before it was/i, reason: 'price_change_complaint' },
    { pattern: /no way|can't believe|ridiculous/i, reason: 'disbelief_frustration' },
  ];
  
  for (const { pattern, reason } of unhappyPatterns) {
    if (pattern.test(lower)) {
      return { isUnhappy: true, reason };
    }
  }
  
  return { isUnhappy: false, reason: '' };
}

// ============================================
// INLINED: Knowledge Base - ACCURATE PRICING
// ============================================
const WPW_KNOWLEDGE = {
  pricing: `
PRICING (Print-Only - Customer arranges local installation):

PRINTED WRAP FILMS (per square foot):
- Avery MPI 1105 with DOL 1460Z Lamination: $5.27/sqft
- 3M IJ180Cv3 with 8518 Lamination: $5.27/sqft ← SAME PRICE AS AVERY!
- Window Perf 50/50: $5.32/sqft

CUT CONTOUR VINYL (per square foot, weeded & masked):
- Avery Cut Contour: $6.32/sqft
- 3M Cut Contour: $6.92/sqft

FADE WRAPS (Fixed pricing by side length):
- Small sides (up to 144"): $600
- Medium sides (up to 172"): $710
- Large sides (up to 200"): $825
- XL sides (up to 240"): $990
- Add-ons: Hood +$160, Front Bumper +$200, Rear+Bumper +$395, Roof +$160-330

DESIGN SERVICES:
- Full Wrap Custom Design: $750
- 1-Hour Design Fee (color matching, edits): $95
- File Output Fee: $95

BULK/FLEET DISCOUNTS (automatic based on total sqft):
- 500-999 sqft: 5% OFF
- 1000-1499 sqft: 10% OFF
- 1500-2499 sqft: 15% OFF
- 2500+ sqft: 20% OFF

SHIPPING:
- FREE on orders over $750
- Orders over $750: 3 days or less within continental US
- Orders under $750: UPS Ground 2-5 days depending on location
- Add to cart and enter zip for instant shipping price

QUOTE FORMULA:
Price = SQFT × Material Price
Then apply bulk discount if applicable.
Example: 2024 F-150 = 279 sqft × $5.27 = $1,470 (no discount)
Example: 5 vehicles = 1,400 sqft × $5.27 × 0.90 = $6,640 (10% off)
`,

  turnaround: `
TURNAROUND TIMES:
- Print production: 1-2 business days
- Shipping (over $750): 3 days or less
- Shipping (under $750): 2-5 business days (UPS Ground)
- Total typical: 3-5 business days
- Rush available for additional fee

All wraps come:
- Trimmed, paneled and READY TO INSTALL
- Laminated (gloss, matte, or satin - your choice)
- Cut contour orders come weeded, masked, ready to install
`,

  fileUpload: `
FILE UPLOAD & ARTWORK:

UPLOAD OPTIONS:
1. Direct upload: https://weprintwraps.com/pages/upload-artwork
2. Email artwork: hello@weprintwraps.com
3. Design questions: design@weprintwraps.com

FILE REQUIREMENTS:
- Accepted: PDF, AI, EPS files
- NOT accepted: CorelDraw, Microsoft Publisher
- Resolution: Minimum 72 DPI for vehicle wraps
- Color mode: CMYK
- Include bleed

RASTERIZED GRAPHICS: 
- Submit as layered PSD or flattened TIFF
- All files must be CMYK

DOWNSIZED FILES:
- Yes, you can submit scaled-down files
- Note in order if files are scaled
- Remember: 200 DPI at 10% scale = only 20 DPI at full size

FILE REVIEW: FREE for all customers
Not sure if your file is print-ready? Email to hello@weprintwraps.com for free review!

CUSTOM SAMPLES:
- Order as little as 1 sqft to test your design
- No minimums!
`,

  products: `
PRODUCT LINKS (use these EXACT URLs):

PRINTED WRAP FILMS:
- Avery MPI 1105: https://weprintwraps.com/our-products/avery-1105egrs-with-doz13607-lamination/
- 3M IJ180Cv3: https://weprintwraps.com/our-products/3m-ij180-printed-wrap-film/

CUT CONTOUR VINYL:
- Avery Contour: https://weprintwraps.com/our-products/avery-cut-contour-vinyl-graphics-54-roll-max-artwork-size-50/
- 3M Contour: https://weprintwraps.com/our-products/3m-cut-contour-vinyl-graphics-54-roll-max-artwork-size-50/

SPECIALTY PRODUCTS:
- Window Perf 50/50: https://weprintwraps.com/our-products/perforated-window-vinyl-5050-unlaminated/
- Fade Wraps: https://weprintwraps.com/our-products/pre-designed-fade-wraps/
- Wall Wrap: https://weprintwraps.com/our-products/wall-wrap-printed-vinyl/
- Custom Design: https://weprintwraps.com/our-products/custom-wrap-design/
- Pantone Color Chart: https://weprintwraps.com/our-products/pantone-color-chart-30-x-52/

WRAP BY THE YARD ($95.50/yard, 60" wide):
- Wicked Wild: https://weprintwraps.com/our-products/wrap-by-the-yard-wicked-wild-wrap-prints/
- Bape Camo: https://weprintwraps.com/our-products/wrap-by-the-yard-bape-camo/
- Modern Trippy: https://weprintwraps.com/our-products/wrap-by-the-yard-modern-trippy/
- Metal Marble: https://weprintwraps.com/our-products/wrap-by-the-yard-metal-marble/
- Camo Carbon: https://weprintwraps.com/our-products/camo-carbon-wrap-by-the-yard/

OTHER:
- Upload Artwork: https://weprintwraps.com/pages/upload-artwork
- Homepage Quote: https://weprintwraps.com/#quote
- My Account: https://weprintwraps.com/my-account

RESTYLEPRO AI VISUALIZER SUITE (https://restyleproai.com):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RestylePro™ is our AI-powered hyper-realistic vehicle wrap visualization platform.

THE SUITE INCLUDES:
• ColorPro™ - See ANY Avery or 3M color on ANY vehicle instantly
• DesignPanelPro™ - AI-generated custom wrap patterns and designs
• PatternPro™ - Specialty finishes: Chrome, Brushed Metal, Carbon Fiber
• ApprovePro™ - Turn any 2D design into hyper-realistic 3D vehicle renders, generates PDF proofs
• FadeWraps™ - Design custom fade/ombre gradient wraps

Built for: PPF shops, color change wrap specialists, print shops, wrap installers

WHEN TO MENTION RESTYLEPRO:
• Customer asks about color-change wraps → "Check out RestyleProAI.com to visualize any color!"
• Customer is unsure about design → "DesignPanelPro can generate custom patterns"
• Customer wants to see proof before buying → "ApprovePro creates 3D renders for faster approval"
• Customer asks about specialty films → "RestyleProAI.com lets you visualize specialty finishes"
`,

  shipping: `
SHIPPING:
- FREE shipping on orders $750+
- Orders over $750: 3 days or less within continental US
- Orders under $750: UPS Ground 2-5 days
- Get instant shipping price: add to cart, enter zip code
- Ships rolled in heavy-duty tubes
- Ships nationwide to all 50 states
`,

  guarantee: `
PREMIUM WRAP GUARANTEE:
- If wrap has flaws due to print quality or shipping damage, let us know within 7 days
- We will reprint and ship ASAP at no cost
- We do NOT offer refunds, but we back our work
- Damaged in shipping? Email photos + order number immediately
- We can reprint and ship within 1 business day with FREE rush shipping
`,

  specs: `
TECHNICAL SPECS:
- Max print width: 59.5" (using 60" wrap film)
- Inks: HP Latex and Epson Resin (same technology as latex)
- Lamination options: Gloss, Matte, or Satin
- No minimums: Order as little as 1 sqft
- No maximums: 10 sqft to 10,000 sqft - we got you!
`,

  colorMatching: `
CUSTOM COLOR MATCHING:
- Order 1-hour design fee ($95)
- Specify exact color needed
- Ship physical sample to:
  We Print Wraps
  15802 N. Cave Creek Rd. Suite 3
  Phoenix, AZ 85032
`,

  contact: `
CONTACT INFO:
- General: hello@weprintwraps.com
- Design Team: design@weprintwraps.com
- Phone: (833) 335-1382 or 602-595-3200
- Address: 15802 N. Cave Creek Rd. Suite 3, Phoenix, AZ 85032
`
};

// ============================================
// VEHICLE DATABASE - ACCURATE SQFT
// ============================================
const VEHICLE_SQFT: Record<string, { total: number; roof: number; noRoof: number }> = {
  // Sedans
  'civic': { total: 210, roof: 20, noRoof: 190 },
  'accord': { total: 235, roof: 22, noRoof: 213 },
  'camry': { total: 235, roof: 22, noRoof: 213 },
  'corolla': { total: 205, roof: 19, noRoof: 186 },
  'model 3': { total: 225, roof: 21, noRoof: 204 },
  'model s': { total: 255, roof: 24, noRoof: 231 },
  'mustang': { total: 215, roof: 20, noRoof: 195 },
  'charger': { total: 245, roof: 23, noRoof: 222 },
  'challenger': { total: 235, roof: 22, noRoof: 213 },
  'altima': { total: 230, roof: 21, noRoof: 209 },
  'maxima': { total: 240, roof: 22, noRoof: 218 },
  'bmw 3': { total: 220, roof: 20, noRoof: 200 },
  'bmw 5': { total: 245, roof: 23, noRoof: 222 },
  
  // Trucks
  'f-150': { total: 312, roof: 33, noRoof: 279 },
  'f150': { total: 312, roof: 33, noRoof: 279 },
  'f-250': { total: 345, roof: 36, noRoof: 309 },
  'f250': { total: 345, roof: 36, noRoof: 309 },
  'f-350': { total: 365, roof: 38, noRoof: 327 },
  'f350': { total: 365, roof: 38, noRoof: 327 },
  'silverado': { total: 320, roof: 34, noRoof: 286 },
  'silverado 1500': { total: 320, roof: 34, noRoof: 286 },
  'silverado 2500': { total: 350, roof: 37, noRoof: 313 },
  'sierra': { total: 320, roof: 34, noRoof: 286 },
  'sierra 1500': { total: 320, roof: 34, noRoof: 286 },
  'ram': { total: 315, roof: 33, noRoof: 282 },
  'ram 1500': { total: 315, roof: 33, noRoof: 282 },
  'ram 2500': { total: 345, roof: 36, noRoof: 309 },
  'ram 3500': { total: 365, roof: 38, noRoof: 327 },
  'tacoma': { total: 255, roof: 26, noRoof: 229 },
  'tundra': { total: 320, roof: 34, noRoof: 286 },
  'colorado': { total: 260, roof: 27, noRoof: 233 },
  'canyon': { total: 260, roof: 27, noRoof: 233 },
  'ranger': { total: 265, roof: 28, noRoof: 237 },
  'frontier': { total: 258, roof: 27, noRoof: 231 },
  'titan': { total: 325, roof: 35, noRoof: 290 },
  'cybertruck': { total: 330, roof: 35, noRoof: 295 },
  'maverick': { total: 240, roof: 24, noRoof: 216 },
  'ridgeline': { total: 280, roof: 29, noRoof: 251 },
  
  // SUVs
  'model y': { total: 270, roof: 28, noRoof: 242 },
  'model x': { total: 300, roof: 32, noRoof: 268 },
  'tahoe': { total: 340, roof: 36, noRoof: 304 },
  'suburban': { total: 385, roof: 41, noRoof: 344 },
  'yukon': { total: 340, roof: 36, noRoof: 304 },
  'yukon xl': { total: 385, roof: 41, noRoof: 344 },
  'escalade': { total: 355, roof: 38, noRoof: 317 },
  'expedition': { total: 350, roof: 37, noRoof: 313 },
  'explorer': { total: 295, roof: 31, noRoof: 264 },
  'bronco': { total: 275, roof: 28, noRoof: 247 },
  'wrangler': { total: 245, roof: 25, noRoof: 220 },
  'wrangler 4 door': { total: 275, roof: 28, noRoof: 247 },
  'grand cherokee': { total: 285, roof: 30, noRoof: 255 },
  '4runner': { total: 290, roof: 30, noRoof: 260 },
  'highlander': { total: 285, roof: 30, noRoof: 255 },
  'pilot': { total: 295, roof: 31, noRoof: 264 },
  'rav4': { total: 250, roof: 26, noRoof: 224 },
  'cr-v': { total: 250, roof: 26, noRoof: 224 },
  'crv': { total: 250, roof: 26, noRoof: 224 },
  'cx-5': { total: 255, roof: 26, noRoof: 229 },
  'cx5': { total: 255, roof: 26, noRoof: 229 },
  'forester': { total: 260, roof: 27, noRoof: 233 },
  'outback': { total: 275, roof: 28, noRoof: 247 },
  'traverse': { total: 305, roof: 32, noRoof: 273 },
  'equinox': { total: 260, roof: 27, noRoof: 233 },
  'blazer': { total: 280, roof: 29, noRoof: 251 },
  'durango': { total: 305, roof: 32, noRoof: 273 },
  'pathfinder': { total: 295, roof: 31, noRoof: 264 },
  'sequoia': { total: 365, roof: 39, noRoof: 326 },
  'land cruiser': { total: 340, roof: 36, noRoof: 304 },
  'telluride': { total: 310, roof: 33, noRoof: 277 },
  'palisade': { total: 310, roof: 33, noRoof: 277 },
  
  // Vans
  'sprinter': { total: 450, roof: 55, noRoof: 395 },
  'sprinter 144': { total: 400, roof: 48, noRoof: 352 },
  'sprinter 170': { total: 450, roof: 55, noRoof: 395 },
  'transit': { total: 410, roof: 50, noRoof: 360 },
  'transit 130': { total: 370, roof: 44, noRoof: 326 },
  'transit 148': { total: 410, roof: 50, noRoof: 360 },
  'promaster': { total: 430, roof: 52, noRoof: 378 },
  'promaster 136': { total: 380, roof: 46, noRoof: 334 },
  'promaster 159': { total: 430, roof: 52, noRoof: 378 },
  'express': { total: 365, roof: 44, noRoof: 321 },
  'savana': { total: 365, roof: 44, noRoof: 321 },
  'nv': { total: 380, roof: 46, noRoof: 334 },
  'metris': { total: 295, roof: 35, noRoof: 260 },
  'sienna': { total: 290, roof: 34, noRoof: 256 },
  'odyssey': { total: 285, roof: 33, noRoof: 252 },
  'pacifica': { total: 290, roof: 34, noRoof: 256 },
  'carnival': { total: 295, roof: 35, noRoof: 260 },
  
  // Porsche SUVs
  'macan': { total: 265, roof: 27, noRoof: 238 },
  'cayenne': { total: 295, roof: 31, noRoof: 264 },

  // Sports/Coupes
  'corvette': { total: 200, roof: 18, noRoof: 182 },
  'camaro': { total: 210, roof: 19, noRoof: 191 },
  'supra': { total: 205, roof: 18, noRoof: 187 },
  '370z': { total: 195, roof: 17, noRoof: 178 },
  'gt-r': { total: 215, roof: 19, noRoof: 196 },
  'gtr': { total: 215, roof: 19, noRoof: 196 },
  'miata': { total: 165, roof: 14, noRoof: 151 },
  'mx-5': { total: 165, roof: 14, noRoof: 151 },
  '911': { total: 195, roof: 17, noRoof: 178 },
  'cayman': { total: 185, roof: 16, noRoof: 169 },
  'boxster': { total: 180, roof: 15, noRoof: 165 },
  // Malibu - from PVO database
  'malibu': { total: 222, roof: 25, noRoof: 197 },
};

// ============================================
// MAKE ALIASES - Handle common abbreviations
// ============================================
const MAKE_ALIASES: Record<string, string> = {
  'chevy': 'Chevrolet',
  'vw': 'Volkswagen',
  'merc': 'Mercedes-Benz',
  'mercedes': 'Mercedes-Benz',
  'benz': 'Mercedes-Benz',
};

// ============================================
// DATABASE VEHICLE LOOKUP - Uses mighty-vehicle-sqft
// This is the PRIMARY lookup, falls back to VEHICLE_SQFT
// ============================================
interface VehicleLookupResult {
  sqft: number;
  sqftWithRoof: number;
  vehicle: string;
  year?: string;
  roof: number;
  isEstimate?: boolean;
  similarTo?: string;
  source: 'database' | 'local' | 'category_estimate';
}

async function lookupVehicleFromDatabase(
  supabase: SupabaseClient,
  message: string
): Promise<VehicleLookupResult | null> {
  const lower = message.toLowerCase();

  // Try to extract year (4 digit number between 1990-2030)
  const yearMatch = message.match(/\b(19\d{2}|20[0-3]\d)\b/);
  const year = yearMatch ? parseInt(yearMatch[1]) : 2022; // Default to recent year

  // Try to extract make from message
  const makePatterns = /\b(ford|chevy|chevrolet|dodge|ram|toyota|honda|nissan|gmc|jeep|bmw|audi|mercedes|tesla|volkswagen|subaru|mazda|hyundai|kia|lexus|acura|cadillac|buick|lincoln|chrysler|porsche|jaguar|volvo|rivian|lucid|vw|merc|benz)\b/i;
  let makeMatch = message.match(makePatterns);

  // Special case: "911" almost always means Porsche 911
  if (!makeMatch && /\b911\b/i.test(message)) {
    console.log('[JordanLee] Detected 911 - assuming Porsche');
    makeMatch = ['porsche', 'porsche'];
  }

  if (!makeMatch) {
    console.log('[JordanLee] No make found in message');
    return null;
  }

  let make = makeMatch[1];

  // Apply make aliases (Chevy → Chevrolet)
  const normalizedMake = make.toLowerCase();
  if (MAKE_ALIASES[normalizedMake]) {
    make = MAKE_ALIASES[normalizedMake];
    console.log(`[JordanLee] Applied make alias: ${makeMatch[1]} → ${make}`);
  } else {
    // Capitalize first letter
    make = make.charAt(0).toUpperCase() + make.slice(1).toLowerCase();
  }

  // Try to extract model - look for words after the make
  const makeIndex = message.toLowerCase().indexOf(makeMatch[1].toLowerCase());
  const afterMake = message.substring(makeIndex + makeMatch[1].length).trim();
  const modelMatch = afterMake.match(/^[\s,]*([\w\-\s]+?)(?:\s*(\d{4}|\.|,|$))/i);
  let model = modelMatch ? modelMatch[1].trim() : '';

  // Clean up model name
  model = model.replace(/\b(for|the|a|an|in|on|at|to|is|are|my|our|your|this|that|these|those)\b/gi, '').trim();

  // If no model found after make, try BEFORE make (e.g., "911 Porsche")
  if (!model && makeIndex > 0) {
    const beforeMake = message.substring(0, makeIndex).trim();
    const beforeModelMatch = beforeMake.match(/([\w\-\d]+)[\s,]*$/i);
    if (beforeModelMatch) {
      model = beforeModelMatch[1].trim();
      console.log('[JordanLee] Found model BEFORE make:', model);
    }
  }

  if (!model) {
    console.log('[JordanLee] No model found for make:', make);
    return null;
  }

  console.log(`[JordanLee] Attempting database lookup: ${year} ${make} ${model}`);

  try {
    const result = await getVehicleSqFt(supabase, year, make, model);

    if (result) {
      const roofSqft = result.panels?.roof || Math.round(result.sqft * 0.10);
      console.log(`[JordanLee] Database hit: ${make} ${model} = ${result.sqft} sqft total, ${result.defaultWrapSqft} sqft default (no roof)`);

      return {
        sqft: result.defaultWrapSqft,  // CRITICAL: Use defaultWrapSqft (total - roof)
        sqftWithRoof: result.sqft,      // Full total with roof
        vehicle: `${make} ${model}`,
        year: yearMatch ? yearMatch[1] : undefined,
        roof: roofSqft,
        isEstimate: result.source !== 'database',
        source: result.source === 'database' ? 'database' : 'local'
      };
    }
  } catch (err) {
    console.error('[JordanLee] Database lookup error:', err);
  }

  return null;
}

// ============================================
// DETECT IF "FULL WRAP" is mentioned (include roof)
// ============================================
function wantsFullWrap(message: string): boolean {
  const lower = message.toLowerCase();
  return /\b(full wrap|include.*roof|with.*roof|entire vehicle|complete wrap|whole car|whole vehicle)\b/i.test(lower);
}

function findVehicleSqft(message: string): { sqft: number; sqftWithRoof: number; vehicle: string; year?: string; roof: number; isEstimate?: boolean; similarTo?: string } | null {
  const lower = message.toLowerCase();
  
  // Try to extract year (4 digit number between 1990-2030)
  const yearMatch = message.match(/\b(19\d{2}|20[0-3]\d)\b/);
  const year = yearMatch ? yearMatch[1] : undefined;
  
  // First try exact match
  for (const [vehicle, data] of Object.entries(VEHICLE_SQFT)) {
    const variations = [vehicle, vehicle.replace('-', ' '), vehicle.replace('-', ''), vehicle.replace(' ', '-')];
    for (const v of variations) {
      if (lower.includes(v)) {
        const displayName = vehicle.split(/[-\s]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        return { 
          sqft: data.noRoof, 
          sqftWithRoof: data.total, 
          vehicle: displayName, 
          year,
          roof: data.roof,
          isEstimate: false
        };
      }
    }
  }
  
  // FALLBACK: Estimate based on vehicle category
  const categoryEstimates: Record<string, { sqft: number; roof: number; total: number; example: string }> = {
    // Sedans/Cars
    'sedan': { sqft: 210, roof: 20, total: 230, example: 'Camry/Accord' },
    'coupe': { sqft: 195, roof: 18, total: 213, example: 'Mustang/Camaro' },
    'hatchback': { sqft: 190, roof: 18, total: 208, example: 'Golf/Civic' },
    'sports car': { sqft: 185, roof: 17, total: 202, example: 'Corvette/911' },
    'luxury sedan': { sqft: 240, roof: 23, total: 263, example: 'BMW 5/Mercedes E' },
    'compact': { sqft: 185, roof: 17, total: 202, example: 'Civic/Corolla' },
    'midsize': { sqft: 220, roof: 21, total: 241, example: 'Camry/Accord' },
    'full size sedan': { sqft: 245, roof: 23, total: 268, example: 'Charger/Maxima' },
    
    // Trucks
    'truck': { sqft: 290, roof: 31, total: 321, example: 'F-150/Silverado' },
    'pickup': { sqft: 290, roof: 31, total: 321, example: 'F-150/Silverado' },
    'half ton': { sqft: 290, roof: 31, total: 321, example: 'F-150/Silverado' },
    'full size truck': { sqft: 310, roof: 33, total: 343, example: 'F-150/Silverado' },
    'mid size truck': { sqft: 255, roof: 26, total: 281, example: 'Tacoma/Colorado' },
    'heavy duty': { sqft: 350, roof: 37, total: 387, example: 'F-250/2500' },
    
    // SUVs
    'suv': { sqft: 270, roof: 28, total: 298, example: 'Explorer/4Runner' },
    'crossover': { sqft: 250, roof: 26, total: 276, example: 'RAV4/CR-V' },
    'compact suv': { sqft: 245, roof: 25, total: 270, example: 'RAV4/CX-5' },
    'midsize suv': { sqft: 285, roof: 30, total: 315, example: 'Explorer/4Runner' },
    'full size suv': { sqft: 340, roof: 36, total: 376, example: 'Tahoe/Expedition' },
    'large suv': { sqft: 340, roof: 36, total: 376, example: 'Tahoe/Suburban' },
    
    // Vans
    'van': { sqft: 360, roof: 43, total: 403, example: 'Transit/Sprinter' },
    'cargo van': { sqft: 380, roof: 46, total: 426, example: 'Transit/ProMaster' },
    'minivan': { sqft: 285, roof: 33, total: 318, example: 'Sienna/Odyssey' },
    'work van': { sqft: 365, roof: 44, total: 409, example: 'Express/Savana' },
    'passenger van': { sqft: 370, roof: 45, total: 415, example: 'Transit/Sprinter' },
    
    // Generic
    'car': { sqft: 210, roof: 20, total: 230, example: 'Average sedan' },
    'vehicle': { sqft: 250, roof: 25, total: 275, example: 'Average vehicle' },
  };
  
  // Check for category matches
  for (const [category, data] of Object.entries(categoryEstimates)) {
    if (lower.includes(category)) {
      // Try to extract a make/model name from the message for display
      const makeMatch = message.match(/\b(ford|chevy|chevrolet|dodge|ram|toyota|honda|nissan|gmc|jeep|bmw|audi|mercedes|tesla|volkswagen|subaru|mazda|hyundai|kia|lexus|acura|cadillac|buick|lincoln|chrysler|porsche|jaguar|volvo|rivian|lucid)\b/i);
      const make = makeMatch ? makeMatch[1] : '';
      
      return {
        sqft: data.sqft,
        sqftWithRoof: data.total,
        vehicle: make ? `${make} ${category}` : category,
        year,
        roof: data.roof,
        isEstimate: true,
        similarTo: data.example
      };
    }
  }
  
  return null;
}

// ============================================
// BULK DISCOUNT CALCULATOR
// ============================================
function calculateBulkDiscount(totalSqft: number): { discount: number; discountPercent: string; tier: string } {
  if (totalSqft >= 2500) {
    return { discount: 0.20, discountPercent: '20%', tier: '2500+ sqft' };
  } else if (totalSqft >= 1500) {
    return { discount: 0.15, discountPercent: '15%', tier: '1500-2499 sqft' };
  } else if (totalSqft >= 1000) {
    return { discount: 0.10, discountPercent: '10%', tier: '1000-1499 sqft' };
  } else if (totalSqft >= 500) {
    return { discount: 0.05, discountPercent: '5%', tier: '500-999 sqft' };
  }
  return { discount: 0, discountPercent: '0%', tier: 'under 500 sqft' };
}

// ============================================
// JORDAN'S PERSONA - WITH CRITICAL RULES
// ============================================
const JORDAN_PERSONA = `You are Jordan, customer service at WePrintWraps.

VOICE - Sound like texting a coworker:
- Short sentences
- "For sure" not "Absolutely, I'd be happy to help"
- "Nice!" not "Great choice!"
- "Hit me up" not "Please don't hesitate to reach out"
- "What's your email?" not "Could you please provide your email address?"
- NO corporate speak, NO robotic language
- NO emojis except maybe 📧 when sending quote
- 1-3 sentences max per response

FLOW (SKIP steps if info already provided in CUSTOMER STATE below):
1. If name is ❌ NOT CAPTURED → "For sure! What's your name?"
2. If name captured but no vehicle → "Hey [name]! What are you looking to wrap?"
3. If vehicle captured but email is ❌ NOT CAPTURED → "Nice! What's your email? I'll get you a quote."
4. If name + email + vehicle all captured → Give price immediately! Then ask for shop name and phone.
5. After quote sent → "Done! Quote's in your inbox. Hit me up if you need anything!"

IMPORTANT: If name AND email are already in CUSTOMER STATE, SKIP straight to helping with their question!

PRICE FORMAT - CRITICAL:
Always clearly state whether roof is included or excluded!

DEFAULT (excludes roof):
"[Vehicle] wrap is **$[PRICE]** ([SQFT] sqft - excludes roof).
Want the full wrap including roof? That's **$[FULL_PRICE]** ([FULL_SQFT] sqft).

Order here: https://weprintwraps.com/our-products/avery-1105egrs-with-doz13607-lamination/"

FULL WRAP (includes roof):
"[Vehicle] FULL wrap including roof is **$[PRICE]** ([SQFT] sqft).

Order here: https://weprintwraps.com/our-products/avery-1105egrs-with-doz13607-lamination/"

ALWAYS mention:
- The sqft being quoted
- Whether roof is included or excluded
- Offer the alternative option

RULES:
- We PRINT and SHIP only - no installation
- $5.27/sqft for Avery and 3M (same price)
- Free shipping over $750
- File upload: https://weprintwraps.com/pages/upload-artwork
- Keep it short and casual
`;

// ============================================
// MAIN HANDLER
// ============================================
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { org, agent, mode, session_id, message_text, page_url, referrer, geo, attachments, customer_name, customer_email } = await req.json();

    if (!message_text || !session_id) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Handle attachments if present
    let attachmentContext = '';
    if (attachments && attachments.length > 0) {
      console.log('[JordanLee] Attachments received:', attachments.length);
      attachmentContext = `\n\n📎 CUSTOMER ATTACHED FILE(S):\n`;
      for (const att of attachments) {
        const isImage = att.type?.startsWith('image/');
        attachmentContext += `- ${att.name} (${att.type || 'unknown type'})\n`;
        attachmentContext += `  URL: ${att.url}\n`;
        if (isImage) {
          attachmentContext += `  (This is an image - you can reference it in your response)\n`;
        }
      }
      attachmentContext += `\nAcknowledge you received the file and ask how you can help with it.`;
    }

    console.log('[JordanLee] Message:', { session_id, message_text: message_text.substring(0, 50), hasAttachments: !!(attachments?.length) });

    // Initialize Supabase
    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL') || Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get or create conversation
    let conversationId: string;
    let chatState: Record<string, any> = { stage: 'initial' };

    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id, chat_state')
      .eq('metadata->>session_id', session_id)
      .single();

    if (existingConv) {
      conversationId = existingConv.id;
      chatState = existingConv.chat_state || { stage: 'initial' };
      // Pre-populate with onboarding data if provided and not already set
      if (customer_name && !chatState.customer_name) chatState.customer_name = customer_name;
      if (customer_email && !chatState.customer_email) chatState.customer_email = customer_email;
      // DEBUG: Log chatState persistence
      console.log('[JordanLee] Session:', { session_id, found: true });
      console.log('[JordanLee] Loaded state:', JSON.stringify(chatState));
    } else {
      console.log('[JordanLee] Session:', { session_id, found: false });
      // Pre-populate chatState with onboarding data if provided
      if (customer_name) chatState.customer_name = customer_name;
      if (customer_email) chatState.customer_email = customer_email;

      const { data: newConv, error: convError } = await supabase
        .from('conversations')
        .insert({
          channel: 'website',
          status: 'active',
          organization_id: '51aa96db-c06d-41ae-b3cb-25b045c75caf', // FIXED: Correct WPW org ID
          metadata: { session_id, page_url, referrer, geo },
          chat_state: chatState
        })
        .select('id')
        .single();

      if (convError || !newConv?.id) {
        console.error('[JordanLee] Failed to create conversation:', convError);
        return new Response(JSON.stringify({
          error: 'Failed to create conversation',
          reply: 'Sorry, I encountered a technical issue. Please try again in a moment.'
        }), { status: 500, headers: corsHeaders });
      }
      conversationId = newConv.id;
    }

    // Save inbound message with attachments - WITH ERROR HANDLING
    const messageMetadata: Record<string, any> = { session_id };
    if (attachments?.length) {
      messageMetadata.attachments = attachments;
    }

    const { error: inboundMsgError } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      channel: 'website',
      direction: 'inbound',
      content: message_text,
      metadata: messageMetadata
    });

    if (inboundMsgError) {
      console.error('[JordanLee] CRITICAL: Failed to save inbound message:', inboundMsgError);
    } else {
      console.log('[JordanLee] Inbound message saved for conversation:', conversationId);
    }

    // Extract info from message
    const msg = message_text.toLowerCase();

    // FIRST: Try database lookup (uses mighty-vehicle-sqft with full 1664 vehicles)
    let vehicleInfo = await lookupVehicleFromDatabase(supabase, message_text);

    // FALLBACK: Use local findVehicleSqft if database lookup failed
    if (!vehicleInfo) {
      const localVehicleInfo = findVehicleSqft(message_text);
      if (localVehicleInfo) {
        vehicleInfo = { ...localVehicleInfo, source: 'local' as const };
      }
    }

    // Check if customer wants full wrap (include roof)
    const includeRoof = wantsFullWrap(message_text);
    if (vehicleInfo && includeRoof) {
      console.log('[JordanLee] Customer requested FULL WRAP - using total sqft with roof');
      vehicleInfo.sqft = vehicleInfo.sqftWithRoof; // Override to use full sqft
    }

    const emailMatch = message_text.match(/[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}/i);
    const email = emailMatch ? emailMatch[0].toLowerCase() : null;
    
    // Extract name - multiple patterns
    let name: string | null = null;
    const namePatterns = [
      /(?:my name is|i'm|i am|this is|call me|it's|its)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /^([A-Z][a-z]+\s+[A-Z][a-z]+)$/,
      /([A-Z][A-Z]?[a-z]*\s+[A-Z][a-z]+)\s+[\w.-]+@/i,
    ];
    for (const pattern of namePatterns) {
      const match = message_text.match(pattern);
      if (match) {
        name = match[1].trim();
        break;
      }
    }
    
    if (!name && email) {
      const beforeEmail = message_text.split(email)[0].trim();
      const lastWords = beforeEmail.split(/\s+/).slice(-2).join(' ');
      if (/^[A-Z][A-Za-z]*\s+[A-Z][A-Za-z]+$/.test(lastWords)) {
        name = lastWords;
      }
    }
    
    const dimensionMatch = message_text.match(/(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')?\s*(?:by|x|×)\s*(\d+(?:\.\d+)?)/i);
    const phoneMatch = message_text.match(/(?:\+?1[-.\s]?)?(?:\(?(\d{3})\)?[-.\s]?)?(\d{3})[-.\s]?(\d{4})/);
    const phone = phoneMatch ? phoneMatch[0].replace(/[^\d+]/g, '') : null;
    
    const vehicleCountMatch = message_text.match(/(\d+)\s*(?:vehicle|truck|van|car|fleet|wrap)/i);
    const bulkVehicleCount = vehicleCountMatch ? parseInt(vehicleCountMatch[1]) : null;
    const vehicleTypesMatch = message_text.match(/\b(truck|van|car|suv|sedan|pickup|sprinter|transit|f-?150|f-?250|silverado|ram|fleet)\b/gi);
    const bulkVehicleTypes = vehicleTypesMatch ? [...new Set(vehicleTypesMatch.map((v: string) => v.toLowerCase()))].join(', ') : null;

    // ============================================
    // VEHICLE CONTEXT RESET - AGGRESSIVE
    // ALWAYS clear and overwrite when user mentions ANY vehicle.
    // This prevents old vehicle data from bleeding into new conversations.
    // ============================================
    if (vehicleInfo) {
      console.log('[JordanLee] Vehicle detected, CLEARING all old vehicle data. New vehicle:', vehicleInfo.vehicle);

      // ALWAYS clear ALL previous vehicle-specific data (keep profile: name, email, phone, shop)
      delete chatState.sqft;
      delete chatState.sqftWithRoof;
      delete chatState.roofSqft;
      delete chatState.is_estimate;
      delete chatState.similar_to;
      delete chatState.vehicle_year;
      delete chatState.quote_created;
      delete chatState.quote_id;
      delete chatState.quote_number;
      delete chatState.price_given;
      delete chatState.quoted_price;
      delete chatState.quote_sent;
      delete chatState.awaiting_trailer_dimensions;
      delete chatState.trailer_dimensions;
      delete chatState.window_type_clarified;
      delete chatState.dimensions;
      delete chatState.from_dimensions;
      delete chatState.stage; // Reset stage to start fresh quote flow

      // Set NEW vehicle data
      chatState.vehicle = vehicleInfo.vehicle;
      chatState.sqft = vehicleInfo.sqft;
      chatState.sqftWithRoof = vehicleInfo.sqftWithRoof;
      chatState.roofSqft = vehicleInfo.roof;
      chatState.is_estimate = vehicleInfo.isEstimate || false;
      chatState.similar_to = vehicleInfo.similarTo || '';
      chatState.stage = 'vehicle_captured'; // Fresh stage
      if (vehicleInfo.year) chatState.vehicle_year = vehicleInfo.year;
    }
    if (dimensionMatch) {
      const w = parseFloat(dimensionMatch[1]);
      const h = parseFloat(dimensionMatch[2]);
      chatState.sqft = w * h;
      chatState.dimensions = { width: w, height: h };
    }
    if (email) chatState.customer_email = email;
    if (name) chatState.customer_name = name;
    if (phone) chatState.customer_phone = phone;
    if (bulkVehicleCount) chatState.bulk_vehicle_count = bulkVehicleCount;
    if (bulkVehicleTypes) chatState.bulk_vehicle_types = bulkVehicleTypes;
    
    // Extract shop/company name
    const shopPatterns = [
      /(?:shop|company|business|from|with|at)\s+(?:is\s+)?([A-Z][A-Za-z0-9\s&'.-]+(?:wraps?|graphics?|signs?|print|design|auto|customs?|llc|inc)?)/i,
      /([A-Z][A-Za-z0-9\s&'.-]+(?:Wraps?|Graphics?|Signs?|Print|Design|Auto|Customs?|LLC|Inc))/,
    ];
    let shopName: string | null = null;
    for (const pattern of shopPatterns) {
      const match = message_text.match(pattern);
      if (match && match[1].length > 2 && match[1].length < 50) {
        shopName = match[1].trim();
        break;
      }
    }
    if (shopName) chatState.shop_name = shopName;

    // ============================================
    // PRODUCT DETECTION - All 23 WPW Products
    // ============================================
    const WPW_PRODUCTS = {
      // PRINTED WRAP FILMS (per sqft)
      avery_wrap: { id: 79, name: 'Avery MPI 1105 with DOL 1460Z', price: 5.27, type: 'per_sqft', pattern: /\b(avery|mpi\s*1105|avery\s*mpi|1105)\b/i },
      threem_wrap: { id: 72, name: '3M IJ180Cv3 with 8518', price: 5.27, type: 'per_sqft', pattern: /\b(3m|three\s*m|ij180|180cv3)\b/i },

      // CONTOUR CUT (per sqft)
      avery_contour: { id: 108, name: 'Avery Contour-Cut', price: 6.32, type: 'per_sqft', pattern: /\b(avery\s*contour|contour\s*cut\s*avery)\b/i },
      threem_contour: { id: 19420, name: '3M Contour-Cut', price: 6.92, type: 'per_sqft', pattern: /\b(3m\s*contour|contour\s*cut\s*3m)\b/i },

      // SPECIALTY (per sqft or flat)
      window_perf: { id: 80, name: 'Perforated Window Vinyl 50/50', price: 5.95, type: 'per_sqft', pattern: /\b(window\s*perf|perforated|perf\s*vinyl|50\s*50)\b/i },
      fadewraps: { id: 58391, name: 'FadeWraps Pre-Designed', price: 600, type: 'flat', pattern: /\b(fade\s*wrap|fadewrap|fade\s*graphics)\b/i },
      inkfusion: { id: 69439, name: 'InkFusion Premium', price: 2075, type: 'flat', pattern: /\b(inkfusion|ink\s*fusion)\b/i },
      wall_wrap: { id: 70093, name: 'Wall Wrap Printed Vinyl', price: 3.25, type: 'per_sqft', pattern: /\b(wall\s*wrap|wall\s*vinyl|wall\s*graphic)\b/i },

      // WRAP BY THE YARD (flat per yard)
      camo_carbon: { id: 1726, name: 'Camo & Carbon', price: 95.50, type: 'per_yard', pattern: /\b(camo\s*carbon|camo\s*&\s*carbon)\b/i },
      metal_marble: { id: 39698, name: 'Metal & Marble', price: 95.50, type: 'per_yard', pattern: /\b(metal\s*marble|metal\s*&\s*marble|marble\s*metal)\b/i },
      wicked_wild: { id: 4181, name: 'Wicked & Wild', price: 95.50, type: 'per_yard', pattern: /\b(wicked\s*wild|wicked\s*&\s*wild)\b/i },
      bape_camo: { id: 42809, name: 'Bape Camo', price: 95.50, type: 'per_yard', pattern: /\b(bape|bape\s*camo)\b/i },
      modern_trippy: { id: 52489, name: 'Modern & Trippy', price: 95.50, type: 'per_yard', pattern: /\b(modern\s*trippy|trippy|modern\s*&\s*trippy)\b/i },

      // DESIGN SERVICES (flat)
      custom_design: { id: 234, name: 'Custom Vehicle Wrap Design', price: 750, type: 'flat', pattern: /\b(custom\s*design|full\s*design|design\s*service|need\s*design)\b/i },
      design_copy: { id: 58160, name: 'Custom Design (Copy/Draft)', price: 500, type: 'flat', pattern: /\b(copy\s*draft|design\s*copy|draft\s*design)\b/i },

      // SAMPLE BOOKS (flat)
      pantone: { id: 15192, name: 'Pantone Color Chart', price: 42, type: 'flat', pattern: /\b(pantone|color\s*chart)\b/i },
      camo_sample: { id: 475, name: 'Camo & Carbon Sample Book', price: 26.50, type: 'flat', pattern: /\b(camo\s*sample|camo\s*swatch)\b/i },
      marble_sample: { id: 39628, name: 'Marble & Metals Swatch Book', price: 26.50, type: 'flat', pattern: /\b(marble\s*sample|marble\s*swatch|metal\s*sample)\b/i },
      wicked_sample: { id: 4179, name: 'Wicked & Wild Swatch Book', price: 26.50, type: 'flat', pattern: /\b(wicked\s*sample|wicked\s*swatch|wild\s*sample)\b/i },

      // PRINT PRODUCTION PACKS (flat)
      pack_small: { id: 69664, name: 'Small Print Production Pack', price: 299, type: 'flat', pattern: /\b(small\s*pack|small\s*production)\b/i },
      pack_medium: { id: 69671, name: 'Medium Print Production Pack', price: 499, type: 'flat', pattern: /\b(medium\s*pack|medium\s*production)\b/i },
      pack_large: { id: 69680, name: 'Large Print Production Pack', price: 699, type: 'flat', pattern: /\b(large\s*pack|large\s*production)\b/i },
      pack_xlarge: { id: 69686, name: 'XLarge Print Production Pack', price: 899, type: 'flat', pattern: /\b(xlarge\s*pack|xl\s*pack|xlarge\s*production)\b/i },
    };

    // Detect product from message
    let detectedProduct = null;
    for (const [key, product] of Object.entries(WPW_PRODUCTS)) {
      if (product.pattern.test(msg)) {
        detectedProduct = { key, ...product };
        break;
      }
    }

    // Update chatState with detected product
    if (detectedProduct && !chatState.product_locked) {
      chatState.product_key = detectedProduct.key;
      chatState.product_id = detectedProduct.id;
      chatState.product_name = detectedProduct.name;
      chatState.product_price = detectedProduct.price;
      chatState.product_type = detectedProduct.type;
      console.log('[JordanLee] Product detected:', detectedProduct.name, '- $' + detectedProduct.price);
    }

    // Default to Avery printed wrap if no product specified
    if (!chatState.product_name) {
      chatState.product_key = 'avery_wrap';
      chatState.product_id = 79;
      chatState.product_name = 'Avery MPI 1105 with DOL 1460Z';
      chatState.product_price = 5.27;
      chatState.product_type = 'per_sqft';
    }

    // ============================================
    // DESIGN SERVICE QUESTION
    // ============================================
    const isDesignQuestion = /\b(design|custom design|need.*design|create.*wrap|don't have.*art|no.*artwork|design.*service)\b/i.test(msg);
    
    // ============================================
    // DIMENSION-BASED PRICING (sqft from dimensions)
    // ============================================
    if (dimensionMatch && !chatState.sqft) {
      const width = parseFloat(dimensionMatch[1]);
      const height = parseFloat(dimensionMatch[2]);
      const sqft = Math.round(width * height);
      chatState.sqft = sqft;
      chatState.dimensions = { width, height };
      chatState.from_dimensions = true;
      console.log('[JordanLee] Calculated sqft from dimensions:', sqft);
    }

    // ============================================
    // TRAILER DETECTION - Ask for dimensions
    // ============================================
    const isTrailerQuestion = /\b(trailer|enclosed|cargo trailer|box trailer|utility trailer|horse trailer|boat|rv|camper|motorhome)\b/i.test(msg);
    
    // ============================================
    // WINDOW PRODUCT CLARIFICATION
    // ============================================
    const isWindowQuestion = /\b(window|windows|glass|rear window|back window|side window)\b/i.test(msg);
    
    // ============================================
    // FADE WRAP DETECTION
    // ============================================
    const isFadeWrapQuestion = /\b(fade|gradient|ombre|faded|color fade)\b/i.test(msg);

    // ============================================
    // RESTYLEPRO AI DETECTION
    // ============================================
    const isRestyleProQuestion = /\b(restyle|restylepro|colorpro|designpanel|patternpro|approvepro|visualize|visualizer|see.*color|preview.*wrap|3d.*proof|color.*change.*visualize)\b/i.test(msg);

    // ============================================
    // WRAP BY THE YARD DETECTION
    // ============================================
    const isWrapByYardQuestion = /\b(wrap.*yard|by.*yard|yard.*wrap|camo|carbon fiber|pattern|bape|trippy|metal.*marble|wicked.*wild)\b/i.test(msg);

    // ============================================
    // PANEL / CUT CONTOUR DETECTION - Ask for dimensions
    // ============================================
    const isPanelOrCutQuestion = /\b(panel|cut|contour|decal|lettering|logo|graphics|sticker|sign|banner|door|bumper)\b/i.test(msg);

    // ============================================
    // INSTALLATION QUESTION DETECTION - CRITICAL
    // ============================================
    const installationPatterns = /\b(install|installation|installer|put on|apply|wrap my|come to|visit|service area|mobile|in person)\b/i;
    const isInstallationQuestion = installationPatterns.test(msg);

    // Check for escalation
    let escalationType = detectEscalation(message_text);
    
    if (/\b(manager|supervisor|speak.*someone|talk.*person|human|real person|call.*back|callback)\b/i.test(msg)) {
      escalationType = 'support';
    }

    // Build context for AI
    let contextNotes = '';
    // Use detected product price, default to Avery MPI 1105 at $5.27
    const pricePerSqft = chatState.product_type === 'per_sqft' ? chatState.product_price : 5.27;
    const productName = chatState.product_name || 'Avery MPI 1105 with DOL 1460Z';

    // ============================================
    // HANDLE INSTALLATION QUESTION FIRST
    // ============================================
    if (isInstallationQuestion) {
      contextNotes = `🚨 INSTALLATION QUESTION DETECTED!

THE CUSTOMER ASKED ABOUT INSTALLATION.

YOUR RESPONSE MUST BE:
"No, we're a print shop - we print and ship vehicle wraps, but we don't do installation. You'll need a local installer to apply the wrap. I can help you find one in your area if you'd like! 

Want me to get you a quote on the printed wrap material?"

CRITICAL: Do NOT say we offer installation. We are PRINT ONLY.`;
    }
    // ============================================
    // HANDLE TRAILER - Ask for dimensions
    // ============================================
    else if (isTrailerQuestion && !chatState.trailer_dimensions) {
      contextNotes = `🚛 TRAILER/LARGE FORMAT DETECTED!

Customer is asking about: trailer, RV, camper, or similar

We need DIMENSIONS to quote trailers (not in our standard database).

SAY: "Nice! For trailers and large format projects, I'll need the dimensions to get you an accurate quote.

What are the dimensions? (length x height of each side you want wrapped)

For example: '20ft long x 8ft tall' for the sides"

After getting dimensions, calculate: length × height = sqft per side
Then multiply by number of sides they want wrapped.
Price at $${pricePerSqft}/sqft for ${productName}.`;
      
      chatState.awaiting_trailer_dimensions = true;
    }
    // ============================================
    // HANDLE WINDOW QUESTION - Clarify product type
    // ============================================
    else if (isWindowQuestion && !chatState.window_type_clarified) {
      contextNotes = `🪟 WINDOW QUESTION DETECTED!

Customer asked about windows. We have TWO window products - need to clarify!

SAY: "Great question! We have two options for windows:

1️⃣ **Perforated Window Vinyl (Window Perf)** - $5.32/sqft
   - See-through from inside, graphics visible outside
   - Perfect for rear windows, storefronts
   - Order here: https://weprintwraps.com/our-products/perforated-window-vinyl-5050-unlaminated/

2️⃣ **Cut Vinyl Graphics** - $6.32/sqft (Avery) or $6.92/sqft (3M)
   - Solid vinyl letters/logos
   - NOT see-through
   - Order here: https://weprintwraps.com/our-products/avery-cut-contour-vinyl-graphics-54-roll-max-artwork-size-50/

Which one are you looking for?"

IMPORTANT: Get their choice before quoting!`;
      
      chatState.window_type_clarified = true;
    }
    // ============================================
    // HANDLE FADE WRAP - Give pricing + URL
    // ============================================
    else if (isFadeWrapQuestion) {
      contextNotes = `🌈 FADE WRAP QUESTION!

ALWAYS include the product URL!

SAY: "Fade wraps look amazing! 🔥 Here's our pricing:

**Fade Wrap Pricing (by side length):**
- Small (up to 144"): **$600**
- Medium (up to 172"): **$710**
- Large (up to 200"): **$825**
- XL (up to 240"): **$990**

**Add-ons:**
- Hood: +$160
- Front Bumper: +$200
- Rear + Bumper: +$395
- Roof: +$160-330

👉 **Order here:** https://weprintwraps.com/our-products/pre-designed-fade-wraps/

What vehicle are you looking to fade wrap? I'll recommend the right size!"

THEN collect: name, email, phone, shop name before finalizing.`; 
    }
    // ============================================
    // HANDLE RESTYLEPRO AI QUESTION
    // ============================================
    else if (isRestyleProQuestion) {
      contextNotes = `🎨 RESTYLEPRO AI QUESTION!

SAY: "RestylePro™ is our hyper-realistic vehicle wrap visualizer suite! 🚗✨

**The Suite Includes:**
• **ColorPro™** - See any Avery or 3M color on your vehicle instantly
• **DesignPanelPro™** - AI-generated custom wrap patterns
• **PatternPro™** - Specialty finishes (chrome, brushed metal, carbon fiber)
• **ApprovePro™** - Turn 2D designs into 3D proofs for faster customer approval
• **FadeWraps™** - Design gradient/ombre wraps

👉 **Try it free:** https://restyleproai.com

It's built for wrap shops, PPF installers, and color-change specialists.

Want me to explain how any of these tools work? Or I can help you with a quote for printed wrap material!"`;
    }
    // ============================================
    // HANDLE WRAP BY THE YARD QUESTION
    // ============================================
    else if (isWrapByYardQuestion) {
      contextNotes = `📏 WRAP BY THE YARD QUESTION!

ALWAYS provide pricing and URLs!

SAY: "We have Wrap By The Yard - perfect for custom projects! 🎨

**Pricing: $95.50 per yard** (60" wide)

**Collections:**
• Camo & Carbon: https://weprintwraps.com/our-products/camo-carbon-wrap-by-the-yard/
• Metal & Marble: https://weprintwraps.com/our-products/wrap-by-the-yard-metal-marble/
• Wicked & Wild: https://weprintwraps.com/our-products/wrap-by-the-yard-wicked-wild-wrap-prints/
• Bape Camo: https://weprintwraps.com/our-products/wrap-by-the-yard-bape-camo/
• Modern & Trippy: https://weprintwraps.com/our-products/wrap-by-the-yard-modern-trippy/

**Yard options:** 1, 5, 10, 25, or 50 yards

How many yards do you need? I can get you a quick quote!"`;
    }
    // ============================================
    // HANDLE PANEL / CUT CONTOUR - Need dimensions
    // ============================================
    else if (isPanelOrCutQuestion && !chatState.dimensions && !chatState.sqft) {
      contextNotes = `📐 PANEL/CUT VINYL QUESTION - NEED DIMENSIONS!

Customer asked about panels, cut vinyl, decals, logos, or graphics.
We need DIMENSIONS to quote!

SAY: "For panels and cut vinyl, I price by square foot! 

**Cut Contour Pricing:**
- Avery Cut Contour: **$6.32/sqft** (weeded & masked)
- 3M Cut Contour: **$6.92/sqft** (weeded & masked)

👉 Order: https://weprintwraps.com/our-products/avery-cut-contour-vinyl-graphics-54-roll-max-artwork-size-50/

What are the dimensions? (width x height in inches or feet)

For example: '24 x 36 inches' or '4ft x 8ft'"`;
    }
    // ============================================
    // HANDLE DESIGN SERVICE QUESTION
    // ============================================
    else if (isDesignQuestion) {
      contextNotes = `🎨 DESIGN SERVICE QUESTION!

ALWAYS provide pricing and URL!

SAY: "Yes! We offer custom wrap design services! 🎨

**Design Pricing:**
- **Full Wrap Custom Design: $750**
- 1-Hour Design Fee (edits, color matching): $95
- File Output Fee: $95

👉 **Order design here:** https://weprintwraps.com/our-products/custom-wrap-design/

Our design team can create a complete custom wrap for your vehicle. Turn around is typically 3-5 business days for the design.

Have design questions? Email design@weprintwraps.com

What vehicle would you like designed? I can get you a total quote for design + print!"

Then collect: name, email, phone, shop name.`;
    }
    // ============================================
    // HANDLE BULK/FLEET DISCOUNT QUESTION
    // ============================================
    else if (/\b(bulk|fleet|discount|volume|wholesale|multiple.*vehicle|[3-9]\d*\s*vehicle|\d{2,}\s*vehicle)\b/i.test(msg) && !escalationType) {
      contextNotes = `🚛 BULK/FLEET DISCOUNT QUESTION!

ALWAYS show the discount tiers!

SAY: "Great news - we have automatic bulk discounts! 🎉

**Fleet/Bulk Discounts (by total sqft):**
- 500-999 sqft: **5% OFF**
- 1,000-1,499 sqft: **10% OFF**
- 1,500-2,499 sqft: **15% OFF**
- 2,500+ sqft: **20% OFF**

For example:
- 5 trucks (~1,400 sqft) = 10% off = ~$6,640 instead of $7,378
- 10 vans (~3,600 sqft) = 20% off = ~$15,177 instead of $18,972

Want me to calculate your fleet quote? Just tell me:
- How many vehicles?
- What types? (trucks, vans, cars)

I'll get you the exact price with your discount!"

Then collect: name, email, phone, shop name.`;
    }
    // ============================================
    // HANDLE FILE UPLOAD QUESTION
    // ============================================
    else if (/\b(upload|send.*file|artwork|check.*art|file.*review|send.*design)\b/i.test(msg)) {
      contextNotes = `📁 FILE UPLOAD QUESTION

Customer wants to upload artwork or have it reviewed.

YOUR RESPONSE MUST INCLUDE THE DIRECT LINK:
"You can upload your artwork here: https://weprintwraps.com/pages/upload-artwork

Or email it to hello@weprintwraps.com - we offer FREE file review!

Want me to get you a quote while you send the file over?"

DO NOT say "Grant will reach out" - give the link directly!`;
    }
    // Handle escalations - use array to track multiple escalation types
    else if (escalationType && !chatState.escalations_sent?.includes(escalationType)) {
      const teamMember = WPW_TEAM[escalationType];
      
      // Log escalation
      try {
        await supabase.from('conversation_events').insert({
          conversation_id: conversationId,
          organization_id: '51aa96db-c06d-41ae-b3cb-25b045c75caf', // FIXED: Correct WPW org ID
          event_type: 'escalation',
          event_subtype: escalationType,
          actor: 'jordan_agent',
          metadata: {
            reason: escalationType,
            trigger_message: message_text.substring(0, 500),
            customer_email: chatState.customer_email || null,
            customer_name: chatState.customer_name || null,
            customer_phone: chatState.customer_phone || null,
            routed_to: teamMember.email
          }
        });
      } catch (e) {
        console.error('[JordanLee] Failed to log escalation:', e);
      }
      
      // For BULK orders - collect contact info FIRST
      if (escalationType === 'bulk' && !chatState.bulk_info_collected) {
        const hasContactInfo = chatState.customer_name && chatState.customer_email && chatState.customer_phone;
        
        if (!hasContactInfo) {
          const missingContact = [];
          if (!chatState.customer_name) missingContact.push('name');
          if (!chatState.customer_email) missingContact.push('email');
          if (!chatState.customer_phone) missingContact.push('phone');
          
          contextNotes = `🚛 BULK/FLEET INQUIRY - GET CONTACT INFO FIRST!

BEFORE discussing fleet details, you MUST collect:
Missing: ${missingContact.join(', ')}

SAY: "Fleet pricing - I can definitely help with that! Let me get your info so our bulk specialist Jackson can put together the best pricing for you. What's your name, email, and phone number?"

DO NOT escalate without contact info!`;
        } else if (!chatState.bulk_vehicle_count) {
          contextNotes = `🚛 BULK INQUIRY - NOW GET VEHICLE DETAILS

Customer: ${chatState.customer_name}
Email: ${chatState.customer_email}
Phone: ${chatState.customer_phone}

NOW ask about the fleet:
"Perfect, thanks ${chatState.customer_name}! Tell me about your fleet:
- How many vehicles?
- What types? (trucks, vans, cars?)
- Full wraps or partial?"`;
        } else {
          chatState.bulk_info_collected = true;
          contextNotes = `🚛 BULK ORDER - ROUTE TO JACKSON

Customer: ${chatState.customer_name}
Email: ${chatState.customer_email}
Phone: ${chatState.customer_phone}
Vehicles: ${chatState.bulk_vehicle_count} ${chatState.bulk_vehicle_types || 'vehicles'}

SAY: "Got it! ${chatState.bulk_vehicle_count} vehicles - Jackson is going to love this! I'm connecting you with him now. He'll reach out at ${chatState.customer_email} with custom fleet pricing. Anything else I can help with?"`;
        }
      } else {
        // Non-bulk escalation
        if (!chatState.customer_email) {
          contextNotes = `🚨 ESCALATION - BUT NO CONTACT INFO!

Customer wants: ${escalationType}
Route to: ${teamMember.name}

BUT WE DON'T HAVE THEIR EMAIL!

SAY: "I totally understand - let me connect you with ${teamMember.name}. What's your name, email, and phone so they can reach you?"

GET CONTACT INFO BEFORE CONFIRMING ESCALATION!`;
        } else {
          contextNotes = `🚨 ESCALATION CONFIRMED

Customer: ${chatState.customer_name || 'Unknown'}
Email: ${chatState.customer_email}
Routed to: ${teamMember.name} (${teamMember.role})

SAY: "I'm connecting you with ${teamMember.name} now - they'll reach out to you at ${chatState.customer_email}. Anything else I can help with in the meantime?"`;
        }
      }
      
      // Send escalation email if we have contact info
      if (chatState.customer_email && (escalationType !== 'bulk' || chatState.bulk_info_collected)) {
        try {
          const resendKey = Deno.env.get('RESEND_API_KEY');
          if (resendKey) {
            const { data: convHistory } = await supabase
              .from('messages')
              .select('direction, content, created_at')
              .eq('conversation_id', conversationId)
              .order('created_at', { ascending: true })
              .limit(20);
            
            let conversationSummary = '';
            if (convHistory && convHistory.length > 0) {
              conversationSummary = convHistory.map((msg: any) => {
                const who = msg.direction === 'inbound' ? '👤 Customer' : '🤖 Jordan';
                return `${who}: ${msg.content}`;
              }).join('\n\n');
            }
            
            const resend = new Resend(resendKey);
            await resend.emails.send({
              from: 'Jordan Lee <jordan@weprintwraps.com>',
              to: teamMember.email,
              cc: SILENT_CC,
              subject: `[ESCALATION] ${escalationType.toUpperCase()} - ${chatState.customer_name || 'Website Chat'}`,
              html: `
<h2>🚨 Customer Needs Assistance!</h2>
<table style="border-collapse: collapse; width: 100%; max-width: 600px;">
  <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Type:</td><td style="padding: 8px; border: 1px solid #ddd; color: #e6007e; font-weight: bold;">${escalationType.toUpperCase()}</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Name:</td><td style="padding: 8px; border: 1px solid #ddd;">${chatState.customer_name || 'Not provided'}</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Email:</td><td style="padding: 8px; border: 1px solid #ddd;"><a href="mailto:${chatState.customer_email}">${chatState.customer_email}</a></td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Phone:</td><td style="padding: 8px; border: 1px solid #ddd;">${chatState.customer_phone || 'Not provided'}</td></tr>
  ${chatState.vehicle ? `<tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Vehicle:</td><td style="padding: 8px; border: 1px solid #ddd;">${chatState.vehicle_year || ''} ${chatState.vehicle}</td></tr>` : ''}
  ${escalationType === 'bulk' ? `<tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Fleet:</td><td style="padding: 8px; border: 1px solid #ddd;">${chatState.bulk_vehicle_count || '?'} ${chatState.bulk_vehicle_types || 'vehicles'}</td></tr>` : ''}
</table>
<h3>📝 Conversation:</h3>
<div style="background: #f5f5f5; padding: 15px; border-radius: 8px; white-space: pre-wrap;">${conversationSummary || 'No messages'}</div>
<h3>⚡ Trigger:</h3>
<div style="background: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #e6007e;">${message_text}</div>
`
            });
            // Track escalations as array to support multiple types
            if (!chatState.escalations_sent) {
              chatState.escalations_sent = [];
            }
            chatState.escalations_sent.push(escalationType);
            chatState.escalation_sent = escalationType; // Keep legacy field for compatibility
            console.log('[JordanLee] Escalation email sent to:', teamMember.email);
          }
        } catch (e) {
          console.error('[JordanLee] Escalation email failed:', e);
        }
      }
    }
    // Check for unhappy customer
    else {
      const unhappyCheck = detectUnhappyCustomer(message_text);
      if (unhappyCheck.isUnhappy && !chatState.unhappy_flagged) {
        console.log('[JordanLee] Unhappy customer:', unhappyCheck.reason);
        
        try {
          await supabase.from('conversation_events').insert({
            conversation_id: conversationId,
            organization_id: '51aa96db-c06d-41ae-b3cb-25b045c75caf', // FIXED: Correct WPW org ID
            event_type: 'escalation',
            event_subtype: 'unhappy_customer',
            actor: 'jordan_agent',
            metadata: {
              reason: unhappyCheck.reason,
              trigger_message: message_text.substring(0, 500),
              customer_email: chatState.customer_email || null,
              needs_callback: true
            }
          });
        } catch (e) {
          console.error('[JordanLee] Failed to log unhappy customer:', e);
        }
        
        chatState.unhappy_flagged = true;
        
        if (!chatState.customer_email) {
          contextNotes = `🚨 UNHAPPY CUSTOMER - GET CONTACT INFO!

Reason: ${unhappyCheck.reason}

YOU MUST:
1. Acknowledge their frustration empathetically
2. Get their email and phone for callback
3. Say: "I'm sorry to hear that - I want to make sure we get this sorted out. Can I get your email and phone? I'll have someone call you back personally."`;
        } else {
          contextNotes = `🚨 UNHAPPY CUSTOMER - OFFER CALLBACK

Email: ${chatState.customer_email}

SAY: "I totally understand - that's not the experience we want. I'm flagging this for our team right now. Would you like someone to call you? What's the best number?"`;
        }
      }
      // Handle pricing with vehicle - REQUIRE NAME + EMAIL (phone/shop optional)
      else if (chatState.sqft && chatState.stage !== 'price_given') {
        const hasAllInfo = chatState.customer_name && chatState.customer_email; // Relaxed: only need name + email
        const isEstimate = chatState.is_estimate || false;
        const similarTo = chatState.similar_to || '';
        
        if (!hasAllInfo) {
          // Missing info - collect name + email (minimum required)
          const missing = [];
          if (!chatState.customer_name) missing.push('name');
          if (!chatState.customer_email) missing.push('email');

          contextNotes = `📋 VEHICLE DETECTED BUT MISSING CONTACT INFO!

Vehicle: ${chatState.vehicle || 'Unknown'}
SQFT: ${chatState.sqft}${isEstimate ? ' (ESTIMATE)' : ''}
${isEstimate ? `Based on similar: ${similarTo}` : ''}

MISSING: ${missing.join(', ')}

SAY: "Got it - ${chatState.vehicle || 'that vehicle'}!" + (isEstimate ? " I don't have exact specs for that model, but I can give you an estimate based on similar vehicles." : "") + " Quick question - what's your ${missing.join(' and ')}? Then I'll get you a quote!"

DO NOT give price until you have name + email!`;
        } else {
          // Has all info - give price and create quote
          // CRITICAL: Calculate both default (no roof) and full wrap (with roof) prices
          const defaultSqft = chatState.sqft || 0;  // Already excludes roof
          const fullSqft = chatState.sqftWithRoof || (defaultSqft + (chatState.roofSqft || 0));
          const roofSqft = chatState.roofSqft || (fullSqft - defaultSqft);

          const price = Math.round(defaultSqft * pricePerSqft);
          const fullPrice = Math.round(fullSqft * pricePerSqft);
          const roofPrice = Math.round(roofSqft * pricePerSqft);

          const freeShip = price >= 750 ? '🎉 FREE shipping included!' : '';
          const productUrl = 'https://weprintwraps.com/our-products/avery-1105egrs-with-doz13607-lamination/';

          let vehicleDisplay = chatState.vehicle || '';
          if (chatState.vehicle_year) vehicleDisplay = `${chatState.vehicle_year} ${vehicleDisplay}`;
          
          // If estimate, flag for escalation to get exact quote
          if (isEstimate) {
            contextNotes = `💰 ESTIMATE QUOTE - SEND + ESCALATE FOR EXACT!

Customer: ${chatState.customer_name}
Email: ${chatState.customer_email}
Phone: ${chatState.customer_phone}
Shop: ${chatState.shop_name}
Vehicle: ${vehicleDisplay}

ESTIMATED PRICING (excludes roof):
- Default (no roof): ~${defaultSqft} sqft = ~$${price}
- Full wrap (with roof): ~${fullSqft} sqft = ~$${fullPrice}

SAY: "Thanks ${chatState.customer_name} from ${chatState.shop_name}! 🙌

I don't have exact specs for **${vehicleDisplay}**, but based on similar vehicles (like ${similarTo}):

Estimated wrap is ~**$${price}** (~${defaultSqft} sqft - excludes roof).
Full wrap with roof would be ~**$${fullPrice}** (~${fullSqft} sqft).

${freeShip}

I'm sending this estimate to ${chatState.customer_email} and flagging it for our team to get you exact measurements!

**Order here:** ${productUrl}"

IMPORTANT: This is an ESTIMATE - escalate to team for exact sqft!`;
            
            // Send escalation for exact quote
            try {
              await supabase.from('conversation_events').insert({
                conversation_id: conversationId,
                organization_id: '51aa96db-c06d-41ae-b3cb-25b045c75caf', // FIXED: Correct WPW org ID
                event_type: 'escalation',
                event_subtype: 'exact_quote_needed',
                actor: 'jordan_agent',
                metadata: {
                  reason: 'Vehicle not in database - estimate provided',
                  vehicle: vehicleDisplay,
                  estimated_sqft: chatState.sqft,
                  estimated_price: price,
                  similar_to: similarTo,
                  customer_name: chatState.customer_name,
                  customer_email: chatState.customer_email,
                  customer_phone: chatState.customer_phone,
                  shop_name: chatState.shop_name,
                  needs_exact_measurement: true
                }
              });
              console.log('[JordanLee] Escalation created for exact quote');
            } catch (e) {
              console.error('[JordanLee] Failed to create escalation:', e);
            }
          } else {
            contextNotes = `💰 ALL INFO COLLECTED - GIVE PRICE & SEND QUOTE!

Customer: ${chatState.customer_name}
Email: ${chatState.customer_email}
Phone: ${chatState.customer_phone}
Shop: ${chatState.shop_name}
Vehicle: ${vehicleDisplay}

PRICING BREAKDOWN:
- Default (excludes roof): ${defaultSqft} sqft = **$${price}**
- Full wrap (with roof): ${fullSqft} sqft = **$${fullPrice}**
- Roof only: ${roofSqft} sqft = +$${roofPrice}

SAY: "Thanks ${chatState.customer_name} from ${chatState.shop_name}! 🙌

**${vehicleDisplay}** wrap is **$${price}** (${defaultSqft} sqft - excludes roof).

Want the full wrap including roof? That's **$${fullPrice}** (${fullSqft} sqft total).

${freeShip}

Would you prefer **Avery MPI 1105** or **3M IJ180Cv3**? Same price!

I'm sending your quote to ${chatState.customer_email} now! 📧

**Order here:** ${productUrl}"

CRITICAL PRICING RULES:
- ALWAYS state sqft being quoted
- ALWAYS state whether roof is included or excluded
- ALWAYS offer the alternative (full wrap price if they got default)
- NEVER show different prices for Avery vs 3M - BOTH are $5.27/sqft
- We PRINT and SHIP - customer arranges local installation`;
          }
          
          chatState.stage = 'price_given';
          chatState.quoted_price = price;
          chatState.quote_sent = true;
          
          // SAVE QUOTE via direct REST API call (uses anon key - works without service role)
          const quoteNumber = 'WPW-CHAT-' + Date.now();
          // Use Supabase env vars directly since this runs on WPW Supabase
          const wpwUrl = Deno.env.get('SUPABASE_URL') || 'https://qxllysilzonrlyoaomce.supabase.co';
          const wpwAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4bGx5c2lsem9ucmx5b2FvbWNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyMzQxMjIsImV4cCI6MjA4MzgxMDEyMn0.s1IyOY7QAVyrTtG_XLhugJUvxi2X_nHCvqvchYCvwtM';

          // Use only columns that exist in quotes table (no customer_phone)
          const quotePayload = {
            quote_number: quoteNumber,
            organization_id: '51aa96db-c06d-41ae-b3cb-25b045c75caf',
            customer_name: chatState.customer_name || 'Website Chat Lead',
            customer_email: chatState.customer_email,
            vehicle_model: chatState.vehicle || vehicleDisplay,
            vehicle_year: chatState.vehicle_year ? parseInt(chatState.vehicle_year) : null,
            sqft: chatState.sqft || defaultSqft,
            material_cost: price,
            total_price: price,
            status: 'sent',
            source: 'website_chat',
            ai_generated: true,
            email_sent: false,
            source_conversation_id: conversationId
          };

          try {
            // Try direct REST API insert
            const insertResponse = await fetch(`${wpwUrl}/rest/v1/quotes`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': wpwAnonKey,
                'Authorization': `Bearer ${wpwAnonKey}`,
                'Prefer': 'return=representation'
              },
              body: JSON.stringify(quotePayload)
            });

            if (insertResponse.ok) {
              const insertedQuote = await insertResponse.json();
              console.log('[JordanLee] Quote saved via REST API:', insertedQuote[0]?.id || insertedQuote?.id);
              chatState.quote_id = insertedQuote[0]?.id || insertedQuote?.id;
              chatState.quote_created = true;
            } else {
              const errorText = await insertResponse.text();
              console.error('[JordanLee] REST API quote insert failed:', insertResponse.status, errorText);

              // Fallback: try via edge function
              const fallbackResponse = await fetch(`${wpwUrl}/functions/v1/create-quote-from-chat`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${wpwAnonKey}`
                },
                body: JSON.stringify({
                  conversation_id: conversationId,
                  customer_email: chatState.customer_email,
                  customer_name: chatState.customer_name,
                  customer_phone: chatState.customer_phone || null,
                  vehicle_year: chatState.vehicle_year || null,
                  vehicle_make: '',
                  vehicle_model: chatState.vehicle || vehicleDisplay,
                  sqft: chatState.sqft || defaultSqft,
                  total_price: price,
                  product_type: chatState.product_key || 'avery_wrap',
                  product_id: chatState.product_id || 79,
                  product_name: chatState.product_name || 'Avery MPI 1105 with DOL 1460Z',
                  product_price: chatState.product_price || 5.27,
                  send_email: true
                })
              });

              if (fallbackResponse.ok) {
                const fallbackResult = await fallbackResponse.json();
                console.log('[JordanLee] Quote created via fallback edge function:', fallbackResult);
                chatState.quote_id = fallbackResult.quote_id;
                chatState.quote_created = true;
              } else {
                console.error('[JordanLee] Fallback also failed:', await fallbackResponse.text());
              }
            }
          } catch (e) {
            console.error('[JordanLee] Quote save error:', e);
          }

          // SEND EMAIL directly via Resend API (don't use create-quote-from-chat to avoid duplicate quote)
          const resendKey = Deno.env.get('RESEND_API_KEY');
          if (resendKey && chatState.customer_email && chatState.quote_id) {
            try {
              const vehicleLabel = `${chatState.vehicle_year || ''} ${chatState.vehicle || vehicleDisplay}`.trim();
              const sqftValue = chatState.sqft || defaultSqft;
              const cartUrl = 'https://weprintwraps.com/our-products/';

              const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f6f7f9;font-family:Inter,Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;">
    <div style="background:#000000;padding:16px 24px;">
      <div style="font-size:16px;font-weight:600;color:#ffffff;">WePrintWraps.com Quote</div>
    </div>
    <div style="background:#ffffff;color:#111827;font-family:Inter,Arial,sans-serif;font-size:14px;line-height:1.5;">
      <div style="padding:24px;">
        <a href="${cartUrl}" style="display:inline-block;padding:12px 18px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">Add This Quote to Cart</a>
      </div>
      <div style="padding:0 24px 24px 24px;">
        <div style="font-size:13px;color:#6b7280;">Estimated Total</div>
        <div style="font-size:26px;font-weight:700;color:#111827;">$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        <div style="font-size:13px;color:#6b7280;">~${sqftValue} sq ft × $5.27 / sq ft</div>
      </div>
      <div style="padding:0 24px 24px 24px;">
        <div style="font-size:13px;color:#111827;font-weight:600;margin-bottom:4px;">Project Details</div>
        <div style="font-size:13px;color:#6b7280;">
          <strong>Vehicle:</strong> ${vehicleLabel}<br/>
          <strong>Coverage:</strong> ${sqftValue} sq ft<br/>
          <strong>Material:</strong> Premium Cast Vinyl<br/>
          <em style="color:#9ca3af;">Printed wrap material only. Installation not included.</em>
        </div>
      </div>
      <div style="padding:24px;background:#f6f7f9;font-size:12px;color:#6b7280;text-align:center;">
        Questions? Reply to this email or contact <a href="mailto:hello@weprintwraps.com" style="color:#2563eb;">hello@weprintwraps.com</a><br/><br/>
        — The WePrintWraps.com Team
      </div>
    </div>
  </div>
</body>
</html>`;

              const emailResponse = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${resendKey}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  from: 'WePrintWraps <hello@weprintwraps.com>',
                  to: [chatState.customer_email],
                  subject: `Your Wrap Quote: ${vehicleLabel} - $${price.toFixed(2)}`,
                  html: emailHtml
                })
              });

              if (emailResponse.ok) {
                console.log('[JordanLee] Email sent directly via Resend');
                // Update quote to mark email as sent
                await fetch(`${wpwUrl}/rest/v1/quotes?id=eq.${chatState.quote_id}`, {
                  method: 'PATCH',
                  headers: {
                    'Content-Type': 'application/json',
                    'apikey': wpwAnonKey,
                    'Authorization': `Bearer ${wpwAnonKey}`
                  },
                  body: JSON.stringify({ email_sent: true, status: 'sent' })
                });
              } else {
                console.error('[JordanLee] Email send failed:', await emailResponse.text());
              }
            } catch (e) {
              console.error('[JordanLee] Email error:', e);
            }
          } else {
            console.log('[JordanLee] Skipping email - missing:', {
              hasResendKey: !!resendKey,
              hasEmail: !!chatState.customer_email,
              hasQuoteId: !!chatState.quote_id
            });
          }
        }
      }
      // Email captured after price
      else if (email && chatState.stage === 'price_given' && !chatState.quote_sent) {
        contextNotes = `📧 EMAIL CAPTURED - CONFIRM QUOTE

Email: ${email}

SAY: "Perfect! Sending your quote to ${email} now! 📧

**Order here:** https://weprintwraps.com/our-products/avery-1105egrs-with-doz13607-lamination/

Upload your design and checkout. Questions? I'm here!"`;
        
        chatState.quote_sent = true;
      }
      // Window perf (if they've clarified)
      else if (/\b(perf|perforated)\b/i.test(msg)) {
        contextNotes = `🪟 WINDOW PERF SELECTED

Price: $5.32/sqft

SAY: "Window perf is $5.32/sqft!

**Order here:** https://weprintwraps.com/our-products/perforated-window-vinyl-5050-unlaminated/

What size window are you covering? I'll get you a quote!"

Then collect: name, email, phone, shop name.`;
      }
      // Order status
      else if (/\b(order|status|track|where|shipping)\b/i.test(msg)) {
        const orderMatch = message_text.match(/\b(\d{4,6})\b/);
        if (orderMatch) {
          let order = null;
          try {
            const { data } = await supabase
              .from('shopflow_orders')
              .select('*')
              .or(`order_number.eq.${orderMatch[1]},woo_order_number.eq.${orderMatch[1]}`)
              .single();
            if (data) order = data;
          } catch (e) {}
          
          if (order) {
            contextNotes = `📦 ORDER FOUND

Order: #${order.order_number || orderMatch[1]}
Status: ${order.status || 'Processing'}
${order.tracking_number ? `Tracking: ${order.tracking_number}` : ''}

Share this info with the customer.`;
          } else {
            contextNotes = `📦 ORDER NOT FOUND

Can't find order #${orderMatch[1]}.

SAY: "I don't see that order in my system. Can you double-check the number? Or email hello@weprintwraps.com for fastest help!"`;
          }
        } else {
          contextNotes = `📦 ORDER STATUS - Need number

SAY: "What's your order number? It's usually 4-6 digits from your confirmation email."`;
        }
      }
      // General pricing question
      else if (/\b(price|cost|how much|quote)\b/i.test(msg) && !chatState.sqft) {
        contextNotes = `💵 PRICING QUESTION - Need vehicle

SAY: "What vehicle are you wrapping? I'll get you an exact price!"

If they give generic vehicle: ask year/make/model.`;
      }
      // Turnaround question
      else if (/\b(turnaround|how long|when|timeline|fast|rush)\b/i.test(msg)) {
        contextNotes = `⏱️ TURNAROUND QUESTION

Standard: 1-2 business days printing + 1-3 days shipping = 3-5 days total
Rush: Available for additional fee

SAY: "Standard turnaround is 1-2 business days for printing, plus shipping. Total 3-5 days. Need it faster? We can rush for an extra fee!"`;
      }
      // Default
      else if (!contextNotes) {
        contextNotes = `GENERAL INQUIRY

Be helpful! Offer to help with:
- Pricing (ask what vehicle)
- Product questions
- Order status

${!chatState.customer_email ? "Try to get their email for follow-up!" : ""}`;
      }
    }

    // Build knowledge context
    const knowledgeContext = `${WPW_KNOWLEDGE.pricing}
${WPW_KNOWLEDGE.products}
${WPW_KNOWLEDGE.fileUpload}
${WPW_KNOWLEDGE.turnaround}
${WPW_KNOWLEDGE.guarantee}
${WPW_KNOWLEDGE.specs}
${WPW_KNOWLEDGE.contact}`;

    // Call AI using OpenAI API
    let aiReply = "Hey! How can I help you today?";

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (openaiApiKey) {
      try {
        // Load message history from CURRENT conversation only (same session)
        // This prevents old vehicle data from bleeding in while keeping current context
        const { data: recentMessages } = await supabase
          .from('messages')
          .select('direction, content')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true })
          .limit(10);

        const messages: Array<{role: string, content: string}> = [];
        if (recentMessages && recentMessages.length > 0) {
          for (const msg of recentMessages) {
            messages.push({
              role: msg.direction === 'inbound' ? 'user' : 'assistant',
              content: msg.content
            });
          }
        }
        // Add current message (deduplicate if already present from recent history)
        const lastMsg = messages[messages.length - 1];
        if (!lastMsg || lastMsg.role !== 'user' || lastMsg.content !== message_text) {
          messages.push({ role: 'user', content: message_text });
        }

        const systemPrompt = `${JORDAN_PERSONA}

${WPW_IDENTITY}

CURRENT CONTEXT:
${contextNotes}
${attachmentContext}

KNOWLEDGE BASE:
${knowledgeContext}

CUSTOMER STATE (AUTHORITATIVE - USE THIS, NOT CONVERSATION HISTORY):
- Name: ${chatState.customer_name || '❌ NOT CAPTURED'}
- Email: ${chatState.customer_email || '❌ NOT CAPTURED'}
- Phone: ${chatState.customer_phone || '❌ NOT CAPTURED'}
- Shop: ${chatState.shop_name || '❌ NOT CAPTURED'}
- Vehicle: ${chatState.vehicle || 'Unknown'}
- SQFT: ${chatState.sqft || 'Unknown'}

${chatState.customer_name ? '🚫 NAME ALREADY CAPTURED: ' + chatState.customer_name + ' - NEVER ask for name!' : ''}
${chatState.customer_email ? '🚫 EMAIL ALREADY CAPTURED: ' + chatState.customer_email + ' - NEVER ask for email! Just send the quote to this email!' : ''}

⚠️ CRITICAL VEHICLE RULE:
- ALWAYS use the vehicle shown above in CUSTOMER STATE
- If conversation history mentions a different vehicle (like a previous quote), IGNORE IT
- The customer may have changed vehicles - only reference the CURRENT vehicle above
- NEVER mix up or reference old vehicles from earlier in the conversation

PRICING RULE (CONTACT-GATED):
- If name AND email are shown above as captured (not ❌), the gate is PASSED - proceed to help!
- If name OR email show ❌ NOT CAPTURED, ask for the missing info before giving pricing
- AFTER you have name+email: Give ONE price at $5.27/sqft and ask "Would you prefer Avery MPI 1105 or 3M IJ180Cv3? Both are the same price!"
- NEVER show two different prices for Avery vs 3M. They are BOTH $5.27/sqft!
- For trailers/RVs/campers: ALWAYS ask for dimensions (length × height per side + which sides). Do NOT estimate sqft from length alone!

${chatState.customer_name && chatState.customer_email ? `
🚫🚫🚫 CRITICAL: DO NOT ASK FOR NAME OR EMAIL! 🚫🚫🚫
Customer already provided: ${chatState.customer_name} / ${chatState.customer_email}
Just help them and send quote to their email. NEVER say "What is your name/email"!
` : '📧 GATE ACTIVE: Get name + email BEFORE giving price!'}`;

        // Use OpenAI API with retry + Anthropic fallback
        const aiResult = await callAIWithRetry(
          openaiApiKey,
          'gpt-4o',
          600,
          [{ role: 'system', content: systemPrompt }, ...messages]
        );
        if (aiResult.content) {
          aiReply = aiResult.content;
          console.log(`[JordanLee] AI response via ${aiResult.provider}`);
        } else {
          console.error('[JordanLee] All AI providers failed for chat response');
        }
      } catch (e) {
        console.error('[JordanLee] AI error:', e);
      }
    } else {
      console.warn('[JordanLee] OPENAI_API_KEY not configured');
    }

    // Generate AI Synopsis (every 3 messages or when key info captured)
    const messageCount = (chatState.message_count || 0) + 1;
    chatState.message_count = messageCount;

    const shouldGenerateSynopsis =
      messageCount === 1 || // First message
      messageCount % 3 === 0 || // Every 3 messages
      (chatState.vehicle && !chatState.ai_summary) || // Vehicle captured
      (chatState.sqft && chatState.customer_email); // Quote ready

    if (shouldGenerateSynopsis && openaiApiKey) {
      try {
        // Synopsis uses gpt-4o-mini (cheaper, higher rate limits - this is a simple summarization task)
        const synopsisResult = await callAIWithRetry(
          openaiApiKey,
          'gpt-4o-mini',
          100,
          [
            { role: 'system', content: `Generate a 1-line synopsis (max 15 words) of this customer chat. Focus on: what they're asking about, vehicle if mentioned, quote status. No emojis. Examples:
- "Quote request for 2024 F-150 full wrap, $1,470"
- "Asking about maximum artwork dimensions for cut-contour graphics"
- "Fleet inquiry: 5 Sprinter vans, needs bulk pricing"
- "Design services question, wants custom wrap created"` },
            { role: 'user', content: `Customer message: "${message_text}"
Vehicle: ${chatState.vehicle || 'Not mentioned'}
SQFT: ${chatState.sqft || 'Unknown'}
Quote: ${chatState.total_price ? '$' + chatState.total_price : 'Not given'}
Email: ${chatState.customer_email ? 'Captured' : 'Not captured'}` }
          ],
          2 // fewer retries for synopsis (non-critical)
        );

        if (synopsisResult.content) {
          chatState.ai_summary = synopsisResult.content.trim();
          console.log(`[JordanLee] Synopsis generated via ${synopsisResult.provider}:`, chatState.ai_summary);
        }
      } catch (e) {
        console.error('[JordanLee] Synopsis generation error:', e);
      }
    }

    // Save state and response - FIXED: Only update valid columns (chat_state JSONB holds all contact info)
    await supabase
      .from('conversations')
      .update({
        chat_state: chatState,
        last_message_at: new Date().toISOString()
      })
      .eq('id', conversationId);

    // Save outbound message - WITH ERROR HANDLING
    const { error: outboundMsgError } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      channel: 'website',
      direction: 'outbound',
      content: aiReply,
      sender_name: 'Jordan Lee',
      metadata: { ai_generated: true }
    });

    if (outboundMsgError) {
      console.error('[JordanLee] CRITICAL: Failed to save outbound message:', outboundMsgError);
    } else {
      console.log('[JordanLee] Outbound message saved for conversation:', conversationId);
    }

    return new Response(JSON.stringify({
      success: true,
      reply: aiReply,
      response: aiReply, // Also include as 'response' for widget compatibility
      conversation_id: conversationId,
      synopsis: chatState.ai_summary || null,
      customer_state: {
        name: chatState.customer_name || null,
        email: chatState.customer_email || null,
        vehicle: chatState.vehicle || null,
        sqft: chatState.sqft || null
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[JordanLee] Error:', error);
    return new Response(JSON.stringify({
      error: 'Something went wrong',
      reply: "I'm having a quick hiccup - what were you looking for help with?"
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// =====================================================
// ⚠️ END OF LOCKED FILE - DO NOT ADD CODE BELOW ⚠️
// =====================================================
