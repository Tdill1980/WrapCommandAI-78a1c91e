# Report 2 — WrapCommandAI: Salvage Audit

> Forensic liveness audit, 2026-07-21. READ-ONLY — no code modified.
> Evidence basis: git history, actual imports, deployment config (`supabase/config.toml`), frontend invocation paths, cross-repo call sites in RestylePro. A component is NOT classified as current merely because it exists.
>
> Classifications: **KEEP** (working, currently used) · **EXTRACT** (reusable, should be decoupled from this architecture) · **REFERENCE** (concept useful, implementation not reusable) · **SUPERSEDED** (RestylePro has a newer implementation) · **REPAIR** (strategically important, reasonable to fix) · **ARCHIVE** (no longer relevant) · **DELETE CANDIDATE** (duplicate, abandoned, dangerous, or misleading)

**Repo:** `Tdill1980/wrapcommandai-78a1c91e` · Supabase project `qxllysilzonrlyoaomce`
**Compared against:** RestylePro (`Tdill1980/restylepro-os`, Supabase `kfapjdyythzyvnpdeghu`)

---

## 1. The Repo's Life Story (evidence-based)

Commit volume by month (`git log --date=format:%Y-%m`):

| Month | Commits | Era |
|---|---|---|
| 2026-02 | 34 | Original "AI operating system for the wrap shop" build |
| 2026-05 | 1 | First RestylePro tie-in (`restylepro-api`, May 26) |
| 2026-06 | 3 | `seo-engine` (Jun 9), `agent-chat` product knowledge (Jun 12) |
| 2026-07 | 72 | Major pivot: WrapGuru customer chat + content/video factory feeding RestylePro |

Totals: 110 commits, 224 edge-function directories, 177 migrations, 95+ pages.

**What it was (Feb 2026):** a maximalist "AI OS" for WePrintWraps — a `command-chat` Anthropic kernel orchestrating `cmd-knowledge / cmd-vehicle / cmd-pricing / cmd-quote / cmd-synopsis` tools, an autonomous ops agent ("Wren"), an "Ops Desk," a founder constitution/authority matrix, a MightyChat unified inbox, an Outlook/Graph mailbox with persona email routing, and a Twilio/Vapi phone agent.

**Critical finding — the Feb architecture is largely fictional today.** There are **zero `cmd-*` functions** in the tree. `command-chat/index.ts` is now 1,030 lines of OpenAI-brained WrapGuru chat (last touched 2026-07-14), not a 120-line Anthropic kernel. Every Feb-era doc is stale and actively misleading (§4).

**What it became (Jul 2026):** two things —
1. A **customer-facing "WrapGuru" chat/quote widget** for weprintwraps.com (`command-chat`, `check-artwork-file`, `wrapguru-shopflow`), which offloads heavy lifting to RestylePro: `wrapguru-shopflow/index.ts` hard-codes `BRIDGE_URL = https://kfapjdyythzyvnpdeghu.supabase.co/functions/v1/shopflow-bridge`.
2. A **content/video factory** whose output feeds RestylePro's marketing pipeline: RP `marketing-agent/index.ts:718` hard-codes `WCAI_FUNCTIONS = https://qxllysilzonrlyoaomce.supabase.co/functions/v1` and pulls media via WCAI `media-bridge`; WCAI `ContentDrafts.tsx` invokes `sync-draft-to-restylepro` → RP `content-intake` → `agent_social_posts` → RP `content-deploy` cron.

**One-line epitaph:** built Feb 2026 as an all-in-one autonomous "AI OS," most of which never worked and was abandoned within weeks; by July 2026 it had been quietly repurposed into a customer-chat widget and a video/content factory bolted onto the side of RestylePro, which is now the real platform.

---

## 2. Cross-Repo Live Wiring (demonstrably in use)

| Link | Direction | Evidence | Verdict |
|---|---|---|---|
| `media-bridge` | RP → WCAI | RP `marketing-agent/index.ts:721` POSTs `{action:list}`; function created 2026-07-15 for exactly this | **LIVE** |
| `sync-draft-to-restylepro` | WCAI → RP | WCAI `ContentDrafts.tsx:136` invokes it; RP `content-intake/index.ts:5` + RP `docs/CONTENT-DEPLOYMENT.md:45` document it | **LIVE** |
| `wrapguru-shopflow` / `command-chat` cmd_fix | WCAI → RP | Delegates Stripe/file-fix to RP `shopflow-bridge` | **LIVE** |
| `restylepro-api` | RP → WCAI | Read-only API exposing WCAI website-chat conversations/quotes to RP (`x-api-key`); last commit 2026-05-26 | **LIVE (verify RP still polls)** |
| `command-chat` | — | RP references it only in its `ARCHITECTURE.md` as "🟡 IN PROGRESS" — RP does **not** call it | Not an RP dependency |

