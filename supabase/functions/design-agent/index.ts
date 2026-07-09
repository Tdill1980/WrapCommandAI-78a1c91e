// design-agent — the WePrintWraps design@ support agent.
//
// WHAT IT DOES (v1 — DRAFT + ALARM ONLY, never auto-sends):
//   1. Reads recent mail in design@weprintwraps.com via Microsoft Graph
//      (same Azure app-only auth the rest of MightyMail uses).
//   2. For each NEW inbound customer email (skips ones already processed and
//      skips mail we sent), it:
//        - parses the order number (#35xxx) and looks it up in shopflow_orders
//        - asks OpenAI to classify intent/urgency/refund-risk and DRAFT a reply
//          grounded in that order's real status + WPW knowledge below
//        - stores the draft in design_agent_drafts (status = pending_review)
//        - if refund-risk or high urgency, emails an alarm to the owner
//   3. Returns a summary. A human approves/sends drafts from the review queue.
//
// TRIGGER: invoke on a schedule (pg_cron, every few minutes) OR by hand.
// SECRETS REQUIRED: MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID,
//   MICROSOFT_CLIENT_SECRET, OPENAI_API_KEY, RESEND_API_KEY,
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Optional: OPENAI_MODEL,
//   DESIGN_AGENT_MAILBOX, DESIGN_AGENT_ALARM_TO.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAILBOX = Deno.env.get("DESIGN_AGENT_MAILBOX") || "design@weprintwraps.com";
const ALARM_TO = Deno.env.get("DESIGN_AGENT_ALARM_TO") || "trish@weprintwraps.com";
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-4o";

// Concise WePrintWraps knowledge the agent answers from. Mirrors the facts
// baked into website-chat. Keep short + true — this is the grounding, not fluff.
const WPW_KNOWLEDGE = `
WePrintWraps (WPW) — vehicle & fleet wrap PRINTING (material only; install not included unless stated).
- Pricing: printed cast wrap film about $5.27 / sq ft. Premium cast vinyl.
- Max print width ~52". Larger coverage is split into multiple panels/pieces.
- Free file review: customers can email artwork to hello@weprintwraps.com before printing.
- Orders move: order_received -> in_design -> awaiting_approval -> printing/in_production -> shipped -> completed.
- Design revisions and proof approvals happen over email on the design@ thread.
- General contact: hello@weprintwraps.com. Be warm, concise, professional, and specific.
`.trim();

async function getGraphToken(): Promise<string> {
  const tenantId = Deno.env.get("MICROSOFT_TENANT_ID");
  const clientId = Deno.env.get("MICROSOFT_CLIENT_ID");
  const clientSecret = Deno.env.get("MICROSOFT_CLIENT_SECRET");
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Missing Microsoft Graph credentials (MICROSOFT_TENANT_ID/CLIENT_ID/CLIENT_SECRET)");
  }
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Graph token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function fetchRecentEmails(token: string, limit: number) {
  const url = `https://graph.microsoft.com/v1.0/users/${MAILBOX}/mailFolders/inbox/messages` +
    `?$top=${limit}&$orderby=receivedDateTime desc` +
    `&$select=id,conversationId,subject,bodyPreview,from,toRecipients,receivedDateTime`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(`Graph inbox read error: ${JSON.stringify(data)}`);
  return (data.value || []) as any[];
}

async function fetchBody(token: string, id: string): Promise<string> {
  const url = `https://graph.microsoft.com/v1.0/users/${MAILBOX}/messages/${id}?$select=body`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return "";
  const data = await res.json();
  const html = data?.body?.content || "";
  // crude HTML -> text for the model; good enough for v1 grounding
  return html.replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}

