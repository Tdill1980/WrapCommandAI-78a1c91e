-- ============================================================================
-- reel_render_jobs — queue for the self-hosted ffmpeg reel renderer.
--
-- Replaces the Creatomate dependency. The render-reel-ffmpeg edge function
-- enqueues a job here; the Railway ffmpeg worker (worker/reel-renderer)
-- claims it, renders with ffmpeg, uploads the mp4 to storage, and writes
-- final_render_url back to video_edit_queue (same contract render-reel used).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.reel_render_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The video_edit_queue row id (passed as job_id by ReelBuilder/ai-execute-edits)
  edit_queue_id text,
  creative_id   text,
  blueprint     jsonb NOT NULL,
  music_url     text,
  captions      jsonb NOT NULL DEFAULT '[]'::jsonb,
  bucket        text NOT NULL DEFAULT 'media-library',
  -- queued → rendering → complete | failed
  status        text NOT NULL DEFAULT 'queued',
  final_url     text,
  thumbnail_url text,
  error         text,
  attempts      int  NOT NULL DEFAULT 0,
  -- worker heartbeat, so a crashed render can be reclaimed
  claimed_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reel_render_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on reel_render_jobs" ON public.reel_render_jobs;
CREATE POLICY "Service role full access on reel_render_jobs"
  ON public.reel_render_jobs FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_reel_render_jobs_status_created
  ON public.reel_render_jobs (status, created_at);
