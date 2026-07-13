// ──────────────────────────────────────────────────────────────────────
// backfill-missing-orders
//
// Recovers PAID WooCommerce orders that never reached shopflow_orders
// (e.g. the Feb 17 2026 → present webhook outage). Pages through the Woo
// REST API from `since`, skips orders already in shopflow_orders, and
// inserts the missing ones using the same field mapping as bulk-sync-orders.
//
// SAFE BY DESIGN:
//   • dryRun defaults to TRUE — first call reports what WOULD be inserted.
//   • Existing orders are never touched (insert-only, matched on
//     woo_order_id OR order_number).
//   • Sends NO customer emails, NO Klaviyo events, NO SMS. Recovery only.
//
// Request (POST, all optional):
//   { since?: "2026-02-17T00:00:00", pages?: 5, perPage?: 100, dryRun?: true }
// Response:
//   { ok, dryRun, scanned, alreadySynced, missing, inserted, failed,
//     oldest, newest, sample: [...first 20 missing], errors? }
//
// Run the real backfill with {"dryRun": false}. Re-running is idempotent.
// ──────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PAID_STATUSES = ['processing', 'completed'];

function normalizeStatus(value: any): string {
  if (!value) return "";
  return value.toString().trim().toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-");
}

const wooToInternalStatus: Record<string, string> = {
  "processing": "in_production",
  "waiting-to-place-order": "order_received",
  "waiting-on-email-response": "order_received",
  "add-on": "order_received",
  "dropbox-link-sent": "order_received",
  "in-design": "in_design",
  "lance": "in_design",
  "manny": "in_design",
  "file-error": "action_required",
  "missing-file": "action_required",
  "design-complete": "awaiting_approval",
  "work-order-printed": "awaiting_approval",
  "ready-for-print": "preparing_for_print",
  "pre-press": "preparing_for_print",
  "print-production": "in_production",
  "lamination": "in_production",
  "finishing": "in_production",
  "ready-for-pickup": "ready_or_shipped",
  "shipping-cost": "ready_or_shipped",
  "shipped": "ready_or_shipped",
  "completed": "completed"
};

const internalToCustomerStatus: Record<string, string> = {
  order_received: "Order Received",
  in_design: "In Design",
  action_required: "Action Needed",
  awaiting_approval: "Awaiting Approval",
  preparing_for_print: "Preparing for Print",
  in_production: "In Production",
  ready_or_shipped: "Ready / Shipped",
  completed: "Completed"
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    let body: any = {};
    try { body = await req.json(); } catch { /* defaults */ }

    const since = String(body?.since || '2026-02-17T00:00:00');
    const maxPages = Math.min(Math.max(parseInt(body?.pages) || 5, 1), 20);
    const perPage = Math.min(Math.max(parseInt(body?.perPage) || 100, 1), 100);
    const dryRun = body?.dryRun !== false; // must pass {"dryRun": false} to write

    const wooKey = Deno.env.get('WOO_CONSUMER_KEY');
    const wooSecret = Deno.env.get('WOO_CONSUMER_SECRET');
    if (!wooKey || !wooSecret) return json(500, { ok: false, error: 'WooCommerce credentials not configured' });

    const supabase = createClient(
      Deno.env.get('EXTERNAL_SUPABASE_URL') || Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const authHeader = `Basic ${btoa(`${wooKey}:${wooSecret}`)}`;

    // 1) Pull paid Woo orders since the outage began (header auth — not query-string).
    const wooOrders: any[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const url = `https://weprintwraps.com/wp-json/wc/v3/orders?after=${encodeURIComponent(since)}` +
        `&status=processing,completed&orderby=date&order=asc&per_page=${perPage}&page=${page}`;
      const res = await fetch(url, { headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' } });
      if (!res.ok) {
        const text = await res.text();
        return json(502, { ok: false, error: `WooCommerce API ${res.status} on page ${page}: ${text.slice(0, 300)}`, scanned: wooOrders.length });
      }
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) break;
      wooOrders.push(...data);
      if (data.length < perPage) break;
    }

    if (wooOrders.length === 0) {
      return json(200, { ok: true, dryRun, scanned: 0, alreadySynced: 0, missing: 0, inserted: 0, failed: 0, note: 'No paid Woo orders found after ' + since });
    }

    // 2) Which of these already exist in shopflow_orders?
    const wooIds = wooOrders.map((o) => o.id);
    const wooNumbers = wooOrders.map((o) => String(o.number));
    const { data: existingRows, error: exErr } = await supabase
      .from('shopflow_orders')
      .select('woo_order_id, order_number')
      .or(`woo_order_id.in.(${wooIds.join(',')}),order_number.in.(${wooNumbers.map((n) => `"${n}"`).join(',')})`);
    if (exErr) return json(500, { ok: false, error: 'Lookup failed: ' + exErr.message });

    const haveIds = new Set((existingRows || []).map((r: any) => r.woo_order_id));
    const haveNums = new Set((existingRows || []).map((r: any) => String(r.order_number)));
    const missing = wooOrders.filter((o) => !haveIds.has(o.id) && !haveNums.has(String(o.number)));

    const sample = missing.slice(0, 20).map((o) => ({
      order: o.number, date: o.date_created, status: o.status,
      total: o.total, customer: `${o.billing?.first_name || ''} ${o.billing?.last_name || ''}`.trim(),
    }));

    let inserted = 0, failed = 0;
    const errors: string[] = [];

    // 3) Insert the missing ones (unless dry run). Insert-only — never updates.
    if (!dryRun) {
      for (const order of missing) {
        try {
          const wooStatus = normalizeStatus(order.status);
          const internalStatus = wooToInternalStatus[wooStatus] || 'order_received';
          const isPaid = PAID_STATUSES.includes(wooStatus) || !!order.date_paid;
          const { error: insErr } = await supabase.from('shopflow_orders').insert({
            order_number: String(order.number),
            woo_order_id: order.id,
            woo_order_number: order.number,
            woo_status_raw: order.status,
            woo_date_paid: order.date_paid || null,
            is_paid: isPaid,
            order_total: parseFloat(order.total || '0') || 0,
            customer_name: `${order.billing?.first_name || ''} ${order.billing?.last_name || ''}`.trim() || 'Unknown Customer',
            customer_email: order.billing?.email || null,
            product_type: order.line_items?.length > 1
              ? `${order.line_items[0]?.name} + ${order.line_items.length - 1} more items`
              : (order.line_items?.[0]?.name || 'Unknown Product'),
            status: internalStatus,
            customer_stage: internalToCustomerStatus[internalStatus] ? internalStatus : 'order_received',
            priority: internalStatus === 'action_required' ? 'high' : 'normal',
            created_at: order.date_created,
            updated_at: new Date().toISOString(),
          });
          if (insErr) throw insErr;
          inserted++;
        } catch (e: any) {
          failed++;
          errors.push(`Order ${order.number}: ${e.message}`);
        }
      }
    }

    return json(200, {
      ok: true, dryRun,
      scanned: wooOrders.length,
      alreadySynced: wooOrders.length - missing.length,
      missing: missing.length,
      inserted, failed,
      oldest: wooOrders[0]?.date_created || null,
      newest: wooOrders[wooOrders.length - 1]?.date_created || null,
      sample,
      errors: errors.length ? errors.slice(0, 25) : undefined,
      next: missing.length && dryRun
        ? 'Re-run with {"dryRun": false} to insert these orders. Re-run with a later "since" (or more "pages") to continue.'
        : undefined,
    });
  } catch (error: any) {
    return json(500, { ok: false, error: error.message });
  }
});
