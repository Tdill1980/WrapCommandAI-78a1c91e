// klaviyo-backfill-quoters — AI-clean the historical inbox contacts and load the
// real prospective customers into a dedicated Klaviyo list.
//
// Flow: caller passes the extracted senders (email+name from mailbox-senders) →
// Gemini classifies each as a genuine prospective wrap/print CUSTOMER vs
// vendor/newsletter/system/spam → (dry_run) return the clean list, or
// (dry_run=false) create/get the Klaviyo list and bulk-import the customers.
//
// Keeps junk OUT of the marketing system. verify_jwt=false. Reversible: a Klaviyo
// list can be deleted; import only ADDS list membership (no forced subscribe).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const KLAVIYO_BASE = "https://a.klaviyo.com/api";
const KLAVIYO_REVISION = "2024-10-15";
const BATCH = 80;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function classifyBatch(batch: { email: string; name: string }[], key: string): Promise<Record<string, boolean>> {
  const list = batch.map((s, i) => `${i}. ${s.email}  |  ${s.name || ""}`).join("\n");
  const prompt =
    `These email senders wrote to a VEHICLE WRAP & wide-format PRINT shop (wraps, vinyl, decals, signs, banners, PPF, tint).\n` +
    `For EACH, decide: is it a genuine PROSPECTIVE CUSTOMER (a person or business that might buy those services) = true, ` +
    `or NOT a customer (supplier/vendor, newsletter/marketing blast, automated/system notice, recruiter, bank/lender, spam) = false.\n` +
    `Return ONLY a JSON array like [{"i":0,"customer":true}, ...] for every item, same indices.\n\n${list}`;
  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "gemini-2.5-flash",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  const content = data.choices?.[0]?.message?.content ?? "[]";
  const m = content.match(/\[[\s\S]*\]/);
  const arr = JSON.parse(m ? m[0] : "[]");
  const out: Record<string, boolean> = {};
  for (const r of arr) {
    const idx = Number(r.i);
    if (batch[idx]) out[batch[idx].email] = !!r.customer;
  }
  return out;
}

async function getOrCreateList(name: string, key: string): Promise<string> {
  const h = { Authorization: `Klaviyo-API-Key ${key}`, revision: KLAVIYO_REVISION, "Content-Type": "application/json" };
  const findRes = await fetch(`${KLAVIYO_BASE}/lists/?filter=equals(name,"${name.replace(/"/g, '\\"')}")`, { headers: h });
  const findData = await findRes.json();
  if (findRes.ok && findData.data && findData.data[0]) return findData.data[0].id;
  const createRes = await fetch(`${KLAVIYO_BASE}/lists/`, {
    method: "POST", headers: h,
    body: JSON.stringify({ data: { type: "list", attributes: { name } } }),
  });
  const created = await createRes.json();
  if (!createRes.ok) throw new Error(`Klaviyo create list ${createRes.status}: ${JSON.stringify(created).slice(0, 200)}`);
  return created.data.id;
}

async function bulkImport(listId: string, customers: { email: string; name: string }[], key: string) {
  const h = { Authorization: `Klaviyo-API-Key ${key}`, revision: KLAVIYO_REVISION, "Content-Type": "application/json" };
  const profiles = customers.map((c) => ({
    type: "profile",
    attributes: { email: c.email, ...(c.name ? { first_name: c.name } : {}) },
  }));
  const res = await fetch(`${KLAVIYO_BASE}/profile-bulk-import-jobs/`, {
    method: "POST", headers: h,
    body: JSON.stringify({
      data: {
        type: "profile-bulk-import-job",
        attributes: { profiles: { data: profiles } },
        relationships: { lists: { data: [{ type: "list", id: listId }] } },
      },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Klaviyo import ${res.status}: ${JSON.stringify(data).slice(0, 250)}`);
  return data.data?.id ?? null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  let body: { senders?: { email: string; name?: string }[]; dry_run?: boolean; listName?: string } = {};
  try { body = await req.json(); } catch { /* */ }
  const senders = (body.senders ?? []).filter((s) => s?.email).map((s) => ({ email: s.email.toLowerCase(), name: s.name || "" }));
  const dryRun = body.dry_run !== false; // default TRUE
  const listName = body.listName || "WPW Quote Requesters (Outlook)";
  if (!senders.length) return json({ error: "pass senders: [{email,name}]" }, 400);

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  const klaviyoKey = Deno.env.get("KLAVIYO_API_KEY");
  if (!geminiKey) return json({ error: "GEMINI_API_KEY missing" }, 500);

  // Classify in batches.
  const verdict: Record<string, boolean> = {};
  for (let i = 0; i < senders.length; i += BATCH) {
    const batch = senders.slice(i, i + BATCH);
    try {
      Object.assign(verdict, await classifyBatch(batch, geminiKey));
    } catch (e) {
      return json({ error: `classify failed at ${i}`, detail: String(e).slice(0, 200) }, 502);
    }
  }
  const customers = senders.filter((s) => verdict[s.email]);
  const rejected = senders.filter((s) => !verdict[s.email]);

  if (dryRun) {
    return json({
      dry_run: true, total: senders.length,
      customers_count: customers.length, rejected_count: rejected.length,
      customers_sample: customers.slice(0, 40).map((c) => `${c.email} — ${c.name}`),
      rejected_sample: rejected.slice(0, 25).map((c) => `${c.email} — ${c.name}`),
    });
  }

  if (!klaviyoKey) return json({ error: "KLAVIYO_API_KEY missing" }, 500);
  const listId = await getOrCreateList(listName, klaviyoKey);
  const jobId = await bulkImport(listId, customers, klaviyoKey);
  return json({
    dry_run: false, list_name: listName, list_id: listId, import_job_id: jobId,
    imported_customers: customers.length, rejected: rejected.length,
  });
});
