-- HeyGen avatar-render job tracking.
-- One row per avatar clip we ask HeyGen to render (typically one per demo scene).
-- heygen-generate-avatar inserts rows; heygen-render-callback updates them when
-- HeyGen's webhook fires. The finished video_url is later composited (corner
-- talking-head bubble / full-screen) over the Playwright screen capture in Creatomate.

CREATE TABLE IF NOT EXISTS public.heygen_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  ai_creative_id uuid REFERENCES public.ai_creatives(id) ON DELETE SET NULL,
  scene_ref text,                       -- which storyboard scene this narration belongs to
  avatar_id text NOT NULL,              -- the user's OWN HeyGen avatar id
  voice_id text,                        -- the user's OWN HeyGen voice-clone id
  input_text text NOT NULL,             -- the approved narration script for this scene
  heygen_video_id text,                 -- HeyGen's video id (returned on create)
  status text NOT NULL DEFAULT 'pending', -- pending|processing|completed|failed
  video_url text,
  thumbnail_url text,
  duration_seconds numeric,
  error text,
  request_payload jsonb,                -- what we sent HeyGen (for debugging)
  callback_payload jsonb,               -- the raw webhook HeyGen sent back
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS heygen_jobs_org_idx ON public.heygen_jobs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS heygen_jobs_video_idx ON public.heygen_jobs(heygen_video_id);
CREATE INDEX IF NOT EXISTS heygen_jobs_status_idx ON public.heygen_jobs(status);

DROP TRIGGER IF EXISTS trg_heygen_jobs_updated_at ON public.heygen_jobs;
CREATE TRIGGER trg_heygen_jobs_updated_at BEFORE UPDATE ON public.heygen_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.heygen_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "heygen_jobs_member_select" ON public.heygen_jobs;
CREATE POLICY "heygen_jobs_member_select" ON public.heygen_jobs FOR SELECT
  USING ((organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())) OR organization_id IS NULL);
DROP POLICY IF EXISTS "heygen_jobs_member_insert" ON public.heygen_jobs;
CREATE POLICY "heygen_jobs_member_insert" ON public.heygen_jobs FOR INSERT
  WITH CHECK ((organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())) OR organization_id IS NULL);
DROP POLICY IF EXISTS "heygen_jobs_member_update" ON public.heygen_jobs;
CREATE POLICY "heygen_jobs_member_update" ON public.heygen_jobs FOR UPDATE
  USING ((organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())) OR organization_id IS NULL);
