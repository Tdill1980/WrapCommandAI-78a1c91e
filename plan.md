# Plan: Remove Lovable Dependency + Direct Google Gemini API

## Context

**56 edge functions** call `ai.gateway.lovable.dev` (Lovable's proxy to Google Gemini). There is **no shared helper** — every function has inline fetch calls. The goal is to:

1. Cut out Lovable entirely — call Google Gemini API directly
2. Wire DesignPanelPro (Standard + Enterprise) to the same direct Gemini setup
3. Create a shared helper so future API changes are a one-line fix

## Current Architecture (What We're Replacing)

```
Edge Function → ai.gateway.lovable.dev → Google Gemini
                (LOVABLE_API_KEY)
```

**Models in use:**
- `google/gemini-3-pro-image-preview` — 8 functions (image gen)
- `google/gemini-2.5-flash-image-preview` — 1 function (image gen)
- `google/gemini-2.5-flash` — 47 functions (text only)

**Lovable touchpoints:**
- `ai.gateway.lovable.dev` endpoint (56 edge functions, 65 fetch calls)
- `lovable-tagger` npm package (dev dependency in package.json)
- `lovable3DRenders` Supabase client pointing to Lovable project `wzwqhfbmymrengjqikjl`
- `contentDB` alias for `lovable3DRenders`
- `.env` vars: `VITE_LOVABLE_FUNCTIONS_URL`, `VITE_LOVABLE_ANON_KEY`

## Target Architecture

```
Edge Function → shared gemini-client.ts → Google Generative AI API directly
                                           (GOOGLE_AI_API_KEY)
```

Endpoint: `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`
(Google's OpenAI-compatible endpoint — same request format, zero logic changes needed)

---

## Step 1: Create shared Gemini client helper

**File:** `supabase/functions/_shared/gemini-client.ts`

Single helper that all 56 functions import:

```typescript
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

export async function callGemini(params: {
  model: string;
  messages: Array<{ role: string; content: any }>;
  max_tokens?: number;
  temperature?: number;
  modalities?: string[];
}) {
  const apiKey = Deno.env.get("GOOGLE_AI_API_KEY");
  if (!apiKey) throw new Error("GOOGLE_AI_API_KEY not set");

  const body: Record<string, any> = {
    model: params.model,
    messages: params.messages,
    max_tokens: params.max_tokens || 4096,
    temperature: params.temperature ?? 0.7,
  };
  if (params.modalities) body.modalities = params.modalities;

  const response = await fetch(GEMINI_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${text}`);
  }

  return response.json();
}
```

## Step 2: Update all 56 edge functions

Replace every inline `fetch("https://ai.gateway.lovable.dev/v1/chat/completions", ...)` with `callGemini(...)` import.

### Image generation functions (9 functions, 12 calls):
- `generate-3d/index.ts` (line 131)
- `generate-3dproof/index.ts` (line 76)
- `generate-color-render/index.ts` (line 113)
- `generate-master/index.ts` (line 176)
- `generate-panel/index.ts` (line 44)
- `generate-studio-renders/index.ts` (lines 160, 288)
- `apply-render-branding/index.ts` (line 93)
- `agent-chat/index.ts` (line 1015 image, lines 618/1271 text)
- `ai-generate-static/index.ts` (lines 141, 228)

### Text-only functions (47 functions, 53 calls):
- `admin-jordan-chat`, `affiliate-support-chat`, `ai-analyze-video-frame`, `ai-atomize-content`, `ai-audio-beats`, `ai-auto-create-reel` (3 calls), `ai-auto-tag`, `ai-boost-copy`, `ai-bulk-variations`, `ai-generate-ad`, `ai-generate-captions`, `ai-generate-carousel-topic`, `ai-generate-from-inspiration`, `ai-generate-meta-ads`, `ai-generate-micro-content`, `ai-generate-video-ad`, `ai-generate-video-blueprint`, `ai-generate-winback-email`, `ai-match-music`, `ai-repurpose-content`, `ai-scan-content-library`, `ai-tag-video`, `ai-video-process` (3 calls), `ai-weekly-plan`, `analyze-brand-voice`, `analyze-brand-voice-enhanced`, `analyze-inspo-image`, `analyze-inspo-video`, `analyze-vinyl-swatch`, `content-analysis`, `extract-vin-ocr`, `generate-email-flow`, `generate-social-content`, `generate-text-overlay`, `hybrid-generate-content`, `ingest-message`, `luigi-ordering-concierge`, `parse-voice-quote`, `process-phone-speech`, `revenue-health-monitor`, `transcribe-audio`, `video-transcribe`, `yt-enhance-longform`, `yt-generate-shorts`, `yt-scene-detect`

## Step 3: Wire DesignPanelPro to direct Gemini

**DesignPanelPro Standard** (`src/modules/designproai/pages/DesignPanelPro.tsx`):
- Currently calls `lovable3DRenders.functions.invoke('generate-color-render')`
- Change to call via `production-client.ts` → `callEdgeFunction('generate-color-render', ...)`
- The edge function itself gets updated in Step 2

**DesignPanelPro Enterprise** (`src/modules/designpanelpro-enterprise/`):
- `api.ts` line 28: `lovable3DRenders.functions.invoke('generate-master')` → `callEdgeFunction('generate-master')`
- `api.ts` line 37: `lovable3DRenders.functions.invoke('generate-3d')` → `callEdgeFunction('generate-3d')`
- `api.ts` line 46: `lovable3DRenders.functions.invoke('convert-print')` → `callEdgeFunction('convert-print')`

All edge functions now run on YOUR Supabase with `GOOGLE_AI_API_KEY`.

## Step 4: Remove Lovable Supabase client

**File:** `src/integrations/supabase/client.ts`
- Remove `lovable3DRenders` client (was pointing to `wzwqhfbmymrengjqikjl`)
- Remove `contentDB` alias
- Any component using `lovable3DRenders` or `contentDB` → switch to `supabase` (your main client)

**File:** `.env`
- Remove `VITE_LOVABLE_FUNCTIONS_URL`
- Remove `VITE_LOVABLE_ANON_KEY`

## Step 5: Remove lovable-tagger

**File:** `package.json` line 91
- Remove `"lovable-tagger": "^1.1.11"`

**File:** `vite.config.ts` lines 4, 16
- Remove `import { componentTagger } from "lovable-tagger"`
- Remove `mode === "development" && componentTagger()`

## Step 6: Add GOOGLE_AI_API_KEY to Supabase secrets

In Supabase Dashboard → Project Settings → Edge Function Secrets:
- Add `GOOGLE_AI_API_KEY` = your Google AI Studio key
- (Optional) Remove `LOVABLE_API_KEY` after confirming everything works

## Step 7: Update health check

**File:** `supabase/functions/chat-health-check/index.ts`
- Add `GOOGLE_AI_API_KEY` check (replacing or alongside OPENAI check)

## Step 8: Redeploy all edge functions

```bash
supabase functions deploy --all
```

---

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Google API format mismatch | Google's `/v1beta/openai/` endpoint is OpenAI-compatible — same request/response format |
| Breaking 56 functions at once | Shared helper means one fix applies everywhere; can test with one function first |
| Content data on Lovable Supabase | Content tables (content_files, content_projects) need migration or dual-read during transition |
| DesignPanelPro breaking | Both versions already use Gemini — only the routing path changes |

## Execution Order

1. Create `_shared/gemini-client.ts` helper
2. Update DesignPanelPro frontend routing (Steps 3+4)
3. Update all 56 edge functions to use helper (Step 2)
4. Remove lovable-tagger (Step 5)
5. Clean up .env (Step 4)
6. User adds `GOOGLE_AI_API_KEY` in Supabase dashboard (Step 6)
7. Deploy all functions (Step 8)
8. Test DesignPanelPro Standard + Enterprise
9. Test ApproveFlow render pipeline
10. Remove `LOVABLE_API_KEY` from secrets once confirmed
