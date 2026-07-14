// =====================================================
// WRAPGURU SHOPFLOW (delivery side)
//
// The heavy lifting — Stripe checkout, payment, and processing — is done by
// RestylePro's public bridge:
//   POST https://kfapjdyythzyvnpdeghu.supabase.co/functions/v1/shopflow-bridge
// command-chat's cmd_fix calls that bridge's `create` action directly and hands
// the customer the returned checkout_url. This function only:
//
//   ?action=callback  (bridge POSTs {job_id, service, status, output_urls} on
//                      completion) -> email the finished file to the customer
//                      and mark the job resolved.
//   ?action=status    -> thin proxy to the bridge's status (for the chat widget)
//
// Jobs are matched via the shopflow_job ai_actions row that cmd_fix wrote at
// create time (it holds job_id + customer_email + file_name).
// =====================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BRIDGE_URL = "https://kfapjdyythzyvnpdeghu.supabase.co/functions/v1/shopflow-bridge";

const SERVICE_LABEL: Record<string, string> = {
  upscale: "Print-Ready Upscale (4×)",
  cutpath: "Cut-Path / Contour Setup",
  recreate: "AI Design Recreate",
  production_pack: "Production Pack",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function sb() {
  const url = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key);
}

async function emailCustomer(job: any, outputUrls: any) {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey || !job?.customer_email) return;
  const label = SERVICE_LABEL[job.service] || "file fix";
  const dl = outputUrls?.upscaled_png || outputUrls?.output || (outputUrls && Object.values(outputUrls)[0]) || null;
  const first = (job.customer_name || "").split(" ")[0] || "there";
  const body = `
    <div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;">
      <h2>Your ${label} is ready 🎉</h2>
      <p>Hey ${first}, WrapGuru finished processing your file.</p>
      ${dl ? `<p><a href="${dl}" style="background:#e6007e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Download your file</a></p>
      <p style="color:#666;font-size:12px;">This download link is valid for 30 days.</p>` : ""}
      <p style="color:#666;font-size:13px;">Original: ${job.file_name || "your upload"}. Questions? Just reply.</p>
      <p style="color:#999;font-size:12px;">⚡ Powered by WrapCommandAI</p>
    </div>`;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "WrapGuru <hello@weprintwraps.com>", to: [job.customer_email], subject: `✅ Your ${label} is ready — WePrintWraps`, html: body }),
    });
  } catch (e) { console.error("[wrapguru-shopflow] email error:", e); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const u = new URL(req.url);
  let body: any = {};
  if (req.method === "POST") { try { body = await req.json(); } catch { body = {}; } }
  // Accept action from the query string OR the JSON body.
  const action = u.searchParams.get("action") || body.action || "";
  const supabase = sb();

  // ----- CALLBACK: bridge finished a job -> deliver to the customer -----
  if (action === "callback" || (body.job_id && body.status && !action)) {
    const jobId = String(body.job_id || "");
    const status = String(body.status || "");
    const outputUrls = body.output_urls || null;
    // Find the mapping row cmd_fix wrote (job_id + customer info).
    const { data: rows } = await supabase
      .from("ai_actions")
      .select("id, action_payload")
      .eq("action_type", "shopflow_job")
      .filter("action_payload->>job_id", "eq", jobId)
      .limit(1);
    const rec = rows?.[0];
    if (!rec) { console.warn("[wrapguru-shopflow] callback for unknown job", jobId); return json({ ok: true, note: "no local job" }); }
    const job = rec.action_payload || {};
    if (status === "complete") {
      await emailCustomer(job, outputUrls);
      await supabase.from("ai_actions").update({
        resolved: true, resolved_at: new Date().toISOString(),
        action_payload: { ...job, status: "complete", output_urls: outputUrls },
      }).eq("id", rec.id);
    } else {
      await supabase.from("ai_actions").update({ action_payload: { ...job, status } }).eq("id", rec.id);
    }
    return json({ ok: true });
  }

  // ----- STATUS: proxy to the bridge (chat widget polling) -----
  if (action === "status") {
    const jobId = String(body.job_id || u.searchParams.get("job_id") || "");
    try {
      const r = await fetch(BRIDGE_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "status", job_id: jobId }) });
      return json(await r.json());
    } catch (e) { return json({ ok: false, error: "status proxy failed" }, 502); }
  }

  return json({ ok: true, service: "wrapguru-shopflow", role: "delivery+status", bridge: BRIDGE_URL });
});
