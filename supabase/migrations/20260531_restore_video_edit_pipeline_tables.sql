-- Restore the AI video-edit / reel pipeline tables that the frontend
-- (useMightyEdit, ReelBuilder, ReelVault) and 6 edge functions
-- (render-reel, mux-stitch-reel, ai-execute-edits, ai-scan-content-library,
-- ai-match-music, mightyedit-render-callback) depend on but which were
-- never applied to the WrapCommand-Production project (qxllysilzonrlyoaomce).
--
-- The original 2025-12 migrations used get_user_organization_id() in their RLS
-- policies; that function does not exist in production, which is why they
-- failed to apply. This migration recreates the full union of columns and uses
-- the production org RLS pattern (organization_members + auth.uid()), matching
-- the live content_files / content_queue policies. Idempotent.

-- 1) video_edit_queue (union of all historical columns)
CREATE TABLE IF NOT EXISTS public.video_edit_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id),
  content_file_id UUID REFERENCES public.content_files(id),
  source_url TEXT NOT NULL,
  title TEXT,
  transcript TEXT,
  duration_seconds INTEGER,
  ai_edit_suggestions JSONB NOT NULL DEFAULT '{}'::jsonb,
  selected_music_id UUID,
  selected_music_url TEXT,
  text_overlays JSONB DEFAULT '[]'::jsonb,
  speed_ramps JSONB DEFAULT '[]'::jsonb,
  chapters JSONB DEFAULT '[]'::jsonb,
  shorts_extracted JSONB DEFAULT '[]'::jsonb,
  final_render_url TEXT,
  render_status TEXT DEFAULT 'pending',
  status TEXT DEFAULT 'pending',
  debug_payload JSONB,
  producer_locked BOOLEAN NOT NULL DEFAULT false,
  producer_blueprint JSONB,
  finalized_at TIMESTAMPTZ,
  download_url TEXT,
  storage_path TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2) music_library
CREATE TABLE IF NOT EXISTS public.music_library (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id),
  title TEXT NOT NULL,
  file_url TEXT NOT NULL,
  duration_seconds INTEGER,
  bpm INTEGER,
  energy TEXT DEFAULT 'medium',
  mood TEXT DEFAULT 'neutral',
  genre TEXT,
  tags TEXT[] DEFAULT '{}',
  is_global BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3) ai_creatives (canonical creative record; links to video_edit_queue)
CREATE TABLE IF NOT EXISTS public.ai_creatives (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id),
  title TEXT,
  description TEXT,
  source_type TEXT NOT NULL CHECK (source_type IN ('mighty_task', 'content_calendar', 'noah_prompt', 'manual', 'producer_job')),
  source_id UUID,
  blueprint JSONB NOT NULL DEFAULT '{}'::jsonb,
  blueprint_id TEXT,
  latest_render_job_id UUID REFERENCES public.video_edit_queue(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'rendering', 'complete', 'failed', 'archived')),
  thumbnail_url TEXT,
  output_url TEXT,
  created_by TEXT DEFAULT 'ai' CHECK (created_by IN ('ai', 'user', 'agent')),
  created_by_agent TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 4) back-link column on video_edit_queue
ALTER TABLE public.video_edit_queue
  ADD COLUMN IF NOT EXISTS ai_creative_id UUID REFERENCES public.ai_creatives(id);

-- 5) RLS
ALTER TABLE public.video_edit_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_library    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_creatives     ENABLE ROW LEVEL SECURITY;

-- video_edit_queue policies
DROP POLICY IF EXISTS "Org members can view video edits" ON public.video_edit_queue;
CREATE POLICY "Org members can view video edits" ON public.video_edit_queue FOR SELECT
  USING ((organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())) OR (organization_id IS NULL));
DROP POLICY IF EXISTS "Org members can insert video edits" ON public.video_edit_queue;
CREATE POLICY "Org members can insert video edits" ON public.video_edit_queue FOR INSERT
  WITH CHECK ((organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())) OR (organization_id IS NULL));
