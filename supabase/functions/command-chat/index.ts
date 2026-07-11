// =====================================================
// COMMANDCHAT — AI OPERATING SYSTEM KERNEL v1.2
// Fixed: synopsis generation, timestamps, email, drift
// =====================================================

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MODEL = 'gpt-4o';
const ORG_ID = '031ac427-f078-4086-a9bc-7bdb78cc1c73'; // WePrintWraps

// A human rep is only pinged when the customer asks for one (rush jobs / real issues)
const OPERATOR_PHONE = '+14807726003'; // Jackson

// =====================================================
// 🧪 TEST MODE — set back to null before going live!
// While this holds an email, EVERY escalation is emailed here instead of the
// real team, the silent CC is skipped, and the operator SMS is suppressed — so
// you can test the "forward a problem ticket" flow without pinging Jackson/
// Lance/Grant. Set to null to restore normal team routing + SMS.
// =====================================================
const ESCALATION_TEST_OVERRIDE: string | null = 'trish@weprintwraps.com';

// =====================================================
// ACE — self-contained catalog / pricing / routing
// (These used to live in cmd-* micro-functions that were
//  never deployed, so every tool 500'd. Now inline.)
// =====================================================

// WPW product catalog — prices current as of 2026-07 (window perf reconciled to $5.95)
const WPW_PRODUCTS: Record<string, { id: number; name: string; price: number; type: 'per_sqft' | 'per_yard' | 'flat'; url: string }> = {
  avery_wrap:    { id: 79,    name: 'Avery MPI 1105 with DOL 1460Z', price: 5.27,  type: 'per_sqft', url: 'https://weprintwraps.com/our-products/avery-1105egrs-with-doz13607-lamination/' },
  '3m_wrap':     { id: 72,    name: '3M IJ180Cv3 with 8518',         price: 5.27,  type: 'per_sqft', url: 'https://weprintwraps.com/our-products/3m-ij180-printed-wrap-film/' },
  cut_avery:     { id: 108,   name: 'Avery Contour-Cut',             price: 6.32,  type: 'per_sqft', url: 'https://weprintwraps.com/our-products/avery-cut-contour-vinyl-graphics-54-roll-max-artwork-size-50/' },
  cut_3m:        { id: 19420, name: '3M Contour-Cut',                price: 6.92,  type: 'per_sqft', url: 'https://weprintwraps.com/our-products/3m-cut-contour-vinyl-graphics-54-roll-max-artwork-size-50/' },
  window_perf:   { id: 80,    name: 'Perforated Window Vinyl 50/50', price: 5.95,  type: 'per_sqft', url: 'https://weprintwraps.com/our-products/perforated-window-vinyl-5050-unlaminated/' },
  wall_wrap:     { id: 70093, name: 'Wall Wrap Printed Vinyl',       price: 3.25,  type: 'per_sqft', url: 'https://weprintwraps.com/our-products/wall-wrap-printed-vinyl/' },
  camo_carbon:   { id: 1726,  name: 'Camo & Carbon (by the yard)',   price: 95.50, type: 'per_yard', url: 'https://weprintwraps.com/our-products/camo-carbon-wrap-by-the-yard/' },
  metal_marble:  { id: 39698, name: 'Metal & Marble (by the yard)',  price: 95.50, type: 'per_yard', url: 'https://weprintwraps.com/our-products/wrap-by-the-yard-metal-marble/' },
  wicked_wild:   { id: 4181,  name: 'Wicked & Wild (by the yard)',   price: 95.50, type: 'per_yard', url: 'https://weprintwraps.com/our-products/wrap-by-the-yard-wicked-wild-wrap-prints/' },
  bape_camo:     { id: 42809, name: 'Bape Camo (by the yard)',       price: 95.50, type: 'per_yard', url: 'https://weprintwraps.com/our-products/wrap-by-the-yard-bape-camo/' },
  modern_trippy: { id: 52489, name: 'Modern & Trippy (by the yard)', price: 95.50, type: 'per_yard', url: 'https://weprintwraps.com/our-products/wrap-by-the-yard-modern-trippy/' },
  custom_design: { id: 234,   name: 'Custom Vehicle Wrap Design',    price: 750,   type: 'flat',     url: 'https://weprintwraps.com/our-products/custom-wrap-design/' },
  design_output: { id: 58160, name: 'Design / File Output',          price: 95,    type: 'flat',     url: 'https://weprintwraps.com/our-products/design-setupfile-output/' },
};

// Escalation routing — the WPW management team (problem tickets forward here)
const WPW_TEAM: Record<string, { name: string; email: string; role: string; phone?: string }> = {
  bulk:    { name: 'Jackson', email: 'jackson@weprintwraps.com', role: 'Bulk/Fleet Sales',    phone: '+14807726003' },
  design:  { name: 'Grant',   email: 'grant@weprintwraps.com',   role: 'Design Services' },
  quality: { name: 'Trish',   email: 'trish@weprintwraps.com',   role: 'Quality/Escalations', phone: '+16233135418' },
  support: { name: 'Lance',   email: 'lance@weprintwraps.com',   role: 'Customer Support' },
};
const SILENT_CC = 'trish@weprintwraps.com';

// Volume discount tiers by total sqft
function bulkDiscount(sqft: number): number {
  if (sqft >= 2500) return 0.20;
  if (sqft >= 1500) return 0.15;
  if (sqft >= 1000) return 0.10;
  if (sqft >= 500)  return 0.05;
  return 0;
}

