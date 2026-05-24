-- Diagnostic: Check what values are actually stored vs expected

-- 1. Show raw geometry ordinates
SELECT 
  'RAW GEOMETRY' as check_type,
  name,
  ST_X(geom) as postgis_first_ordinate,
  ST_Y(geom) as postgis_second_ordinate,
  ST_AsText(geom) as wkt
FROM surveyor_surveyor_kuda.coordinate_points
WHERE project_id = 1
  AND name IN ('P2', 'ZA', 'ZD', 'ZE', 'ZG', '1425A')
ORDER BY name;

-- 2. Show expected values from historical data
SELECT 
  'EXPECTED FROM HISTORICAL' as check_type,
  point_name as name,
  y_coordinate as expected_y_westing,
  x_coordinate as expected_x_southing
FROM historical_survey_points
WHERE project_id = 1
  AND point_name IN ('P2', 'ZA', 'ZD', 'ZE', 'ZG')
ORDER BY point_name;

-- 3. Check if there's a pattern in the difference
SELECT 
  'DIFFERENCE ANALYSIS' as check_type,
  h.point_name as name,
  h.y_coordinate as hist_y,
  h.x_coordinate as hist_x,
  ST_Y(cp.geom) as curr_postgis_y,
  ST_X(cp.geom) as curr_postgis_x,
  (ST_Y(cp.geom) - h.y_coordinate) as y_diff,
  (ST_X(cp.geom) - h.x_coordinate) as x_diff,
  -- Check if it's a simple negation
  (ST_Y(cp.geom) + h.y_coordinate) as y_sum_if_negated,
  (ST_X(cp.geom) + h.x_coordinate) as x_sum_if_negated
FROM historical_survey_points h
INNER JOIN surveyor_surveyor_kuda.coordinate_points cp ON 
  cp.project_id = h.project_id AND 
  cp.name = h.point_name
WHERE h.project_id = 1
ORDER BY h.point_name
LIMIT 5;

-- 4. Check a regular survey peg (not a control point)
SELECT 
  'REGULAR PEG CHECK' as check_type,
  name,
  ST_X(geom) as postgis_first_ordinate,
  ST_Y(geom) as postgis_second_ordinate,
  ST_AsText(geom) as wkt
FROM surveyor_surveyor_kuda.coordinate_points
WHERE project_id = 1
  AND name = '1425A'
LIMIT 1;
