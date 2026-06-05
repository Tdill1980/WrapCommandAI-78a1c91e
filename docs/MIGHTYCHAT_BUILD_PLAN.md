# MightyChat 2.0 — Build Plan

**WePrintWraps AI chat + email, built in WrapCommandAI.**
Replaces the dead MightyChat console and the Gemini `agent-chat` mega-agent.

> Goal: a chat+email AI for **weprintwraps.com** that boosts sales, lifts customer
> satisfaction, and pitches **RestyleProAI** — that **actually answers**, grounded in real
> data, with your team in the loop. Built on the latest Claude stack and 2026 support-copilot
> best practices.

---

## 0. Why the old one failed (so we don't repeat it)

- The console (`/mightychat`, 30+ components) was wired to `agent-chat` — a **1,708-line Gemini
  mega-agent** with a 6K-token prompt doing everything. Stale, wrong, incomplete.
- Over-scoped into reels / Instagram / phone / ops **and** chat — customer chat got buried.
- Mixed Lovable + main Supabase backends; replies landed in different places.
- It's currently **disabled** (`/mightychat` → redirects to `/website-admin`).

**Lesson (matches 2026 production guidance): one over-built agent doing everything fails.
Build small, grounded, observable surfaces on a brain that works.**

---

## 1. Architecture — one brain, three surfaces

```
                 ┌──────────────── SHARED WPW CORE ─────────────────┐
                 │  Knowledge base (RAG-grounded, audit trail)       │
                 │  Pricing engine (single source) + vehicle sq-ft   │
                 │  Product catalog incl. RestyleProAI pitch         │
                 │  Tools: quote · pricing · vehicle · order/status  │
                 │         · approveflow · escalate · knowledge      │
                 │  Cached as a frozen prompt prefix (prompt caching)│
                 └───────┬───────────────┬───────────────┬──────────┘
                         │               │               │
              ┌──────────▼─────┐ ┌───────▼────────┐ ┌────▼─────────────┐
              │ WEBSITE CHAT   │ │ EMAIL RESPONDER│ │ MIGHTYCHAT       │
              │ (sync,         │ │ (async, FULLY  │ │ COPILOT CONSOLE  │
              │  streamed)     │ │  human-approve)│ │ (suggest+compose │
              │                │ │                │ │  +send, tagged)  │
              └────────────────┘ └────────────────┘ └──────────────────┘
```

The **copilot console** is the human-in-the-loop surface for both channels: AI drafts a reply +
multiple-choice suggestions, you click-to-send / edit / defer, AI can send on your behalf.

---

## 2. The tech (latest Claude stack)

| Capability | Use | Why |
|---|---|---|
| **Structured outputs** (`output_config.format`, strict JSON) | classify/extract + the reply envelope `{reply, quick_replies, confidence, needs_human, suggested_replies}` | guaranteed-valid, complete fields — kills "incomplete info"; gives audit logs |
| **Strict tool use** (`strict:true`) | pricing + quote tools | model can't quote from memory — one pricing source |
| **Prompt caching** | freeze the shared core (KB + pricing + catalog + rules) as a cached prefix | **biggest latency + cost win**, esp. for live chat; consistent grounding every turn |
| **Streaming** | website chat replies | reply types out instantly → fewer drop-offs |
| **Model tiering** | Haiku 4.5 classify · Sonnet 4.6 chat draft · Opus 4.8 email draft | right model per step; keep one model per live session (model switch invalidates cache) |
| **Adaptive thinking** | email + hard cases | better reasoning, no fixed budget; keep low/off on chat for speed |

**Models:** `claude-haiku-4-5` (classify/extract), `claude-sonnet-4-6` (synchronous chat — speed),
`claude-opus-4-8` (async email drafts + suggested replies — quality). All current as of 2026-05.

---

## 3. Per-message flow (both channels)

```
Inbound (chat msg OR email)
  1. CLASSIFY + EXTRACT   ← Haiku 4.5, strict JSON
       → { intent, customer, vehicle, urgency, channel }
         intent ∈ question | quote_request | status | approveflow | revision
                  | bulk_order | unhappy | urgent | spam
  2. ROUTE (code, deterministic — not the LLM)
       question/status/approveflow → grounded answer
       quote_request              → QuickQuote tool
       bulk_order/unhappy/urgent  → escalate (email + text)
  3. DRAFT  ← Sonnet 4.6 (chat) / Opus 4.8 (email), grounded ONLY in retrieved KB
       + computed quote; returns { reply, quick_replies[], confidence,
         needs_human, suggested_replies[] }
  4. GATE
       email → ALWAYS human-approve (your call)
       chat  → auto-answer info instantly; quotes + escalations → copilot console
  5. CONSOLE — every conversation tagged; team sees AI draft + multiple-choice
       suggestions + compose box; click-to-send / edit / "we'll get back"
```

---

## 4. The MightyChat copilot console (human-in-the-loop)

The 2026 agent-assist pattern: **AI suggests, human approves, AI can send.** McKinsey's 2026
contact-center benchmark puts a working copilot at **~28% lower handle time, ~19% higher
first-contact resolution.**

