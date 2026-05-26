// =====================================================
// RESTYLEPRO API
// Read-only API for the RestylePro AI app to tap into
// WePrintWraps website-chat data: conversations, full
// transcripts, and quotes.
//
// AUTH: send header  x-api-key: <RESTYLEPRO_API_KEY>
//   (RESTYLEPRO_API_KEY must be set as a Supabase secret;
//    if it is not set, every request is denied.)
//
// ENDPOINTS (GET):
//   ?resource=health
//   ?resource=conversations&limit=50&since=<ISO>&channel=website
//   ?resource=transcript&conversation_id=<uuid>
//   ?resource=quotes&limit=50&since=<ISO>
// =====================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clampLimit(raw: string | null, def: number, max: number): number {
  const n = parseInt(raw || "", 10);
  if (isNaN(n) || n <= 0) return def;
  return Math.min(n, max);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // ---- Auth (fail closed) ----
  const expectedKey = Deno.env.get("RESTYLEPRO_API_KEY");
  if (!expectedKey) {
    return json({ error: "API not configured. Set the RESTYLEPRO_API_KEY secret in Supabase." }, 503);
  }
  const providedKey = req.headers.get("x-api-key");
  if (!providedKey || providedKey !== expectedKey) {
    return json({ error: "Unauthorized. Send a valid x-api-key header." }, 401);
  }

  try {
    const supabaseUrl = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const u = new URL(req.url);
    const resource = u.searchParams.get("resource") || "health";

    // ---------------- HEALTH ----------------
    if (resource === "health") {
      return json({ ok: true, service: "restylepro-api", time: new Date().toISOString() });
    }

    // ---------------- CONVERSATIONS (list) ----------------
    if (resource === "conversations") {
      const limit = clampLimit(u.searchParams.get("limit"), 50, 500);
      const since = u.searchParams.get("since");
      const channel = u.searchParams.get("channel"); // optional; default all

      let q = supabase
        .from("conversations")
        .select("id, channel, status, chat_state, metadata, created_at, updated_at, last_message_at, contact_id");

      if (channel) q = q.eq("channel", channel);
      if (since) q = q.gte("last_message_at", since);

      const { data: conversations, error } = await q
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) return json({ error: error.message }, 500);

      // message counts + last message per conversation
      const ids = (conversations || []).map((c) => c.id);
      const counts: Record<string, number> = {};
      const lastInbound: Record<string, string> = {};
      if (ids.length > 0) {
        const { data: msgs } = await supabase
          .from("messages")
          .select("conversation_id, direction, content, created_at")
          .in("conversation_id", ids)
          .order("created_at", { ascending: true });
        for (const m of msgs || []) {
          counts[m.conversation_id] = (counts[m.conversation_id] || 0) + 1;
          if (m.direction === "inbound") lastInbound[m.conversation_id] = m.content;
        }
      }

      const out = (conversations || []).map((c: any) => {
        const cs = c.chat_state || {};
        const md = c.metadata || {};
        return {
          id: c.id,
          channel: c.channel,
          status: c.status,
          created_at: c.created_at,
          updated_at: c.updated_at,
          last_message_at: c.last_message_at,
          message_count: counts[c.id] || 0,
          customer_name: cs.customer_name || null,
          customer_email: cs.customer_email || null,
          customer_phone: cs.customer_phone || null,
          shop_name: cs.shop_name || null,
          vehicle: cs.vehicle || null,
          sqft: cs.sqft || null,
          quoted_price: cs.quoted_price || null,
          quote_number: cs.quote_number || null,
          ai_summary: cs.ai_summary || null,
          escalations_sent: cs.escalations_sent || [],
          last_customer_message: lastInbound[c.id] || null,
          session_id: md.session_id || null,
          page_url: md.page_url || null,
          geo_city: md.geo_city || md.geo?.city || null,
          geo_region: md.geo_region || md.geo?.region || null,
        };
      });

      return json({ count: out.length, conversations: out });
    }

    // ---------------- TRANSCRIPT (one conversation) ----------------
    if (resource === "transcript") {
      const conversationId = u.searchParams.get("conversation_id");
      if (!conversationId) return json({ error: "conversation_id is required" }, 400);

      const { data: conv, error: convErr } = await supabase
        .from("conversations")
        .select("id, channel, status, chat_state, metadata, created_at, updated_at, last_message_at")
        .eq("id", conversationId)
        .maybeSingle();

      if (convErr) return json({ error: convErr.message }, 500);
      if (!conv) return json({ error: "Conversation not found" }, 404);

      const { data: msgs, error: msgErr } = await supabase
        .from("messages")
        .select("id, direction, content, sender_name, created_at, metadata")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (msgErr) return json({ error: msgErr.message }, 500);

      const cs = conv.chat_state || {};
      const transcript = (msgs || []).map((m: any) => ({
        id: m.id,
        role: m.direction === "inbound" ? "customer" : "agent",
        sender_name: m.sender_name || (m.direction === "inbound" ? "Customer" : "WPW Team"),
        content: m.content,
        created_at: m.created_at,
      }));

      return json({
        conversation: {
          id: conv.id,
          channel: conv.channel,
          status: conv.status,
          created_at: conv.created_at,
          last_message_at: conv.last_message_at,
          customer_name: cs.customer_name || null,
          customer_email: cs.customer_email || null,
          customer_phone: cs.customer_phone || null,
          vehicle: cs.vehicle || null,
          quote_number: cs.quote_number || null,
          ai_summary: cs.ai_summary || null,
        },
        message_count: transcript.length,
        transcript,
      });
    }

    // ---------------- QUOTES ----------------
    if (resource === "quotes") {
      const limit = clampLimit(u.searchParams.get("limit"), 50, 500);
      const since = u.searchParams.get("since");

      let q = supabase
        .from("quotes")
        .select("id, quote_number, customer_name, customer_email, vehicle_year, vehicle_make, vehicle_model, sqft, total_price, price, price_per_sqft, material, status, source, email_sent, ai_generated, source_conversation_id, conversation_id, metadata, created_at, updated_at");

      if (since) q = q.gte("created_at", since);

      const { data: quotes, error } = await q
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) return json({ error: error.message }, 500);

      // status text drives conversion: 'converted'/'completed'/'paid' => converted
      const out = (quotes || []).map((row: any) => {
        const st = (row.status || "").toLowerCase();
        return {
          ...row,
          customer_phone: row.metadata?.customer_phone || null,
          is_converted: ["converted", "completed", "paid", "won"].includes(st),
        };
      });
      return json({ count: out.length, quotes: out });
    }

    // ---------------- STATS (conversion funnel) ----------------
    if (resource === "stats") {
      const since = u.searchParams.get("since"); // optional ISO; default all-time
      let q = supabase
        .from("quotes")
        .select("source, status, total_price, price, converted_to_order, conversion_revenue, followup_count, created_at");
      if (since) q = q.gte("created_at", since);
      const { data: rows, error } = await q.limit(5000);
      if (error) return json({ error: error.message }, 500);

      const bySource: Record<string, { quotes: number; converted: number; quoted_value: number; converted_revenue: number }> = {};
      let totalQuotes = 0, converted = 0, quotedValue = 0, convertedRevenue = 0, followupsSent = 0;
      for (const r of rows || []) {
        const src = r.source || "unknown";
        bySource[src] ||= { quotes: 0, converted: 0, quoted_value: 0, converted_revenue: 0 };
        const value = Number(r.total_price ?? r.price ?? 0);
        const isConv = !!r.converted_to_order;
        totalQuotes++; quotedValue += value;
        bySource[src].quotes++; bySource[src].quoted_value += value;
        followupsSent += Number(r.followup_count || 0);
        if (isConv) {
          converted++; convertedRevenue += Number(r.conversion_revenue ?? value ?? 0);
          bySource[src].converted++; bySource[src].converted_revenue += Number(r.conversion_revenue ?? value ?? 0);
        }
      }
      const round = (n: number) => Math.round(n * 100) / 100;
      for (const s of Object.values(bySource)) { s.quoted_value = round(s.quoted_value); s.converted_revenue = round(s.converted_revenue); }

      return json({
        since: since || "all_time",
        totals: {
          quotes: totalQuotes,
          converted,
          conversion_rate: totalQuotes ? round((converted / totalQuotes) * 100) : 0,
          quoted_value: round(quotedValue),
          converted_revenue: round(convertedRevenue),
          retargeting_emails_sent: followupsSent,
        },
        by_source: bySource,
      });
    }

    return json({ error: `Unknown resource '${resource}'. Use: health, conversations, transcript, quotes, stats.` }, 400);
  } catch (err) {
    console.error("[restylepro-api] Error:", err);
    return json({ error: err instanceof Error ? err.message : "Internal server error" }, 500);
  }
});
