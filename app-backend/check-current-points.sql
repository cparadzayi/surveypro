-- Check current point count after the fresh import
SELECT 
    COUNT(*) as total_points,
    MIN(created_at) as first_insert,
    MAX(created_at) as last_insert
FROM surveyor_kuziva_paradzayi.coordinate_points 
WHERE project_id = 7
  AND created_at > '2026-01-01 22:31:00';

-- Show the distribution by second to see chunking
SELECT 
    DATE_TRUNC('second', created_at) as insert_time,
    COUNT(*) as points_in_batch
FROM surveyor_kuziva_paradzayi.coordinate_points 
WHERE project_id = 7
  AND created_at > '2026-01-01 22:31:00'
GROUP BY DATE_TRUNC('second', created_at)
ORDER BY insert_time;

-- Check if there are exactly 500 or 544 points
SELECT 
    CASE 
        WHEN COUNT(*) = 500 THEN '500 points - 6th chunk failed'
        WHEN COUNT(*) = 544 THEN '544 points - ALL chunks succeeded'
        ELSE CONCAT(COUNT(*), ' points - unexpected count')
    END as result
FROM surveyor_kuziva_paradzayi.coordinate_points 
WHERE project_id = 7
  AND created_at > '2026-01-01 22:31:00';
