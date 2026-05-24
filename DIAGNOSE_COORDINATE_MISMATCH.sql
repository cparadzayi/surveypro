-- ============================================================================
-- DIAGNOSTIC SCRIPT: Identify Coordinate System Mismatch
-- ============================================================================
-- Purpose: Determine why spatial matching is failing (3000+ km distances)
-- Expected: Both tables should use Cape Lo 29 (EPSG:22289)
-- ============================================================================

-- 1. Check SRID of land_parcels geometry
SELECT 
  'land_parcels' as table_name,
  ST_SRID(geom) as srid,
  Find_SRID('surveyor_surveyor_kuda', 'land_parcels', 'geom') as find_srid,
  COUNT(*) as record_count
FROM surveyor_surveyor_kuda.land_parcels
WHERE stand = '1465'
GROUP BY ST_SRID(geom);

-- 2. Check SRID of coordinate_points geometry
SELECT 
  'coordinate_points' as table_name,
  ST_SRID(geom) as srid,
  Find_SRID('surveyor_surveyor_kuda', 'coordinate_points', 'geom') as find_srid,
  COUNT(*) as record_count
FROM surveyor_surveyor_kuda.coordinate_points
WHERE name IN ('1465A', '1466A', '1465C', '1465D', '1465E', '1465F')
GROUP BY ST_SRID(geom);

-- 3. Extract actual coordinates from both tables
-- Parcel 1465 vertices
SELECT 
  '1465_parcel_vertices' as source,
  generate_series(1, ST_NPoints(ST_ExteriorRing(geom))) as vertex_num,
  ST_Y(ST_PointN(ST_ExteriorRing(geom), generate_series(1, ST_NPoints(ST_ExteriorRing(geom))))) as y_coord,
  ST_X(ST_PointN(ST_ExteriorRing(geom), generate_series(1, ST_NPoints(ST_ExteriorRing(geom))))) as x_coord,
  ST_SRID(geom) as srid
FROM surveyor_surveyor_kuda.land_parcels
WHERE stand = '1465';

-- Coordinate points for parcel 1465
SELECT 
  'coordinate_points' as source,
  name,
  ST_Y(geom) as y_coord,
  ST_X(geom) as x_coord,
  ST_SRID(geom) as srid
FROM surveyor_surveyor_kuda.coordinate_points
WHERE name IN ('1465A', '1466A', '1465C', '1465D', '1465E', '1465F')
ORDER BY name;

-- 4. Test spatial distance calculation (should be < 2m if same SRID)
WITH parcel_vertices AS (
  SELECT 
    generate_series(1, ST_NPoints(ST_ExteriorRing(geom)) - 1) as vertex_num,
    ST_PointN(ST_ExteriorRing(geom), generate_series(1, ST_NPoints(ST_ExteriorRing(geom)) - 1)) as vertex_geom
  FROM surveyor_surveyor_kuda.land_parcels
  WHERE stand = '1465'
),
coord_points AS (
  SELECT name, geom, ST_Y(geom) as y, ST_X(geom) as x
  FROM surveyor_surveyor_kuda.coordinate_points
  WHERE name IN ('1465A', '1466A', '1465C', '1465D', '1465E', '1465F')
)
SELECT 
  pv.vertex_num,
  ST_Y(pv.vertex_geom) as vertex_y,
  ST_X(pv.vertex_geom) as vertex_x,
  cp.name as nearest_point,
  cp.y as point_y,
  cp.x as point_x,
  ST_Distance(pv.vertex_geom, cp.geom) as distance_meters,
  CASE 
    WHEN ST_Distance(pv.vertex_geom, cp.geom) > 1000 THEN 'COORDINATE SYSTEM MISMATCH'
    WHEN ST_Distance(pv.vertex_geom, cp.geom) <= 2 THEN 'MATCH'
    ELSE 'POSSIBLE MATCH'
  END as status
FROM parcel_vertices pv
CROSS JOIN LATERAL (
  SELECT name, geom, y, x
  FROM coord_points
  ORDER BY pv.vertex_geom <-> geom
  LIMIT 1
) cp
ORDER BY pv.vertex_num;

-- 5. Check geometry_columns metadata
SELECT 
  f_table_schema,
  f_table_name,
  f_geometry_column,
  coord_dimension,
  srid,
  type
FROM geometry_columns
WHERE f_table_schema = 'surveyor_surveyor_kuda'
  AND f_table_name IN ('land_parcels', 'coordinate_points');
