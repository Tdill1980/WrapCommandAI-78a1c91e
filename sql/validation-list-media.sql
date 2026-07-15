-- Read-only: list video assets in storage so reels can be cut from real
-- WePrintWraps footage. Safe to delete.
SELECT bucket_id, name, (metadata->>'size')::bigint AS bytes
FROM storage.objects
WHERE (name ILIKE '%.mp4' OR name ILIKE '%.mov')
ORDER BY created_at DESC
LIMIT 50;
