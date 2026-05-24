-- Check the most recent CSV import
SELECT 
    COUNT(*) as total_points,
    MIN(created_at) as first_insert,
    MAX(created_at) as last_insert,
    MAX(created_at) - MIN(created_at) as duration
FROM surveyor_kuziva_paradzayi.coordinate_points 
WHERE project_id = 7
  AND created_at > '2026-01-01 22:19:00';

-- Show distribution by second to see chunking pattern
SELECT 
    DATE_TRUNC('second', created_at) as insert_time,
    COUNT(*) as points_in_batch
FROM surveyor_kuziva_paradzayi.coordinate_points 
WHERE project_id = 7
  AND created_at > '2026-01-01 22:19:00'
GROUP BY DATE_TRUNC('second', created_at)
ORDER BY insert_time;

-- Check total points for project 7
SELECT COUNT(*) as total_project_points
FROM surveyor_kuziva_paradzayi.coordinate_points 
WHERE project_id = 7;