// Standard WooCommerce add-to-cart URL (works on any Woo store — no REST call needed)
function cartUrl(productId: number, qty = 1): string {
  const q = Math.max(1, Math.round(qty || 1));
  return `https://weprintwraps.com/cart/?add-to-cart=${productId}${q > 1 ? `&quantity=${q}` : ''}`;
}

const KNOWLEDGE: Record<string, string> = {
  pricing: 'Avery MPI 1105 and 3M IJ180 printed wraps are both $5.27/sqft. Contour-cut: Avery $6.32/sqft, 3M $6.92/sqft. Window perf $5.95/sqft. Wall wrap $3.25/sqft. Wrap-by-the-yard patterns $95.50/yard. Custom design from $750. Free shipping on orders $750+. Volume discounts start at 500 sqft (5%) up to 2500+ sqft (20%).',
  products: 'We print full vehicle wraps (Avery/3M), contour-cut graphics/decals/labels, perforated window vinyl, wall wraps, pre-designed wrap-by-the-yard patterns, and custom design. Print & ship only — no installation.',
  shipping: 'Orders ship in 1-2 business days. Free shipping on orders $750+. Add to cart and enter your zip for an instant shipping price.',
  turnaround: 'Print production is 1-2 business days, then it ships.',
  file_upload: 'Upload artwork at checkout or email hello@weprintwraps.com for a free print-readiness review. Send PDF/AI/EPS at full scale.',
  design_services: 'No artwork? Custom vehicle wrap design starts at $750; design/file output help is $95. Email design@weprintwraps.com.',
  guarantee: 'We print on genuine 3M and Avery media with UV inks, made in the USA.',
  contact: 'hello@weprintwraps.com for general questions, design@weprintwraps.com for design.',
  installation: 'We are print & ship ONLY — we do not install. We can point you to install resources.',
  restyleproai: 'RestyleProAI is our AI wrap-visualization tool — upload a photo of your vehicle and preview wrap designs/colors before you buy. Ask us for a link if you want to try it.',
};

async function sendOperatorSMS(body: string): Promise<void> {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const auth = Deno.env.get('TWILIO_AUTH_TOKEN');
  const from = Deno.env.get('TWILIO_PHONE_NUMBER');
  if (!sid || !auth || !from) {
    console.error('[CommandChat] Twilio creds missing — skipping operator SMS');
    return;
  }
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${sid}:${auth}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: OPERATOR_PHONE, From: from, Body: body }),
    });
    if (!res.ok) {
      console.error('[CommandChat] Operator SMS failed:', res.status, await res.text());
    }
  } catch (e) {
    console.error('[CommandChat] Operator SMS exception:', e);
  }
}

const TOOLS = [
  {
    name: "cmd_knowledge",
    description: "Get WePrintWraps knowledge. Topics: pricing, products, shipping, turnaround, file_upload, design_services, guarantee, contact, installation",
    input_schema: { type: "object", properties: { topic: { type: "string" } }, required: ["topic"] }
  },
  {
    name: "cmd_vehicle",
    description: "Look up vehicle sqft. Use when customer mentions a vehicle.",
    input_schema: { type: "object", properties: { year: { type: "number" }, make: { type: "string" }, model: { type: "string" } }, required: ["make", "model"] }
  },
  {
    name: "cmd_pricing",
    description: `Calculate price for any WPW product. Products:
VEHICLE WRAPS (per sqft): avery_wrap, 3m_wrap ($5.27), window_perf ($5.95), cut_avery ($6.32), cut_3m ($6.92), wall_wrap ($3.25)
WRAP BY YARD ($95.50/yd): camo_carbon, metal_marble, wicked_wild, bape_camo, modern_trippy
FADE WRAPS (tiered): fade_wrap - needs side_length
DESIGN (flat): custom_design ($750), design_hour ($95), file_output ($95)
SAMPLES (flat): pantone ($42), camo_sample, marble_sample, wicked_sample ($26.50 each)
PACKS (flat): pack_small ($299), pack_medium ($499), pack_large ($699), pack_xlarge ($899)`,
    input_schema: {
      type: "object",
      properties: {
        sqft: { type: "number", description: "Square footage (for per_sqft products)" },
        sqft_with_roof: { type: "number", description: "Sqft including roof" },
        product: { type: "string", description: "Product key from list above. Default: avery_wrap" },
        yards: { type: "number", description: "Number of yards (for wrap by yard products)" },
        side_length: { type: "number", description: "Side length in inches (for fade_wrap)" },
        vehicle_count: { type: "number", description: "Number of vehicles (for bulk discount)" }
      },
      required: []
    }
  },
  {
    name: "cmd_quote",
    description: "Create quote and send email. Use ONLY after: name + email + phone + vehicle/product + price are ALL confirmed.",
    input_schema: { type: "object", properties: { customer_name: { type: "string" }, customer_email: { type: "string" }, customer_phone: { type: "string" }, vehicle: { type: "string" }, sqft: { type: "number" }, price: { type: "number" }, product_name: { type: "string" } }, required: ["customer_name", "customer_email", "vehicle", "sqft", "price"] }
  },
  {
    name: "cmd_cart",
    description: `Generate a WooCommerce add-to-cart link so the customer can buy now. Use after you've given a price and the customer is ready to order (or asks "where do I buy / add to cart / checkout").
product keys: avery_wrap, 3m_wrap, cut_avery, cut_3m, window_perf, wall_wrap, camo_carbon, metal_marble, wicked_wild, bape_camo, modern_trippy, custom_design, design_output. Default: avery_wrap.
quantity = sqft for per-sqft products, yards for by-the-yard, units for flat items.`,
    input_schema: { type: "object", properties: { product: { type: "string", description: "Product key from the list" }, quantity: { type: "number", description: "Qty (sqft/yards/units). Default 1." } }, required: [] }
  },
  {
    name: "cmd_order",
    description: "Look up WooCommerce order by order number. Use when customer mentions an order number like #12345 or asks about payment, order status, or tracking.",
    input_schema: { type: "object", properties: { order_number: { type: "string", description: "The order number (just digits, no #)" } }, required: ["order_number"] }
  },
  {
    name: "cmd_escalate",
    description: `Route conversation to team member. Use when customer needs specialized help:
- bulk: Fleet/bulk orders (5+ vehicles), volume pricing, wholesale
- design: Design help, artwork review, file issues, custom design needs
- quality: Complaints, damaged product, refunds, unhappy customer
- support: Wants callback, speak to human, manager, supervisor`,
    input_schema: {
      type: "object",
      properties: {
        escalation_type: { type: "string", enum: ["bulk", "design", "quality", "support"], description: "Type of escalation" },
        reason: { type: "string", description: "Brief reason for escalation" }
      },
      required: ["escalation_type"]
    }
  },
  {
    name: "cmd_update_contact",
    description: "Update customer contact info in CRM. Use when customer provides shop name, company name, or additional contact details.",
    input_schema: {
      type: "object",
      properties: {
        shop_name: { type: "string", description: "Shop or company name" },
        additional_phone: { type: "string", description: "Additional phone number" },
        notes: { type: "string", description: "Any notes about this contact" }
      },
      required: []
    }
  }
];

