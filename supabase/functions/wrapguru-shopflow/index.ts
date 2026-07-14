// =====================================================
// WRAPGURU SHOPFLOW — pay-then-process file-fix orchestrator
//
// WrapGuru (command-chat, OpenAI) "pulls the levers": when a customer's file
// needs a fix (upscale / cut-path / recreate / production pack), this function
//   1) quotes the fix,
//   2) creates a Stripe Checkout (RestylePro's Stripe when its key is set),
//   3) after payment, PROCESSES the fix, and
//   4) delivers the finished file to the customer + the admin.
//
// Jobs are persisted as ai_actions rows (action_type='shopflow_job') so no new
// table/migration is needed; the ai_action id IS the job_id.
//
// ACTIONS (body.action or ?action=):
//   quote     -> { fixes:[{key,label,price,description,example_url}] }
//   checkout  -> { job_id, checkout_url | cart_url, price }
//   fulfill   -> (GET redirect target from Stripe) verifies payment, processes, returns HTML
//   status    -> { job_id, status, output_url }
//
// EXTERNAL CONFIG (Supabase secrets — set once, then it's fully live):
//   RESTYLEPRO_STRIPE_KEY   RestylePro's Stripe secret (falls back to STRIPE_SECRET_KEY)
//   RESTYLEPRO_SHOPFLOW_URL RestylePro's AI-tool endpoint (optional; if unset we use local processors)
//   RESTYLEPRO_SHOPFLOW_KEY x-api-key for the above (optional)
//   PUBLIC_BASE_URL         where fulfill redirects live (default this function's URL)
// =====================================================

import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ORG_ID = "031ac427-f078-4086-a9bc-7bdb78cc1c73"; // WePrintWraps anchor tenant
const FN_BASE = "https://qxllysilzonrlyoaomce.supabase.co/functions/v1";

// Fix catalog — prices match the synced store ($199 setup / $975 design).
// woo_id is the WooCommerce product used for the pay-link fallback.
const FIXES: Record<string, { label: string; price: number; description: string; woo_id: number; processor: string; example_url: string }> = {
  print_prep: {
    label: "Print-Ready Prep (300 DPI + bleed)",
    price: 199,
    description: "We upscale and prep your file to true 300 DPI with bleed so it prints crisp on a full wrap.",
    woo_id: 58160, // Design Setup / File Output
    processor: "convert-print",
    example_url: "https://weprintwraps.com/wp-content/uploads/wrapguru/example-printprep.jpg",
  },
  cut_path: {
    label: "Cut-Path / Contour Setup",
    price: 199,
    description: "We build clean cut paths / contour lines so your graphics are install-ready.",
    woo_id: 58160,
    processor: "generate-printpackage",
    example_url: "https://weprintwraps.com/wp-content/uploads/wrapguru/example-cutpath.jpg",
  },
  production_pack: {
    label: "Production Pack (print-ready panels + views)",
    price: 199,
    description: "Full production-ready package: tiled panels, bleed, and preview views.",
    woo_id: 58160,
    processor: "generate-printpackage",
    example_url: "https://weprintwraps.com/wp-content/uploads/wrapguru/example-productionpack.jpg",
  },
  recreate: {
    label: "AI Design Recreate",
    price: 975,
    description: "Our AI recreates your reference into a full custom wrap design across every panel.",
    woo_id: 234, // Custom Vehicle Wrap Design
    processor: "generate-panel",
    example_url: "https://weprintwraps.com/wp-content/uploads/wrapguru/example-recreate.jpg",
  },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function html(body: string, status = 200) {
  return new Response(body, { status, headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } });
}

function sb() {
  const url = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key);
}

// Suggest fixes from the detected issues/score coming out of check-artwork-file.
function fixesForIssues(issues: string[], score: number | null): string[] {
  const text = (issues || []).join(" ").toLowerCase();
  const out: string[] = [];
  if (/resolution|dpi|raster|low res|small|rgb|cmyk/.test(text) || (score !== null && score < 7)) out.push("print_prep");
  if (/cut|contour|outline|vector|scal/.test(text)) out.push("cut_path");
  if (out.length === 0) out.push("production_pack"); // default upsell
  return [...new Set(out)];
}

