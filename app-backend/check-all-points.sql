-- Check total points and see if there are duplicates or errors
SELECT 
    COUNT(*) as total_points,
    COUNT(DISTINCT name) as unique_names,
    MIN(created_at) as first_insert,
    MAX(created_at) as last_insert
FROM surveyor_kuziva_paradzayi.coordinate_points 
WHERE project_id = 7;

-- Check if there are any NULL or invalid geometries
SELECT COUNT(*) as invalid_geom_count
FROM surveyor_kuziva_paradzayi.coordinate_points 
WHERE project_id = 7 AND geom IS NULL;

-- Show the most recent 10 points
SELECT id, name, ST_X(geom) as x, ST_Y(geom) as y, created_at
FROM surveyor_kuziva_paradzayi.coordinate_points 
WHERE project_id = 7
ORDER BY created_at DESC
LIMIT 10;
