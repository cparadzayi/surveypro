-- Fix coordinate storage in surveyor_surveyor_kuda schema
-- Issue: Coordinates stored with wrong ordinate order AND possible negation
-- Cape Lo 31: Y=Westing (~97k), X=Southing (~2.2M)
-- PostGIS ST_MakePoint(x, y) expects X first, Y second

-- Backup current state
CREATE TABLE IF NOT EXISTS surveyor_surveyor_kuda.coordinate_points_backup_correct AS 
SELECT * FROM surveyor_surveyor_kuda.coordinate_points WHERE project_id = 1;

-- Show current state
SELECT 
  'CURRENT STATE' as status,
  name,
  ST_X(geom) as postgis_x_ordinate,
  ST_Y(geom) as postgis_y_ordinate,
  ST_AsText(geom) as wkt
FROM surveyor_surveyor_kuda.coordinate_points
WHERE project_id = 1
  AND name IN ('P2', 'ZA', 'ZD', 'ZE', 'ZG')
ORDER BY name;

-- Show what we expect from historical data
SELECT 
  'EXPECTED (from historical)' as status,
  point_name as name,
  y_coordinate as expected_y_westing,
  x_coordinate as expected_x_southing
FROM historical_survey_points
WHERE project_id = 1
  AND point_name IN ('P2', 'ZA', 'ZD', 'ZE', 'ZG')
ORDER BY point_name;

-- The fix: We need to store as ST_MakePoint(X, Y) where X=Southing, Y=Westing
-- Current state after swap: ST_X = 2.2M (X value), ST_Y = -97k (negated Y)
-- We need: ST_X = 2.2M (X/Southing), ST_Y = +97k (Y/Westing, positive)
-- So we need to: keep ST_X as is, negate ST_Y to make it positive

UPDATE surveyor_surveyor_kuda.coordinate_points
SET geom = ST_SetSRID(
  ST_MakePoint(
    ST_X(geom),      -- Keep X (Southing ~2.2M) as first ordinate
    -ST_Y(geom)      -- Negate Y to make it positive (Westing ~97k) as second ordinate
  ),
  22291
)
WHERE project_id = 1;

-- Show corrected coordinates
SELECT 
  'AFTER CORRECTION' as status,
  name,
  ST_X(geom) as postgis_x_southing,
  ST_Y(geom) as postgis_y_westing,
  ST_AsText(geom) as wkt
FROM surveyor_surveyor_kuda.coordinate_points
WHERE project_id = 1
  AND name IN ('P2', 'ZA', 'ZD', 'ZE', 'ZG')
ORDER BY name;

-- Verify with beacon comparison
-- For Cape Lo: Y=Westing (second ordinate in PostGIS), X=Southing (first ordinate in PostGIS)
SELECT 
  'VERIFICATION' as status,
  h.point_name,
  h.y_coordinate AS hist_y_westing,
  h.x_coordinate AS hist_x_southing,
  ST_Y(cp.geom) AS curr_y_westing,
  ST_X(cp.geom) AS curr_x_southing,
  (h.y_coordinate - ST_Y(cp.geom)) AS dy,
  (h.x_coordinate - ST_X(cp.geom)) AS dx,
  SQRT(POWER(h.y_coordinate - ST_Y(cp.geom), 2) + POWER(h.x_coordinate - ST_X(cp.geom), 2)) AS distance_m
FROM historical_survey_points h
INNER JOIN surveyor_surveyor_kuda.coordinate_points cp ON 
  cp.project_id = h.project_id AND 
  cp.name = h.point_name
WHERE h.project_id = 1
ORDER BY h.point_name
LIMIT 5;
