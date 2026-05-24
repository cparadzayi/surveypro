-- ============================================================================
-- DIAGNOSTIC SCRIPT: Test Spatial Matching (CORRECTED)
-- ============================================================================
-- Both tables use SRID 22291 (Cape Lo 31) - GOOD!
-- Issue: coordinate_points has no y/x columns, only geom
-- ============================================================================

-- Extract coordinates from coordinate_points geometry
SELECT 
  'coordinate_points' as source,
  name,
  ST_Y(geom) as y_coord,
  ST_X(geom) as x_coord,
  ST_SRID(geom) as srid
FROM surveyor_surveyor_kuda.coordinate_points
WHERE name IN ('1465A', '1466A', '1465C', '1465D', '1465E', '1465F')
ORDER BY name;

-- Test spatial distance calculation
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
    WHEN ST_Distance(pv.vertex_geom, cp.geom) > 1000 THEN 'COORDINATE SYSTEM MISMATCH'
    WHEN ST_Distance(pv.vertex_geom, cp.geom) <= 2 THEN 'MATCH'
    ELSE 'POSSIBLE MATCH'
  END as status
FROM parcel_vertices pv
CROSS JOIN LATERAL (
  SELECT name, geom
  FROM coord_points
  ORDER BY pv.vertex_geom <-> geom
  LIMIT 1
) cp
ORDER BY pv.vertex_num;
