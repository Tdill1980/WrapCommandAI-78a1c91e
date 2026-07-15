// mailbox-quote-report — read-only Graph report that CLASSIFIES mail, not just counts it.
//
// For each mailbox it pulls recent Inbox + Sent messages (subject + preview) and
// tags each as:
//   quote_request  — an inbound customer asking for a wrap quote/price
//   quote_sent     — an outbound quote/estimate with pricing
//   other          — noise (newsletters, internal, receipts, etc.)
//
// Answers: how many real quote requests hit design@, and how many quotes Troy vs
// Lance actually send. Keyword heuristic (fast + free over thousands of emails);
// upgradeable to AI classification later. Same Azure client-credentials flow as
// check-inbox. No writes. verify_jwt = false.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

const DEFAULT_MAILBOXES = [
  "design@weprintwraps.com",
  "troy@weprintwraps.com",
  "lance@weprintwraps.com",
];
const MAX_PER_FOLDER = 1500; // cap so we stay under the worker time limit

async function getAccessToken(): Promise<string> {
  const tenantId = Deno.env.get("MICROSOFT_TENANT_ID");
  const clientId = Deno.env.get("MICROSOFT_CLIENT_ID");
  const clientSecret = Deno.env.get("MICROSOFT_CLIENT_SECRET");
  if (!tenantId || !clientId || !clientSecret) throw new Error("Missing Microsoft credentials");
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Token error: ${JSON.stringify(data).slice(0, 200)}`);
  return data.access_token as string;
}

// Quote-REQUEST signals (inbound customer wants a price/wrap).
const REQ_RE = /\b(quote|pricing|\bprice\b|how much|cost to wrap|estimate|ballpark|interested in|looking to wrap|wrap my|get (a )?wrap|need (a )?wrap|square ?f(ee|oo)?t|how many yards|do you (do|make))\b/i;
// Quote-SENT signals (outbound quote/estimate with numbers).
const SENT_RE = /\b(your (quote|estimate)|here'?s your|quote attached|estimate attached|pricing (below|attached)|see attached|attached (is )?(the )?(quote|estimate)|quote #|quote number|total (is|:)|grand total|deposit|invoice)\b/i;
const MONEY_RE = /\$\s?\d[\d,]*/;
const WRAP_RE = /\b(wrap|vinyl|decal|graphic|ppf|tint|vehicle|truck|van|fleet|car|trailer|sqft|sq ft|yard)\b/i;

function classify(subject: string, preview: string, outbound: boolean): "quote_request" | "quote_sent" | "other" {
  const t = `${subject}\n${preview}`;
  if (outbound) {
    if (SENT_RE.test(t) || (MONEY_RE.test(t) && WRAP_RE.test(t))) return "quote_sent";
    return "other";
  }
  if (REQ_RE.test(t) && WRAP_RE.test(t)) return "quote_request";
  if (REQ_RE.test(subject)) return "quote_request";
  return "other";
}

async function pullFolder(mailbox: string, folder: "inbox" | "sentitems", sinceIso: string, token: string) {
  const dateField = folder === "inbox" ? "receivedDateTime" : "sentDateTime";
  let url =
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/mailFolders/${folder}/messages` +
    `?$select=subject,bodyPreview,from,${dateField}&$top=100&$filter=${dateField} ge ${sinceIso}&$orderby=${dateField} desc`;
  const msgs: { subject: string; preview: string; fromEmail: string; fromName: string }[] = [];
  let capped = false;
  while (url && msgs.length < MAX_PER_FOLDER) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: "eventual" } });
    const text = await res.text();
    if (!res.ok) throw new Error(`${folder} ${res.status}: ${text.slice(0, 160)}`);
    const data = JSON.parse(text);
    for (const m of data.value ?? []) {
      const ea = (m.from && m.from.emailAddress) || {};
      msgs.push({ subject: m.subject || "", preview: m.bodyPreview || "", fromEmail: (ea.address || "").toLowerCase(), fromName: ea.name || "" });
    }
    url = data["@odata.nextLink"] || "";
    if (msgs.length >= MAX_PER_FOLDER && url) capped = true;
  }
  return { msgs, capped };
}

async function reportFor(mailbox: string, sinceIso: string, token: string) {
  const out: Record<string, unknown> = { mailbox };
  try {
    const inbox = await pullFolder(mailbox, "inbox", sinceIso, token);
    const sent = await pullFolder(mailbox, "sentitems", sinceIso, token);
    let requests = 0, sentQuotes = 0;
    const reqSamples: string[] = [], sentSamples: string[] = [];
    // Dedupe senders of quote-request messages (message-level classification —
    // the RIGHT signal: this specific email asked for a quote), excluding internal.
    const reqSenders = new Map<string, { email: string; name: string }>();
    for (const m of inbox.msgs) {
      if (classify(m.subject, m.preview, false) === "quote_request") {
        requests++; if (reqSamples.length < 5) reqSamples.push(m.subject.slice(0, 80));
        const e = m.fromEmail;
        if (e && e.includes("@") && !/weprintwraps\.com$|restyleproai\.com$/.test(e) && !/no-?reply|do-?not-?reply|mailer-daemon|postmaster/.test(e)) {
          if (!reqSenders.has(e)) reqSenders.set(e, { email: e, name: m.fromName });
        }
      }
    }
    for (const m of sent.msgs) {
      if (classify(m.subject, m.preview, true) === "quote_sent") {
        sentQuotes++; if (sentSamples.length < 5) sentSamples.push(m.subject.slice(0, 80));
      }
    }
    out.inbox_scanned = inbox.msgs.length;
    out.sent_scanned = sent.msgs.length;
    out.quote_requests_in = requests;
    out.quotes_sent = sentQuotes;
    out.capped = inbox.capped || sent.capped;
    out.sample_requests = reqSamples;
    out.sample_quotes_sent = sentSamples;
    out.request_senders = [...reqSenders.values()];
  } catch (e) {
    out.error = String(e).slice(0, 240);
  }
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  let body: { mailboxes?: string[]; sinceDays?: number } = {};
  try { body = await req.json(); } catch { /* defaults */ }
  const mailboxes = body.mailboxes?.length ? body.mailboxes : DEFAULT_MAILBOXES;
  const sinceDays = body.sinceDays ?? 30;
  const sinceIso = new Date(Date.now() - sinceDays * 86400_000).toISOString();
  try {
    const token = await getAccessToken();
    const results = [];
    for (const mb of mailboxes) results.push(await reportFor(mb, sinceIso, token));
    return new Response(JSON.stringify({ since: sinceIso, sinceDays, method: "keyword-heuristic", mailboxes: results }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e).slice(0, 300) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