async function execTool(name: string, input: any, baseUrl: string, key: string, context?: { email?: string; product_key?: string }): Promise<any> {
  // Handle cmd_update_contact locally (updates command_contacts)
  if (name === 'cmd_update_contact') {
    console.log(`[CommandChat] Updating contact:`, JSON.stringify(input));
    if (context?.email && input.shop_name) {
      try {
        await fetch(`${baseUrl}/rest/v1/command_contacts?email=eq.${encodeURIComponent(context.email.toLowerCase())}`, {
          method: 'PATCH',
          headers: { 
            'apikey': key, 
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({ 
            shop_name: input.shop_name,
            updated_at: new Date().toISOString()
          })
        });
        console.log(`[CommandChat] Contact updated for ${context.email}`);
        return { success: true, message: `Shop name "${input.shop_name}" saved to your profile!` };
      } catch (err) {
        console.error(`[CommandChat] Contact update error:`, err);
        return { success: false, error: 'Failed to update contact' };
      }
    }
    return { success: true, message: 'Contact info noted' };
  }

  console.log(`[Ace] Tool ${name}:`, JSON.stringify(input));

  // cmd_knowledge — inline knowledge base (was a missing micro-function)
  if (name === 'cmd_knowledge') {
    const topic = String(input.topic || '').toLowerCase().replace(/[^a-z_]/g, '_');
    const info = KNOWLEDGE[topic] || KNOWLEDGE[topic.replace(/_/g, '')] || Object.values(KNOWLEDGE).join(' ');
    return { topic, info };
  }

  // cmd_vehicle — call the REAL vehicle-sqft function (this one is deployed)
  if (name === 'cmd_vehicle') {
    try {
      const r = await fetch(`${baseUrl}/functions/v1/vehicle-sqft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ year: input.year, make: input.make, model: input.model }),
      });
      const v = await r.json();
      const sqft = typeof v.sqft === 'number' ? v.sqft : null;
      const roof = v.panels?.roof ?? (sqft ? Math.round(sqft * 0.10) : null);
      return {
        vehicle: `${input.year || ''} ${input.make || ''} ${input.model || ''}`.replace(/\s+/g, ' ').trim(),
        sqft,
        roof,
        sqft_with_roof: sqft ? sqft + (roof || 0) : null,
        needs_review: !!v.needs_review,
      };
    } catch (e) {
      console.error('[Ace] vehicle-sqft failed:', e);
      return { sqft: null, needs_review: true, error: 'vehicle lookup failed' };
    }
  }

  // cmd_pricing — inline calculation from the catalog (was a missing micro-function)
  if (name === 'cmd_pricing') {
    const pk = String(input.product || 'avery_wrap');
    const p = WPW_PRODUCTS[pk] || WPW_PRODUCTS['avery_wrap'];
    let prices: any = { rate: p.price };
    if (p.type === 'per_sqft') {
      const sqft = Number(input.sqft) || 0;
      const sqftRoof = Number(input.sqft_with_roof) || sqft;
      const totalSqft = Math.max(sqft, sqftRoof) * (Number(input.vehicle_count) || 1);
      const disc = bulkDiscount(totalSqft);
      prices = {
        rate: p.price,
        default: Math.round(sqft * p.price * (1 - disc) * 100) / 100,
        with_roof: Math.round(sqftRoof * p.price * (1 - disc) * 100) / 100,
        discount_pct: Math.round(disc * 100),
      };
    } else if (p.type === 'per_yard') {
      const yards = Number(input.yards) || 1;
      prices = { rate: p.price, default: Math.round(yards * p.price * 100) / 100 };
    } else {
      prices = { rate: p.price, default: p.price };
    }
    return { product: p.name, product_key: pk, url: p.url, cart_url: cartUrl(p.id), prices };
  }

  // cmd_cart — build a working WooCommerce add-to-cart link
  if (name === 'cmd_cart') {
    const pk = String(input.product || context?.product_key || 'avery_wrap');
    const p = WPW_PRODUCTS[pk] || WPW_PRODUCTS['avery_wrap'];
    const qty = Number(input.quantity) || 1;
    return { product: p.name, product_key: pk, cart_url: cartUrl(p.id, qty), product_url: p.url };
  }

  // cmd_order — look up a WooCommerce order (was a missing micro-function)
  if (name === 'cmd_order') {
    const num = String(input.order_number || '').replace(/\D/g, '');
    if (!num) return { found: false, message: 'No order number provided' };
    try {
      const rows = await dbQuery(baseUrl, key, 'shopflow_orders',
        `select=order_number,status,customer_name,tracking_number,tracking_url&order_number=eq.${num}&limit=1`);
      if (Array.isArray(rows) && rows.length) {
        const o = rows[0];
        return { found: true, order_number: o.order_number, status: o.status, tracking_number: o.tracking_number || null, tracking_url: o.tracking_url || null };
      }
      return { found: false, message: `Order #${num} not found in our system yet` };
    } catch (e) {
      console.error('[Ace] order lookup failed:', e);
      return { found: false, message: 'Order lookup unavailable right now' };
    }
  }

  // cmd_synopsis — inline one-liner for the admin inbox (was a missing micro-function)
  if (name === 'cmd_synopsis') {
    const bits: string[] = [];
    if (input.vehicle) bits.push(String(input.vehicle));
    if (input.sqft) bits.push(`${input.sqft} sqft`);
    if (input.price) bits.push(`$${input.price}`);
    if (input.email_captured) bits.push('email captured');
    const synopsis = bits.length ? bits.join(' • ') : String(input.message || '').substring(0, 90);
    return { synopsis };
  }

  // cmd_escalate — forward the problem ticket to the right manager via forward-to-team
  if (name === 'cmd_escalate') {
    const type = String(input.escalation_type || 'support');
    const member = WPW_TEAM[type] || WPW_TEAM.support;
    // In test mode, every escalation goes to the tester's inbox (no team CC).
    const routeTo = ESCALATION_TEST_OVERRIDE || member.email;
    const routeCc = ESCALATION_TEST_OVERRIDE ? undefined : SILENT_CC;
    try {
      const r = await fetch(`${baseUrl}/functions/v1/forward-to-team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
          conversation_id: input.conversation_id,
          organization_id: ORG_ID,
          to_email: routeTo,
          cc_email: routeCc,
          subject: `[Ace • WPW] ${type.toUpperCase()} — ${input.customer_name || 'Website visitor'}`,
          reason: input.reason || `${type} escalation from website chat`,
          context: `Escalation type: ${type} → route to ${member.name} (${member.role})\n` +
            `Customer: ${input.customer_name || 'unknown'} | ${input.customer_email || 'no email'} | ${input.customer_phone || 'no phone'}\n` +
            `Vehicle: ${input.vehicle || 'n/a'}\n` +
            `Reason: ${input.reason || 'n/a'}`,
          sender_name: input.customer_name || 'Website visitor',
          sender_email: input.customer_email || null,
          original_message: input.trigger_message || input.reason || '',
        }),
      });
      const res = await r.json();
      const ok = r.ok && !res.error;
      return { success: ok, escalation_type: type, routed_to: routeTo, team_member: member.name, test_mode: !!ESCALATION_TEST_OVERRIDE };
    } catch (e) {
      console.error('[Ace] escalate/forward-to-team failed:', e);
      return { success: false, escalation_type: type, error: 'escalation failed' };
    }
  }

  // cmd_quote -> create-quote-from-chat: the real WPW quote tool.
  // It saves the quote with the correct schema, emails the customer (Resend), and logs to ai_actions.
  if (name === 'cmd_quote') {
    const res = await fetch(`${baseUrl}/functions/v1/create-quote-from-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify(input),
    });
    const result = await res.json();
    console.log(`[Ace] cmd_quote result:`, JSON.stringify(result));
    return result;
  }

  return { error: `Unknown tool ${name}` };
}

async function dbQuery(url: string, key: string, table: string, query: string): Promise<any> {
  const res = await fetch(`${url}/rest/v1/${table}?${query}`, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
  });
  return res.json();
}

async function dbInsert(url: string, key: string, table: string, data: any): Promise<any> {
  const res = await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': key, 'Authorization': `Bearer ${key}`, 'Prefer': 'return=representation' },
    body: JSON.stringify(data)
  });
  return res.json();
}

