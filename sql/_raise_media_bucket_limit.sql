-- Raise the media-library bucket per-object size limit to 500MB so ingested
-- videos fit, and report the resulting limit. Temp op file — remove after.
update storage.buckets
set file_size_limit = 524288000  -- 500MB
where id = 'media-library'
returning id, name, public, file_size_limit;
