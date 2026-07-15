// mailbox-senders — read-only Graph extractor for the Klaviyo list build.
//
// Pulls Inbox senders from the given mailboxes over a window, keeps only
// EXTERNAL (customer) addresses — drops internal staff domains and no-reply
// system senders — dedupes, and returns each with a message count + last-seen.
// This is the raw customer list we then diff against Klaviyo and load in.
//
// Same Azure client-credentials flow as check-inbox. No writes. verify_jwt=false.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

const DEFAULT_MAILBOXES = ["design@weprintwraps.com", "hello@weprintwraps.com"];
const INTERNAL_DOMAINS = ["weprintwraps.com", "restyleproai.com"];
const NOREPLY_RE = /(no-?reply|do-?not-?reply|mailer-daemon|postmaster|notifications?@|bounce)/i;
const MAX_PER_MAILBOX = 3000;

// Quote-REQUEST signal (same heuristic as mailbox-quote-report). When
// mode="quote_requests" (default) we keep only senders whose email reads like a
// real wrap quote request — high-intent buyers, not random inbox traffic.
const REQ_RE = /\b(quote|pricing|\bprice\b|how much|cost to wrap|estimate|ballpark|interested in|looking to wrap|wrap my|get (a )?wrap|need (a )?wrap|square ?f(ee|oo)?t|how many yards|do you (do|make)|can you (do|wrap|print))\b/i;
const WRAP_RE = /\b(wrap|vinyl|decal|graphic|ppf|tint|vehicle|truck|van|fleet|car|trailer|sqft|sq ft|yard|banner|sign|print)\b/i;
function isQuoteRequest(subject: string, preview: string): boolean {
  const t = `${subject}\n${preview}`;
  return (REQ_RE.test(t) && WRAP_RE.test(t)) || REQ_RE.test(subject);
}

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

function isInternal(email: string): boolean {
  const dom = email.split("@")[1] || "";
  return INTERNAL_DOMAINS.some((d) => dom === d || dom.endsWith("." + d));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  let body: { mailboxes?: string[]; sinceDays?: number; mode?: string } = {};
  try { body = await req.json(); } catch { /* defaults */ }
  const mailboxes = body.mailboxes?.length ? body.mailboxes : DEFAULT_MAILBOXES;
  const sinceDays = body.sinceDays ?? 90;
  const quoteOnly = (body.mode ?? "quote_requests") === "quote_requests";
  const sinceIso = new Date(Date.now() - sinceDays * 86400_000).toISOString();

  try {
    const token = await getAccessToken();
    // email -> { email, name, count, lastSeen, mailboxes:Set }
    const map = new Map<string, { email: string; name: string; count: number; lastSeen: string; boxes: Set<string> }>();
    const perBox: Record<string, number> = {};

    for (const mb of mailboxes) {
      let url =
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mb)}/mailFolders/inbox/messages` +
        `?$select=from,subject,bodyPreview,receivedDateTime&$top=100&$filter=receivedDateTime ge ${sinceIso}&$orderby=receivedDateTime desc`;
      let scanned = 0;
      while (url && scanned < MAX_PER_MAILBOX) {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: "eventual" } });
        const text = await res.text();
        if (!res.ok) throw new Error(`${mb} ${res.status}: ${text.slice(0, 160)}`);
        const data = JSON.parse(text);
        for (const m of data.value ?? []) {
          scanned++;
          const ea = (m.from && m.from.emailAddress) || {};
          const email = (ea.address || "").toLowerCase().trim();
          if (!email || !email.includes("@")) continue;
          if (isInternal(email) || NOREPLY_RE.test(email)) continue;
          if (quoteOnly && !isQuoteRequest(m.subject || "", m.bodyPreview || "")) continue;
          const when = m.receivedDateTime || "";
          const cur = map.get(email);
          if (cur) {
            cur.count++; cur.boxes.add(mb);
            if (when > cur.lastSeen) cur.lastSeen = when;
          } else {
            map.set(email, { email, name: ea.name || "", count: 1, lastSeen: when, boxes: new Set([mb]) });
          }
        }
        url = data["@odata.nextLink"] || "";
      }
      perBox[mb] = scanned;
    }

    const senders = [...map.values()]
      .map((s) => ({ email: s.email, name: s.name, count: s.count, lastSeen: s.lastSeen.slice(0, 10), mailboxes: [...s.boxes] }))
      .sort((a, b) => b.count - a.count);

    return new Response(JSON.stringify({
      since: sinceIso, sinceDays, scanned_per_mailbox: perBox,
      unique_external_senders: senders.length,
      senders,
    }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e).slice(0, 300) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
