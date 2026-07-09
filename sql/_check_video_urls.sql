-- Diagnostic: one full video file_url to test direct download. Temp — remove after.
select file_url
from content_files
where file_type = 'video'
order by created_at desc
limit 1;
