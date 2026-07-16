# WrapGuru Port / Audit Kit → for the restylepro-os session

You're auditing WrapGuru but can't read `WrapCommandAI-78a1c91e`. This is the
ground truth so your audit + `docs/WRAPGURU_EVOLUTION.md` are accurate.

## Correct these assumptions first
- **"WrapGuru barely exists"** — FALSE for WrapCommand. It's live in production and
  verified (quotes, file checks, cart links, ShopFlow fixes). It "barely exists"
  only in `restylepro-os`, which is why you can't find it there.
- **"Konva / chat UI"** — WRONG model. WrapGuru is **not** a Konva canvas app.
  It's a **backend AI agent + a vanilla-JS embed widget**. No React canvas, no
  Konva. Don't audit it as a UI component.

## What WrapGuru actually is (architecture)
- **Brain:** `supabase/functions/command-chat/index.ts` — a Deno edge function on
  Supabase `qxllysilzonrlyoaomce`. **OpenAI `gpt-4o`** with function-calling.
  Tools: `cmd_vehicle`, `cmd_pricing`, `cmd_quote`, `cmd_cart`, `cmd_order`,
  `cmd_escalate`, `cmd_knowledge`, `cmd_synopsis`, `cmd_update_contact`,
  `cmd_fix`. Inline price catalog (`WPW_PRODUCTS`), knowledge base, escalation
  routing. Temperature 0.2. Org-scoped to WPW `031ac427-f078-4086-a9bc-7bdb78cc1c73`.
- **File check:** `supabase/functions/check-artwork-file/index.ts` — fetches the
  file bytes and REALLY parses PNG/JPEG/TIFF/PDF for true dimensions, DPI, color
  space, vector/raster; computes real DPI at wrap size; returns a `checks[]`
  breakdown + a `recommended_fix` that pre-creates a Stripe checkout via the
  ShopFlow bridge. Sends the WrapGuruAI score email.
- **ShopFlow delivery:** `supabase/functions/wrapguru-shopflow/index.ts` — receives
  the bridge's completion callback (emails the finished file) + a status proxy.
  Payment + processing live on YOUR bridge (`shopflow-bridge`).
- **Widget:** `public/embed/chat-widget.js` (~52KB vanilla JS) — floating chat,
  6 starter buttons, geo, mic/transcription, Check-My-File modal, calls
  `command-chat`. Hosted at `www.wrapcommandai.com/embed/chat-widget.js`.
- **Admin:** React components under `src/components/admin/jordan-dashboard/`
  (WrapGuruTab, QuotesTab) + `src/hooks/useWebsiteChats.ts` — read via
  `get-website-chats`, org-scoped.

## DB tables WrapGuru uses (in qxllysilzonrlyoaomce)
`conversations`, `messages`, `contacts` (source `website_chat`), `quotes`
(source `website_chat`), `ai_actions` (`action_type` in `artwork_review`,
`design_output`, `shopflow_job`, `quote_created_from_chat`), `tasks`,
`email_sequence_enrollments`.

## Env / secrets it needs
`OPENAI_API_KEY`, `RESEND_API_KEY`, `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`
(or `EXTERNAL_*`), and the anon key for gateway auth. **No Stripe key** (your
bridge owns payment). Optional: `WOO_APP_USER`/`WOO_APP_PASS`, `TEAM_OUTPUT_KEY`.

## The full HTTP interface
See `docs/wrapguru-api.md` (chat, check-artwork-file, wrapguru-shopflow status,
get-website-chats) — copy this verbatim; it's the integration contract.

## Port plan (if consolidating into restylepro-os / restyleproai)
This is a **PORT, not a rewrite** — the logic is done and tested:
1. Copy these into your repo/Supabase project (`kfapjdyythzyvnpdeghu`):
   `command-chat`, `check-artwork-file`, `wrapguru-shopflow`,
   `create-quote-from-chat`, `forward-to-team`, `_shared/wpw-pricing.ts`, and
   `public/embed/chat-widget.js`.
2. Set the env/secrets above in your project.
3. Create/confirm the tables listed above (they mostly already exist for ShopFlow).
4. Repoint the widget's `apiUrl`/`supabaseUrl`/anon key to your project.
5. Deploy; test a quote + a file check + a fix checkout; cut the widget over.
6. Keep the current live WrapGuru running until yours is verified — zero downtime.

## The actual blocker (needs Trish)
Both sessions are hard-scoped to their own repo. To let you read WrapGuru's real
code, Trish must grant this session access to `Tdill1980/WrapCommandAI-78a1c91e`
(approve the repo-add in the Claude Code UI / add it as a session source / grant
the Claude GitHub App access to that repo). Until then, use this kit — and I
(the WrapCommand session) can export any specific file's full source on request.