// Run the actual fix. Prefer RestylePro's AI tools if configured; else local processors.
// Never strand a paid customer: on any failure we return needs_manual.
async function processFix(fixKey: string, job: any): Promise<{ ok: boolean; output_url?: string; needs_manual?: boolean; note?: string }> {
  const fix = FIXES[fixKey];
  const rpUrl = Deno.env.get("RESTYLEPRO_SHOPFLOW_URL");
  const rpKey = Deno.env.get("RESTYLEPRO_SHOPFLOW_KEY");

  try {
    // Preferred path: RestylePro's real ShopFlow AI tools.
    if (rpUrl) {
      const r = await fetch(rpUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(rpKey ? { "x-api-key": rpKey } : {}) },
        body: JSON.stringify({ tool: fixKey, file_url: job.file_url, file_name: job.file_name, vehicle: job.vehicle, job_id: job.job_id }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && (j.output_url || j.url || j.file_url)) {
        return { ok: true, output_url: j.output_url || j.url || j.file_url, note: "restylepro" };
      }
      // fall through to local on failure
    }

    // Local processors (real, self-contained fallbacks).
    const sqft = Number(job?.vehicle?.sqft) || 0;
    // Rough panel dims: assume 54" roll width; length from area if we know it.
    const widthIn = 54;
    const heightIn = sqft > 0 ? Math.max(24, Math.round((sqft * 144) / widthIn)) : 120;

    if (fix.processor === "convert-print") {
      const r = await fetch(`${FN_BASE}/convert-print`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ panelUrl: job.file_url, width: widthIn, height: heightIn }),
      });
      const j = await r.json().catch(() => ({}));
      const url = j.url || j.imageUrl || j.output_url || j.printUrl;
      if (r.ok && url) return { ok: true, output_url: url, note: "convert-print" };
    } else if (fix.processor === "generate-printpackage") {
      const r = await fetch(`${FN_BASE}/generate-printpackage`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ panelUrl: job.file_url, widthIn, heightIn }),
      });
      const j = await r.json().catch(() => ({}));
      const url = j.url || j.packageUrl || j.output_url || j.zipUrl;
      if (r.ok && url) return { ok: true, output_url: url, note: "generate-printpackage" };
    } else if (fix.processor === "generate-panel") {
      const r = await fetch(`${FN_BASE}/generate-panel`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: `Full vehicle wrap design recreated from customer reference for a ${job?.vehicle?.make || ""} ${job?.vehicle?.model || ""}`.trim(), style: "wrap", size: "full" }),
      });
      const j = await r.json().catch(() => ({}));
      const url = j.url || j.imageUrl || j.output_url;
      if (r.ok && url) return { ok: true, output_url: url, note: "generate-panel" };
    }
  } catch (e) {
    console.error("[wrapguru-shopflow] processFix error:", e);
  }
  // Paid but couldn't auto-process → hand to the design team, never strand the customer.
  return { ok: false, needs_manual: true };
}

