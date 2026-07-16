# WrapGuru API (for the WePrintWraps anchor tenant)

WrapGuru is the customer-facing AI agent for the **WePrintWraps** tenant, running
on the WrapCommandAI platform. Your SaaS calls these HTTP endpoints directly.

- **Base:** `https://qxllysilzonrlyoaomce.supabase.co/functions/v1`
- **Auth:** send the Supabase anon key on every call (public, safe to embed):
  ```
  apikey: <ANON_KEY>
  Authorization: Bearer <ANON_KEY>
  Content-Type: application/json
  ```
  `ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4bGx5c2lsem9ucmx5b2FvbWNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyMzQxMjIsImV4cCI6MjA4MzgxMDEyMn0.s1IyOY7QAVyrTtG_XLhugJUvxi2X_nHCvqvchYCvwtM`
- **CORS:** `Access-Control-Allow-Origin: *` (callable from browser or server).
- **Tenant:** WePrintWraps anchor tenant, org `031ac427-f078-4086-a9bc-7bdb78cc1c73`.
  All writes (conversations, quotes, contacts, jobs) are server-scoped to this org.
- **Sessions:** generate a stable `session_id` per visitor and reuse it across all
  calls so WrapGuru keeps context.

---

## 1. Chat — the WrapGuru brain
`POST /command-chat`

Handles quotes, real cart links, order lookups, escalations, design intake, and
file-fix checkout. Just send the user's message.

**Request**
```json
{
  "session_id": "wg-abc123",
  "message_text": "2020 Ford F150 full wrap",
  "customer_name": "",          // optional
  "customer_email": "",         // optional — enables emailed quote + retargeting
  "customer_phone": "",         // optional
  "geo": { "city": "", "region": "", "country": "" },  // optional
  "page_url": "https://weprintwraps.com/"              // optional
}
```
**Response**
```json
{
  "success": true,
  "reply": "For a 2020 Ford F150, the estimated wrap size is 280 sqft... $5.27/sqft...",
  "response": "…(same as reply)…",
  "conversation_id": "uuid"
}
```
Render `reply` as the assistant message. It may contain markdown links
(`[text](url)`) for cart/checkout links — linkify them.

---

## 2. Check My File — real print-ready analysis + fix orchestration
`POST /check-artwork-file`

Upload the file to storage first (any public URL ≤25MB), then call this. Returns a
real analysis (true DPI/dimensions/color space) and, when it has the customer
email, a **pre-created Stripe checkout** for the recommended fix.

**Request**
```json
{
  "session_id": "wg-abc123",
  "file_url": "https://…/artwork.pdf",
  "file_name": "artwork.pdf",
  "file_type": "application/pdf",
  "file_size": 1234567,
  "customer_confirmed_full_wrap": true,          // required gate
  "customer_email": "customer@x.com",            // triggers WrapGuruAI email + fix checkout
  "customer_name": "Trish",
  "vehicle_info": { "year": 2022, "make": "Chevy", "model": "Blazer", "sqft": 265 },
  "geo_data": { "city": "", "region": "" },
  "debug": false                                  // true = skip emails (testing)
}
```
Pass `vehicle_info.sqft` so DPI is computed against the real wrap size.

**Response**
```json
{
  "success": true,
  "action_id": "uuid",
  "preliminary_check": {
    "score": 3, "print_ready": false, "verdict": "…",
    "checks": [ { "label": "Effective DPI @ 265 sq ft", "value": "≈ 4 DPI", "status": "fail" }, … ],
    "quick_issues": [ … ], "recommendations": [ … ],
    "real_analysis": { "width_px": 1200, "height_px": 600, "color_space": "RGB", "format": "JPEG", "is_vector": false }
  },
  "recommended_fix": { "service": "upscale", "label": "Print-Ready Prep", "price": 199,
                       "reason": "…", "checkout_url": "https://checkout.stripe.com/…", "job_id": "uuid" },
  "customer_email_sent": true
}
```

---

## 3. ShopFlow fix — status / delivery
Fixes are created by `check-artwork-file` or by WrapGuru's `cmd_fix`. The
processing + Stripe live on RestylePro's public bridge; poll status here:

`POST /wrapguru-shopflow`
```json
{ "action": "status", "job_id": "uuid" }
→ { "ok": true, "status": "pending_payment|paid|processing|complete", "output_urls": { "upscaled_png": "…" } }
```
On `complete`, the customer is emailed automatically (bridge → callback). Services
& prices: upscale $199 (auto), cutpath $199, recreate $199, production_pack $299.

---

## 4. Admin / dashboard reads (for your SaaS UI)
`POST /get-website-chats`
```json
{ "channel": "website", "organization_id": "031ac427-f078-4086-a9bc-7bdb78cc1c73", "limit": 200 }
→ [ { id, channel, status, messages:[…], customer_email, vehicle, stage, … }, … ]
```
File analyses + quotes for a dashboard: read `ai_actions`
(`action_type='artwork_review'` and `'design_output'`) and `quotes`
(`source='website_chat'`), filtered by `organization_id`.

---

## Quick integration example
```js
const BASE = "https://qxllysilzonrlyoaomce.supabase.co/functions/v1";
const ANON = "<ANON_KEY>";
const H = { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${ANON}` };

async function askWrapGuru(sessionId, text) {
  const r = await fetch(`${BASE}/command-chat`, {
    method: "POST", headers: H,
    body: JSON.stringify({ session_id: sessionId, message_text: text, page_url: location.href })
  });
  const j = await r.json();
  return j.reply;          // render this
}
```

## Notes for multi-tenant use
- WrapGuru is **currently hard-scoped to the WePrintWraps org** on the server
  side. To serve a *different* tenant from the same endpoint later, the write
  path needs an `organization_id` (or `data-org`) passed through and honored in
  `command-chat` — a small change when you onboard tenant #2. For WePrintWraps
  (the anchor), it works as-is today.
