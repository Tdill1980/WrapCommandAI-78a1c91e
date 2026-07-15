// mailbox-stats — read-only Microsoft Graph reporting.
//
// Counts, per mailbox, how many emails came IN (Inbox) vs went OUT (Sent Items),
// all-time and over a recent window. Used to measure real quote activity when the
// reps work straight out of Outlook and skip the quote tool:
//   design@  = incoming quote requests
//   troy@ / lance@ = quotes/replies they actually send
//
// Uses the same Azure app-credentials (client-credentials) flow as check-inbox.
// No writes, no deletes. verify_jwt = false (internal reporting).
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

async function getAccessToken(): Promise<string> {
  const tenantId = Deno.env.get("MICROSOFT_TENANT_ID");
  const clientId = Deno.env.get("MICROSOFT_CLIENT_ID");
  const clientSecret = Deno.env.get("MICROSOFT_CLIENT_SECRET");
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Missing Microsoft credentials (MICROSOFT_TENANT_ID/CLIENT_ID/CLIENT_SECRET)");
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
  if (!res.ok) throw new Error(`Token error: ${JSON.stringify(data).slice(0, 300)}`);
  return data.access_token as string;
}

// GET a JSON resource from Graph.
async function graphJson(url: string, token: string): Promise<any> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: "eventual" },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
}

// GET a Graph /$count endpoint (returns a bare integer body).
async function graphCount(url: string, token: string): Promise<number> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: "eventual" },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 200)}`);
  return parseInt(text.trim(), 10) || 0;
}

async function statsFor(mailbox: string, token: string, sinceIso: string) {
  const base = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}`;
  const out: Record<string, unknown> = { mailbox };
  try {
    const inbox = await graphJson(`${base}/mailFolders/inbox?$select=totalItemCount,unreadItemCount`, token);
    out.received_total = inbox.totalItemCount ?? null;
    out.unread = inbox.unreadItemCount ?? null;
    const sent = await graphJson(`${base}/mailFolders/sentitems?$select=totalItemCount`, token);
    out.sent_total = sent.totalItemCount ?? null;
    out.received_last_window = await graphCount(
      `${base}/mailFolders/inbox/messages/$count?$filter=receivedDateTime ge ${sinceIso}`, token);
    out.sent_last_window = await graphCount(
      `${base}/mailFolders/sentitems/messages/$count?$filter=sentDateTime ge ${sinceIso}`, token);
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
    for (const mb of mailboxes) results.push(await statsFor(mb, token, sinceIso));
    return new Response(JSON.stringify({ since: sinceIso, sinceDays, mailboxes: results }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e).slice(0, 300) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
