-- Check for duplicate point names in project 7
SELECT name, COUNT(*) as count
FROM surveyor_kuziva_paradzayi.coordinate_points 
WHERE project_id = 7
GROUP BY name
HAVING COUNT(*) > 1
ORDER BY count DESC, name;

-- Check the distribution of points by created_at to see if they were inserted in batches
SELECT 
    DATE_TRUNC('second', created_at) as insert_time,
    COUNT(*) as points_in_batch
FROM surveyor_kuziva_paradzayi.coordinate_points 
WHERE project_id = 7
GROUP BY DATE_TRUNC('second', created_at)
ORDER BY insert_time;
