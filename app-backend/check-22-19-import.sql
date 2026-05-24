-- Check if any points were inserted during the 22:19:39 import
SELECT 
    COUNT(*) as points_from_latest_import
FROM surveyor_kuziva_paradzayi.coordinate_points 
WHERE project_id = 7
  AND created_at BETWEEN '2026-01-01 22:19:39' AND '2026-01-01 22:19:40';

-- Show all distinct insert times for project 7
SELECT 
    DATE_TRUNC('second', created_at) as insert_time,
    COUNT(*) as point_count
FROM surveyor_kuziva_paradzayi.coordinate_points 
WHERE project_id = 7
GROUP BY DATE_TRUNC('second', created_at)
ORDER BY insert_time DESC;

-- Check if there are any points with updated_at after 22:19:39 (in case of ON CONFLICT UPDATE)
SELECT COUNT(*) as updated_points
FROM surveyor_kuziva_paradzayi.coordinate_points 
WHERE project_id = 7
  AND updated_at > '2026-01-01 22:19:39';