async function dbUpdate(url: string, key: string, table: string, query: string, data: any): Promise<void> {
  await fetch(`${url}/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'apikey': key, 'Authorization': `Bearer ${key}` },
    body: JSON.stringify(data)
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { session_id, message_text, customer_name, customer_email, customer_phone, geo, page_url, debug } = body;

    console.log('[CommandChat] Received:', { session_id, message_text: message_text?.substring(0, 50), customer_name, customer_email, geo: geo?.city });

    if (!message_text || !session_id) {
      return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: corsHeaders });
    }

    const url = Deno.env.get('EXTERNAL_SUPABASE_URL') || Deno.env.get('SUPABASE_URL')!;
    const key = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const aiKey = Deno.env.get('OPENAI_API_KEY')!;

    // Get or create conversation
    let convId: string;
    let contactId: string | null = null;
    let state: any = {};
    let isNewConversation = false;

    const convs = await dbQuery(url, key, 'conversations', `select=id,chat_state,contact_id&metadata->>session_id=eq.${session_id}`);

    if (convs && convs.length > 0) {
      convId = convs[0].id;
      contactId = convs[0].contact_id;
      state = convs[0].chat_state || {};
      console.log('[CommandChat] Loaded existing state:', JSON.stringify(state));

      // Always update from payload if provided (widget sends these)
      if (customer_name) state.customer_name = customer_name;
      if (customer_email) state.customer_email = customer_email;
      if (customer_phone) state.customer_phone = customer_phone;

      // Get existing metadata to merge with
      const existingConv = await dbQuery(url, key, 'conversations', `select=metadata,created_at&id=eq.${convId}`);
      const existingMetadata = existingConv?.[0]?.metadata || {};
      const sessionStart = existingConv?.[0]?.created_at;

      // Calculate session duration
      let duration_seconds = 0;
      if (sessionStart) {
        duration_seconds = Math.floor((Date.now() - new Date(sessionStart).getTime()) / 1000);
      }

      // Merge geo into existing metadata (don't replace)
      if (geo && !existingMetadata.geo) {
        const mergedMetadata = {
          ...existingMetadata,
          session_id,
          page_url: page_url || existingMetadata.page_url,
          geo,
          duration_seconds
        };
        await dbUpdate(url, key, 'conversations', `id=eq.${convId}`, {
          metadata: mergedMetadata
        });
        state.geo_captured = true;
        console.log('[CommandChat] Updated geo:', geo?.city, geo?.region);
      } else {
        // Just update duration
        await dbUpdate(url, key, 'conversations', `id=eq.${convId}`, {
          metadata: { ...existingMetadata, duration_seconds }
        });
      }
    } else {
      isNewConversation = true;
      // Initialize state with all provided customer data
      state = {};
      if (customer_name) state.customer_name = customer_name;
      if (customer_email) state.customer_email = customer_email;
      if (customer_phone) state.customer_phone = customer_phone;

      // Build metadata with geo, page_url, and session start
      const metadata: any = { 
        session_id,
        session_started_at: new Date().toISOString(),
        duration_seconds: 0
      };
      if (geo) {
        metadata.geo = geo;
        metadata.geo_city = geo.city || null;
        metadata.geo_region = geo.region || null;
        metadata.geo_country = geo.country_name || geo.country || null;
        state.geo_captured = true;
      }
      if (page_url) metadata.page_url = page_url;

      console.log('[CommandChat] Creating new conversation with state:', JSON.stringify(state), 'geo:', geo?.city, geo?.region);

      const newConv = await dbInsert(url, key, 'conversations', {
        channel: 'website', status: 'active',
        organization_id: ORG_ID,
        metadata,
        chat_state: state
      });
      convId = newConv[0]?.id;
    }

    // Create or update contact if we have email
    if (customer_email && !contactId) {
      try {
        // Check if contact exists
        const existingContacts = await dbQuery(url, key, 'contacts', `select=id&email=eq.${encodeURIComponent(customer_email)}`);

        if (existingContacts && existingContacts.length > 0) {
          contactId = existingContacts[0].id;
        } else {
          // Create new contact
          const newContact = await dbInsert(url, key, 'contacts', {
            organization_id: ORG_ID,
            name: customer_name || 'Website Visitor',
            email: customer_email,
            phone: customer_phone || null,
            source: 'website_chat'
          });
          contactId = newContact[0]?.id;
          console.log('[CommandChat] Created contact:', contactId);
        }

        // Link contact to conversation
        if (contactId) {
          await dbUpdate(url, key, 'conversations', `id=eq.${convId}`, { contact_id: contactId });
        }
      } catch (e) {
        console.error('[CommandChat] Contact creation error:', e);
      }
    }

    // Extract customer info from message text (email and name patterns)
    const emailMatch = message_text.match(/[\w.-]+@[\w.-]+\.\w+/i);
    if (emailMatch && !state.customer_email) {
      state.customer_email = emailMatch[0].toLowerCase();
      console.log('[CommandChat] Extracted email:', state.customer_email);
    }

    // Extract name patterns like "I'm Sarah", "I am John", "My name is Mike", "This is Tom"
    const namePatterns = [
      /(?:I'?m|I am|my name is|this is|name'?s?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /^([A-Z][a-z]+)\s+(?:here|at|from)/i,
      /(?:Hi|Hey|Hello),?\s*(?:I'?m|I am)?\s*([A-Z][a-z]+)/i
    ];
    for (const pattern of namePatterns) {
      const nameMatch = message_text.match(pattern);
      if (nameMatch && nameMatch[1] && !state.customer_name) {
        state.customer_name = nameMatch[1].trim();
        console.log('[CommandChat] Extracted name:', state.customer_name);
        break;
      }
    }

    // Save inbound with timestamp
    const now = new Date().toISOString();
    await dbInsert(url, key, 'messages', {
      conversation_id: convId, channel: 'website', direction: 'inbound', content: message_text, created_at: now
    });

    // Load history (the inbound message we just saved is already included)
    const history = await dbQuery(url, key, 'messages', `conversation_id=eq.${convId}&select=direction,content&order=created_at&limit=12`);
    let msgs = (history || [])
      .filter((m: any) => m.content && m.content.trim())
      .map((m: any) => ({ role: m.direction === 'inbound' ? 'user' : 'assistant', content: m.content }));
    // Anthropic requires the first turn to be a user message — drop any leading greeting/assistant turns
    while (msgs.length && msgs[0].role !== 'user') msgs.shift();
    // History already contains the current message; only append if it's somehow missing
    const last = msgs[msgs.length - 1];
    if (!last || last.role !== 'user' || last.content !== message_text) {
      msgs.push({ role: 'user', content: message_text });
    }

    // CONVERSION-FOCUSED PROMPT: Solve problems, guide to purchase naturally
    const prompt = `You are Ace, the WePrintWraps wrap concierge (weprintwraps.com) — a WePrintWraps × RestyleProAI assistant. WePrintWraps is a PRINT SHOP ONLY (no installation).

YOUR MISSION: Solve their problem and guide them to buy. Be genuinely helpful — the sale follows naturally.

IDENTITY:
- Your name is Ace. Greet people as Ace ("Hey, I'm Ace with WePrintWraps").
- You work with the WePrintWraps team — speak as "we"/"us" for the shop, and "I" as Ace.
- WePrintWraps × RestyleProAI: if asked, you're Ace, the WPW wrap assistant powered by RestyleProAI. Keep it warm and human, never robotic.
- Don't over-explain what you are — just help.

VOICE RULES (STRICT):
- Casual and short, like texting a coworker
- 1-3 sentences max
- NO emojis
- NO asterisks or bold formatting
- NO markdown formatting
- Plain text only
- Sound like a real person, not a bot

CUSTOMER STATE:
- Name: ${state.customer_name || 'NOT PROVIDED'}
- Email: ${state.customer_email || 'NOT PROVIDED'}
- Phone: ${state.customer_phone || 'Not provided'}
- Shop Name: ${state.shop_name || 'Not provided'}
- Vehicle: ${state.vehicle || 'Not mentioned'}
- SQFT: ${state.sqft || 'Unknown'}
- Quote: ${state.quoted_price ? '$' + state.quoted_price : 'Not given'}

CONVERSION MINDSET:
- Every answer should solve their problem AND include a way to buy
- Don't just answer questions — guide them to the next step
- After pricing, make it easy: "Ready to order? Here's the link..."
- Create urgency naturally: "Ships in 1-2 days" / "Free shipping on $750+"
- Remove friction: answer objections before they ask

PRODUCT URLS (always include the relevant one):

FULL WRAPS:
- Avery printed wrap: https://weprintwraps.com/our-products/avery-1105egrs-with-doz13607-lamination/
- 3M printed wrap: https://weprintwraps.com/our-products/3m-ij180-printed-wrap-film/
- Avery cut contour: https://weprintwraps.com/our-products/avery-cut-contour-vinyl-graphics-54-roll-max-artwork-size-50/
- 3M cut contour: https://weprintwraps.com/our-products/3m-cut-contour-vinyl-graphics-54-roll-max-artwork-size-50/
- Window perf: https://weprintwraps.com/our-products/perforated-window-vinyl-5050-unlaminated/

PRE-DESIGNED PATTERNS (by the yard):
- Camo & Carbon: https://weprintwraps.com/our-products/camo-carbon-wrap-by-the-yard/
- Metal & Marble: https://weprintwraps.com/our-products/wrap-by-the-yard-metal-marble/
- Wicked & Wild: https://weprintwraps.com/our-products/wrap-by-the-yard-wicked-wild-wrap-prints/
- Bape Camo: https://weprintwraps.com/our-products/wrap-by-the-yard-bape-camo/
- Modern & Trippy: https://weprintwraps.com/our-products/wrap-by-the-yard-modern-trippy/
- FadeWraps: https://weprintwraps.com/our-products/pre-designed-fade-wraps/

SPECIALTY:
- Wall graphics: https://weprintwraps.com/our-products/wall-wrap-printed-vinyl/
- Custom design: https://weprintwraps.com/our-products/custom-wrap-design/
- Design/file output: https://weprintwraps.com/our-products/design-setupfile-output/

INFO PAGES:
- Homepage: https://weprintwraps.com/
- How to order: https://weprintwraps.com/how-to-order/
- FAQs: https://weprintwraps.com/faqs/
- Shipping info: https://weprintwraps.com/#shipping
- Rewards: https://weprintwraps.com/reward-landing/
- Video gallery: https://weprintwraps.com/video-gallery/
- Design videos: https://weprintwraps.com/design-videos/
- Contact: https://weprintwraps.com/contact/

PRODUCT KNOWLEDGE:
- Window perf: NOT tint. Perforated vinyl for ads on glass. See-through from inside, graphics outside. 12-24 month durability. Always laminate.
- Cut contour / Labels / Decals / Stickers: We print, laminate, cut to shape, weed, and mask. Install-ready out of the box. No hand-trimming needed. MAX SIZE: 50" x any length (54" roll, minus bleed). If customer says "labels" or "decals" or "stickers", they mean CUT CONTOUR.
- Full wraps (Avery/3M): Max roll width 54" (4.5 feet). Most vehicles fit without seams.
- All wraps printed on 3M or Avery with UV inks, made in USA, ship in 1-2 business days.

VEHICLE RULE (CRITICAL):
- Stay focused on the vehicle shown above in CUSTOMER STATE
- Do NOT switch to a different vehicle unless the customer explicitly asks about a new one
- If the customer mentions a new vehicle, use cmd_vehicle to look it up and update

PRICING FLOW:
1. Customer mentions vehicle -> use cmd_vehicle to get sqft
2. After getting sqft -> use cmd_pricing to calculate
3. Give price + relevant order URL in same message
4. When they're ready to buy -> use cmd_cart to generate a real add-to-cart link and share it
5. After name + email + phone + vehicle + price confirmed -> use cmd_quote to save and send email

BUY / CART:
- When a customer says they're ready, asks "how do I order", "add to cart", "checkout", or "where do I buy", call cmd_cart and give them the link.
- cmd_cart returns a real weprintwraps.com cart link — paste it plainly so they can click and pay.

RESTYLEPROAI:
- If a customer is unsure how a wrap will look, mention RestyleProAI (our AI visualizer) — use cmd_knowledge topic "restyleproai" for details.

CONTACT COLLECTION (GET ALL 4):
- If name is NOT PROVIDED, ask for it naturally
- If email is NOT PROVIDED, ask for it
- If phone is "Not provided", ask: "What's the best number to reach you?"
- Get all 3 before sending the quote
- AFTER quote sent, ask: "By the way, what's your shop name?" (if not already known)
- Shop name helps us serve wrap shops better and offer trade pricing

PRICING RULES:
- Avery and 3M wraps are BOTH $5.27/sqft (same price)
- Window perf: $5.95/sqft
- Cut contour Avery: $6.32/sqft, 3M: $6.92/sqft
- Always state sqft and whether roof is included or excluded
- Free shipping on orders $750+
- Ships in 1-2 business days

FLEET/BULK DISCOUNTS (mention when multiple vehicles or high sqft):
- 500-999 sqft: 5% off
- 1000-1499 sqft: 10% off
- 1500-2499 sqft: 15% off
- 2500+ sqft: 20% off
If customer mentions fleet, multiple vehicles, or total sqft hits these tiers, calculate and show the discount. Upsell: "Add another vehicle and you'd hit the 10% tier"

REP REQUESTS / RUSH JOBS / REAL ISSUES:
- If the customer asks to talk to a rep, wants a callback, has a rush/urgent job, or has a real problem (damage, mistake, complaint), call cmd_escalate right away (support for callback/rush, quality for complaints/damage).
- Then confirm warmly in plain text, e.g. "Got it — I've flagged this for a rep and someone will reach out shortly. Anything I can help with in the meantime?"
- Keep helping them in chat while they wait; don't go silent.

WE PRINT AND SHIP ONLY - NO INSTALLATION EVER.
Contact: hello@weprintwraps.com`;

    let reply = "Hey! How can I help?";
    let escalatedThisTurn: string | null = null;
    let aiError: any = null;

    // OpenAI Chat Completions with function calling. Convert our tool defs to
    // OpenAI's schema, and put the system prompt as the first message.
    const oaTools = TOOLS.map((t: any) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));
    const oaMessages: any[] = [{ role: 'system', content: prompt }, ...msgs];

    async function callOpenAI(messages: any[]): Promise<{ r: Response; j: any }> {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${aiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODEL, max_tokens: 1024, messages, tools: oaTools, tool_choice: 'auto' })
      });
      const j = await r.json();
      return { r, j };
    }

    let { r: res, j: ai } = await callOpenAI(oaMessages);
    if (!res.ok || ai.error) {
      aiError = { status: res.status, model: MODEL, key_present: !!aiKey, error: ai?.error || ai };
      console.error('[Ace] OpenAI API error:', res.status, JSON.stringify(ai));
    }
    let assistantMsg = ai.choices?.[0]?.message;

    // Tool execution loop (OpenAI tool_calls). Guard against runaway loops.
    let guard = 0;
    while (assistantMsg?.tool_calls?.length && guard < 6) {
      guard++;
      // Append the assistant turn that requested the tools (required by OpenAI before tool results).
      oaMessages.push(assistantMsg);

      for (const call of assistantMsg.tool_calls) {
        const fnName = call.function?.name;
        let input: any = {};
        try { input = JSON.parse(call.function?.arguments || '{}'); } catch (_e) { input = {}; }

        // Pass all customer info to cmd_quote
        if (fnName === 'cmd_quote') {
          input.conversation_id = convId;
          if (!input.customer_name && state.customer_name) input.customer_name = state.customer_name;
          if (!input.customer_email && state.customer_email) input.customer_email = state.customer_email;
          if (!input.customer_phone && state.customer_phone) input.customer_phone = state.customer_phone;
          if (!input.vehicle && state.vehicle) input.vehicle = state.vehicle;
          if (!input.sqft && state.sqft) input.sqft = state.sqft;
          if (state.vehicle_year) input.vehicle_year = state.vehicle_year;
          if (state.vehicle_make) input.vehicle_make = state.vehicle_make;
          if (state.vehicle_model) input.vehicle_model = state.vehicle_model;
        }

        // Pass customer info to escalation
        if (fnName === 'cmd_escalate') {
          input.conversation_id = convId;
          input.customer_name = state.customer_name || null;
          input.customer_email = state.customer_email || null;
          input.customer_phone = state.customer_phone || null;
          input.vehicle = state.vehicle || null;
          input.trigger_message = message_text;
        }

        const r = await execTool(fnName, input, url, key, { email: state.customer_email, product_key: state.product_key });

        // Update state from tool results
        if (fnName === 'cmd_update_contact' && r.success && input.shop_name) {
          state.shop_name = input.shop_name;
        }
        if (fnName === 'cmd_vehicle' && r.sqft) {
          state.vehicle = r.vehicle;
          state.sqft = r.sqft;
          state.sqftWithRoof = r.sqft_with_roof;
          state.roof = r.roof;
          if (input.year) state.vehicle_year = input.year;
          if (input.make) state.vehicle_make = input.make;
          if (input.model) state.vehicle_model = input.model;
        }
        if (fnName === 'cmd_pricing' && r.prices) {
          state.calculated_price = r.prices.default;
          state.calculated_price_with_roof = r.prices.with_roof;
          if (r.product_key) state.product_key = r.product_key;
          if (r.cart_url) state.cart_url = r.cart_url;
        }
        if (fnName === 'cmd_cart' && r.cart_url) {
          state.cart_url = r.cart_url;
          if (r.product_key) state.product_key = r.product_key;
        }
        if (fnName === 'cmd_quote' && r.success) {
          state.quote_sent = true;
          state.quoted_price = r.price;
          state.quote_number = r.quote_number;
        }
        if (fnName === 'cmd_escalate' && r.success) {
          if (!state.escalations_sent) state.escalations_sent = [];
          state.escalations_sent.push(r.escalation_type);
          state.last_escalation = r.escalation_type;
          escalatedThisTurn = r.escalation_type || input.escalation_type;
          console.log('[Ace] Escalated to:', r.routed_to);
        }

        // Feed the tool result back to the model
        oaMessages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(r) });
      }

      ({ r: res, j: ai } = await callOpenAI(oaMessages));
      if (!res.ok || ai.error) {
        aiError = { status: res.status, model: MODEL, key_present: !!aiKey, error: ai?.error || ai, phase: 'tool_loop' };
        console.error('[Ace] OpenAI API error (tool loop):', res.status, JSON.stringify(ai));
        break;
      }
      assistantMsg = ai.choices?.[0]?.message;
    }

    const finalText = assistantMsg?.content;
    if (typeof finalText === 'string' && finalText.trim()) {
      reply = finalText;
    } else {
      // No text came back (usually an upstream API error) — give a helpful fallback, not silence
      console.error('[Ace] No text in AI response, finish_reason:', ai?.choices?.[0]?.finish_reason, 'err:', ai?.error?.message);
      reply = "Sorry, I hit a snag on my end — mind sending that again? Or email hello@weprintwraps.com and we'll jump right on it.";
    }

    // Generate synopsis
    const replyTime = new Date().toISOString();
    try {
      const synopsisResult = await execTool('cmd_synopsis', {
        message: message_text,
        vehicle: state.vehicle || null,
        sqft: state.sqft || null,
        price: state.calculated_price || state.quoted_price || null,
        email_captured: !!state.customer_email
      }, url, key);
      if (synopsisResult.synopsis) {
        state.ai_summary = synopsisResult.synopsis;
      }
    } catch (e) {
      console.log('[CommandChat] Synopsis generation failed:', e);
    }

    // Save updated state with timestamp
    console.log('[CommandChat] Saving state:', JSON.stringify(state));
    await dbUpdate(url, key, 'conversations', `id=eq.${convId}`, {
      chat_state: state,
      last_message_at: replyTime,
      updated_at: replyTime
    });
    await dbInsert(url, key, 'messages', {
      conversation_id: convId,
      channel: 'website',
      direction: 'outbound',
      content: reply,
      sender_name: 'Ace',
      created_at: replyTime
    });

    // The AI handles every chat. A human is only pinged when the customer explicitly
    // asks for a rep (the "Talk to a rep" button / rush jobs / real issues) -> cmd_escalate.
    try {
      if (escalatedThisTurn && !ESCALATION_TEST_OVERRIDE) {
        const shortSession = String(session_id).substring(0, 6);
        await sendOperatorSMS(
          `WPW CHAT - REP REQUESTED [${shortSession}] (${escalatedThisTurn})\n` +
          `${state.customer_name || 'Customer'} (${state.customer_email || 'no email'}${state.customer_phone ? ', ' + state.customer_phone : ''})\n` +
          `Said: "${message_text}"\n` +
          `Open WrapCommandAI to follow up.`
        );
      }
    } catch (smsErr) {
      console.error('[CommandChat] Operator notify failed:', smsErr);
    }

    return new Response(JSON.stringify({ success: true, reply, response: reply, conversation_id: convId, ...(debug ? { ai_error: aiError } : {}) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('[CommandChat] Error:', e);
    return new Response(JSON.stringify({ error: 'Error', reply: "Quick hiccup - what were you looking for?" }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