---

## 3. Per-Subsystem Verdicts

### A. Chat / Agent kernel

| Component | Classification | Evidence | Last active | RP counterpart |
|---|---|---|---|---|
| `command-chat` (WrapGuru brain, 1,030 ln, OpenAI) | **KEEP** | Invoked by `WebsiteChatWidget.tsx:94`, `LuigiWebsiteWidget.tsx:99`, `ChatWithUpload.tsx:180`, `WebsiteChatAgent.tsx:68`; delegates fix/shopflow to RP bridge | 2026-07-14 | RP `ace-speak`/`chat-with-ai` (parallel, different product) |
| `check-artwork-file` (715 ln) | **KEEP** | WrapGuru file check | 2026-07-14 | RP `quick-prep-vector-trace` / `analyze-panel-design` |
| `wrapguru-shopflow` | **KEEP (thin proxy)** | Stripe callback + status proxy to RP bridge | 2026-07-13 | RP `shopflow-bridge` (the real engine) |
| `agent-chat` (1,819 ln) | **REPAIR / consolidate** | Still invoked by ~10 admin components (`useAgentChat.ts`, `InternalReplyPanel.tsx`) but overlaps `command-chat`; MightyChat inbox routes disabled | 2026-06-12 | — |
| `admin-jordan-chat` | **REFERENCE** | Admin "platform education" chat; niche | 2026-02 | — |
| `cmd-knowledge/vehicle/pricing/quote/synopsis` | **DELETE CANDIDATE (phantom)** | Documented in ARCHITECTURE-BIBLE but do not exist in the tree | never existed | — |

### B. Abandoned "AI OS" concepts (Feb 2026, frozen)

| Component | Classification | Evidence | Last active |
|---|---|---|---|
| `_shared/wpw-constitution.ts` (authority matrix: founder override, ops approvals, escalation rules, sales goals) | **REFERENCE** — the concept (codified org bylaws for agents) is genuinely valuable; the implementation is a static object only imported by the dead Wren/Ops-Desk chain | 2026-02-09 |
| `_shared/ops-desk-router.ts` (237 ln) | **ARCHIVE** — routes to abandoned Ops Desk | 2026-02-09 |
| `_shared/conversation-events.ts` (239 ln) | **REFERENCE** — event-sourcing concept for conversations; not wired to any live flow | 2026-02-09 |
| `OpsDeskScreen/Panel/CommandPanel.tsx` | **ARCHIVE** — under disabled MightyChat shell | 2026-02 |
| `wren-monitor` (568 ln), `send-wren-email`, `wren_tasks`/`wren_diary` tables | **ARCHIVE / DELETE CANDIDATE** — last commit: "Fix health monitor creating fake quotes + emails" (it was misfiring and was neutered, not maintained) | 2026-02-09 |
| MightyChat inbox (`MightyChat.tsx`, `MightyChatV2.tsx`) | **ARCHIVE** — routes disabled → redirect to `/website-admin` | 2026-02 |

### C. Email / Mailbox / Persona routing

| Component | Classification | Evidence | Last active | RP counterpart |
|---|---|---|---|---|
| Outlook/Graph mailbox (`mightymail-sync`, `manage-mailbox`, `check-inbox`, `mailbox-senders/stats`) | **SUPERSEDED / ARCHIVE** | Core sync frozen 2026-02-09; only `mailbox-stats` touched Jul 9 (read-only stat) | 2026-02-09 | RP `process-scheduled-emails`, `resend-email-history` |
| `receive-email-webhook` + persona routing (Alex/hello@, Grant/design@, Jackson/ops) | **ARCHIVE** | Frozen at the Feb anon-key fix | 2026-02-09 | — |
| MightyMail campaigns (`send-mightymail-*`, sequences, winback) | **SUPERSEDED** | Still invoked by `MightyMail*.tsx` pages but Resend-based, WPW-only | Feb (frontend Jul) | RP `send-email-campaign`, `send-templated-email`, `send-estimate-email`, `send-team-email` |
| `mightymail-autoquote`, `mightymail-classify` | **ARCHIVE** | Feb 2026, unmaintained | 2026-02-09 | RP `parse-quote-job` |
| Email kill-switch (Jul 15) | **KEEP** | Safety toggle added in the July batch | 2026-07-15 | — |

