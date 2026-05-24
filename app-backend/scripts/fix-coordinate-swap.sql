-- Fix coordinate swap in surveyor_surveyor_kuda schema
-- The coordinates were stored as ST_MakePoint(x, y) but should be ST_MakePoint(y, x)
-- This script swaps the ordinates to correct the error

-- Backup the current data first
CREATE TABLE IF NOT EXISTS surveyor_surveyor_kuda.coordinate_points_backup_swap AS 
SELECT * FROM surveyor_surveyor_kuda.coordinate_points WHERE project_id = 1;

-- Show current (incorrect) coordinates
SELECT 
  'BEFORE FIX' as status,
  name,
  ST_X(geom) as first_ordinate,
  ST_Y(geom) as second_ordinate
FROM surveyor_surveyor_kuda.coordinate_points
WHERE project_id = 1
  AND name IN ('P2', 'ZA', 'ZD', 'ZE', 'ZG')
ORDER BY name;

-- Fix the coordinates by swapping ordinates
-- Current: ST_MakePoint(x_value, y_value) where first=-111k, second=2.2M
-- Correct: ST_MakePoint(y_value, x_value) where first=97k, second=2.2M
UPDATE surveyor_surveyor_kuda.coordinate_points
SET geom = ST_SetSRID(
  ST_MakePoint(ST_Y(geom), ST_X(geom)),  -- Swap: new first = old second, new second = old first
  22291
)
WHERE project_id = 1;

-- Show fixed coordinates
SELECT 
  'AFTER FIX' as status,
  name,
  ST_X(geom) as first_ordinate_y,
  ST_Y(geom) as second_ordinate_x
FROM surveyor_surveyor_kuda.coordinate_points
WHERE project_id = 1
  AND name IN ('P2', 'ZA', 'ZD', 'ZE', 'ZG')
ORDER BY name;

-- Verify the fix with beacon comparison
SELECT 
  'VERIFICATION' as status,
  h.point_name,
  h.y_coordinate AS prev_y,
  h.x_coordinate AS prev_x,
  ST_X(cp.geom) AS curr_y,
  ST_Y(cp.geom) AS curr_x,
  (h.y_coordinate - ST_X(cp.geom)) AS dy,
  (h.x_coordinate - ST_Y(cp.geom)) AS dx,
  SQRT(POWER(h.y_coordinate - ST_X(cp.geom), 2) + POWER(h.x_coordinate - ST_Y(cp.geom), 2)) AS distance_m
FROM historical_survey_points h
INNER JOIN surveyor_surveyor_kuda.coordinate_points cp ON 
  cp.project_id = h.project_id AND 
  cp.name = h.point_name
WHERE h.project_id = 1
ORDER BY h.point_name
LIMIT 5;
