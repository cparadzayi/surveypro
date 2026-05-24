-- Check points from the latest import (after 22:39:00)
SELECT COUNT(*) as total_points
FROM surveyor_kuziva_paradzayi.coordinate_points 
WHERE project_id = 7
  AND created_at > '2026-01-01 22:39:00';
