# Report 3 — Cross-Repo Dependency Truth: RestylePro ↔ WrapCommandAI

> Forensic audit, 2026-07-21. Evidence-only: every claim carries file:line citations and a confidence level. No redesign recommendations — this report only establishes what is factually connected, what is broken, and which implementation is the evidenced source of truth per capability.
>
> Repos: RestylePro (`RP`, `/restylepro-os`, Supabase `kfapjdyythzyvnpdeghu`) · WrapCommandAI (`WCAI`, Supabase `qxllysilzonrlyoaomce`).

---

## 0. The Four Supabase Projects

| Project ref | Identity | Owner | Evidence |
|---|---|---|---|
| `kfapjdyythzyvnpdeghu` | **RestylePro** (restyleproai.com) | RP | RP `CLAUDE.md` deploy commands; WCAI calls it "RestylePro's public bridge" (`wrapguru-shopflow/index.ts:5-6`) |
| `qxllysilzonrlyoaomce` | **WrapCommandAI** own DB (WePrintWraps dashboard/production) | WCAI | WCAI `.env:9-10`; WCAI `ARCHITECTURE.md:43` |
| `wzwqhfbmymrengjqikjl` | **"Lovable" Supabase — 3D renders + email-image storage only** | WCAI-only | WCAI `ARCHITECTURE.md:54-58`, `PROTECTED.md:43-45`. 19 refs are render endpoints (`RenderTestLab.tsx:25-26`, `ApproveFlow.tsx:411`) + storage URLs (`MightyMailCampaignSender.tsx:41-42`). **NOT a link to RP — red herring for cross-repo purposes.** Confidence HIGH |
| `lqxnwskrrshythrydzcs` | **External WPW WooCommerce quote/analytics DB** (tenant `wpw`) | shared third project | WCAI `fetch-external-quotes/index.ts:9-10`, `quote-status-webhook/index.ts:9-10`; **RP also reads it**: `wpw-analytics-proxy/index.ts:30`, `config.toml:1268`. Confidence HIGH |

---

## 1. What RestylePro calls/references in WrapCommandAI

| RP file:line | Reference | Live? | Confidence |
|---|---|---|---|
| `supabase/functions/marketing-agent/index.ts:718,721` | `POST https://qxllysilzonrlyoaomce…/media-bridge` (action:list) — pulls WCAI media-library assets | **LIVE** (target exists, WCAI `config.toml:468`) | HIGH |
| `supabase/functions/marketing-agent/index.ts:821` | `POST …/ai-generate-meta-ads` — pulls paid-ad copy | **LIVE** (WCAI `config.toml:145`) | HIGH |
| `src/pages/AdminMarketingHub.tsx:3087-3193` | `WCAI_BASE="https://wrapcommandai.com"` — `target=_blank` hyperlinks to WCAI web tools | **Passive** — browser navigation only, no API call | HIGH |
| `supabase/functions/content-intake/index.ts:4,21,26` | Comments documenting the inbound WCAI bridge + shared secret name | Inbound endpoint (§2); no outbound call | HIGH |
| `supabase/functions/intake-graph-poll/index.ts:164-169` | Comment + `MICROSOFT_*` env fallback — **shares WCAI's Azure Graph app/mailbox**, makes no HTTP call to WCAI | Shared credentials only | HIGH |
| `docs/CONTENT-DEPLOYMENT.md:37-92`, `docs/APPROVEPRO_EMAIL_INTAKE.md:26-45`, `ARCHITECTURE.md:205-210`, `WRAPCOMMAND_AI_REBUILD_GUIDE.md` | Prose/blueprints | Docs only | HIGH |

**RP → WCAI live data calls = exactly TWO**, both inside `marketing-agent` (media-bridge, ai-generate-meta-ads). Both fetches send **no auth header** (`marketing-agent/index.ts:721-724, 821-824`) — they depend on those WCAI functions staying public.

---

## 2. What WrapCommandAI calls in RestylePro

| WCAI file:line | Calls RP endpoint | Target exists in RP? | Live? | Confidence |
|---|---|---|---|---|
| `sync-draft-to-restylepro/index.ts:21,50,86` | `${RESTYLEPRO_FUNCTIONS_URL}/content-intake` (with `RESTYLEPRO_INTAKE_SECRET`) | ✅ exists (`config.toml:1425`) | **LIVE** — WCAI pushes finished `content_drafts` into RP's deploy loop | HIGH |
| `command-chat/index.ts:403,444` | `…kfapjdyythzyvnpdeghu…/shopflow-bridge` (action:create) | ❌ **DOES NOT EXIST in RP repo** | **BROKEN/unverifiable** (§6.1) | HIGH |
| `command-chat/index.ts:959-960` | `…/wpw-calc-lead` (hard-coded RP anon JWT) | ✅ exists (`config.toml:744`) | **LIVE** | HIGH |
| `wrapguru-shopflow/index.ts:6,27,109` | `…/shopflow-bridge` (status proxy) | ❌ missing | **BROKEN** | HIGH |
| `check-artwork-file/index.ts:465` | `…/shopflow-bridge` (pre-creates checkout) | ❌ missing | **BROKEN** | HIGH |
| `_shared/brand-os.ts:36`, `generate-social-content/index.ts:58-62` | `RESTYLEPRO_BRAND_BLOCK` — a **copied** brand OS constant, not a shared import | n/a | Duplication that drifts | HIGH |
| `.github/workflows/edge-fn-admin.yml:59-69` | Sets `RESTYLEPRO_API_KEY` secret — **no WCAI function ever reads it** | — | Vestigial | MEDIUM |