function parseOrderNumber(text: string): string | null {
  const m = text.match(/#\s*(\d{4,6})/) || text.match(/\border\s*#?\s*(\d{4,6})/i);
  return m ? m[1] : null;
}

async function callOpenAI(payload: {
  subject: string; from: string; body: string; order: any | null;
}): Promise<any> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const orderContext = payload.order
    ? `Matched order #${payload.order.order_number}: status="${payload.order.status}", stage="${payload.order.customer_stage}", paid=${payload.order.is_paid}, total=$${payload.order.order_total}, tracking=${payload.order.tracking_number || "none"}, product="${payload.order.product_type || ""}".`
    : "No matching order was found in ShopFlow.";

  const system = `You are the customer support lead for WePrintWraps, replying on the design@ email thread.
${WPW_KNOWLEDGE}

You will receive one customer email plus any matched order data. Respond ONLY with a JSON object:
{
  "intent": "revision|approval|quote|complaint|shipping|question|other",
  "urgency": "low|normal|high",
  "refund_risk": true|false,
  "summary": "one sentence: what the customer wants",
  "draft_reply": "a complete, ready-to-send email reply in a warm, concise, professional tone. Use the real order status when relevant. Never invent tracking numbers, prices, or dates you weren't given. If information is missing, ask for exactly what you need. Sign off as 'The WePrintWraps Team'."
}
Set refund_risk=true if they mention refund, money back, cancel, dispute, chargeback, or sound angry/ignored.`;

  const user = `FROM: ${payload.from}
SUBJECT: ${payload.subject}
${orderContext}

EMAIL BODY:
${payload.body}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`OpenAI error: ${JSON.stringify(data)}`);
  return JSON.parse(data.choices[0].message.content);
}

async function sendAlarm(subject: string, html: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "WPW Design Agent <hello@weprintwraps.com>",
      to: [ALARM_TO],
      subject,
      html,
    }),
  }).catch(() => {});
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Number(body.limit) || 15, 40);

    const token = await getGraphToken();
    const emails = await fetchRecentEmails(token, limit);

    const processed: any[] = [];
    for (const email of emails) {
      const fromAddr = email.from?.emailAddress?.address?.toLowerCase() || "";
      // skip anything WE sent (outbound from our own domain)
      if (fromAddr.endsWith("@weprintwraps.com")) continue;

      // dedupe: already have a draft for this message?
      const { data: existing } = await supabase
        .from("design_agent_drafts")
        .select("id")
        .eq("email_id", email.id)
        .maybeSingle();
      if (existing) continue;

      const bodyText = await fetchBody(token, email.id);
      const orderNo = parseOrderNumber(`${email.subject} ${bodyText}`);
      let order: any = null;
      if (orderNo) {
        const { data: o } = await supabase
          .from("shopflow_orders")
          .select("order_number,status,customer_stage,is_paid,order_total,tracking_number,product_type,customer_email")
          .eq("order_number", orderNo)
          .maybeSingle();
        order = o;
      }

      let ai: any = {};
      let error: string | null = null;
      try {
        ai = await callOpenAI({
          subject: email.subject || "",
          from: email.from?.emailAddress?.address || "",
          body: bodyText || email.bodyPreview || "",
          order,
        });
      } catch (e) {
        error = String(e?.message || e);
      }

      const refundRisk = !!ai.refund_risk;
      const urgency = ai.urgency || "normal";
      const shouldAlarm = refundRisk || urgency === "high";

      const { data: inserted } = await supabase
        .from("design_agent_drafts")
        .insert({
          email_id: email.id,
          conversation_id: email.conversationId,
          mailbox: MAILBOX,
          from_email: email.from?.emailAddress?.address,
          from_name: email.from?.emailAddress?.name,
          subject: email.subject,
          received_at: email.receivedDateTime,
          order_number: orderNo,
          order_status: order?.status || null,
          intent: ai.intent || null,
          urgency,
          refund_risk: refundRisk,
          summary: ai.summary || null,
          draft_reply: ai.draft_reply || null,
          model: OPENAI_MODEL,
          status: "pending_review",
          alarmed: shouldAlarm,
          error,
        })
        .select("id")
        .single();

      if (shouldAlarm) {
        await sendAlarm(
          `[${refundRisk ? "REFUND RISK" : "URGENT"}] ${email.from?.emailAddress?.address} — ${email.subject}`,
          `<h2>${refundRisk ? "⚠️ Possible refund risk" : "⏰ Urgent"} on design@</h2>
           <p><b>From:</b> ${email.from?.emailAddress?.address}</p>
           <p><b>Subject:</b> ${email.subject}</p>
           <p><b>Order:</b> ${orderNo || "not found"} (${order?.status || "—"})</p>
           <p><b>What they want:</b> ${ai.summary || "(unclassified)"}</p>
           <hr/><p><b>Suggested reply (review before sending):</b></p>
           <div style="white-space:pre-wrap;background:#f5f5f5;padding:12px;border-radius:8px;">${(ai.draft_reply || "").replace(/</g, "&lt;")}</div>`,
        );
      }

      processed.push({
        id: inserted?.id,
        from: email.from?.emailAddress?.address,
        subject: email.subject,
        order: orderNo,
        intent: ai.intent,
        urgency,
        refund_risk: refundRisk,
        error,
      });
    }

    return new Response(
      JSON.stringify({ success: true, scanned: emails.length, drafted: processed.length, processed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: String(error?.message || error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