DROP POLICY IF EXISTS "Org members can update video edits" ON public.video_edit_queue;
CREATE POLICY "Org members can update video edits" ON public.video_edit_queue FOR UPDATE
  USING ((organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())) OR (organization_id IS NULL));
DROP POLICY IF EXISTS "Org members can delete video edits" ON public.video_edit_queue;
CREATE POLICY "Org members can delete video edits" ON public.video_edit_queue FOR DELETE
  USING ((organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())) OR (organization_id IS NULL));

-- ai_creatives policies
DROP POLICY IF EXISTS "Org members can view ai creatives" ON public.ai_creatives;
CREATE POLICY "Org members can view ai creatives" ON public.ai_creatives FOR SELECT
  USING ((organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())) OR (organization_id IS NULL));
DROP POLICY IF EXISTS "Org members can insert ai creatives" ON public.ai_creatives;
CREATE POLICY "Org members can insert ai creatives" ON public.ai_creatives FOR INSERT
  WITH CHECK ((organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())) OR (organization_id IS NULL));
DROP POLICY IF EXISTS "Org members can update ai creatives" ON public.ai_creatives;
CREATE POLICY "Org members can update ai creatives" ON public.ai_creatives FOR UPDATE
  USING ((organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())) OR (organization_id IS NULL));
DROP POLICY IF EXISTS "Org members can delete ai creatives" ON public.ai_creatives;
CREATE POLICY "Org members can delete ai creatives" ON public.ai_creatives FOR DELETE
  USING ((organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())) OR (organization_id IS NULL));

-- music_library policies (readable globally when is_global)
DROP POLICY IF EXISTS "Org members can view music" ON public.music_library;
CREATE POLICY "Org members can view music" ON public.music_library FOR SELECT
  USING ((organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())) OR is_global = true OR (organization_id IS NULL));
DROP POLICY IF EXISTS "Org members can insert music" ON public.music_library;
CREATE POLICY "Org members can insert music" ON public.music_library FOR INSERT
  WITH CHECK ((organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())) OR (organization_id IS NULL));
DROP POLICY IF EXISTS "Org members can update music" ON public.music_library;
CREATE POLICY "Org members can update music" ON public.music_library FOR UPDATE
  USING ((organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())) OR (organization_id IS NULL));
DROP POLICY IF EXISTS "Org members can delete music" ON public.music_library;
CREATE POLICY "Org members can delete music" ON public.music_library FOR DELETE
  USING ((organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())) OR (organization_id IS NULL));

-- 6) updated_at triggers
DROP TRIGGER IF EXISTS update_video_edit_queue_updated_at ON public.video_edit_queue;
CREATE TRIGGER update_video_edit_queue_updated_at BEFORE UPDATE ON public.video_edit_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_ai_creatives_updated_at ON public.ai_creatives;
CREATE TRIGGER update_ai_creatives_updated_at BEFORE UPDATE ON public.ai_creatives
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7) indexes
CREATE INDEX IF NOT EXISTS idx_video_edit_queue_org ON public.video_edit_queue(organization_id);
CREATE INDEX IF NOT EXISTS idx_video_edit_queue_status ON public.video_edit_queue(status);
CREATE INDEX IF NOT EXISTS idx_video_edit_queue_creative ON public.video_edit_queue(ai_creative_id);
CREATE INDEX IF NOT EXISTS idx_music_library_mood ON public.music_library(mood, energy);
CREATE INDEX IF NOT EXISTS idx_ai_creatives_source_type ON public.ai_creatives(source_type);
CREATE INDEX IF NOT EXISTS idx_ai_creatives_status ON public.ai_creatives(status);
CREATE INDEX IF NOT EXISTS idx_ai_creatives_created_at ON public.ai_creatives(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_creatives_organization_id ON public.ai_creatives(organization_id);
