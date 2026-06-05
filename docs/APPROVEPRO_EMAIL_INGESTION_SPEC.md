# ApprovePro ⇄ WePrintWraps Design Email — Integration Spec

**Audience:** the Claude session building the connection in the **RestylePro / ApprovePro** repo.
**Purpose:** everything the ApprovePro side needs to parse **existing and new** emails sent to
`design@weprintwraps.com`, extract customer design assets, match them to a customer/order, and
drive ApprovePro's automated proof flow.

> Single owner: WePrintWraps.com, WrapCommandAI, and RestylePro/ApprovePro are all owned by the
> same person (Trish). Reusing the existing Microsoft 365 tenant is fine. A **dedicated, scoped
> Entra app for ApprovePro is still recommended** — for independent revocation and so a secret
> rotation on one product can't break the other.

---

## 1. WePrintWraps-side facts (the other repo can't see these)

| Thing | Value |
|---|---|
| Email provider | **Microsoft 365 (Exchange Online)** — accessed via **Microsoft Graph**, app-only |
| Primary mailbox to parse | `design@weprintwraps.com` |
| Other live inboxes (same tenant) | `hello@weprintwraps.com`, `support@weprintwraps.com`, `jackson@weprintwraps.com` |
| Existing Graph auth | Azure AD app, **client-credentials** flow, scope `https://graph.microsoft.com/.default` |
| Existing secrets (in WrapCommand) | `MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` |
| WPW org id (Supabase) | `51aa96db-c06d-41ae-b3cb-25b045c75caf` |
| WPW Supabase project | `qxllysilzonrlyoaomce` (`https://qxllysilzonrlyoaomce.supabase.co`) |

**Proven-working Graph endpoints already in production** (WrapCommand `check-inbox` / `manage-mailbox`):
```
GET /v1.0/users/{mailbox}/mailFolders/inbox/messages?$top=&$orderby=receivedDateTime desc
GET /v1.0/users/{mailbox}/messages/{id}?$select=body
GET /v1.0/users/{mailbox}/messages/{id}/attachments
POST /v1.0/users/{mailbox}/sendMail
```
So the tenant **already grants app-only mailbox read + attachment access**. ApprovePro can either
reuse those creds or (preferred) get its own scoped app — see §3.

---

## 2. Auth (client-credentials, app-only)

```
POST https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/token
Content-Type: application/x-www-form-urlencoded

client_id={CLIENT_ID}
client_secret={CLIENT_SECRET}        # or use a certificate (recommended for prod)
scope=https://graph.microsoft.com/.default
grant_type=client_credentials
```
Returns `access_token` (≈60 min). Cache it; refresh on 401/expiry. **No user is involved** — this
is application identity, which is what lets it read the mailbox unattended.

---

## 3. Entra app registration for ApprovePro (recommended dedicated app)

