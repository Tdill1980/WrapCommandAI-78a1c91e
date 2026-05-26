// =====================================================
// RECONCILE QUOTE CONVERSIONS
// Matches PAID WooCommerce orders (shopflow_orders) back to the
// originating quote (by customer email) and marks the quote converted
// with revenue. Idempotent. Intended to run on a schedule (hourly).
//
// AUTH: header  x-cron-secret: <CRON_SECRET>   (fails closed if unset)
// =====================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const secret = Deno.env.get("CRON_SECRET");
  if (!secret) return json({ error: "Not configured. Set CRON_SECRET secret." }, 503);
  if (req.headers.get("x-cron-secret") !== secret) return json({ error: "Unauthorized" }, 401);

  try {
    const url = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(url, key);

    // Look back window (days) - default 120
    let lookbackDays = 120;
    try {
      const b = await req.json();
      if (b?.lookback_days) lookbackDays = Number(b.lookback_days);
    } catch { /* no body */ }
    const sinceIso = new Date(Date.now() - lookbackDays * 86400000).toISOString();

    // Paid orders in window
    const { data: orders, error: ordErr } = await supabase
      .from("shopflow_orders")
      .select("order_number, woo_order_number, customer_email, order_total, woo_date_paid, created_at, is_paid")
      .eq("is_paid", true)
      .gte("created_at", sinceIso);

    if (ordErr) return json({ error: ordErr.message }, 500);

    let matched = 0;
    let skipped = 0;
    const details: any[] = [];

    for (const o of orders || []) {
      if (!o.customer_email) { skipped++; continue; }
      const email = o.customer_email.toLowerCase().trim();
      const paidAt = o.woo_date_paid || o.created_at;

      // Find the most recent UNCONVERTED quote for this email created on/before the order was paid
      const { data: quotes } = await supabase
        .from("quotes")
        .select("id, created_at, total_price, price")
        .ilike("customer_email", email)
        .eq("converted_to_order", false)
        .lte("created_at", paidAt)
        .order("created_at", { ascending: false })
        .limit(1);

      const quote = quotes?.[0];
      if (!quote) { skipped++; continue; }

      const { error: upErr } = await supabase
        .from("quotes")
        .update({
          converted_to_order: true,
          converted_at: paidAt,
          conversion_revenue: o.order_total ?? null,
          woo_order_number: o.woo_order_number ?? null,
          status: "converted",
          updated_at: new Date().toISOString(),
        })
        .eq("id", quote.id)
        .eq("converted_to_order", false); // guard against races / double counting

      if (upErr) { skipped++; continue; }
      matched++;
      details.push({ quote_id: quote.id, email, order_number: o.order_number, revenue: o.order_total });
    }

    return json({ success: true, lookback_days: lookbackDays, paid_orders_scanned: (orders || []).length, conversions_marked: matched, skipped, details });
  } catch (err) {
    console.error("[reconcile-quote-conversions] Error:", err);
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
