-- Restore the render PERSISTENCE layer that render-reel and
-- mightyedit-render-callback depend on but which was never applied to the
-- WrapCommand-Production project (qxllysilzonrlyoaomce).
--
-- Root cause of "rendering never worked" (independent of any API key):
--   1. video_edit_queue.error_message was referenced by render-reel on every
--      render but the column never existed in ANY migration -> the success-path
--      .update().select() returned a "column not found" error, so final_render_url
--      was never persisted and a *successful* Creatomate render reported failure.
--   2. creative_vault / content_jobs / execution_receipts / creative_tags /
--      creative_tag_map did not exist in prod -> mightyedit-render-callback
--      crashed on its first insert and render-reel's status tagging silently failed.
--
-- The original 2025-12 migrations gated RLS on is_member_of_organization(), which
-- does not exist in production; that is why they never applied. This migration
-- reproduces the original column/table shapes but uses the live organization_members
-- RLS pattern (matching content_files / video_edit_queue). Fully idempotent.

-- ============================================================
-- 1) Missing columns on video_edit_queue
-- ============================================================
ALTER TABLE public.video_edit_queue
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS content_jobs_id UUID;

-- ============================================================
-- 2) content_jobs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.content_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  conversation_id uuid NULL,
  requested_by text NOT NULL DEFAULT 'unknown',
  agent text NOT NULL DEFAULT 'noah_bennett',
  status text NOT NULL DEFAULT 'pending',
  mode text NOT NULL DEFAULT 'preview',
  create_content_block text NOT NULL DEFAULT '',
  parsed jsonb NOT NULL DEFAULT '{}'::jsonb,
  delegated_task_id uuid NULL,
  content_queue_id uuid NULL,
  content_draft_id uuid NULL,
  video_edit_queue_id uuid NULL,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS content_jobs_status_idx ON public.content_jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS content_jobs_org_idx ON public.content_jobs(organization_id, created_at DESC);
DROP TRIGGER IF EXISTS trg_content_jobs_updated_at ON public.content_jobs;
CREATE TRIGGER trg_content_jobs_updated_at BEFORE UPDATE ON public.content_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 3) creative_vault  (mightyedit-render-callback target)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.creative_vault (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  conversation_id uuid NULL,
  job_id uuid NULL REFERENCES public.content_jobs(id) ON DELETE SET NULL,
  type text NOT NULL,
  platform text NULL,
  content_type text NULL,
  title text NULL,
  asset_url text NOT NULL,
  thumbnail_url text NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS creative_vault_org_idx ON public.creative_vault(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS creative_vault_job_idx ON public.creative_vault(job_id, created_at DESC);

-- ============================================================
-- 4) execution_receipts  (proof-of-persistence ledger)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.execution_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id),
  conversation_id uuid REFERENCES public.conversations(id),
  source_table text NOT NULL DEFAULT 'ai_actions',
  source_id uuid NULL,
  channel text NOT NULL,
  action_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  provider text NULL,
  provider_receipt_id text NULL,
  payload_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS execution_receipts_org_idx ON public.execution_receipts(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS execution_receipts_source_idx ON public.execution_receipts(source_table, source_id);

-- ============================================================
-- 5) creative_tags + creative_tag_map  (render-reel status tagging)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.creative_tags (
  slug text PRIMARY KEY,
  category text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);
INSERT INTO public.creative_tags (slug, category, description) VALUES
  ('status:draft', 'status', 'Draft'),
  ('status:rendering', 'status', 'Rendering'),
  ('status:complete', 'status', 'Complete'),
  ('status:failed', 'status', 'Failed')
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.creative_tag_map (
  creative_id uuid REFERENCES public.ai_creatives(id) ON DELETE CASCADE,
  tag_slug text REFERENCES public.creative_tags(slug) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (creative_id, tag_slug)
);

-- ============================================================
-- 6) RLS  (live organization_members pattern; service role bypasses RLS)
-- ============================================================
ALTER TABLE public.content_jobs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creative_vault      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.execution_receipts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creative_tags       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creative_tag_map    ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['content_jobs','creative_vault','execution_receipts'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_member_select" ON public.%1$s', t);
    EXECUTE format($f$CREATE POLICY "%1$s_member_select" ON public.%1$s FOR SELECT
      USING ((organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())) OR organization_id IS NULL)$f$, t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_member_insert" ON public.%1$s', t);
    EXECUTE format($f$CREATE POLICY "%1$s_member_insert" ON public.%1$s FOR INSERT
      WITH CHECK ((organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())) OR organization_id IS NULL)$f$, t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_member_update" ON public.%1$s', t);
    EXECUTE format($f$CREATE POLICY "%1$s_member_update" ON public.%1$s FOR UPDATE
      USING ((organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())) OR organization_id IS NULL)$f$, t);
  END LOOP;
END $$;

-- creative_tags: global lookup, readable by any authenticated user
DROP POLICY IF EXISTS "creative_tags_read" ON public.creative_tags;
CREATE POLICY "creative_tags_read" ON public.creative_tags FOR SELECT TO authenticated USING (true);

-- creative_tag_map: readable by any authenticated user (writes via service role)
DROP POLICY IF EXISTS "creative_tag_map_read" ON public.creative_tag_map;
CREATE POLICY "creative_tag_map_read" ON public.creative_tag_map FOR SELECT TO authenticated USING (true);
