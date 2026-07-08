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

## Deploy on Railway

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

## v1 scope & next step

v1 renders a **single-clip** reel: first scene trimmed → scaled + center-cropped
to 1080×1920 → scene text + captions + end card burned in → music with
fade-out. Multi-scene concat is the next step — build one segment per scene the
same way, concat with the ffmpeg concat demuxer, then apply captions/music (see
the comment in `renderReel()`).

## Local smoke test

```
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node index.js
# insert a reel_render_jobs row with a blueprint whose first scene has a public
# clipUrl, then: curl -XPOST localhost:8080/kick -H 'x-worker-key: ...'
```
