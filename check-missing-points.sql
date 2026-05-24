-- Check which points are missing from the database for project 7
-- Run this in PostgreSQL to see the missing points

-- 1. Count total points in database for project 7
SELECT COUNT(*) as total_points_in_db
FROM surveyor_kuziva_paradzayi.coordinate_points
WHERE project_id = 7;

-- 2. List all point names in database (ordered)
SELECT name
FROM surveyor_kuziva_paradzayi.coordinate_points
WHERE project_id = 7
ORDER BY name;

-- 3. Show first 10 and last 10 points to see the range
(SELECT name, y, x, 'FIRST 10' as position
 FROM surveyor_kuziva_paradzayi.coordinate_points
 WHERE project_id = 7
 ORDER BY name
 LIMIT 10)
UNION ALL
(SELECT name, y, x, 'LAST 10' as position
 FROM surveyor_kuziva_paradzayi.coordinate_points
 WHERE project_id = 7
 ORDER BY name DESC
 LIMIT 10)
ORDER BY position, name;

-- 4. Check for any NULL coordinates
SELECT COUNT(*) as points_with_null_coords
FROM surveyor_kuziva_paradzayi.coordinate_points
WHERE project_id = 7
  AND (geom IS NULL OR ST_X(geom) IS NULL OR ST_Y(geom) IS NULL);

-- 5. Show summary statistics
SELECT 
  MIN(name) as first_point,
  MAX(name) as last_point,
  COUNT(*) as total_count,
  COUNT(DISTINCT name) as unique_names,
  MIN(ST_Y(geom)) as min_y,
  MAX(ST_Y(geom)) as max_y,
  MIN(ST_X(geom)) as min_x,
  MAX(ST_X(geom)) as max_x
FROM surveyor_kuziva_paradzayi.coordinate_points
WHERE project_id = 7;
