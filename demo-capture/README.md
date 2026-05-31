# Demo Capture (Playwright)

High-resolution, deterministic screen recorder for AI-produced SaaS demo videos.
Records the **real** app and logs **click coordinates** so the renderer can
auto-zoom to the action — fixing the "wide UI / tiny text" problem at the source.

## Why this (not Loom / Google Vids)
- **Scriptable & repeatable** — same flawless demo every run.
- **Crisp** — captures at 1920×1080 @2× device scale; survives a 2× zoom and stays sharp.
- **Free auto-zoom** — every click's `(x, y)` is logged → no computer-vision guessing.
- **Runs in CI** — GitHub Actions, no always-on server to pay for.

## One-time setup
Add these **GitHub repo secrets** (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `DEMO_BASE_URL` | e.g. `https://app.restylepro.ai` |
| `DEMO_USERNAME` | a **test/demo** account (never a real admin) |
| `DEMO_PASSWORD` | … |
| `SUPABASE_URL` | `https://qxllysilzonrlyoaomce.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | service role (for storage upload) |

## Workflow
1. **Discover** the page (maps real selectors):
   Actions → *Demo Capture* → Run → `mode: discover`.
   Produces `discovery/*-elements.json` + a screenshot in the `media-library` bucket.
2. **Author** a recipe under `recipes/<name>.json` using those real selectors
   (replace every `TODO:`). Prefer `[data-testid]`; if the app has few, adding a
   handful makes scripts durable across UI changes.
3. **Record**:
   Actions → *Demo Capture* → Run → `recipe: <name>`, `mode: record`.
   Produces in `media-library/demos/<name>/`:
   - `<timestamp>.webm` — the recording
   - `<timestamp>.zoom.json` — the auto-zoom keyframe track

## Auto-zoom track format
```jsonc
{
  "viewport": { "width": 1920, "height": 1080 },
  "keyframes": [
    { "t": 5230, "x": 960, "y": 540, "w": 220, "h": 48, "zoom": 1.7, "scene": "generate", "label": "click" }
  ]
}
```
`t` = ms into the recording. The renderer interpolates scale+position between
keyframes (Creatomate), easing in/out and holding on clicks.

## Pipeline position
```
recorder.ts  → webm + zoom track  → (convert to mp4)  → Creatomate composite
                                                          + HeyGen avatar bubble
                                                          + captions  → final demo
```
> The capture is `.webm`; convert to `.mp4` (ffmpeg or Mux) before Creatomate.

## Local run (optional)
```bash
cd demo-capture
npm install && npx playwright install chromium
DEMO_BASE_URL=... DEMO_USERNAME=... DEMO_PASSWORD=... \
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
RECIPE=restyle-color-change npm run record
```
