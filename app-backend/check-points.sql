-- Check if points were inserted for project 7
SELECT COUNT(*) as point_count 
FROM surveyor_kuziva_paradzayi.coordinate_points 
WHERE project_id = 7;

-- Show first 5 points if any exist
SELECT id, name, project_id, ST_X(geom) as x, ST_Y(geom) as y
FROM surveyor_kuziva_paradzayi.coordinate_points 
WHERE project_id = 7
LIMIT 5;
