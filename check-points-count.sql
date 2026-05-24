-- Check how many points are in the database for project 7
SELECT COUNT(*) as total_points 
FROM surveyor_kuziva_paradzayi.coordinate_points 
WHERE project_id = 7;

-- Show sample of point names to verify
SELECT name 
FROM surveyor_kuziva_paradzayi.coordinate_points 
WHERE project_id = 7 
ORDER BY name 
LIMIT 10;
