// mailbox-quote-folder — create (idempotently) a dedicated Outlook folder where
// the auto-quote agent drops ready-to-send quote drafts, so reps see every
// pending AI quote in ONE place instead of buried in normal Drafts.
//
// Returns the folder id per mailbox (the agent needs it to place drafts).
// Uses the same Azure client-credentials flow as check-inbox. verify_jwt=false.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

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

async function ensureFolder(mailbox: string, name: string, token: string) {
  const base = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/mailFolders`;
  const out: Record<string, unknown> = { mailbox, folderName: name };
  try {
    // Look for an existing top-level folder with this name.
    const findRes = await fetch(`${base}?$filter=displayName eq '${name.replace(/'/g, "''")}'&$select=id,displayName`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const findData = await findRes.json();
    if (!findRes.ok) throw new Error(`find ${findRes.status}: ${JSON.stringify(findData).slice(0, 160)}`);
    const existing = (findData.value || [])[0];
    if (existing) {
      out.folderId = existing.id; out.status = "existed";
      return out;
    }
    // Create it.
    const createRes = await fetch(base, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: name }),
    });
    const created = await createRes.json();
    if (!createRes.ok) throw new Error(`create ${createRes.status}: ${JSON.stringify(created).slice(0, 160)}`);
    out.folderId = created.id; out.status = "created";
  } catch (e) {
    out.error = String(e).slice(0, 240);
  }
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  let body: { mailboxes?: string[]; folderName?: string } = {};
  try { body = await req.json(); } catch { /* defaults */ }
  const mailboxes = body.mailboxes?.length ? body.mailboxes : ["design@weprintwraps.com"];
  const folderName = body.folderName || "AI Quote Drafts";
  try {
    const token = await getAccessToken();
    const results = [];
    for (const mb of mailboxes) results.push(await ensureFolder(mb, folderName, token));
    return new Response(JSON.stringify({ folderName, results }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e).slice(0, 300) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
