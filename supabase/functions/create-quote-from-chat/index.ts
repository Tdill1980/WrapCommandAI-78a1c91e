// Create Quote from Chat - Generates and sends quote from website chat
// Called when Jordan has collected email + vehicle info
// Creates quote record, sends email, creates follow-up task
// OS SPINE: Logs quote_drafted and email_sent events

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { WPW_PRICING, calculateQuickQuote } from "../_shared/wpw-pricing.ts";
import { logConversationEvent, logQuoteEvent } from "../_shared/conversation-events.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Vehicle SQFT lookup (simplified - matches website-chat estimates)
const VEHICLE_SQFT: Record<string, number> = {
  // Compact cars
  'prius': 175, 'civic': 175, 'corolla': 175, 'sentra': 175, 'versa': 175,
  'yaris': 175, 'fit': 175, 'accent': 175, 'rio': 175, 'mirage': 175,
  // Midsize sedans
  'camry': 200, 'accord': 200, 'altima': 200, 'sonata': 200, 'mazda6': 200,
  'legacy': 200, 'jetta': 200, 'passat': 200, 'optima': 200, 'k5': 200,
  // Full-size sedans
  'avalon': 210, 'maxima': 210, '300': 210, 'charger': 210, 'impala': 210, 'taurus': 210,
  // Compact SUVs
  'rav4': 200, 'crv': 200, 'cr-v': 200, 'tucson': 200, 'rogue': 200,
  'forester': 200, 'crosstrek': 200, 'cx5': 200, 'cx-5': 200, 'tiguan': 200,
  'sportage': 200, 'seltos': 200, 'kona': 200, 'venue': 200,
  // Midsize SUVs
  'highlander': 225, 'pilot': 225, 'explorer': 225, 'pathfinder': 225,
  '4runner': 225, 'cx9': 225, 'cx-9': 225, 'atlas': 225, 'palisade': 225,
  'telluride': 225, 'sorento': 225,
  // Full-size trucks
  'f150': 250, 'f-150': 250, 'silverado': 250, 'sierra': 250, 'ram': 250,
  'tundra': 250, 'titan': 250, 'f250': 275, 'f-250': 275, 'f350': 275, 'f-350': 275,
  // HD TRUCKS (CRITICAL - These were missing and blocking quotes!)
  'f450': 300, 'f-450': 300, 'f550': 320, 'f-550': 320, 'f650': 350, 'f-650': 350,
  'silverado 2500': 280, 'silverado 2500hd': 280, 'silverado2500': 280,
  'silverado 3500': 300, 'silverado 3500hd': 300, 'silverado3500': 300,
  'silverado 4500': 320, 'silverado 4500hd': 320, 'silverado4500': 320,
  'silverado 5500': 340, 'silverado 5500hd': 340, 'silverado5500': 340,
  'silverado 6500': 360, 'silverado 6500hd': 360, 'silverado6500': 360,
  'sierra 2500': 280, 'sierra 2500hd': 280, 'sierra2500': 280,
  'sierra 3500': 300, 'sierra 3500hd': 300, 'sierra3500': 300,
  'ram 2500': 280, 'ram2500': 280,
  'ram 3500': 300, 'ram3500': 300,
  'ram 4500': 320, 'ram4500': 320,
  'ram 5500': 340, 'ram5500': 340,
  // Large SUVs
  'tahoe': 275, 'expedition': 275, 'suburban': 300, 'yukon': 275,
  'sequoia': 275, 'armada': 275, 'escalade': 275, 'navigator': 275,
  // Cargo vans
  'transit': 350, 'sprinter': 350, 'promaster': 350, 'express': 300, 'savana': 300,
  // Sprinter variants by wheelbase
  'sprinter 144': 280, 'sprinter 170': 320, 'sprinter 170 ext': 360,
  'transit 130': 260, 'transit 148': 300, 'transit 148 ext': 350,
  // Box trucks
  'box truck': 400, 'boxtruck': 400,
  'npr': 320, 'isuzu npr': 320, 'nqr': 350, 'isuzu nqr': 350, 'nrr': 380, 'isuzu nrr': 380,
  'hino': 350, 'fuso': 350, 'canter': 320,
  // Sports cars
  'mustang': 180, 'camaro': 180, 'challenger': 190, 'corvette': 175,
  'supra': 170, '370z': 170, '86': 160, 'brz': 160, 'miata': 150, 'mx5': 150,
  // Compact trucks
  'tacoma': 200, 'colorado': 200, 'ranger': 200, 'maverick': 180, 'frontier': 200,
  // Jeeps
  'wrangler': 200, 'gladiator': 220, 'cherokee': 200, 'grand cherokee': 220,
  // SUVs
  'bronco': 200, 'defender': 225, 'range rover': 250,
};

