-- HeyGen avatar registry: the org's available avatars (the user's OWN avatars),
-- so the demo pipeline / UI can let you pick which one narrates a given video.
-- Avatar IDs are identifiers (not secrets) but are account-specific, so the actual
-- IDs are stored as DATA in the database, not hardcoded here.

CREATE TABLE IF NOT EXISTS public.heygen_avatars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  avatar_id text NOT NULL,
  label text,
  voice_id text,                 -- the matching voice-clone id for this avatar
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, avatar_id)
);

ALTER TABLE public.heygen_avatars ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "heygen_avatars_member_select" ON public.heygen_avatars;
CREATE POLICY "heygen_avatars_member_select" ON public.heygen_avatars FOR SELECT
  USING ((organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())) OR organization_id IS NULL);

DROP POLICY IF EXISTS "heygen_avatars_member_write" ON public.heygen_avatars;
CREATE POLICY "heygen_avatars_member_write" ON public.heygen_avatars FOR ALL
  USING ((organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())))
  WITH CHECK ((organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())));
