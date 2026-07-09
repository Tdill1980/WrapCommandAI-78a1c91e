-- Diagnostic: sample video file_url values to see if they are directly playable
-- (public URL, extension, whether a thumbnail exists). Temp file — remove after.
select
  id,
  file_type,
  content_category,
  right(file_url, 40) as file_url_tail,
  (thumbnail_url is not null) as has_thumb,
  (mux_playback_id is not null) as has_mux,
  duration_seconds
from content_files
where file_type = 'video'
order by created_at desc
limit 8;
