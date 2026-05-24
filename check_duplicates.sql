-- Check for duplicate coordinate points in surveyor schema
\set SURVEYOR_SCHEMA 'surveyor_kuziva_paradzayi'
SET search_path TO :SURVEYOR_SCHEMA, public;

-- Count total points
SELECT COUNT(*) as total_points FROM coordinate_points;

-- Count unique point names
SELECT COUNT(DISTINCT name) as unique_names FROM coordinate_points;

-- Find duplicate point names
SELECT 
  name,
  COUNT(*) as count,
  ARRAY_AGG(id) as point_ids,
  ARRAY_AGG(ST_X(geom)) as x_values,
  ARRAY_AGG(ST_Y(geom)) as y_values
FROM coordinate_points
GROUP BY name
HAVING COUNT(*) > 1
ORDER BY name
LIMIT 20;

-- Check if duplicates have swapped coordinates
SELECT 
  p1.name,
  p1.id as id1,
  p2.id as id2,
  ST_X(p1.geom) as p1_x,
  ST_Y(p1.geom) as p1_y,
  ST_X(p2.geom) as p2_x,
  ST_Y(p2.geom) as p2_y,
  CASE 
    WHEN ST_X(p1.geom) = ST_Y(p2.geom) AND ST_Y(p1.geom) = ST_X(p2.geom)
    THEN 'SWAPPED COORDINATES'
    ELSE 'DIFFERENT'
  END as relationship
FROM coordinate_points p1
JOIN coordinate_points p2 ON p1.name = p2.name AND p1.id < p2.id
LIMIT 10;