Per conversation, the console shows:
- The customer thread (chat + email unified) with context summary in your voice.
- **AI's recommended reply** + **2-3 multiple-choice alternatives** + a **compose box** to type your own.
- One-tap actions: **Send** (AI's pick or your edit) · **Refine** (AI rewrites) · **We'll get back** (defer + tag).
- AI can **auto-send** routine, high-confidence replies (per channel mode); everything is **tagged**
  so you/Jackson/Lance/Troy can read and take over.
- **Identity rule:** always speaks as **us (the WPW team)** — never "I'm an AI." If a customer asks
  for a manager, it **answers as us** and flags a human.

Reuse: `ai_actions` (review queue), `conversations`/`messages`, `ConversationActionsBar` escalation
inserts. **Drop** the 30-component sprawl + the Gemini agent.

---

## 5. Capabilities (your requirements, mapped)

| Requirement | How |
|---|---|
| Answer questions | KB-grounded RAG, `cmd_knowledge`; no hallucinated facts |
| Live job status | `cmd_job_status` → WooCommerce + ShopFlow stage + tracking |
| ApprovePro triggers | `cmd_approveflow` → proof status, resend proof link, trigger reminder |
| Quotes in chat **and** email | **one QuickQuote tool** (`submit-quote`): same email, same Jackson/bulk routing, same `ai_actions` review record |
| Quote review → go live | review-mode flag on the quote tool: hold email → dashboard approve → send; flip to auto-send when proven |
| Email **and** text escalation | urgent · bulk orders · unhappy → Resend email + Twilio SMS to the right person |
| Upsell + pitch RestyleProAI | grounded upsell every turn (order link · volume nudge · free-ship threshold · add-on · "design it in RestyleProAI") |
| Multiple-choice to us + compose box | the copilot console (§4) |
| Speak as us / manager rule | identity guardrail (§4) |

**Upsell impact (2026 ecommerce data):** personalized in-chat offers lift AOV ~15%; 10-30% of
ecommerce revenue comes from upsell/cross-sell. Frictionless, in-conversation, grounded in real
catalog — never invented.

---

## 6. Guardrails & grounding (anti-hallucination)

- **RAG grounding with audit trail** — every factual answer cites a KB source; pricing always from
  the engine, never the prompt.
- **Strict schemas** on classify + quote tools → structured, loggable, compliant.
- **Fail-closed** — unknown vehicle/price → `needs_review`, never a guessed number.
- **Escalation with context** — hand-offs carry the full summary so the human isn't cold.

---

## 7. Observability & evals (LLMOps)

- **Trace every turn**: inputs, tool calls, model, tokens, latency, confidence, send/defer outcome.
- **Eval harness** before go-live: a labeled set of real WPW chats/emails scored on intent accuracy,
  pricing correctness, escalation correctness, and answer groundedness. Gate "go live" on passing it.
- **Dashboards**: deflection rate, human-approval rate, AHT, quote conversion, upsell take-rate.

---

## 8. Codebase: keep / kill

**Keep (works):** `conversations`/`messages`/`ai_actions` tables · QuickQuote (`submit-quote`) ·
ApproveFlow stack · ShopFlow (`sync-wc-shopflow`) · Twilio + Resend · `AIApprovalsCard`/`QuoteDrafts`
review UI · Microsoft Graph email.

**Kill / replace:** Gemini `agent-chat` mega-agent · the 30-component MightyChat sprawl ·
Lovable-backend mixing · pricing hardcoded in prompts · regex name/email extraction.

---

## 9. Data model additions

- `quotes`: `review_mode` (bool), `approved_by` (uuid), `approved_at` (ts), `is_live` (bool).
- `conversations`: `assigned_to`, `ai_status` (auto_sent | suggested | deferred | human), `tags[]`.
- `mightychat_suggestions`: per-message AI draft + alternatives + chosen action (audit).

---

## 10. Phased rollout

| Phase | Deliverable | Risk |
|---|---|---|
| **0** | Shared knowledge core (KB + pricing + vehicle + catalog + RestyleProAI) + eval harness | low |
| **1** | Email responder (async, **fully human-approved**) on the core | low — async, gated |
| **2** | MightyChat copilot console (suggest + compose + send, tagged inbox, identity rule) | med |
| **3** | Website chat v2 — streamline `command-chat` onto the core (streaming, quick replies, `cmd_job_status`, `cmd_approveflow`) | med — live surface |
| **4** | QuickQuote unification + review-mode→live flip · escalation (email+text) · upsell/RestyleProAI | med |
| **5** | Observability + evals green → flip chat quotes to live | — |

Start at Phase 0; each phase ships independently and is reversible.

---

## Sources (research)
- Fini Labs — agent-assist / human-in-the-loop (2026): https://www.usefini.com/guides/best-ai-agent-assist-tools-human-in-the-loop-customer-support
- Assembled — AI copilots for support (2026): https://www.assembled.com/blog/ai-copilots-customer-support
- IrisAgent — RAG / grounding for LLM support: https://irisagent.com/llm-customer-support/
- Confident AI — LLM agent evaluation (2026): https://www.confident-ai.com/blog/llm-agent-evaluation-complete-guide
- Andrii Furmanets — AI agents: tools, memory, evals, guardrails (2026): https://andriifurmanets.com/blogs/ai-agents-2026-practical-architecture-tools-memory-evals-guardrails
- Zendesk — AI chatbots for sales (2026): https://www.zendesk.com/service/messaging/ai-chatbot-for-sales/
- Quidget — chatbot upsell/cross-sell techniques: https://quidget.ai/blog/ai-automation/7-chatbot-techniques-for-upselling-and-cross-selling/
</content>
