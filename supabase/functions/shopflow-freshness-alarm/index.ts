// ──────────────────────────────────────────────────────────────────────
// shopflow-freshness-alarm
//
// The Feb 17 2026 → July webhook outage went unnoticed for ~5 months
// because nothing watched whether orders were still flowing. This closes
// that gap: if NO new order has landed in shopflow_orders within the
// threshold (default 24h), it emails trish@weprintwraps.com.
//
// Read-only against orders; the only side effect is the alert email
// (at most one per ALERT_COOLDOWN_HOURS, tracked in ai_actions).
//
// Request (POST, optional): { thresholdHours?: 24 }
// Response: { ok, stale, lastOrderAt, hoursSinceLastOrder, alerted }
//
// Schedule after deploy (Supabase Dashboard → Database → Cron, hourly):
//   select net.http_post(
//     url    := 'https://qxllysilzonrlyoaomce.supabase.co/functions/v1/shopflow-freshness-alarm',
//     headers:= '{"Content-Type":"application/json"}'::jsonb,
//     body   := '{}'::jsonb
//   );
// ──────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { Resend } from 'https://esm.sh/resend@2.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const NOTIFY_TO = 'trish@weprintwraps.com';
const ALERT_COOLDOWN_HOURS = 12; // never email more than twice a day
const ALERT_ACTION_TYPE = 'shopflow_freshness_alert';

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
    const thresholdHours = Math.min(Math.max(Number(body?.thresholdHours) || 24, 1), 168);

    const supabase = createClient(
      Deno.env.get('EXTERNAL_SUPABASE_URL') || Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: newest, error } = await supabase
      .from('shopflow_orders')
      .select('created_at, order_number')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return json(500, { ok: false, error: error.message });

    const lastOrderAt = newest?.created_at || null;
    const hoursSince = lastOrderAt
      ? (Date.now() - new Date(lastOrderAt).getTime()) / 36e5
      : Infinity;
    const stale = hoursSince > thresholdHours;

    let alerted = false;
    if (stale) {
      // Cooldown: skip if we already alerted recently.
      const cutoff = new Date(Date.now() - ALERT_COOLDOWN_HOURS * 36e5).toISOString();
      const { data: recent } = await supabase
        .from('ai_actions')
        .select('id')
        .eq('action_type', ALERT_ACTION_TYPE)
        .gte('created_at', cutoff)
        .limit(1);

      if (!recent || recent.length === 0) {
        const resendKey = Deno.env.get('RESEND_API_KEY');
        if (resendKey) {
          const hrs = isFinite(hoursSince) ? hoursSince.toFixed(1) : 'unknown';
          const resend = new Resend(resendKey);
          const r = await resend.emails.send({
            from: 'WrapCommand Alerts <noreply@restyleproai.com>',
            to: [NOTIFY_TO],
            subject: `⚠️ No new orders synced in ${hrs} hours — check the Woo webhook`,
            html: `<div style="font-family:-apple-system,sans-serif;color:#111;max-width:560px;">
              <h2 style="margin:0 0 8px;">Order sync looks stalled</h2>
              <p>The newest order in ShopFlow is <b>#${newest?.order_number || '—'}</b>, received
              <b>${lastOrderAt ? new Date(lastOrderAt).toLocaleString('en-US') : 'never'}</b>
              (${hrs} hours ago). Threshold: ${thresholdHours}h.</p>
              <p><b>Check, in order:</b></p>
              <ol>
                <li>WooCommerce → Orders — are new paid orders arriving on the store?</li>
                <li>WooCommerce → Settings → Advanced → Webhooks — is the ShopFlow webhook <b>Active</b>? (Woo auto-disables it after repeated delivery failures.)</li>
                <li>Run <code>backfill-missing-orders</code> to recover anything missed.</li>
              </ol>
              <p style="color:#6b7280;font-size:12px;">Sent by shopflow-freshness-alarm. You'll get at most one of these every ${ALERT_COOLDOWN_HOURS}h while the sync is stalled.</p>
            </div>`,
          });
          alerted = !r.error;
          if (r.error) console.error('[freshness-alarm] email failed:', r.error);
        } else {
          console.warn('[freshness-alarm] RESEND_API_KEY not set — cannot alert');
        }

        // Record the alert (best-effort) so the cooldown works.
        try {
          await supabase.from('ai_actions').insert({
            action_type: ALERT_ACTION_TYPE,
            preview: `No orders synced in ${isFinite(hoursSince) ? hoursSince.toFixed(1) : '?'}h (email ${alerted ? 'sent' : 'failed'})`,
            action_payload: { lastOrderAt, hoursSince: isFinite(hoursSince) ? +hoursSince.toFixed(1) : null, thresholdHours, alerted },
          });
        } catch (e) {
          console.error('[freshness-alarm] could not record alert:', e);
        }
      }
    }

    return json(200, {
      ok: true,
      stale,
      lastOrderAt,
      hoursSinceLastOrder: isFinite(hoursSince) ? +hoursSince.toFixed(1) : null,
      thresholdHours,
      alerted,
    });
  } catch (error: any) {
    return json(500, { ok: false, error: error.message });
  }
});
