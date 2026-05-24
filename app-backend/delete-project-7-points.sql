-- Delete all coordinate points for project 7 to allow fresh import
BEGIN;

SELECT COUNT(*) as points_before_delete
FROM surveyor_kuziva_paradzayi.coordinate_points 
WHERE project_id = 7;

DELETE FROM surveyor_kuziva_paradzayi.coordinate_points 
WHERE project_id = 7;

SELECT COUNT(*) as points_after_delete
FROM surveyor_kuziva_paradzayi.coordinate_points 
WHERE project_id = 7;

COMMIT;

-- Verify deletion
SELECT COUNT(*) as final_count
FROM surveyor_kuziva_paradzayi.coordinate_points 
WHERE project_id = 7;
