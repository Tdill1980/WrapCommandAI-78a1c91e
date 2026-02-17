-- =============================================================================
-- Migration: Create content tables on YOUR Supabase (qxllysilzonrlyoaomce)
-- These tables previously lived on Lovable Supabase. Now consolidated here.
-- =============================================================================

-- 1. content_files — Media library, AI tags, vehicle info
CREATE TABLE IF NOT EXISTS public.content_files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id),
  uploader_id UUID,
  source TEXT NOT NULL DEFAULT 'upload',
  source_id TEXT,
  brand TEXT NOT NULL DEFAULT 'wpw',
  file_type TEXT NOT NULL DEFAULT 'image',
  file_url TEXT NOT NULL,
  thumbnail_url TEXT,
  original_filename TEXT,
  file_size_bytes BIGINT,
  duration_seconds NUMERIC,
  width INTEGER,
  height INTEGER,
  tags TEXT[],
  ai_labels JSONB,
  visual_tags JSONB,
  visual_analyzed_at TIMESTAMPTZ,
  thumbnail_generated_at TIMESTAMPTZ,
  transcript TEXT,
  dominant_colors TEXT[],
  vehicle_info JSONB,
  content_category TEXT,
  processing_status TEXT DEFAULT 'ready',
  metadata JSONB,
  mux_asset_id TEXT,
  mux_playback_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.content_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view content files"
  ON public.content_files FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
    OR organization_id IS NULL
  );

CREATE POLICY "Org members can insert content files"
  ON public.content_files FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
    OR organization_id IS NULL
  );

CREATE POLICY "Org members can update content files"
  ON public.content_files FOR UPDATE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
    OR organization_id IS NULL
  );

CREATE POLICY "Org members can delete content files"
  ON public.content_files FOR DELETE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
    OR organization_id IS NULL
  );

-- Indexes for content_files
CREATE INDEX IF NOT EXISTS idx_content_files_org ON public.content_files(organization_id);
CREATE INDEX IF NOT EXISTS idx_content_files_source ON public.content_files(source);
CREATE INDEX IF NOT EXISTS idx_content_files_tags ON public.content_files USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_content_files_ai_labels ON public.content_files USING gin(ai_labels);
CREATE INDEX IF NOT EXISTS idx_content_files_visual_tags ON public.content_files USING gin(visual_tags);
CREATE INDEX IF NOT EXISTS idx_content_files_created ON public.content_files(created_at DESC);


-- 2. content_queue — Content processing pipeline
CREATE TABLE IF NOT EXISTS public.content_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id),
  created_by UUID,
  content_type TEXT,
  mode TEXT,
  title TEXT,
  ai_prompt TEXT,
  script TEXT,
  caption TEXT,
  hashtags TEXT[],
  cta_text TEXT,
  media_urls TEXT[],
  references_urls TEXT[],
  output_url TEXT,
  scheduled_for TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  status TEXT DEFAULT 'draft',
  brand TEXT,
  channel TEXT,
  content_purpose TEXT,
  ad_placement TEXT,
  platform TEXT,
  review_notes TEXT,
  reviewed_by UUID,
  ai_metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.content_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view content queue"
  ON public.content_queue FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
    OR organization_id IS NULL
  );

CREATE POLICY "Org members can insert content queue"
  ON public.content_queue FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
    OR organization_id IS NULL
  );

CREATE POLICY "Org members can update content queue"
  ON public.content_queue FOR UPDATE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
    OR organization_id IS NULL
  );

CREATE POLICY "Org members can delete content queue"
  ON public.content_queue FOR DELETE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
    OR organization_id IS NULL
  );

CREATE INDEX IF NOT EXISTS idx_content_queue_org ON public.content_queue(organization_id);
CREATE INDEX IF NOT EXISTS idx_content_queue_status ON public.content_queue(status);
CREATE INDEX IF NOT EXISTS idx_content_queue_created ON public.content_queue(created_at DESC);


-- 3. content_calendar — Scheduled content across channels
CREATE TABLE IF NOT EXISTS public.content_calendar (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id),
  title TEXT,
  brand TEXT NOT NULL DEFAULT 'wpw',
  content_type TEXT NOT NULL DEFAULT 'reel',
  platform TEXT NOT NULL DEFAULT 'instagram',
  scheduled_date TEXT NOT NULL,
  scheduled_time TEXT NOT NULL DEFAULT '09:00',
  status TEXT DEFAULT 'planned',
  caption TEXT,
  directive TEXT,
  notes TEXT,
  hashtags TEXT[],
  google_doc_url TEXT,
  post_url TEXT,
  posted_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  in_progress_at TIMESTAMPTZ,
  engagement_stats JSONB,
  content_project_id UUID,
  intent_preset_id TEXT,
  locked_metadata JSONB,
  migrated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.content_calendar ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view content calendar"
  ON public.content_calendar FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
    OR organization_id IS NULL
  );

