// =====================================================
// RUN QUOTE RETARGETING (MightyMail)
// Sends cadence follow-up emails to UNCONVERTED quotes:
//   day >=1 & 0 sent  -> follow-up #1
//   day >=3 & 1 sent  -> follow-up #2
//   day >=7 & 2 sent  -> follow-up #3 (final)
// Skips converted / opted-out / no-email. Caps at 3.
// Intended to run on a schedule (hourly is fine; gating is by age).
//
// AUTH: header  x-cron-secret: <CRON_SECRET>   (fails closed if unset)
// =====================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { emailsPaused, pausedResponse } from "../_shared/email-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const SUBJECTS = [
  "Still thinking about your wrap? Here's your quote",
  "Your WePrintWraps quote is ready when you are",
  "Last nudge on your wrap quote",
];

function ageDays(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}

// returns the cadence step due (1,2,3) or 0 if none
function dueStep(followupCount: number, createdAt: string, lastFollowupAt: string | null): number {
  const age = ageDays(createdAt);
  // don't send more than one follow-up per ~20h
  if (lastFollowupAt && ageDays(lastFollowupAt) < 0.8) return 0;
  if (followupCount === 0 && age >= 1) return 1;
  if (followupCount === 1 && age >= 3) return 2;
  if (followupCount === 2 && age >= 7) return 3;
  return 0;
}

function emailHtml(step: number, q: any): string {
  const vehicle = [q.vehicle_year, q.vehicle_make, q.vehicle_model].filter(Boolean).join(" ") || "your vehicle";
  const price = (q.total_price ?? q.price) != null ? `$${Number(q.total_price ?? q.price).toFixed(2)}` : null;
  const orderLink = q.quote_number ? `https://weprintwraps.com/?quote=${q.quote_number}` : "https://weprintwraps.com/";
  const intro = step === 1
    ? "Just following up on the wrap quote we put together for you."
    : step === 2
    ? "Wanted to make sure you saw your wrap quote - happy to answer any questions."
    : "Last check-in on your wrap quote before it ages out.";
  return `<!DOCTYPE html><html><body style="margin:0;background:#f7f7f7;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f7;padding:32px 16px;"><tr><td align="center">
  <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08);">
    <tr><td style="background:#0f172a;padding:22px;text-align:center;">
      <div style="font-size:22px;font-weight:800;color:#fff;">WePrintWraps.com</div>
      <div style="margin-top:4px;font-size:11px;letter-spacing:2px;color:#38bdf8;">PRINT-ONLY WHOLESALE WRAP PRICING</div>
    </td></tr>
    <tr><td style="padding:32px 28px;color:#1a1a1a;">
      <p style="font-size:15px;margin:0 0 16px;">${intro}</p>
      <table width="100%" style="background:#f8f9fa;border-radius:8px;margin:0 0 20px;" cellpadding="12">
        ${q.quote_number ? `<tr><td style="color:#666;font-size:13px;">Quote #</td><td style="text-align:right;font-weight:600;">${q.quote_number}</td></tr>` : ""}
        <tr><td style="color:#666;font-size:13px;">Vehicle</td><td style="text-align:right;font-weight:600;">${vehicle}</td></tr>
        ${q.sqft ? `<tr><td style="color:#666;font-size:13px;">Coverage</td><td style="text-align:right;">${q.sqft} sq ft</td></tr>` : ""}
        ${price ? `<tr><td style="color:#666;font-size:13px;">Print-only total</td><td style="text-align:right;font-weight:700;color:#00AFFF;">${price}</td></tr>` : ""}
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;"><tr><td align="center">
        <a href="${orderLink}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:14px 44px;border-radius:8px;font-weight:700;">ORDER NOW</a>
      </td></tr></table>
      <p style="font-size:13px;color:#444;margin:0 0 6px;">Ships in 1-2 business days. Free shipping on orders $750+.</p>
      <p style="font-size:13px;color:#444;margin:0;">Questions? Just reply or email hello@weprintwraps.com.</p>
    </td></tr>
    <tr><td style="background:#1a1a1a;padding:18px;text-align:center;">
      <a href="https://weprintwraps.com" style="color:#00AFFF;text-decoration:none;font-size:12px;">weprintwraps.com</a>
      <div style="color:#888;font-size:11px;margin-top:6px;">Reply STOP or email us to stop these reminders.</div>
    </td></tr>
  </table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method !== "OPTIONS" && emailsPaused()) return pausedResponse(corsHeaders);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const secret = Deno.env.get("CRON_SECRET");
  if (!secret) return json({ error: "Not configured. Set CRON_SECRET secret." }, 503);
  if (req.headers.get("x-cron-secret") !== secret) return json({ error: "Unauthorized" }, 401);

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return json({ error: "RESEND_API_KEY not set" }, 503);

  try {
    const url = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(url, key);
    const resend = new Resend(resendKey);

    // Candidate quotes: unconverted, not opted out, not maxed, with a real email, created in last 45 days
    const sinceIso = new Date(Date.now() - 45 * 86400000).toISOString();
    const { data: quotes, error } = await supabase
      .from("quotes")
      .select("id, quote_number, customer_email, customer_name, vehicle_year, vehicle_make, vehicle_model, sqft, total_price, price, followup_count, last_followup_at, created_at")
      .eq("converted_to_order", false)
      .eq("retarget_opt_out", false)
      .lt("followup_count", 3)
      .gte("created_at", sinceIso)
      .not("customer_email", "is", null)
      .limit(200);

    if (error) return json({ error: error.message }, 500);

    let sent = 0;
    let skipped = 0;
    const errors: any[] = [];

    for (const q of quotes || []) {
      const email = (q.customer_email || "").trim();
      if (!email || email.includes("@capture.local")) { skipped++; continue; }
      const step = dueStep(q.followup_count || 0, q.created_at, q.last_followup_at);
      if (step === 0) { skipped++; continue; }

      try {
        await resend.emails.send({
          from: "WePrintWraps <hello@weprintwraps.com>",
          to: [email],
          subject: SUBJECTS[step - 1],
          html: emailHtml(step, q),
        });
        await supabase
          .from("quotes")
          .update({ followup_count: (q.followup_count || 0) + 1, last_followup_at: new Date().toISOString() })
          .eq("id", q.id);
        sent++;
      } catch (e) {
        errors.push({ quote_id: q.id, error: String(e) });
      }
    }

    return json({ success: true, candidates: (quotes || []).length, emails_sent: sent, skipped, errors });
  } catch (err) {
    console.error("[run-quote-retargeting] Error:", err);
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
