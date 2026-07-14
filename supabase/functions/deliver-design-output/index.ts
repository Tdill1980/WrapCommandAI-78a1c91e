// =====================================================================
// DELIVER DESIGN OUTPUT
// The missing piece: when a designer finishes a File Output / design job,
// they upload the finished print-ready file here. This function:
//   1) RECORDS it to the system (ai_actions 'design_output') — builds the
//      corpus of real finished files (order # + input + output), which is the
//      only way to eventually spec/train automated output.
//   2) EMAILS the customer their finished file (no more manual send).
//   3) (optional) writes the file link + a note back to the WooCommerce order
//      and marks it design-complete — only if WOO_APP_USER/WOO_APP_PASS are set.
//
// Auth: pass team_key; it must match TEAM_OUTPUT_KEY (if that secret is set).
// Use dry_run:true to record without emailing (for testing).
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const ORG_ID = "031ac427-f078-4086-a9bc-7bdb78cc1c73"; // WePrintWraps
const WOO_BASE = "https://weprintwraps.com/wp-json/wc/v3";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  // Light team gate (optional).
  const teamKey = Deno.env.get("TEAM_OUTPUT_KEY");
  if (teamKey && body.team_key !== teamKey) return json({ error: "unauthorized" }, 401);

  const { order_id, customer_email, customer_name, vehicle, file_url, file_name, input_file_url, notes, dry_run } = body;
  if (!file_url) return json({ error: "file_url required" }, 400);
  if (!customer_email) return json({ error: "customer_email required" }, 400);

  const supabase = createClient(
    Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 1) RECORD — this is the corpus row (input + output paired to the order).
  let recorded = false, recordId: string | null = null;
  try {
    const { data, error } = await supabase.from("ai_actions").insert({
      action_type: "design_output",
      organization_id: ORG_ID,
      priority: "normal",
      resolved: true,
      resolved_at: new Date().toISOString(),
      action_payload: {
        order_id: order_id || null,
        customer_email, customer_name: customer_name || null,
        vehicle: vehicle || null,
        output_file_url: file_url, output_file_name: file_name || null,
        input_file_url: input_file_url || null,
        notes: notes || null,
        delivered_at: new Date().toISOString(),
        source: "design_output_delivery",
      },
    }).select("id").single();
    if (error) throw error;
    recorded = true; recordId = data.id;
  } catch (e) { console.error("[deliver-design-output] record failed:", e); }

  // 2) EMAIL the customer their finished file.
  let emailed = false;
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (resendKey && !dry_run) {
    const first = (customer_name || "").split(" ")[0] || "there";
    const veh = vehicle ? ` for your ${vehicle}` : "";
    const html = `
      <div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:8px;">
        <div style="background:#000;padding:16px 20px;border-radius:12px 12px 0 0;"><b style="color:#fff;font-size:15px;">WePrintWraps.com</b></div>
        <div style="border:1px solid #e5e5e5;border-top:none;border-radius:0 0 12px 12px;padding:24px;">
          <h2 style="margin:0 0 12px;">Your print-ready design is ready 🎉</h2>
          <p style="color:#333;line-height:1.6;">Hey ${first}, your design team finished your print-ready files${veh}. Download them below — they're built to print.</p>
          <p style="text-align:center;margin:22px 0;"><a href="${file_url}" style="background:#e6007e;color:#fff;padding:13px 30px;border-radius:9px;text-decoration:none;font-weight:700;">Download My Files</a></p>
          ${order_id ? `<p style="color:#777;font-size:13px;">Order #${order_id}. ` : "<p style='color:#777;font-size:13px;'>"}Ready to print? Reply and we'll get your wrap into production.</p>
          <p style="color:#999;font-size:12px;margin-top:18px;">⚡ Powered by WrapCommandAI</p>
        </div>
      </div>`;
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: "WePrintWraps <hello@weprintwraps.com>", to: [customer_email], subject: `✅ Your print-ready design is ready${vehicle ? " — " + vehicle : ""}`, html }),
      });
      emailed = r.ok;
      if (!r.ok) console.error("[deliver-design-output] email err:", await r.text());
    } catch (e) { console.error("[deliver-design-output] email failed:", e); }
  }

  // 3) OPTIONAL — write the file link + note back to the Woo order, mark complete.
  let woo_updated = false;
  const wooUser = Deno.env.get("WOO_APP_USER"), wooPass = Deno.env.get("WOO_APP_PASS");
  if (wooUser && wooPass && order_id && !dry_run) {
    try {
      const basic = "Basic " + btoa(`${wooUser}:${wooPass}`);
      // add a private note with the link
      await fetch(`${WOO_BASE}/orders/${order_id}/notes`, {
        method: "POST", headers: { Authorization: basic, "Content-Type": "application/json", "User-Agent": UA },
        body: JSON.stringify({ note: `Print-ready output delivered to customer: ${file_url}`, customer_note: false }),
      });
      // store the link on the order + mark design-complete
      await fetch(`${WOO_BASE}/orders/${order_id}`, {
        method: "PUT", headers: { Authorization: basic, "Content-Type": "application/json", "User-Agent": UA },
        body: JSON.stringify({ status: "design-complete", meta_data: [{ key: "_design_output_file", value: file_url }] }),
      });
      woo_updated = true;
    } catch (e) { console.error("[deliver-design-output] woo write failed:", e); }
  }

  return json({ success: recorded, record_id: recordId, recorded, emailed, woo_updated, dry_run: !!dry_run });
});