// COMMERCIAL VEHICLE FALLBACK ESTIMATES (never block silently!)
const COMMERCIAL_FALLBACK_SQFT: Record<string, number> = {
  'hd_truck': 300,      // HD trucks (4500, 5500, 6500 series)
  'box_truck': 380,     // Box trucks / cab chassis
  'commercial_van': 320, // Commercial vans
  'chassis_cab': 300,   // Chassis cab
  'default': 275,       // Safe default for unknown commercial
};

interface SqftResult {
  sqft: number;
  source: 'exact' | 'pattern' | 'commercial_fallback' | 'default_fallback';
  needsReview: boolean;
}

function getVehicleSqft(make: string, model: string): SqftResult {
  const modelLower = model.toLowerCase().replace(/\s+/g, '');
  const modelWithSpaces = model.toLowerCase();
  const modelNormalized = model.toLowerCase().replace(/[\s-]+/g, ' ').trim();
  
  // Check exact match first
  if (VEHICLE_SQFT[modelLower]) {
    return { sqft: VEHICLE_SQFT[modelLower], source: 'exact', needsReview: false };
  }
  if (VEHICLE_SQFT[modelWithSpaces]) {
    return { sqft: VEHICLE_SQFT[modelWithSpaces], source: 'exact', needsReview: false };
  }
  if (VEHICLE_SQFT[modelNormalized]) {
    return { sqft: VEHICLE_SQFT[modelNormalized], source: 'exact', needsReview: false };
  }
  
  // Check partial matches
  for (const [key, sqft] of Object.entries(VEHICLE_SQFT)) {
    if (modelLower.includes(key) || key.includes(modelLower)) {
      return { sqft, source: 'pattern', needsReview: false };
    }
  }
  
  // Pattern-based fallbacks for commercial vehicles
  // HD Trucks (4500, 5500, 6500 series)
  if (/4500|5500|6500/i.test(model)) {
    console.log('[SQFT FALLBACK] HD truck detected:', model);
    return { sqft: COMMERCIAL_FALLBACK_SQFT.hd_truck, source: 'commercial_fallback', needsReview: true };
  }
  
  // Box trucks / Isuzu / Hino / Fuso
  if (/box|npr|nqr|nrr|hino|fuso|canter|cabover|cab.?over/i.test(model)) {
    console.log('[SQFT FALLBACK] Box truck detected:', model);
    return { sqft: COMMERCIAL_FALLBACK_SQFT.box_truck, source: 'commercial_fallback', needsReview: true };
  }
  
  // Commercial vans
  if (/van|sprinter|transit|promaster|express|savana|nv\d/i.test(model)) {
    console.log('[SQFT FALLBACK] Commercial van detected:', model);
    return { sqft: COMMERCIAL_FALLBACK_SQFT.commercial_van, source: 'commercial_fallback', needsReview: true };
  }
  
  // Chassis cab / work trucks
  if (/chassis|work.?truck|flatbed|stake|dump|utility/i.test(model)) {
    console.log('[SQFT FALLBACK] Chassis/work truck detected:', model);
    return { sqft: COMMERCIAL_FALLBACK_SQFT.chassis_cab, source: 'commercial_fallback', needsReview: true };
  }
  
  // Regular trucks
  if (/truck|f-?\d{3}|silverado|sierra|ram|tundra|titan/i.test(model)) {
    return { sqft: 250, source: 'pattern', needsReview: false };
  }
  
  // SUVs
  if (/suv|tahoe|expedition|suburban|yukon|explorer|pilot/i.test(model)) {
    return { sqft: 275, source: 'pattern', needsReview: false };
  }
  
  // ✅ NEVER BLOCK QUOTE CREATION - Always return a fallback with review flag
  console.log('[SQFT FALLBACK] Unknown vehicle, using safe default:', { make, model });
  return { sqft: COMMERCIAL_FALLBACK_SQFT.default, source: 'default_fallback', needsReview: true };
}

