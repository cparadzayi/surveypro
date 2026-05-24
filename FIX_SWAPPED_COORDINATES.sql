-- ============================================================================
-- FIX SWAPPED COORDINATES IN coordinate_points TABLE
-- ============================================================================
-- Problem: Coordinates were inserted as POINT(Y, X) instead of POINT(X, Y)
-- Solution: Swap the coordinates in all existing records
-- ============================================================================

-- BACKUP FIRST (just in case)
-- CREATE TABLE coordinate_points_backup AS SELECT * FROM surveyor_surveyor_kuda.coordinate_points;

-- Check current state (before fix)
SELECT 
  'BEFORE FIX' as status,
  name,
  ST_Y(geom) as current_y,
  ST_X(geom) as current_x,
  ST_AsText(geom) as current_geom
FROM surveyor_surveyor_kuda.coordinate_points
WHERE name IN ('1465A', '1466A', '1465C')
ORDER BY name;

-- Fix: Swap X and Y coordinates
-- ST_MakePoint expects (X, Y) but we stored (Y, X)
-- So we need to swap: ST_MakePoint(ST_Y(geom), ST_X(geom))
UPDATE surveyor_surveyor_kuda.coordinate_points
SET geom = ST_SetSRID(
  ST_MakePoint(ST_Y(geom), ST_X(geom)),  -- Swap: use Y as X, X as Y
  ST_SRID(geom)
);

-- Verify the fix
SELECT 
  'AFTER FIX' as status,
  name,
  ST_Y(geom) as new_y,
  ST_X(geom) as new_x,
  ST_AsText(geom) as new_geom
FROM surveyor_surveyor_kuda.coordinate_points
WHERE name IN ('1465A', '1466A', '1465C')
ORDER BY name;

-- Expected result for 1465A:
-- new_y = 2247765.354 (northing)
-- new_x = 97593.773 (easting)
-- new_geom = POINT(97593.773 2247765.354)
--            Now correctly: POINT(X Y)

-- Test spatial matching after fix
WITH parcel_vertices AS (
  SELECT 
    generate_series(1, ST_NPoints(ST_ExteriorRing(geom)) - 1) as vertex_num,
    ST_PointN(ST_ExteriorRing(geom), generate_series(1, ST_NPoints(ST_ExteriorRing(geom)) - 1)) as vertex_geom
  FROM surveyor_surveyor_kuda.land_parcels
  WHERE stand = '1465'
),
coord_points AS (
  SELECT name, geom
  FROM surveyor_surveyor_kuda.coordinate_points
  WHERE name IN ('1465A', '1466A', '1465C', '1465D', '1465E', '1465F')
)
SELECT 
  pv.vertex_num,
  ST_Y(pv.vertex_geom) as vertex_y,
  ST_X(pv.vertex_geom) as vertex_x,
  cp.name as nearest_point,
  ST_Y(cp.geom) as point_y,
  ST_X(cp.geom) as point_x,
  ST_Distance(pv.vertex_geom, cp.geom) as distance_meters,
  CASE 
    WHEN ST_Distance(pv.vertex_geom, cp.geom) <= 0.5 THEN '✅ PERFECT MATCH'
    WHEN ST_Distance(pv.vertex_geom, cp.geom) <= 2.0 THEN '✅ GOOD MATCH'
    ELSE '❌ NO MATCH'
  END as status
FROM parcel_vertices pv
CROSS JOIN LATERAL (
  SELECT name, geom
  FROM coord_points
  ORDER BY pv.vertex_geom <-> geom
  LIMIT 1
) cp
ORDER BY pv.vertex_num;

-- Expected: All distances should be 0.000m (perfect match)