**Verified absence:** `grep -i shopflow` across the entire RP repo returns **zero matches** — no function, no config entry, no doc. Confidence HIGH.

---

## 3. Shared services / accounts / credentials

| Service | RP | WCAI | Shared? | Evidence |
|---|---|---|---|---|
| **Resend** | sends `noreply@restyleproai.com`, notifies `trish@weprintwraps.com` (`wpw-calc-lead:11,27`) | sends `hello@weprintwraps.com` (`submit-quote:219`) | Likely shared account/verified domains | HIGH |
| **Microsoft Graph** | `MS_GRAPH_*` with `MICROSOFT_*` fallback; mailbox `design@weprintwraps.com` | `MICROSOFT_*` (10 fns), same mailboxes | **Shared Azure app + mailboxes by design** (`intake-graph-poll:163-169`; RP `docs/APPROVEPRO_EMAIL_INTAKE.md:34-45`) | HIGH |
| **WooCommerce** (weprintwraps.com store) | `WOOCOMMERCE_*` (8 fns) | `WOO_*` (18 fns) | **Same store**, different var names | HIGH |
| **Klaviyo** | 8 fns | 6 fns | Likely same WPW account | MEDIUM |
| **Stripe** | Full stack: secret key (22 fns), 4 webhooks, Connect | Only `STRIPE_SECRET_KEY` (1 fn) | **Payments centralized in RP** — which is why WCAI expects RP to host `shopflow-bridge` | HIGH |
| **AI providers** | OpenAI(12), Anthropic(10), Google AI(39), Gemini(4) | OpenAI(3), Anthropic(5), Gemini(63) | Same providers, presumably separate keys | MEDIUM |
| **Twilio** | 12 fns (voice agent) | 6 fns (phone agent) | Duplicate capability, both present | HIGH |
| **Mux (video)** | none | `MUX_TOKEN_*` (3) | WCAI-only capability | HIGH |
| **Storage buckets** | `wrap-files` | `media-library` on `wzwqhfbmymrengjqikjl` | No shared bucket | HIGH |
| **Domains** | restyleproai.com | wrapcommandai.com | **weprintwraps.com is the shared surface both serve** | HIGH |

---

## 4. Duplicate capabilities + evidenced source of truth

| Capability | RP implementation | WCAI implementation | Evidence of which is live | Recommended SoT | Conf. |
|---|---|---|---|---|---|
| Content publishing (IG/FB) | `content-intake` + `content-deploy` cron, brand-aware Meta connections | `sync-draft-to-restylepro` (bridge) + single-account `publish-content` | Both repos' docs agree RP is the sanctioned publisher; WCAI defers to it | **RP** | HIGH |
| Heavy media production (reels/video/ads) | none | Mux pipeline, `media-bridge`, `ai-generate-meta-ads`, ReelBuilder | RP `AdminMarketingHub.tsx:3081-3085` links out; RP `marketing-agent` pulls FROM WCAI | **WCAI** (unique live asset) | HIGH |
| Social/ad copy generation | `marketing-agent`, `content-studio-ai-copy` (Jul 2026) | `generate-social-content`, `hybrid-generate-content` (duplicated brand OS) | RP's invoked from RP frontend; WCAI's standalone | Split by brand; consolidate `brand-os` | MEDIUM |
| SEO / AEO | ~20 `seo-*` fns (GSC, GBP, WP publish, blog cron), Jun–Jul 2026 | single `seo-engine` (2026-06-09) targeting the **same** weprintwraps.com GSC/Woo | RP far more complete + cron-wired; both hitting the same domain = **conflict risk** (double blog posting) | **RP** | MEDIUM |
| WPW customer quotes | `wpw-calc-lead`, `submit-public-quote` (calculator lead) | `submit-quote`, `create-quote-from-chat`, `convert-quote-to-order` (Woo order chain) | WCAI owns the WPW Woo quote→order chain | **WCAI** for Woo quotes; **RP** for calculator leads | HIGH |
| WePrintWraps site chat widget | `wpw-sales-chat` ("no WrapCommand dependency"), `chat-with-ai` | `command-chat` (WrapGuru) — the deployed embed (`public/embed/chat-widget.js`) | WrapGuru is the live site widget | **WCAI** | HIGH |
| Phone agent | `twilio-voice-agent` + webhooks | `receive-phone-call`, `process-phone-speech` (frozen Feb) | RP's is webhook-wired; WCAI's frozen 2026-02 | **RP** | LOW-MED |
| Woo order sync | `cron-ingest-wpw`, `wpw-backfill-orders`, `wpw-analytics-proxy` → external DB | `bulk-sync-orders`, `get-shopflow-orders`, `fetch-external-quotes` → same external DB | Both ingest independently into their own DBs — parallel copies, no single SoT today | Unresolved (both live) | MEDIUM |
| File-fix / print-prep ("Check My File") | expected host of `shopflow-bridge` (absent); owns the actual render/upscale pipeline | `check-artwork-file`, `command-chat` cmd_fix, `wrapguru-shopflow` — all call the missing bridge | See §6.1 | Intended **RP**, not wired in-repo | HIGH |

