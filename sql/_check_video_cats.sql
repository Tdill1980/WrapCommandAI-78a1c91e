SELECT COALESCE(content_category,'NULL') AS cat, count(*) AS n
FROM content_files WHERE file_type='video'
GROUP BY content_category ORDER BY n DESC;
