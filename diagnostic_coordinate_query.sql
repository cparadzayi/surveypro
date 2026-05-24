-- Diagnostic query to check coordinate storage in PostGIS
-- Run this in your PostgreSQL client to diagnose the QGIS display issue

-- Replace <project_id> with your actual project ID
-- Replace <schema_name> with your surveyor schema (e.g., surveyor_john_doe)

SET search_path TO <schema_name>, public;

SELECT 
  name,
  ST_SRID(geom) as srid,
  ST_X(geom) as x_ordinate,
  ST_Y(geom) as y_ordinate,
  ST_AsText(geom) as wkt,
  ROUND(ST_X(ST_Transform(geom, 4326))::numeric, 6) as wgs84_lon,
  ROUND(ST_Y(ST_Transform(geom, 4326))::numeric, 6) as wgs84_lat,
  -- Check if coordinates are in expected ranges
  CASE 
    WHEN ST_X(geom) BETWEEN 90000 AND 105000 THEN 'X looks like Westing (90k-105k) ✓'
    WHEN ST_X(geom) BETWEEN 2200000 AND 2300000 THEN 'X looks like Southing (2.2M-2.3M) ✗ WRONG!'
    ELSE 'X is out of expected range'
  END as x_analysis,
  CASE 
    WHEN ST_Y(geom) BETWEEN 2200000 AND 2300000 THEN 'Y looks like Southing (2.2M-2.3M) ✓'
    WHEN ST_Y(geom) BETWEEN 90000 AND 105000 THEN 'Y looks like Westing (90k-105k) ✗ WRONG!'
    ELSE 'Y is out of expected range'
  END as y_analysis,
  -- Check if WGS84 is in Zimbabwe
  CASE 
    WHEN ST_X(ST_Transform(geom, 4326)) BETWEEN 25 AND 33 
     AND ST_Y(ST_Transform(geom, 4326)) BETWEEN -23 AND -15 
    THEN 'In Zimbabwe ✓'
    ELSE 'Outside Zimbabwe ✗'
  END as location_check
FROM coordinate_points
WHERE project_id = <project_id>
ORDER BY name
LIMIT 10;

-- Expected results for CORRECT storage (Point P2: Y=97538, X=2247107):
-- srid: 22291
-- x_ordinate: 97538.004 (Westing)
-- y_ordinate: 2247107.9 (Southing)
-- wgs84_lon: ~30.12
-- wgs84_lat: ~-20.3
-- x_analysis: 'X looks like Westing (90k-105k) ✓'
-- y_analysis: 'Y looks like Southing (2.2M-2.3M) ✓'
-- location_check: 'In Zimbabwe ✓'

-- If you see WRONG results (coordinates swapped):
-- x_ordinate: 2247107.9 (Southing in X position - WRONG!)
-- y_ordinate: 97538.004 (Westing in Y position - WRONG!)
-- wgs84_lon: Way outside 25-33°E range
-- wgs84_lat: Way outside -15 to -23°S range
-- x_analysis: 'X looks like Southing (2.2M-2.3M) ✗ WRONG!'
-- y_analysis: 'Y looks like Westing (90k-105k) ✗ WRONG!'
-- location_check: 'Outside Zimbabwe ✗'