### D. Marketing / Content / SEO engine

| Component | Classification | Evidence | Last active | RP counterpart |
|---|---|---|---|---|
| `seo-engine` (742 ln) + 4 pg_cron jobs (`20260610_seo_engine.sql`: daily blog 13:00, product sweep Mon 14:00, GSC sync 13:30, weekly audit Mon 15:00) | **SUPERSEDED** — cron *may still fire*; RP's suite is vastly more complete | 2026-06-09 | RP `seo-auto-blog-cron`, `seo-blog-generate`, `seo-product-sweep`, `seo-page-audit`, `seo-gbp-scheduler`, `seo-google-search-console`, `seo-meta-publish`, `seo-wp-publish`, `seo-monthly-report` (~20 fns) |
| Content generation (`generate-social-content`, `hybrid-generate-content`, `ai-repurpose-content`, `publish-content`, `generate-content-calendar`) | **SUPERSEDED** | WCAI frontend still calls via `useContentBox.ts` | 2026-07 | RP `content-engine-claude`, `content-studio-ai-copy`, `content-deploy`, `content-intake` |
| Meta/paid-ad factory (`create-meta-ad`, `ai-generate-meta-ads`, `render-static-ad`, `render-grid-ad`, `MetaAdFactory.tsx`) | **REFERENCE / SUPERSEDED** | Wired but overlaps RP marketing-agent | 2026-07 | RP `marketing-agent` |
| **Content/video FACTORY** (`ai-auto-create-reel`, `render-reel-ffmpeg`, `mux-*`, `yt-*`, `ai-generate-static`, ReelBuilder, Organic Hub, `AutoSplit.tsx`) | **KEEP / EXTRACT** — the one capability RP actively wants from WCAI | RP commit #3342 "Video Studio tab — WrapCommandAI content-factory launcher"; RP `marketing-agent` pulls output via `media-bridge` | 2026-07-16 | RP has **no** video renderer — this is WCAI's unique live asset |

### E. Quotes / ShopFlow / ApproveFlow / Affiliate (WPW-native shop ops)

| Component | Classification | Evidence | Last active | RP counterpart |
|---|---|---|---|---|
| Quote pipeline (`submit-quote`, `convert-quote-to-order`, `save-quote`, `create-quote-from-chat`, `run-quote-followups`, `run-quote-retargeting`) | **KEEP** | Live WPW quote→order flow; retargeting refreshed 2026-07-09; `PaymentConfirmModal.tsx:73` → `convert-quote-to-order` | 2026-07-09 | RP `submit-public-quote`, `apply-quickquote-upsell` (parallel, RP-brand) |
| ShopFlow + WooCommerce (`sync-wc-shopflow`, `woo-proxy`, `update-woo-order`, `get-shopflow-orders`, `useShopFlow.ts`) | **KEEP** | Live webhook for weprintwraps.com Woo; `SHOPFLOW_WEBHOOK_DIAGNOSTICS.md` claims verified — "missing files" is a WooCommerce data problem, not a code break | 2026-07 | none (WPW-specific) |
| ApproveFlow (`approve-approveflow-proof`, `generate-studio-renders`, `sync-wc-approveflow`, 10 tables) | **KEEP (RP has newer design proofing)** | Fully wired for WPW; server-side approval gate correct | 2026-07 | RP `approvepro-*` suite is newer/more capable, RestylePro-branded |
| Affiliate system (`affiliate-*`, Stripe Connect, 5 tables) | **KEEP** | Fully wired; `affiliateApi.ts` + `useStripeConnect.ts` | 2026-02 (stable) | RP `affiliate-*` (separate program) |
| DesignPanelPro / render (`generate-panel`, `generate-printpackage`, `generate-color-render`, `generate-3dproof`) | **SUPERSEDED** | Uses external Lovable 3D endpoint (`wzwqhfbmymrengjqikjl`) | 2026-02 | RP DesignProAI (thousands of commits, current) |

### F. Phone / Voice agent

