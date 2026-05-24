-- Diagnostic script to check beacon comparison coordinate extraction
-- Run this to see actual coordinate values from both tables

-- Check historical survey points (should be positive Cape Lo 31 coordinates)
SELECT 
  'Historical Points' as source,
  point_name,
  y_coordinate as y_value,
  x_coordinate as x_value,
  coordinate_system,
  measurement_unit
FROM historical_survey_points
WHERE project_id = 1
ORDER BY point_name
LIMIT 5;

-- Check current coordinate points from surveyor schema
-- Replace 'surveyor_charles_mataranyika' with your actual schema name
SELECT 
  'Current Points (Raw Geometry)' as source,
  name as point_name,
  ST_X(geom) as first_ordinate_extracted_as_y,
  ST_Y(geom) as second_ordinate_extracted_as_x,
  ST_AsText(geom) as geometry_wkt
FROM surveyor_charles_mataranyika.coordinate_points
WHERE project_id = 1
ORDER BY name
LIMIT 5;

-- Check the comparison query results
SELECT 
  'Comparison Results' as source,
  h.point_name,
  h.y_coordinate AS prev_y,
  h.x_coordinate AS prev_x,
  ST_X(cp.geom) AS curr_y,
  ST_Y(cp.geom) AS curr_x,
  (h.y_coordinate - ST_X(cp.geom)) AS dy,
  (h.x_coordinate - ST_Y(cp.geom)) AS dx,
  SQRT(POWER(h.y_coordinate - ST_X(cp.geom), 2) + POWER(h.x_coordinate - ST_Y(cp.geom), 2)) AS distance
FROM historical_survey_points h
INNER JOIN surveyor_charles_mataranyika.coordinate_points cp ON 
  cp.project_id = h.project_id AND 
  cp.name = h.point_name
WHERE h.project_id = 1
ORDER BY h.point_name
LIMIT 5;
