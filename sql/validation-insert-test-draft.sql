-- Validation fixture: one approved test content_drafts row with a fixed UUID
-- so the sync-draft-to-restylepro bridge can be exercised end to end without
-- touching real drafts. Safe to re-run (upsert) and safe to delete after.
INSERT INTO public.content_drafts
  (id, content_type, platform, caption, media_url, status, created_by_agent)
VALUES
  ('c1a0de00-0000-4000-8000-000000000001',
   'post',
   'instagram',
   'Claude validation test — bridge to restylepro publisher. Safe to delete.',
   'https://qxllysilzonrlyoaomce.supabase.co/storage/v1/object/public/media-library/reels/1d42f131-3773-4772-9223-0a8df76c06bf.jpg',
   'approved',
   'validation')
ON CONFLICT (id) DO UPDATE
  SET status = 'approved', platform_post_id = NULL, published_at = NULL;