**Git chronology of the bridges:** WCAI→RP content bridge landed 2026-07-08 (`15bcf85`); WrapGuru/ShopFlow file-fix flow 2026-07-13/14; RP `content-intake`/`intake-graph-poll` last touched 2026-07-15; RP `marketing-agent` media-pull rewired 2026-07-16 ("pull real images from Content Studio library, drop Gemini"). The content bridge is the most mature; the ShopFlow bridge is newest and its RP half never materialized in the repo.

---

## 5. What breaks TODAY if WCAI's Supabase were shut down

| RP path | Impact | Customer-facing? |
|---|---|---|
| `marketing-agent` plan_social | `media-bridge` fetch throws → 409 "no usable media in the WrapCommand library" (`marketing-agent:726,738`) | No — admin-only, graceful degradation |
| `marketing-agent` ad_pack | `ai-generate-meta-ads` → 502 (`marketing-agent:826`) | No — admin-only |
| AdminMarketingHub Video tab | Dead hyperlinks | Cosmetic |
| `content-intake` | Stops receiving WCAI drafts; RP-native content still deploys | No |
| `intake-graph-poll` | **Unaffected** — talks to Microsoft directly with its own secrets | — |
| All RP render/design/production/quotes/SEO/checkout | **Unaffected** | — |

**Conclusion: no customer-facing RestylePro path breaks.** Confidence HIGH.

**Reverse (if RP shut down):** WCAI loses `sync-draft-to-restylepro` (content publishing), `wpw-calc-lead` (chat quote lead), and the already-broken ShopFlow bridge; WrapGuru chat keeps chatting but loses its fulfillment/publishing arms.

---

## 6. Connections that only APPEAR real

1. **`shopflow-bridge` — the biggest phantom (HIGH).** Three live WCAI functions POST to `…kfapjdyythzyvnpdeghu…/functions/v1/shopflow-bridge` for the entire "Check My File → pay → fix → deliver" flow. The function exists nowhere in RP source or `config.toml`. Either it's deployed to RP's Supabase out-of-repo (unverifiable from source) or the flow is dead — WCAI even has a live callback receiver (`wrapguru-shopflow?action=callback`) waiting on it. **#1 item to verify against the live project.**
2. **`RESTYLEPRO_API_KEY` (WCAI, MEDIUM):** set by a workflow, read by nothing. Vestigial.
3. **`intake-graph-poll` "wrapcommandai" mentions (HIGH):** comments only — no HTTP call to WCAI; it shares the Azure app, not the API.
4. **AdminMarketingHub "integration" (HIGH):** `target=_blank` links, not integration.
5. **WCAI `.lovable/wrapcommand-integration-guide.md:5` claims "both applications share the same Supabase instance" (HIGH — STALE):** code shows four separate projects; the guide predates the split.
6. **WCAI `docs/WRAPCOMMAND_SYSTEM_BIBLE (1).md:202-207`** self-marks several `weprintwraps.com/pages/*` integration URLs as "❌ FAKE" — described integrations that were never built.
7. **Duplicated `brand-os.ts`:** WCAI's copy of RP's brand block is a fork, not a shared import — they drift independently.

---

## 7. True dependency graph (summary)

```
LIVE bridges
  WCAI sync-draft-to-restylepro ──► RP content-intake        (content publishing)
  RP  marketing-agent ────────────► WCAI media-bridge         (media pull, unauthenticated)
  RP  marketing-agent ────────────► WCAI ai-generate-meta-ads (ad copy pull, unauthenticated)
  WCAI command-chat ──────────────► RP wpw-calc-lead          (chat quote lead)

BROKEN / PHANTOM
  WCAI command-chat / wrapguru-shopflow / check-artwork-file ──► RP shopflow-bridge  (absent from RP source)

SHARED INFRASTRUCTURE (no code link)
  Microsoft Graph Azure app + weprintwraps.com mailboxes  (by design)
  WooCommerce store (weprintwraps.com)                    (both sync independently)
  lqxnwskrrshythrydzcs external quote/analytics DB        (both read)
  Resend / Klaviyo accounts                               (likely shared)
  Stripe                                                  (centralized in RP)
```

**Caveat:** this audit reasons from static repo evidence. Production pg_cron schedules and out-of-repo function deployments (notably `shopflow-bridge`) require verification against the live Supabase projects.