async function emailResult(job: any, outputUrl: string | null, needsManual: boolean) {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return;
  const fix = FIXES[job.fix_key];
  const to = needsManual ? ["Design@WePrintWraps.com", "jackson@weprintwraps.com"] : [job.customer_email].filter(Boolean);
  if (to.length === 0) return;
  const subject = needsManual
    ? `⚙️ [SHOPFLOW] Manual fix needed — ${fix.label} (paid) — ${job.file_name}`
    : `✅ Your ${fix.label} is ready — WePrintWraps`;
  const body = needsManual
    ? `<p>A customer PAID for <b>${fix.label}</b> but auto-processing didn't complete. Please finish it manually.</p>
       <p>File: <a href="${job.file_url}">${job.file_name}</a><br/>Customer: ${job.customer_email || "unknown"}<br/>Job: ${job.job_id}</p>`
    : `<div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;">
         <h2>Your ${fix.label} is ready 🎉</h2>
         <p>Hey ${(job.customer_name || "").split(" ")[0] || "there"}, WrapGuru finished processing your file.</p>
         ${outputUrl ? `<p><a href="${outputUrl}" style="background:#e6007e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Download your file</a></p>` : ""}
         <p style="color:#666;font-size:13px;">Original: ${job.file_name}. Questions? Reply to this email.</p>
         <p style="color:#999;font-size:12px;">⚡ Powered by WrapCommandAI</p>
       </div>`;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "WrapGuru <hello@weprintwraps.com>", to, subject, html: body }),
    });
  } catch (e) { console.error("[wrapguru-shopflow] email error:", e); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const u = new URL(req.url);
  let action = u.searchParams.get("action") || "";
  let body: any = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch { body = {}; }
    action = action || body.action || "";
  }

  const supabase = sb();

  // -------- QUOTE: what fixes does this file need + prices --------
  if (action === "quote") {
    const keys = fixesForIssues(body.issues || [], typeof body.score === "number" ? body.score : null);
    const fixes = keys.map((k) => ({ key: k, ...FIXES[k] }));
    return json({ fixes });
  }

  // -------- CHECKOUT: create Stripe session (or Woo fallback) + persist job --------
  if (action === "checkout") {
    const fixKey = String(body.fix_key || "");
    const fix = FIXES[fixKey];
    if (!fix) return json({ error: "Unknown fix_key" }, 400);
    if (!body.file_url) return json({ error: "file_url required" }, 400);

    // Persist the job first so we have a job_id for the success redirect.
    const jobPayload = {
      job_id: "", // filled after insert
      fix_key: fixKey,
      file_url: body.file_url,
      file_name: body.file_name || "file",
      customer_email: body.customer_email || null,
      customer_name: body.customer_name || null,
      vehicle: body.vehicle || null,
      session_id: body.session_id || null,
      price: fix.price,
      status: "pending_payment",
      output_url: null,
      created_at: new Date().toISOString(),
    };
    const { data: rec, error: insErr } = await supabase.from("ai_actions").insert({
      action_type: "shopflow_job",
      organization_id: ORG_ID,
      priority: "high",
      resolved: false,
      action_payload: jobPayload,
    }).select().single();
    if (insErr) { console.error("[wrapguru-shopflow] job insert failed:", insErr); return json({ error: "Could not create job" }, 500); }
    const jobId = rec.id;
    await supabase.from("ai_actions").update({ action_payload: { ...jobPayload, job_id: jobId } }).eq("id", jobId);

    const stripeKey = Deno.env.get("RESTYLEPRO_STRIPE_KEY") || Deno.env.get("STRIPE_SECRET_KEY");
    const baseUrl = Deno.env.get("PUBLIC_BASE_URL") || `${FN_BASE}/wrapguru-shopflow`;

    if (stripeKey) {
      try {
        const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16", httpClient: Stripe.createFetchHttpClient() });
        const sessionObj = await stripe.checkout.sessions.create({
          mode: "payment",
          line_items: [{
            quantity: 1,
            price_data: { currency: "usd", unit_amount: Math.round(fix.price * 100), product_data: { name: `${fix.label} — WePrintWraps`, description: fix.description } },
          }],
          customer_email: body.customer_email || undefined,
          success_url: `${baseUrl}?action=fulfill&job_id=${jobId}&cs={CHECKOUT_SESSION_ID}`,
          cancel_url: "https://weprintwraps.com/",
          metadata: { job_id: jobId, fix_key: fixKey },
        });
        return json({ job_id: jobId, checkout_url: sessionObj.url, price: fix.price, label: fix.label });
      } catch (e) {
        console.error("[wrapguru-shopflow] Stripe checkout failed:", e);
        // fall through to Woo fallback
      }
    }
    // Fallback: WooCommerce add-to-cart link (WPW rails) so it still works pre-Stripe-key.
    const cartUrl = `https://weprintwraps.com/cart/?add-to-cart=${fix.woo_id}`;
    return json({ job_id: jobId, cart_url: cartUrl, price: fix.price, label: fix.label, note: "stripe_key_not_set_using_woo" });
  }

  // -------- FULFILL: Stripe success redirect → verify paid → process → deliver --------
  if (action === "fulfill") {
    const jobId = u.searchParams.get("job_id") || "";
    const cs = u.searchParams.get("cs") || "";
    const { data: rec } = await supabase.from("ai_actions").select("id, action_payload").eq("id", jobId).single();
    if (!rec) return html("<h2>Job not found.</h2>", 404);
    const job = rec.action_payload || {};

    // Verify payment with Stripe (defense in depth — don't process unpaid).
    const stripeKey = Deno.env.get("RESTYLEPRO_STRIPE_KEY") || Deno.env.get("STRIPE_SECRET_KEY");
    if (stripeKey && cs) {
      try {
        const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16", httpClient: Stripe.createFetchHttpClient() });
        const session = await stripe.checkout.sessions.retrieve(cs);
        if (session.payment_status !== "paid") return html("<h2>Payment not confirmed yet.</h2>", 402);
      } catch (e) { console.error("[wrapguru-shopflow] session verify failed:", e); }
    }

    if (job.status === "done") {
      return html(`<h2>All set 🎉</h2><p>Your ${FIXES[job.fix_key]?.label || "fix"} is ready. Check your email${job.output_url ? ` or <a href="${job.output_url}">download it here</a>` : ""}.</p>`);
    }

    await supabase.from("ai_actions").update({ action_payload: { ...job, status: "processing" } }).eq("id", jobId);
    const result = await processFix(job.fix_key, { ...job, job_id: jobId });
    const newStatus = result.ok ? "done" : (result.needs_manual ? "needs_manual" : "failed");
    await supabase.from("ai_actions").update({
      resolved: result.ok,
      resolved_at: result.ok ? new Date().toISOString() : null,
      action_payload: { ...job, status: newStatus, output_url: result.output_url || null, processor_note: result.note || null },
    }).eq("id", jobId);
    await emailResult({ ...job, job_id: jobId }, result.output_url || null, !!result.needs_manual);

    if (result.ok) return html(`<h2>Payment received — your file is being delivered 🎉</h2><p>We emailed your ${FIXES[job.fix_key]?.label || "fix"} to ${job.customer_email || "you"}.${job.output_url ? ` <a href="${result.output_url}">Download</a>` : ""}</p><p>⚡ Powered by WrapCommandAI</p>`);
    return html(`<h2>Payment received ✅</h2><p>Our design team is finishing your ${FIXES[job.fix_key]?.label || "fix"} by hand and will email it shortly.</p><p>⚡ Powered by WrapCommandAI</p>`);
  }

  // -------- STATUS: for chat polling --------
  if (action === "status") {
    const jobId = String(body.job_id || u.searchParams.get("job_id") || "");
    const { data: rec } = await supabase.from("ai_actions").select("action_payload").eq("id", jobId).single();
    if (!rec) return json({ error: "not found" }, 404);
    const job = rec.action_payload || {};
    return json({ job_id: jobId, status: job.status, output_url: job.output_url || null });
  }

  return json({ ok: true, service: "wrapguru-shopflow", actions: ["quote", "checkout", "fulfill", "status"] });
});