CREATE POLICY "Org members can insert content calendar"
  ON public.content_calendar FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
    OR organization_id IS NULL
  );

CREATE POLICY "Org members can update content calendar"
  ON public.content_calendar FOR UPDATE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
    OR organization_id IS NULL
  );

CREATE POLICY "Org members can delete content calendar"
  ON public.content_calendar FOR DELETE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
    OR organization_id IS NULL
  );

CREATE INDEX IF NOT EXISTS idx_content_calendar_org ON public.content_calendar(organization_id);
CREATE INDEX IF NOT EXISTS idx_content_calendar_date ON public.content_calendar(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_content_calendar_brand ON public.content_calendar(brand);


-- 4. content_drafts — Draft approval flow
CREATE TABLE IF NOT EXISTS public.content_drafts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id),
  content_type TEXT NOT NULL DEFAULT 'reel',
  platform TEXT NOT NULL DEFAULT 'instagram',
  status TEXT NOT NULL DEFAULT 'pending_review',
  caption TEXT,
  media_url TEXT,
  thumbnail_url TEXT,
  hashtags TEXT[],
  created_by UUID,
  created_by_agent TEXT,
  task_id UUID REFERENCES public.tasks(id),
  scheduled_for TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  published_url TEXT,
  platform_post_id TEXT,
  publish_error TEXT,
  rejection_reason TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.content_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view content drafts"
  ON public.content_drafts FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
    OR organization_id IS NULL
  );

CREATE POLICY "Org members can insert content drafts"
  ON public.content_drafts FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
    OR organization_id IS NULL
  );

CREATE POLICY "Org members can update content drafts"
  ON public.content_drafts FOR UPDATE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
    OR organization_id IS NULL
  );

CREATE POLICY "Org members can delete content drafts"
  ON public.content_drafts FOR DELETE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
    OR organization_id IS NULL
  );

CREATE INDEX IF NOT EXISTS idx_content_drafts_org ON public.content_drafts(organization_id);
CREATE INDEX IF NOT EXISTS idx_content_drafts_status ON public.content_drafts(status);
CREATE INDEX IF NOT EXISTS idx_content_drafts_task ON public.content_drafts(task_id);


-- 5. content_projects — Project grouping
CREATE TABLE IF NOT EXISTS public.content_projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id),
  created_by UUID,
  brand TEXT NOT NULL DEFAULT 'wpw',
  project_type TEXT NOT NULL DEFAULT 'campaign',
  goal TEXT,
  platform TEXT,
  status TEXT DEFAULT 'draft',
  ai_brief TEXT,
  ai_output JSONB,
  canva_export_json JSONB,
  content_file_ids TEXT[],
  scheduled_for TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  published_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.content_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view content projects"
  ON public.content_projects FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
    OR organization_id IS NULL
  );

CREATE POLICY "Org members can insert content projects"
  ON public.content_projects FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
    OR organization_id IS NULL
  );

CREATE POLICY "Org members can update content projects"
  ON public.content_projects FOR UPDATE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
    OR organization_id IS NULL
  );

CREATE POLICY "Org members can delete content projects"
  ON public.content_projects FOR DELETE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
    OR organization_id IS NULL
  );

CREATE INDEX IF NOT EXISTS idx_content_projects_org ON public.content_projects(organization_id);
CREATE INDEX IF NOT EXISTS idx_content_projects_status ON public.content_projects(status);


-- 6. Pipeline trigger: auto-create draft when content_queue item completes
CREATE OR REPLACE FUNCTION public.create_draft_from_completed_content()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    INSERT INTO public.content_drafts (
      organization_id, content_type, platform, status, caption, media_url, created_by_agent
    ) VALUES (
      NEW.organization_id,
      COALESCE(NEW.content_type, 'reel'),
      COALESCE(NEW.platform, 'instagram'),
      'pending_review',
      NEW.caption,
      NEW.output_url,
      'content_engine'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_content_completed') THEN
    CREATE TRIGGER on_content_completed
      AFTER UPDATE ON public.content_queue FOR EACH ROW
      EXECUTE FUNCTION public.create_draft_from_completed_content();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_content_insert_completed') THEN
    CREATE TRIGGER on_content_insert_completed
      AFTER INSERT ON public.content_queue FOR EACH ROW
      WHEN (NEW.status = 'completed')
      EXECUTE FUNCTION public.create_draft_from_completed_content();
  END IF;
END $$;


-- 7. Create media-library storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('media-library', 'media-library', true)
ON CONFLICT (id) DO NOTHING;
