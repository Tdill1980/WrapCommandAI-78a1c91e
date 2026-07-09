// quote-agent-draft — the Outlook auto-quote drafter (human-in-the-loop).
//
// For each NEW quote-request email in design@ (not yet handled), it:
//   1. AI-drafts a warm, professional reply (acknowledge + confirm capabilities +
//      ask for the missing vehicle/coverage details + invite to proceed).
//   2. Creates that as a REPLY DRAFT in Outlook (sends from design@, in-thread),
//      and MOVES it into the "AI Quote Drafts" folder so reps review in one place.
//   3. Stamps the source email with the category "AI-Drafted" so it is NEVER
//      double-drafted (idempotency, no DB needed).
//
// It NEVER sends — a human opens the folder, reviews, hits Send. Safe defaults:
//   dry_run=true  -> generate + return draft text ONLY (no Outlook writes)
//   dry_run=false -> create the draft(s); use limit=1 to test on one email first.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const CATEGORY = "AI-Drafted";
const FOLDER_NAME = "AI Quote Drafts";

// Quote-request heuristic (same as the report) — first-pass filter before AI draft.
const REQ_RE = /\b(quote|pricing|\bprice\b|how much|cost to wrap|estimate|ballpark|interested in|looking to wrap|wrap my|get (a )?wrap|need (a )?wrap|square ?f(ee|oo)?t|how many yards|do you (do|make)|can you (do|wrap|print))\b/i;
const WRAP_RE = /\b(wrap|vinyl|decal|graphic|ppf|tint|vehicle|truck|van|fleet|car|trailer|sqft|sq ft|yard|banner|sign|print)\b/i;
const isQuoteReq = (s: string, p: string) => (REQ_RE.test(`${s}\n${p}`) && WRAP_RE.test(`${s}\n${p}`)) || REQ_RE.test(s);
const isInternal = (e: string) => /weprintwraps\.com$|restyleproai\.com$/.test(e) || /no-?reply|mailer-daemon|postmaster/.test(e);

async function graphToken(): Promise<string> {
  const t = Deno.env.get("MICROSOFT_TENANT_ID"), c = Deno.env.get("MICROSOFT_CLIENT_ID"), s = Deno.env.get("MICROSOFT_CLIENT_SECRET");
  if (!t || !c || !s) throw new Error("Missing Microsoft credentials");
  const r = await fetch(`https://login.microsoftonline.com/${t}/oauth2/v2.0/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c, client_secret: s, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`token ${r.status}: ${JSON.stringify(d).slice(0, 160)}`);
  return d.access_token;
}

async function findFolderId(mb: string, token: string): Promise<string | null> {
  const r = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mb)}/mailFolders?$filter=displayName eq '${FOLDER_NAME}'&$select=id`,
    { headers: { Authorization: `Bearer ${token}` } });
  const d = await r.json();
  return (d.value && d.value[0]?.id) || null;
}

async function draftText(subject: string, preview: string, fromName: string, key: string): Promise<string> {
  const prompt =
    `You are a friendly, professional quote specialist at WePrintWraps (vehicle wraps, vinyl, decals, signs, banners, PPF, tint, wide-format print).\n` +
    `A prospective customer emailed. Write a concise reply (120-180 words) that: warmly greets them by first name if known; confirms we can help with what they described; asks for the specific details we need to quote if they're missing (vehicle year/make/model, coverage — full/partial/panels, finish, timeline, and artwork if any); and invites them to proceed. Warm but efficient. Do NOT invent prices. Sign as "The WePrintWraps Team".\n` +
    `Return ONLY the reply body text (no subject line, no markdown).\n\n` +
    `From: ${fromName || "there"}\nSubject: ${subject}\nTheir message (preview): ${preview}`;
  const r = await fetch(GEMINI_URL, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "gemini-2.5-flash", messages: [{ role: "user", content: prompt }], temperature: 0.4 }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`gemini ${r.status}: ${JSON.stringify(d).slice(0, 160)}`);
  return (d.choices?.[0]?.message?.content ?? "").trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  let body: { mailbox?: string; sinceDays?: number; limit?: number; dry_run?: boolean } = {};
  try { body = await req.json(); } catch { /* */ }
  const mailbox = body.mailbox || "design@weprintwraps.com";
  const sinceDays = body.sinceDays ?? 3;
  const limit = body.limit ?? 5;
  const dryRun = body.dry_run !== false; // default TRUE

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiKey) return new Response(JSON.stringify({ error: "GEMINI_API_KEY missing" }), { status: 500, headers: corsHeaders });

  try {
    const token = await graphToken();
    const sinceIso = new Date(Date.now() - sinceDays * 86400_000).toISOString();
    const base = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}`;

    // Pull recent inbox messages with the fields we need.
    const listUrl = `${base}/mailFolders/inbox/messages?$select=id,subject,bodyPreview,from,categories,receivedDateTime&$top=50&$filter=receivedDateTime ge ${sinceIso}&$orderby=receivedDateTime desc`;
    const lr = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: "eventual" } });
    const ld = await lr.json();
    if (!lr.ok) throw new Error(`list ${lr.status}: ${JSON.stringify(ld).slice(0, 160)}`);

    const folderId = dryRun ? null : await findFolderId(mailbox, token);
    if (!dryRun && !folderId) throw new Error(`folder "${FOLDER_NAME}" not found in ${mailbox}`);

    const results: Record<string, unknown>[] = [];
    for (const m of ld.value ?? []) {
      if (results.length >= limit) break;
      const ea = (m.from && m.from.emailAddress) || {};
      const email = (ea.address || "").toLowerCase();
      if (!email || isInternal(email)) continue;
      if ((m.categories || []).includes(CATEGORY)) continue; // already drafted
      if (!isQuoteReq(m.subject || "", m.bodyPreview || "")) continue;

      const text = await draftText(m.subject || "", m.bodyPreview || "", ea.name || "", geminiKey);
      if (dryRun) {
        results.push({ from: email, name: ea.name, subject: m.subject, draft_preview: text });
        continue;
      }

      // 1) create reply draft, 2) set our body, 3) move to folder, 4) stamp source.
      const cr = await fetch(`${base}/messages/${m.id}/createReply`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const draft = await cr.json();
      if (!cr.ok) { results.push({ from: email, error: `createReply ${cr.status}` }); continue; }
      const draftId = draft.id;
      const html = text.split(/\n\n+/).map((p: string) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
      await fetch(`${base}/messages/${draftId}`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ body: { contentType: "HTML", content: html } }),
      });
      await fetch(`${base}/messages/${draftId}/move`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ destinationId: folderId }),
      });
      await fetch(`${base}/messages/${m.id}`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ categories: [...(m.categories || []), CATEGORY] }),
      });
      results.push({ from: email, subject: m.subject, draft_id: draftId, status: "drafted_into_folder" });
    }

    return new Response(JSON.stringify({ mailbox, dry_run: dryRun, drafted: results.length, results }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e).slice(0, 300) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
