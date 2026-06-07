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

const MODEL = 'claude-sonnet-4-6';
const ORG_ID = '031ac427-f078-4086-a9bc-7bdb78cc1c73'; // WePrintWraps

// A human rep is only pinged when the customer asks for one (rush jobs / real issues)
const OPERATOR_PHONE = '+14807726003'; // Jackson

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
VEHICLE WRAPS (per sqft): avery_wrap, 3m_wrap ($5.27), window_perf ($5.32), cut_avery ($6.32), cut_3m ($6.92), wall_wrap ($3.25)
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
    description: "Create the quote and EMAIL it to the customer. Call this as soon as you have their email plus a vehicle and a price — do NOT wait for a phone number. Ask for phone and shop name AFTER the quote is sent.",
    input_schema: { type: "object", properties: { customer_name: { type: "string" }, customer_email: { type: "string" }, customer_phone: { type: "string" }, vehicle: { type: "string" }, sqft: { type: "number" }, price: { type: "number" }, product_name: { type: "string" } }, required: ["customer_email", "vehicle", "sqft", "price"] }
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

async function execTool(name: string, input: any, baseUrl: string, key: string, context?: { email?: string }): Promise<any> {
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

  // cmd_quote -> submit-quote: the PROVEN homepage quote tool (used by the RestylePro
  // homepage form). It does the authoritative sqft lookup, prices the wrap, and emails
  // the customer a polished quote via Resend (plus retargeting + CommercialPro routing).
  // We then stamp the conversation + org onto the quote row so it links back to the
  // transcript and shows in the admin Website-Chat Quotes panel.
  if (name === 'cmd_quote') {
    const embedSecret = Deno.env.get('WPW_EMBED_SECRET') || '';
    const quoteId = (globalThis as any).crypto?.randomUUID?.() ?? `wpw-chat-${Date.now()}`;
    const payload: any = {
      quote_id: quoteId,
      email: input.customer_email,
      name: input.customer_name || null,
      phone: input.customer_phone || null,
      vehicle: {
        year: input.vehicle_year != null ? String(input.vehicle_year) : undefined,
        make: input.vehicle_make || undefined,
        model: input.vehicle_model || undefined,
      },
      material: input.product_name && /3m/i.test(input.product_name) ? '3M' : 'Avery',
      source: 'website_chat',
      notes: input.vehicle ? `Website chat quote for ${input.vehicle}` : undefined,
    };
    console.log('[CommandChat] cmd_quote -> submit-quote:', JSON.stringify(payload));
    const sqRes = await fetch(`${baseUrl}/functions/v1/submit-quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-wpw-embed-secret': embedSecret },
      body: JSON.stringify(payload),
    });
    const sq = await sqRes.json().catch(() => ({}));
    console.log('[CommandChat] submit-quote result:', sqRes.status, JSON.stringify(sq));

    if (!sqRes.ok || sq?.success === false) {
      return { success: false, error: sq?.error || `submit-quote failed (${sqRes.status})` };
    }
    // Vehicle not in the pricing DB -> submit-quote does NOT email. Don't claim success.
    if (sq?.needs_review) {
      return { success: false, needs_review: true, message: sq?.message || 'This one needs a quick manual pricing review.' };
    }

    // Link the new quote to this conversation + the real WePrintWraps org
    try {
      await fetch(`${baseUrl}/rest/v1/quotes?id=eq.${sq.quote_id}`, {
        method: 'PATCH',
        headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          source_conversation_id: input.conversation_id || null,
          organization_id: input.organization_id || null,
        }),
      });
    } catch (e) {
      console.error('[CommandChat] quote link patch failed:', e);
    }

    return {
      success: true,
      quote_number: sq.quote_number,
      material_cost: sq.price ?? sq.estimated_price ?? null,
      price: sq.price ?? sq.estimated_price ?? null,
      email_sent: !!sq.emailSent,
    };
  }

  const map: Record<string, string> = { cmd_knowledge: 'cmd-knowledge', cmd_vehicle: 'cmd-vehicle', cmd_pricing: 'cmd-pricing', cmd_synopsis: 'cmd-synopsis', cmd_order: 'cmd-order', cmd_escalate: 'cmd-escalate' };
  console.log(`[CommandChat] Calling ${name}:`, JSON.stringify(input));
  const res = await fetch(`${baseUrl}/functions/v1/${map[name]}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify(input)
  });
  const result = await res.json();
  console.log(`[CommandChat] ${name} result:`, JSON.stringify(result));
  return result;
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
    const { session_id, message_text, customer_name, customer_email, customer_phone, geo, page_url } = body;

    console.log('[CommandChat] Received:', { session_id, message_text: message_text?.substring(0, 50), customer_name, customer_email, geo: geo?.city });

    if (!message_text || !session_id) {
      return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: corsHeaders });
    }

    const url = Deno.env.get('EXTERNAL_SUPABASE_URL') || Deno.env.get('SUPABASE_URL')!;
    const key = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const aiKey = Deno.env.get('ANTHROPIC_API_KEY')!;

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
    const prompt = `You are a member of the WePrintWraps team (weprintwraps.com) — we are a PRINT SHOP ONLY (no installation).

YOUR MISSION: Solve their problem and guide them to buy. Be genuinely helpful — the sale follows naturally. Answer fast and directly from what you already know; only use a tool when you actually need a vehicle sqft, a calculated price, an order lookup, or to send a quote.

IDENTITY:
- You're a real WePrintWraps team member helping over chat. Speak as "we"/"us" (the WPW team).
- Do NOT use a personal name or claim to be a specific person. If asked your name, say you're part of the WePrintWraps team.
- Never say you're an AI, a bot, or an assistant.

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
1. Customer mentions a vehicle -> get the YEAR, make, and model (the quote email needs all three), then use cmd_vehicle to get sqft
2. After getting sqft -> use cmd_pricing to calculate
3. Give price + relevant order URL in same message
4. Offer to email the quote: "Want me to email you this quote so you've got it on file?"
5. As soon as you have their email + vehicle + price -> use cmd_quote to save and EMAIL it. Do NOT wait for a phone number.

CONTACT COLLECTION:
- Email is the priority — once you have a price, ask for their email so you can send the quote
- The moment you have email + vehicle + price, call cmd_quote (it emails them automatically)
- AFTER the quote is sent, THEN collect the rest: "What's the best number to reach you?" and "What's your shop name?" (if not already known)
- Shop name helps us serve wrap shops better and offer trade pricing

PRICING RULES:
- Avery and 3M wraps are BOTH $5.27/sqft (same price)
- Window perf: $5.32/sqft
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
    let quoteSentThisTurn: { email: string; quote_number: string; amount: number; sent_at: string } | null = null;
    let res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': aiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 1024, system: prompt, tools: TOOLS, messages: msgs })
    });

    let ai = await res.json();
    if (!res.ok || ai.type === 'error') {
      console.error('[CommandChat] Anthropic API error:', res.status, JSON.stringify(ai));
    }

    // Tool execution loop
    while (ai.stop_reason === 'tool_use') {
      const calls = ai.content.filter((b: any) => b.type === 'tool_use');
      const results: any[] = [];

      for (const c of calls) {
        // FIX: Pass all customer info to cmd_quote
        if (c.name === 'cmd_quote') {
          c.input.conversation_id = convId;
          // Quotes, follow-up tasks and revenue must land in the real WePrintWraps org
          c.input.organization_id = ORG_ID;
          // Ensure we pass stored customer info if not in the call
          if (!c.input.customer_name && state.customer_name) c.input.customer_name = state.customer_name;
          if (!c.input.customer_email && state.customer_email) c.input.customer_email = state.customer_email;
          if (!c.input.customer_phone && state.customer_phone) c.input.customer_phone = state.customer_phone;
          if (!c.input.vehicle && state.vehicle) c.input.vehicle = state.vehicle;
          if (!c.input.sqft && state.sqft) c.input.sqft = state.sqft;
          // Structured vehicle for the homepage quote tool (submit-quote)
          if (state.vehicle_year) c.input.vehicle_year = state.vehicle_year;
          if (state.vehicle_make) c.input.vehicle_make = state.vehicle_make;
          if (state.vehicle_model) c.input.vehicle_model = state.vehicle_model;
        }

        // Pass customer info to escalation
        if (c.name === 'cmd_escalate') {
          c.input.conversation_id = convId;
          c.input.customer_name = state.customer_name || null;
          c.input.customer_email = state.customer_email || null;
          c.input.customer_phone = state.customer_phone || null;
          c.input.vehicle = state.vehicle || null;
          c.input.trigger_message = message_text;
        }

        const r = await execTool(c.name, c.input, url, key, { email: state.customer_email });

        // Update state from tool results
        if (c.name === 'cmd_update_contact' && r.success && c.input.shop_name) {
          state.shop_name = c.input.shop_name;
        }
        if (c.name === 'cmd_vehicle' && r.sqft) {
          state.vehicle = r.vehicle;
          state.sqft = r.sqft;
          state.sqftWithRoof = r.sqft_with_roof;
          state.roof = r.roof;
          // Keep the structured make/model/year so the homepage quote tool can re-price authoritatively
          if (c.input.year) state.vehicle_year = c.input.year;
          if (c.input.make) state.vehicle_make = c.input.make;
          if (c.input.model) state.vehicle_model = c.input.model;
        }
        if (c.name === 'cmd_pricing' && r.prices) {
          state.calculated_price = r.prices.default;
          state.calculated_price_with_roof = r.prices.with_roof;
        }
        if (c.name === 'cmd_quote' && r.success) {
          // create-quote-from-chat returns material_cost (not price) — map it correctly
          const quoteAmount = r.material_cost ?? r.total_price ?? r.price ?? c.input.price ?? 0;
          state.quote_sent = true;
          state.quoted_price = quoteAmount;
          state.quote_number = r.quote_number;
          quoteSentThisTurn = {
            email: c.input.customer_email || state.customer_email || '',
            quote_number: r.quote_number || '',
            amount: quoteAmount,
            sent_at: new Date().toISOString(),
          };
        }
        if (c.name === 'cmd_escalate' && r.success) {
          if (!state.escalations_sent) state.escalations_sent = [];
          state.escalations_sent.push(r.escalation_type);
          state.last_escalation = r.escalation_type;
          escalatedThisTurn = r.escalation_type || c.input.escalation_type;
          console.log('[CommandChat] Escalated to:', r.routed_to);
        }

        results.push({ type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(r) });
      }

      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': aiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODEL, max_tokens: 1024, system: prompt, tools: TOOLS, messages: [...msgs, { role: 'assistant', content: ai.content }, { role: 'user', content: results }] })
      });
      ai = await res.json();
      if (!res.ok || ai.type === 'error') {
        console.error('[CommandChat] Anthropic API error (tool loop):', res.status, JSON.stringify(ai));
        break;
      }
    }

    const txt = ai.content?.find((b: any) => b.type === 'text');
    if (txt && txt.text?.trim()) {
      reply = txt.text;
    } else {
      // No text came back (usually an upstream API error) — give a helpful fallback, not silence
      console.error('[CommandChat] No text in AI response, last stop_reason:', ai?.stop_reason, 'err:', ai?.error?.message);
      reply = "Sorry, I hit a snag on my end — mind sending that again? Or email hello@weprintwraps.com and we'll jump right on it.";
    }

    const replyTime = new Date().toISOString();

    // Persist state + the outbound reply IMMEDIATELY so the customer is never kept waiting.
    // The internal synopsis is generated in the background below (it used to add a full
    // extra AI round-trip to every reply — that was the "delay" customers felt).
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
      sender_name: 'WPW Team',
      created_at: replyTime
    });

    // Fire-and-forget: build the admin synopsis AFTER replying so it never delays the customer.
    const synopsisTask = (async () => {
      try {
        const synopsisResult = await execTool('cmd_synopsis', {
          message: message_text,
          vehicle: state.vehicle || null,
          sqft: state.sqft || null,
          price: state.calculated_price || state.quoted_price || null,
          email_captured: !!state.customer_email
        }, url, key);
        if (synopsisResult?.synopsis) {
          await dbUpdate(url, key, 'conversations', `id=eq.${convId}`, {
            chat_state: { ...state, ai_summary: synopsisResult.synopsis }
          });
        }
      } catch (e) {
        console.log('[CommandChat] Synopsis generation failed:', e);
      }
    })();
    // Keep the worker alive to finish the background task without blocking the response.
    try { (globalThis as any).EdgeRuntime?.waitUntil?.(synopsisTask); } catch (_) { /* local dev: just let it run */ }

    // The AI handles every chat. A human is only pinged when the customer explicitly
    // asks for a rep (the "Talk to a rep" button / rush jobs / real issues) -> cmd_escalate.
    try {
      if (escalatedThisTurn) {
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

    return new Response(JSON.stringify({
      success: true,
      reply,
      response: reply,
      conversation_id: convId,
      // Surface a backend-confirmed "quote sent" receipt so the chat widget can show it
      quote_sent: !!quoteSentThisTurn,
      quote_email: quoteSentThisTurn?.email || null,
      quote_number: quoteSentThisTurn?.quote_number || null,
      quote_amount: quoteSentThisTurn?.amount ?? null,
      quote_sent_at: quoteSentThisTurn?.sent_at || null,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('[CommandChat] Error:', e);
    return new Response(JSON.stringify({ error: 'Error', reply: "Quick hiccup - what were you looking for?" }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
