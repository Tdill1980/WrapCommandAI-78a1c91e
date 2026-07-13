-- ============================================================
-- CONTENT ATOMS — missing from the Feb 17 2026 consolidation
-- ============================================================
-- The Feb 17 migration (20260217_create_content_tables.sql) moved
-- content_files / content_queue / content_calendar / content_drafts /
-- content_projects to the WPW production DB but omitted content_atoms,
-- so the Content Atomizer tool 404'd on every query/insert
-- (PGRST205: table public.content_atoms not found).
-- This recreates it, matching the original Lovable-era schema
-- (20251210075507) with the same org-scoped RLS pattern.

CREATE TABLE IF NOT EXISTS content_atoms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  -- source category (transcript / faq / pricing / other)
  source_type TEXT NOT NULL DEFAULT 'other',

  -- atom classification
  atom_type TEXT NOT NULL DEFAULT 'idea',

  original_text TEXT NOT NULL,
  processed_text TEXT,

  -- AI tag support
  tags TEXT[] DEFAULT '{}',

  -- link to product (optional)
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,

  -- AI-detected ad angles
  ad_angles TEXT[] DEFAULT '{}',

  -- suggested output formats
  suggested_formats TEXT[] DEFAULT '{}',

  -- usage intelligence
  is_used BOOLEAN DEFAULT FALSE,
  use_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE content_atoms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org can read atoms" ON content_atoms;
CREATE POLICY "org can read atoms"
  ON content_atoms FOR SELECT
  USING (organization_id = get_user_organization_id() OR organization_id IS NULL);

DROP POLICY IF EXISTS "org can insert atoms" ON content_atoms;
CREATE POLICY "org can insert atoms"
  ON content_atoms FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id() OR organization_id IS NULL);

DROP POLICY IF EXISTS "org can update atoms" ON content_atoms;
CREATE POLICY "org can update atoms"
  ON content_atoms FOR UPDATE
  USING (organization_id = get_user_organization_id() OR organization_id IS NULL);

DROP POLICY IF EXISTS "org can delete atoms" ON content_atoms;
CREATE POLICY "org can delete atoms"
  ON content_atoms FOR DELETE
  USING (organization_id = get_user_organization_id() OR organization_id IS NULL);