function generateQuoteNumber(): string {
  const date = new Date();
  const dateStr = date.toISOString().slice(2, 10).replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `WPW-${dateStr}-${random}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      conversation_id,
      customer_email,
      customer_name,
      customer_phone,
      vehicle_year,
      vehicle_make,
      vehicle_model,
      product_type = 'avery_wrap',
      product_id = 79,
      product_name: passedProductName,
      product_price = 5.27,
      send_email = true,
      organization_id = '51aa96db-c06d-41ae-b3cb-25b045c75caf',
      test_mode = false
    } = await req.json();

    // TEST MODE: Skip everything and return mock response for health checks
    if (test_mode) {
      console.log('[CreateQuoteFromChat] TEST MODE - returning mock response without creating data');
      return new Response(JSON.stringify({
        success: true,
        quote_number: 'TEST-MOCK-QUOTE',
        quote_id: 'test-mock-id',
        test_mode: true,
        message: 'Test mode - no actual quote created'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('[CreateQuoteFromChat] Starting:', { conversation_id, customer_email, vehicle_make, vehicle_model });

    // Lovable 3D Renders API (for vehicle renders)
    const LOVABLE_RENDER_URL = 'https://wzwqhfbmymrengjqikjl.supabase.co/functions/v1/generate-color-render';
    const LOVABLE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6d3FoZmJteW1yZW5nanFpa2psIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMyNDM3OTgsImV4cCI6MjA3ODgxOTc5OH0.-LtBxqJ7gNmImakDRGQyr1e7FXrJCQQXF5zE5Fre_1I';

    // Fetch conversation context for personalization
    let chatContext = '';
    let aiSummary = '';
    if (conversation_id) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://qxllysilzonrlyoaomce.supabase.co';
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        if (serviceKey) {
          const contextClient = createClient(supabaseUrl, serviceKey);
          const { data: convo } = await contextClient
            .from('conversations')
            .select('chat_state')
            .eq('id', conversation_id)
            .single();
          
          if (convo?.chat_state) {
            aiSummary = convo.chat_state.ai_summary || '';
            // Clean up the ai_summary (remove quotes if present)
            aiSummary = aiSummary.replace(/^["']|["']$/g, '').trim();
          }
        }
      } catch (e) {
        console.log('[CreateQuoteFromChat] Could not fetch conversation context:', e);
      }
    }

    if (!customer_email) {
      return new Response(JSON.stringify({ error: 'Customer email required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Use WPW Supabase - this function runs on WPW and queries WPW DB
    // Using anon key instead of service role key for public API access
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://qxllysilzonrlyoaomce.supabase.co';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4bGx5c2lsem9ucmx5b2FvbWNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyMzQxMjIsImV4cCI6MjA4MzgxMDEyMn0.s1IyOY7QAVyrTtG_XLhugJUvxi2X_nHCvqvchYCvwtM';
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Calculate SQFT and pricing - NEVER BLOCK, always create quote
    const sqftResult = getVehicleSqft(vehicle_make || '', vehicle_model || '');
    const sqft = sqftResult.sqft;
    const needsReview = sqftResult.needsReview;
    
    console.log('[CreateQuoteFromChat] SQFT lookup:', {
      vehicle: `${vehicle_year} ${vehicle_make} ${vehicle_model}`,
      sqft,
      source: sqftResult.source,
      needsReview
    });
    
    // Use passed product price or default to $5.27
    const pricePerSqft = product_price || 5.27;
    const materialCost = Math.round(sqft * pricePerSqft * 100) / 100;
    const quoteNumber = generateQuoteNumber();

    // Use passed product name or derive from product_type
    const productName = passedProductName || (product_type === '3m' || product_type === 'threem_wrap'
      ? '3M IJ180Cv3 with 8518'
      : 'Avery MPI 1105 with DOL 1460Z');

    console.log('[CreateQuoteFromChat] Calculated:', { sqft, pricePerSqft, materialCost, quoteNumber, needsReview });

    // Create quote record (using ONLY columns that exist in quotes table)
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .insert({
        quote_number: quoteNumber,
        organization_id,
        customer_name: customer_name || `Website Lead (${customer_email})`,
        customer_email,
        // customer_phone column doesn't exist in quotes table - store in metadata instead
        vehicle_year: vehicle_year ? parseInt(vehicle_year) : null,
        vehicle_make,
        vehicle_model,
        sqft,
        material_cost: materialCost,
        total_price: materialCost,
        price_per_sqft: pricePerSqft,
        ai_message: `${productName} at $${pricePerSqft}/sqft`,
        ai_generated: true,
        status: 'pending', // Valid status value
        source: 'website_chat', // Canonical source so chat quotes surface in the admin Quotes tab (was 'wren', which get-website-chat-quotes filters out)
        source_conversation_id: conversation_id || null,
        email_sent: false,
        metadata: customer_phone ? { customer_phone } : null
      })
      .select()
      .single();

    if (quoteError) {
      console.error('[CreateQuoteFromChat] Quote creation error:', quoteError);
      // Return explicit failure response instead of throwing
      return new Response(JSON.stringify({ 
        success: false, 
        error: quoteError.message,
        code: 'QUOTE_INSERT_FAILED'
      }), { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('[CreateQuoteFromChat] Quote created:', quote.id);

    // ============================================
    // OS SPINE: Log quote_drafted event
    // ============================================
    if (conversation_id) {
      await logQuoteEvent(
        supabase,
        conversation_id,
        'quote_drafted',
        {
          quoteId: quote.id,
          quoteNumber,
          total: materialCost,
          customerEmail: customer_email,
          customerName: customer_name,
          vehicleInfo: `${vehicle_year || ''} ${vehicle_make || ''} ${vehicle_model || ''}`.trim(),
        }
      );
      console.log('[CreateQuoteFromChat] quote_drafted event logged');
    }

    // Update conversation with quote info
    if (conversation_id) {
      await supabase
        .from('conversations')
        .update({
          chat_state: {
            quote_id: quote.id,
            quote_number: quoteNumber,
            quote_sent: true,
            quote_sent_at: new Date().toISOString()
          },
          status: 'quote_sent'
        })
        .eq('id', conversation_id);
    }

    // Create MightyTask for Alex Morgan (quote follow-up) - using ONLY valid columns
    const { error: taskError } = await supabase
      .from('tasks')
      .insert({
        title: `Quote Follow-Up: ${vehicle_year || ''} ${vehicle_make || ''} ${vehicle_model || ''} - $${materialCost}`.trim(),
        description: `Website chat quote sent to ${customer_email}. Vehicle: ${vehicle_year || ''} ${vehicle_make || ''} ${vehicle_model || ''} (${sqft} sqft). Material: $${materialCost}. Quote #${quoteNumber}. Conversation: ${conversation_id || 'N/A'}. Follow up to close!`,
        status: 'pending',
        priority: materialCost > 1500 ? 'high' : 'medium',
        assigned_to: 'alex_morgan',
        due_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        organization_id
      });

    if (taskError) {
      console.error('[CreateQuoteFromChat] Task creation error:', taskError);
    }

    // ============================================
    // CANONICAL QUOTE EMAIL - Claude-style with rotating upsells
    // ============================================
    
    // Rotating upsell helper (cycles through 3 options)
    function getRotatingUpsell(quoteId?: string) {
      const num = quoteId
        ? parseInt(quoteId.slice(-2), 16) % 3
        : Date.now() % 3;

      if (num === 0) {
        return {
          title: "Need window coverage?",
          body: "Window Perf — $5.95/sq ft. See-through from inside, full graphics outside.",
          link: "https://weprintwraps.com/our-products/perforated-window-vinyl-5050-unlaminated/",
        };
      } else if (num === 1) {
        return {
          title: "Need logos or decals?",
          body: "Cut Contour vinyl — $6.32/sq ft. Weeded, masked, ready to install.",
          link: "https://weprintwraps.com/our-products/avery-cut-contour-vinyl-graphics-54-roll-max-artwork-size-50/",
        };
      }
      return {
        title: "Got walls to wrap?",
        body: "Wall Wrap — only $3.25/sq ft. Perfect for shops, showrooms, garages.",
        link: "https://weprintwraps.com/our-products/wall-wrap-printed-vinyl/",
      };
    }

    // Build CONVERSATIONAL email HTML - references their actual chat
    function buildQuoteEmailHTML({
      quoteNumber,
      vehicleLabel,
      sqft,
      rate,
      total,
      cartUrl,
      quoteId,
      customerName,
      chatSummary,
      renderImageUrl,
    }: {
      quoteNumber: string;
      vehicleLabel: string;
      sqft: number;
      rate: number;
      total: number;
      cartUrl: string;
      quoteId?: string;
      customerName?: string;
      chatSummary?: string;
      renderImageUrl?: string;
    }) {
      const upsell = getRotatingUpsell(quoteId);
      const firstName = customerName?.split(' ')[0] || '';
      const greeting = firstName ? `Hey ${firstName}!` : 'Hey!';
      const freeShipping = total >= 750;
      
      // Build the opening line based on what they asked about
      let openingLine = `Here's your quote for the ${vehicleLabel} wrap.`;
      if (chatSummary) {
        // Use the AI summary to make it personal
        if (chatSummary.toLowerCase().includes('color')) {
          openingLine = `You asked about wrapping your ${vehicleLabel} — here's what that looks like:`;
        } else if (chatSummary.toLowerCase().includes('fleet') || chatSummary.toLowerCase().includes('multiple')) {
          openingLine = `You mentioned a fleet project — here's the quote for the ${vehicleLabel}. Hit me up for volume pricing on the rest.`;
        } else if (chatSummary.toLowerCase().includes('price') || chatSummary.toLowerCase().includes('cost') || chatSummary.toLowerCase().includes('quote')) {
          openingLine = `You wanted pricing on your ${vehicleLabel} — here it is:`;
        } else {
          openingLine = `Following up on your ${vehicleLabel} wrap inquiry — here's your quote:`;
        }
      }

      return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">

    <!-- HEADER -->
    <div style="background:#000000;padding:20px 24px;">
      <div style="font-size:15px;font-weight:600;color:#ffffff;">
        WePrintWraps.com
      </div>
    </div>

    <!-- BODY -->
    <div style="padding:32px 24px;color:#1a1a1a;font-size:15px;line-height:1.7;">

      <!-- PERSONAL OPENING -->
      <p style="margin:0 0 20px 0;">
        ${greeting} ${openingLine}
      </p>

      ${renderImageUrl ? `
      <!-- VEHICLE RENDER -->
      <div style="margin:0 0 24px 0;text-align:center;">
        <img src="${renderImageUrl}" alt="${vehicleLabel} Wrap Preview" style="max-width:100%;height:auto;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.15);" />
        <div style="font-size:12px;color:#737373;margin-top:8px;">Here's what your ${vehicleLabel} could look like 🔥</div>
      </div>
      ` : ''}

      <!-- THE QUOTE - BOLD AND CLEAR -->
      <div style="background:#1a1a1a;border-radius:12px;padding:28px;margin:0 0 24px 0;text-align:center;">
        <div style="color:#ffffff;font-size:36px;font-weight:700;margin-bottom:8px;">
          $${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div style="color:#a3a3a3;font-size:14px;margin-bottom:20px;">
          ${vehicleLabel} • ${sqft} sq ft • $${rate.toFixed(2)}/sq ft
        </div>
        <a href="${cartUrl}" style="display:inline-block;background:#e6007e;color:#ffffff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
          Add to Cart
        </a>
        ${freeShipping ? '<div style="color:#22c55e;font-size:13px;margin-top:12px;">✓ FREE SHIPPING</div>' : ''}
      </div>

      <!-- DETAILS - CONVERSATIONAL -->
      <p style="margin:0 0 16px 0;">
        That's ${sqft} sq ft of premium Avery wrap film, laminated and trimmed — ready to install.
      </p>
      
      <p style="margin:0 0 16px 0;">
        We'll have it printed in <strong>1-2 business days</strong> and shipped out fast. 
        ${freeShipping ? "Free shipping since you're over $750." : 'Shipping calculated at checkout.'}
        And if anything's off, we make it right — that's our <strong>Premium Wrap Guarantee</strong>.
      </p>

      <!-- UPSELL - CASUAL -->
      <div style="background:#f5f3ff;border-radius:8px;padding:16px;margin:0 0 24px 0;">
        <div style="font-size:14px;color:#6d28d9;font-weight:600;margin-bottom:4px;">${upsell.title}</div>
        <div style="font-size:14px;color:#4b5563;">${upsell.body} <a href="${upsell.link}" style="color:#6d28d9;">Check it out →</a></div>
      </div>

      <!-- VOLUME TEASE -->
      <p style="margin:0 0 24px 0;font-size:14px;color:#525252;">
        <strong>Got more vehicles?</strong> 5+ gets you 5-20% off. Just reply and let me know.
      </p>

      <!-- CTA TO REPLY -->
      <p style="margin:0 0 8px 0;">
        Questions? Just hit reply — I'm real and I'll get back to you.
      </p>
      
      <p style="margin:0;color:#525252;font-size:14px;">
        — Wren<br/>
        WePrintWraps.com
      </p>

    </div>

    <!-- FOOTER -->
    <div style="background:#fafafa;padding:20px 24px;text-align:center;border-top:1px solid #e5e5e5;">
      <div style="margin-bottom:12px;">
        <a href="https://weprintwraps.com/reward-landing/" style="color:#e6007e;text-decoration:none;font-size:13px;font-weight:500;">Join ClubWPW</a>
        <span style="color:#d4d4d4;margin:0 10px;">|</span>
        <a href="https://weprintwraps.com" style="color:#737373;text-decoration:none;font-size:13px;">Chat with us</a>
        <span style="color:#d4d4d4;margin:0 10px;">|</span>
        <a href="https://weprintwraps.com/faqs/" style="color:#737373;text-decoration:none;font-size:13px;">FAQs</a>
      </div>
      <div style="font-size:11px;color:#a3a3a3;">
        Quote #${quoteNumber} • We print. You install. Let's go.
      </div>
  </div>
</body>
</html>
`;
    }

    // Send quote email
    let emailSent = false;
    if (send_email && resendKey) {
      const vehicleDisplay = `${vehicle_year || ''} ${vehicle_make || ''} ${vehicle_model || ''}`.trim() || 'Your Vehicle';
      
      // Real WooCommerce add-to-cart link (product + sqft as quantity) — same link Ace gives in chat.
      const cartQty = Math.max(1, Math.round(sqft));
      const cartUrl = `https://weprintwraps.com/cart/?add-to-cart=${product_id || 79}&quantity=${cartQty}`;

      // Generate vehicle render (WPW Pink, async but don't block email if it fails)
      let renderImageUrl = '';
      try {
        console.log('[CreateQuoteFromChat] Generating vehicle render for:', vehicle_make, vehicle_model);
        const renderResponse = await fetch(LOVABLE_RENDER_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${LOVABLE_ANON_KEY}`,
            'apikey': LOVABLE_ANON_KEY,
          },
          body: JSON.stringify({
            vehicleMake: vehicle_make || 'Ford',
            vehicleModel: vehicle_model || 'F-150',
            vehicleYear: vehicle_year || 2024,
            vehicleType: 'Auto', // Auto-detect
            colorHex: '#E6007E', // WPW Signature Pink
            colorName: 'WPW Pink',
            finishType: 'gloss',
            hasMetallicFlakes: false,
            angle: 'hero',
            mode: 'full', // Full wrap, not panel
          }),
        });
        
        if (renderResponse.ok) {
          const renderData = await renderResponse.json();
          renderImageUrl = renderData.imageUrl || '';
          console.log('[CreateQuoteFromChat] Render generated:', renderImageUrl);
        } else {
          console.log('[CreateQuoteFromChat] Render API returned:', renderResponse.status);
        }
      } catch (renderError) {
        console.log('[CreateQuoteFromChat] Render generation failed (non-blocking):', renderError);
        // Don't block email sending if render fails
      }

      const emailHtml = buildQuoteEmailHTML({
        quoteNumber,
        vehicleLabel: vehicleDisplay,
        sqft,
        rate: pricePerSqft,
        total: materialCost,
        cartUrl,
        quoteId: quote.id,
        customerName: customer_name,
        chatSummary: aiSummary,
        renderImageUrl,
      });

      try {
        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'WePrintWraps <hello@weprintwraps.com>',
            to: [customer_email],
            subject: `Your Wrap Quote: ${vehicleDisplay} - $${materialCost.toFixed(2)}`,
            html: emailHtml
          })
        });

        if (emailResponse.ok) {
          emailSent = true;
          console.log('[CreateQuoteFromChat] Email sent successfully');
          
          // ============================================
          // OS SPINE: Log email_sent event
          // ============================================
          if (conversation_id) {
            await logConversationEvent(
              supabase,
              conversation_id,
              'email_sent',
              'jordan_lee',
              {
                email_sent_to: [customer_email],
                email_sent_at: new Date().toISOString(),
                email_subject: `Your Wrap Quote: ${vehicleDisplay} - $${materialCost.toFixed(2)}`,
                quote_id: quote.id,
                quote_number: quoteNumber,
                customer_email: customer_email,
              },
              'quote'
            );
            console.log('[CreateQuoteFromChat] email_sent event logged');
          }
          
          // Update quote record: email_sent = true AND status = 'sent'
          const { error: updateError } = await supabase
            .from('quotes')
            .update({ email_sent: true, status: 'sent' })
            .eq('id', quote.id);
          
          if (updateError) {
            console.error('[CreateQuoteFromChat] Failed to update quote after email:', updateError);
          }
        } else {
          const errorText = await emailResponse.text();
          console.error('[CreateQuoteFromChat] Email send error:', errorText);
        }
      } catch (emailErr) {
        console.error('[CreateQuoteFromChat] Email error:', emailErr);
      }
    }

    // ============================================
    // MIGHTYMAIL WIRING: Enroll in email sequence
    // ============================================
    if (customer_email && !customer_email.includes('@capture.local')) {
      try {
        // Get or find contact
        const { data: contact } = await supabase
          .from('contacts')
          .select('id')
          .eq('email', customer_email.toLowerCase())
          .eq('organization_id', organization_id)
          .maybeSingle();

        if (contact) {
          // Find quote follow-up sequence
          const { data: sequence } = await supabase
            .from('email_sequences')
            .select('id')
            .ilike('name', '%quote%follow%')
            .eq('is_active', true)
            .maybeSingle();

          if (sequence) {
            // Check if not already enrolled
            const { data: existingEnrollment } = await supabase
              .from('email_sequence_enrollments')
              .select('id')
              .eq('customer_email', customer_email)
              .eq('sequence_id', sequence.id)
              .eq('is_active', true)
              .maybeSingle();

            if (!existingEnrollment) {
              await supabase.from('email_sequence_enrollments').insert({
                contact_id: contact.id,
                quote_id: quote.id,
                sequence_id: sequence.id,
                customer_email: customer_email,
                customer_name: customer_name || 'Website Lead',
                enrolled_at: new Date().toISOString(),
                emails_sent: 0,
                is_active: true
              });
              console.log(`[MightyMail] Enrolled ${customer_email} in quote follow-up sequence`);
            }
          }
        }
      } catch (mailError) {
        console.warn('[MightyMail] Enrollment warning (non-blocking):', mailError);
      }
    }

    // Log AI action
    await supabase
      .from('ai_actions')
      .insert({
        action_type: 'quote_created_from_chat',
        action_payload: {
          quote_id: quote.id,
          quote_number: quoteNumber,
          customer_email,
          vehicle: `${vehicle_year || ''} ${vehicle_make || ''} ${vehicle_model || ''}`.trim(),
          sqft,
          material_cost: materialCost,
          email_sent: emailSent,
          conversation_id
        },
        organization_id,
        priority: 'normal',
        resolved: true,
        resolved_at: new Date().toISOString()
      });

    return new Response(JSON.stringify({
      success: true,
      quote_id: quote.id,
      quote_number: quoteNumber,
      sqft,
      material_cost: materialCost,
      price_per_sqft: pricePerSqft,
      email_sent: emailSent,
      message: `Quote created and ${emailSent ? 'sent to ' + customer_email : 'ready for review'}`
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[CreateQuoteFromChat] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