| Component | Classification | Evidence | Last active |
|---|---|---|---|
| `vapi-webhook`, `receive-phone-call`, `twilio-sms-webhook`, `purchase-twilio-numbers`, `send-sms`, `process-phone-speech`, `parse-voice-quote` | **ARCHIVE / DELETE CANDIDATE** | Entire subsystem frozen 2026-02 (only `process-phone-speech` nudged 2026-02-16 in a bulk Gemini swap); no frontend wiring beyond `VoiceCommand.tsx`; Twilio/Vapi secrets likely never provisioned | 2026-02-16 |

### G. Monitors / Cron

| Component | Classification | Evidence | Last active |
|---|---|---|---|
| `run-quote-followups`, `run-quote-retargeting` | **KEEP** | Refreshed in the July quote batch | 2026-07-09 |
| `revenue-health-monitor` | **REPAIR** | `RevenueHealth.tsx` invokes it 4×; last real work Feb 2026 | 2026-02-16 |
| `reconcile-quote-conversions` | **KEEP** | May 2026 conversion reconciliation | 2026-05-26 |
| `wren-monitor`, `chat-health-check` | **ARCHIVE** | Feb; wren-monitor neutered for creating fake data | 2026-02 |

---

## 4. Broken / Misleading Paths (verified)

1. **Phantom `cmd-*` kernel** — `ARCHITECTURE-BIBLE.md`, `PROTECTED.md`, `README.md`, `WIRING-AUDIT-REPORT.md` all describe a `command-chat` kernel + `cmd-*` tool functions. **None exist.** `PROTECTED.md` even lists `supabase/functions/cmd-quote/index.ts` as a protected file. → All four docs are **ARCHIVE / DELETE CANDIDATE** (dangerously misleading).
2. **WIRING-AUDIT-REPORT.md is stale** (2026-02-12, pre-pivot): claims "196 edge functions … Dead Endpoints: 0"; actual count is 224 dirs and it validates the non-existent `cmd-*` chain. Its ShopFlow/ApproveFlow/Affiliate/Quotes wiring sections remain broadly accurate; its chat/kernel section is fiction.
3. **`content_files` migration TODO** — `MediaUploader.tsx:18`, `MediaLibrary.tsx:21`: "TODO: Migrate content_files to WPW production," unresolved 5+ months.
4. **`useVideoRender.ts` DEPRECATED** — still in tree, shows an error toast, superseded by `useMightyEdit.ts`. → **DELETE CANDIDATE**.
5. **Lovable 3D dependency** — DesignPanelPro/ApproveFlow renders still call `wzwqhfbmymrengjqikjl.supabase.co` (external Lovable project). Live but a cross-tenant liability; RP DesignProAI replaces it.
6. Low TODO density in `src/` (9 files) — the rot is in dead backend subsystems and stale docs, not the live frontend.

---

## 5. Salvage Summary — highest-value actions

**EXTRACT (crown jewels RP already depends on):** the content/video factory (`ai-auto-create-reel`, `render-reel-ffmpeg`, `mux-*`, `yt-*`, ReelBuilder/Organic Hub) + `media-bridge` + `sync-draft-to-restylepro`. The only WCAI capability RP cannot replicate and actively calls. Decouple it from the WCAI shell so it doesn't die with the legacy app.

**KEEP (live WPW production):** WrapGuru website widget (`command-chat`, `check-artwork-file`, `wrapguru-shopflow`), ShopFlow/WooCommerce sync, quote pipeline + followups/retargeting, ApproveFlow, affiliate, `restylepro-api`.

**REFERENCE (good ideas, not reusable code):** `wpw-constitution.ts` (agent authority matrix — worth re-implementing as live guardrails), `conversation-events.ts` (event-sourced conversations).

**SUPERSEDED by RestylePro:** `seo-engine` → RP `seo-*` suite; content generation → RP `content-engine-claude`/`content-deploy`; MightyMail → RP email suite; DesignPanelPro → RP DesignProAI/`approvepro-*`; generic chat agent → RP `ace-*`.

**ARCHIVE / DELETE CANDIDATE:** Wren agent (+ `wren-monitor`, `wren_tasks`, `wren_diary`), Ops Desk, MightyChat inbox, entire phone/SMS/Vapi subsystem, Outlook/Graph mailbox + persona routing, `useVideoRender.ts`, and — most urgently — the four Feb-2026 architecture docs describing a kernel that does not exist.
