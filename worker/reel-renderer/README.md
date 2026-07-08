# reel-renderer — self-hosted ffmpeg reel renderer

Replaces Creatomate. Renders reels with ffmpeg (no vendor, no per-render fee)
and writes `final_render_url` back to `video_edit_queue` — the same contract the
old Creatomate `render-reel` used, so the app UI is unchanged.

## How the pieces fit

```
ReelBuilder / ai-execute-edits
   → render-reel-ffmpeg (edge fn)      enqueue reel_render_jobs, mark rendering, kick worker, bounded-wait
      → reel_render_jobs (queue)
         → THIS worker (Railway)        claim → ffmpeg render → upload mp4 to storage
            → video_edit_queue.final_render_url = <public mp4 url>
```

The edge function waits ~100s for the job to finish. Single-clip reels render
in seconds, so the render feels synchronous and ReelBuilder gets
`{ ok, final_url }` exactly like before. Longer renders return `processing`
and the worker still fills `final_render_url` when done.

## Default host: GitHub Actions (no server, no Railway)

The `render-reels` workflow (`.github/workflows/render-reels.yml`) runs this
worker in **run-once mode** (`RUN_ONCE=1`) on GitHub's ubuntu runners, which
have ffmpeg. It drains the `reel_render_jobs` queue and exits.

- **Triggers:** every 5 min (schedule), manual (`workflow_dispatch`), and
  instant (`repository_dispatch: render-reel`) when the edge function is given
  a dispatch PAT.
- **Required repo secrets:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- **Latency:** with just the schedule, a reel renders within ~5 min. For
  instant renders, set the edge-function secrets `GH_DISPATCH_TOKEN` (a
  fine-grained PAT with Actions: write on this repo) and `GH_DISPATCH_REPO`
  (`Tdill1980/WrapCommandAI-78a1c91e`) — the edge function then fires the
  workflow the moment a job is enqueued.

That's the whole host. The Railway path below is optional/alternative.

## (Optional) Deploy on Railway

1. New Railway service → **Deploy from repo subdirectory** `worker/reel-renderer`
   (it has its own Dockerfile; ffmpeg + fonts are installed in the image).
2. Set service variables:
   | var | value |
   |-----|-------|
   | `SUPABASE_URL` | `https://qxllysilzonrlyoaomce.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | service role key for that project |
   | `RENDER_WORKER_KEY` | any long random string (must match the edge secret) |
   | `RENDER_BUCKET` | `media-library` (optional; default) |
3. Deploy. Confirm `GET https://<service>.up.railway.app/health` → `{"ok":true}`.

## Wire the edge function to it

Set these secrets on the Supabase project (`qxllysilzonrlyoaomce`):

```
supabase secrets set RENDER_WORKER_URL=https://<service>.up.railway.app \
  RENDER_WORKER_KEY=<same random string> RENDER_BUCKET=media-library \
  --project-ref qxllysilzonrlyoaomce
supabase functions deploy render-reel-ffmpeg --project-ref qxllysilzonrlyoaomce
```

Then flip the app to the ffmpeg renderer:
- Frontend (ReelBuilder): set `VITE_REEL_RENDERER=ffmpeg` in the Vercel env.
- Server (ai-execute-edits): set `REEL_RENDERER=ffmpeg` as a function secret.

Leave them unset to keep using the old Creatomate `render-reel` while you test.

## What it renders

Full **multi-scene** reels:
- Each blueprint scene → trimmed, scaled + center-cropped to 1080×1920, with
  its per-scene text burned in, encoded to an identical-params segment.
- Segments concatenated with the ffmpeg concat demuxer.
- Optional end card appended as its own solid segment.
- Timeline captions (absolute reel time, spanning scenes) + background music
  with fade-out applied in a final pass.

Single-clip reels are just the N=1 case — same code path. Audio from source
clips is dropped in favor of the music track (segments are encoded `-an` so the
concat is clean).

## Local smoke test

```
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node index.js
# insert a reel_render_jobs row with a blueprint whose first scene has a public
# clipUrl, then: curl -XPOST localhost:8080/kick -H 'x-worker-key: ...'
```