1. **App registration** → note `tenantId`, `clientId`. Create a **client secret** (or, better, a
   **certificate** — Graph supports cert creds and they don't expire as bluntly as secrets).
2. **API permissions → Microsoft Graph → Application permissions:**
   - `Mail.Read` — read mail + attachments (sufficient for ingestion).
   - Add `Mail.ReadWrite` **only if** ApprovePro should mark-as-read / move / categorize processed mail.
   - (Change-notification subscriptions need no extra permission beyond the resource permission above.)
   - Click **Grant admin consent**.
3. **Scope it to ONLY `design@` (least privilege)** via an Exchange **Application Access Policy** —
   `Mail.Read` is otherwise tenant-wide:
   ```powershell
   # In Exchange Online PowerShell
   New-DistributionGroup -Name "ApprovePro-Mailboxes" -Type Security `
     -Members design@weprintwraps.com

   New-ApplicationAccessPolicy -AppId <APPROVEPRO_CLIENT_ID> `
     -PolicyScopeGroupId ApprovePro-Mailboxes@weprintwraps.com `
     -AccessRight RestrictAccess `
     -Description "ApprovePro may only read the design inbox"

   Test-ApplicationAccessPolicy -Identity design@weprintwraps.com -AppId <APPROVEPRO_CLIENT_ID>
   # → AccessCheckResult : Granted
   Test-ApplicationAccessPolicy -Identity hello@weprintwraps.com  -AppId <APPROVEPRO_CLIENT_ID>
   # → AccessCheckResult : Denied
   ```
   To parse additional inboxes later, just add them to the `ApprovePro-Mailboxes` group.

---

## 4. Parse EXISTING emails (one-time backfill)

Page through inbox history. Use `$select` to keep payloads small and `@odata.nextLink` to paginate.

```
GET /v1.0/users/design@weprintwraps.com/mailFolders/inbox/messages
    ?$top=50
    &$orderby=receivedDateTime desc
    &$select=id,internetMessageId,conversationId,subject,from,toRecipients,
             receivedDateTime,hasAttachments,bodyPreview
```
- Optional date window: `&$filter=receivedDateTime ge 2025-01-01T00:00:00Z` (when filtering you may
  need `&$orderby=receivedDateTime desc` dropped or `Prefer: outlook.body-content-type`; if Graph
  rejects filter+orderby together, sort client-side).
- Follow `@odata.nextLink` until absent.
- **Idempotency:** persist `internetMessageId` (stable across folders) — skip already-processed mail
  so backfill + real-time can't double-create assets.
- Also sweep other folders if assets land outside Inbox (e.g. `Archive`): iterate `/mailFolders`.

For each message where `hasAttachments == true`, fetch attachments (§6).

---

## 5. Parse NEW emails (real-time, going forward)

**Primary: Graph change notifications (webhooks).**
```
POST /v1.0/subscriptions
{
  "changeType": "created",
  "notificationUrl": "https://<approvepro>/webhooks/graph-mail",
  "resource": "/users/design@weprintwraps.com/mailFolders('inbox')/messages",
  "expirationDateTime": "<now + 4230 minutes>",   // messages max ~3 days; renew before expiry
  "clientState": "<random secret you verify on each notification>"
}
```
- **Validation handshake:** on subscription create AND on renewal, Graph GETs your `notificationUrl`
  with `?validationToken=...`. Respond `200 text/plain` echoing the token within 10s, or the
  subscription fails.
- **On notification:** body contains `{ value: [{ resource, resourceData: { id }, clientState }] }`.
  Verify `clientState`, then `GET /v1.0/users/design@.../messages/{id}` to load the full message →
  parse → attachments.
- **Renewal:** subscriptions for messages expire fast (~3 days). Run a timer to `PATCH
  /subscriptions/{id}` with a new `expirationDateTime` well before expiry.
- (Optional) **Rich notifications**: include `includeResourceData:true` + encryption certificate to
  get message data inline and skip the follow-up GET.

**Backstop: delta query** (catches anything missed if your endpoint was down / subscription lapsed):
```
GET /v1.0/users/design@weprintwraps.com/mailFolders/inbox/messages/delta
```
Store the returned `@odata.deltaLink`; poll it every 5–10 min. It returns only changes since last
delta. This + webhooks = no missed mail.

---

## 6. Download attachments

```
GET /v1.0/users/design@weprintwraps.com/messages/{id}/attachments
    ?$select=id,name,contentType,size,isInline,@odata.type
```
- `#microsoft.graph.fileAttachment` → has `contentBytes` (**base64**). Decode → bytes → store.
- For **large** files where `contentBytes` isn't inlined, stream raw:
  `GET /messages/{id}/attachments/{attId}/$value`.
- `#microsoft.graph.referenceAttachment` → a link (OneDrive/SharePoint); resolve separately.
- `#microsoft.graph.itemAttachment` → an attached email/item; usually ignore for design assets.
- **Skip signature/inline images:** filter out `isInline == true` and tiny logos unless wanted.
- **Keep real design assets:** `png, jpg/jpeg, pdf, svg, ai, eps, psd, tif/tiff, zip`.

---

## 7. Parse + match to customer/order

Fields to extract per email: `from.emailAddress.address` + `.name`, `subject`, `receivedDateTime`,
`bodyPreview`/`body`, `internetMessageId`, `conversationId`, and the kept attachments.

**Matching backbone — reuse the `restylepro-api` you already own** (read-only, `x-api-key` auth, no
JWT). It exposes WPW customers/orders keyed by email, so ApprovePro can resolve a sender to a real
quote/conversation without direct DB access:
```
GET https://qxllysilzonrlyoaomce.supabase.co/functions/v1/restylepro-api?resource=quotes
GET https://qxllysilzonrlyoaomce.supabase.co/functions/v1/restylepro-api?resource=conversations
   Header: x-api-key: <RESTYLEPRO_API_KEY>   # set this secret in the WPW Supabase project
```
Match order, in priority:
1. **Order #** parsed from subject/body (WooCommerce order-number pattern) → exact match.
2. **Sender email** → `customer_email` on a recent quote/conversation.
3. No match → **unmatched/pending queue** for human review (don't silently drop assets).

> If you need richer fields (e.g. proof/approval data), `restylepro-api` currently exposes
> `health, conversations, transcript, quotes, stats, retargeting` — **not** the `approveflow_*`
> tables. If ApprovePro needs those, that's a small add on the WrapCommand side (new resource) —
> flag it and the WrapCommand session can add it.

---

## 8. Handoff into ApprovePro automation

Once matched: create/locate the ApprovePro project for that customer/order, attach the downloaded
files as **customer-supplied assets**, and trigger the AI 2D→3D proof. Record provenance on each
asset: `source = "design_email"`, `internet_message_id`, `received_at`, `sender_email`.

---

## 9. Non-negotiables / ops checklist

- [ ] **Idempotency** keyed on `internetMessageId` (backfill + webhook + delta must converge).
- [ ] **Throttling:** handle `429` with `Retry-After`; use `$batch` (≤20 requests) for attachment pulls.
- [ ] **Secrets** in ApprovePro's secret manager; prefer **certificate** creds; rotate on a schedule.
- [ ] **Least privilege:** `Mail.Read` + Application Access Policy locked to `design@`.
- [ ] **Validation + clientState** verified on every webhook call.
- [ ] **Subscription renewal** timer (messages expire ~3 days).
- [ ] **Dead-letter / retry** for parse or handoff failures; never lose an attachment.
- [ ] **Unmatched queue** surfaced for human review.

---

## 10. Coordination between the two sessions

| Side | Owner | Action |
|---|---|---|
| Entra app + Application Access Policy | tenant admin | Create scoped ApprovePro app, grant consent |
| Graph ingestion (backfill + webhook + delta) | **ApprovePro repo session** | Build per §2–§8 |
| `RESTYLEPRO_API_KEY` secret | WrapCommand/Supabase | Set in project `qxllysilzonrlyoaomce` so §7 matching works |
| Extra `restylepro-api` resources (if ApprovePro needs `approveflow_*`) | WrapCommand session | Add on request |

**Note on WrapCommand's own inbound pipeline:** WrapCommand has a `receive-email-webhook` that also
ingests `design@` mail, but it is currently **disabled** (`KILL_SWITCH_EMAIL = true`). If ApprovePro
becomes the system of record for design email, that WrapCommand pipeline can stay off — just make
sure only **one** system is acting on the inbox (or that both are idempotent) to avoid double-processing.
</content>
