# design-agent — WePrintWraps design@ support agent

The new, intelligent email agent for **design@weprintwraps.com**. It reads the
inbox that real customers actually use, drafts grounded replies, and makes sure
no one goes dark — the thing the old website-chat "Jordan" never did (that widget
only ever saw ~5 test chats; customers come by email).

## What it does (v1 — DRAFT + ALARM ONLY)
For every new inbound customer email on design@:
1. Reads the full thread via Microsoft Graph (the Azure app-only auth that
   already works — proven live).
2. Parses the order number (`#35xxx`) and pulls the real order from
   `shopflow_orders` (status, stage, tracking, paid, total).
3. Uses **OpenAI** to classify intent / urgency / refund-risk and **draft a
   complete reply** grounded in that order + WPW knowledge.
4. Saves the draft to `design_agent_drafts` (`status = pending_review`).
5. If refund-risk or high urgency → **emails an alarm** to the owner.

**It never emails a customer automatically in v1.** A human approves each draft.
Auto-send for safe categories is a later, deliberate step.

## Files
- `supabase/functions/design-agent/index.ts` — the agent.
- `supabase/migrations/20260709_design_agent_drafts.sql` — the review-queue table.
- `supabase/config.toml` — `[functions.design-agent] verify_jwt = false`.

## Secrets required (Supabase → Edge Functions → Secrets)
Already present (used by existing MightyMail functions): `MICROSOFT_TENANT_ID`,
`MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `RESEND_API_KEY`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
**Must be added:** `OPENAI_API_KEY`.
Optional: `OPENAI_MODEL` (default `gpt-4o`), `DESIGN_AGENT_MAILBOX`
(default `design@weprintwraps.com`), `DESIGN_AGENT_ALARM_TO`
(default `trish@weprintwraps.com`).

## Go-live steps
1. Add `OPENAI_API_KEY` secret.
2. Apply the migration (creates `design_agent_drafts`).
3. Deploy: `supabase functions deploy design-agent --project-ref qxllysilzonrlyoaomce`.
4. **Test once, by hand** (no cron yet):
   ```bash
   curl -X POST https://qxllysilzonrlyoaomce.supabase.co/functions/v1/design-agent \
     -H "Content-Type: application/json" -d '{"limit":5}'
   ```
   Then read the drafts:
   `select from_email, subject, order_number, intent, urgency, refund_risk, summary, draft_reply from design_agent_drafts order by created_at desc;`
5. Once the drafts look right, schedule it (the switch that was always missing):
   ```sql
   select cron.schedule('design-agent-poll', '*/3 * * * *', $$
     select net.http_post(
       url    := 'https://qxllysilzonrlyoaomce.supabase.co/functions/v1/design-agent',
       headers:= '{"Content-Type":"application/json"}'::jsonb,
       body   := '{"limit":15}'::jsonb
     );
   $$);
   ```

## The heartbeat (why this won't silently die like before)
Every past piece broke because nothing watched it. Next step after v1 is a tiny
monitor that alarms the owner if design-agent hasn't run, or if any thread sits
unanswered > 2h. Build that before trusting auto-send.

## Roadmap
- v1: draft + alarm (this).
- v2: one-click approve/send from a dashboard review queue reading
  `design_agent_drafts`.
- v3: auto-send safe categories (status/tracking answers); humans keep refunds
  and approvals.
- Knowledge: wire in the dedicated "Wrap knowledge" Supabase project as the
  grounding source (replacing the inline `WPW_KNOWLEDGE` constant).
