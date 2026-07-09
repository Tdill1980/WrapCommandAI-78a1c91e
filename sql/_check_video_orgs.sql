SELECT COALESCE(organization_id::text,'NULL') AS org, count(*) AS n
FROM content_files WHERE file_type='video'
GROUP BY organization_id ORDER BY n DESC;
