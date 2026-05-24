-- Verify the coordinate fix worked
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
  ROUND(ST_Y(pv.vertex_geom)::numeric, 2) as vertex_y,
  ROUND(ST_X(pv.vertex_geom)::numeric, 2) as vertex_x,
  cp.name as matched_point,
  ROUND(ST_Y(cp.geom)::numeric, 2) as point_y,
  ROUND(ST_X(cp.geom)::numeric, 2) as point_x,
  ROUND(ST_Distance(pv.vertex_geom, cp.geom)::numeric, 3) as distance_m,
  CASE 
    WHEN ST_Distance(pv.vertex_geom, cp.geom) <= 0.5 THEN 'PERFECT'
    WHEN ST_Distance(pv.vertex_geom, cp.geom) <= 2.0 THEN 'GOOD'
    ELSE 'NO_MATCH'
  END as match_status
FROM parcel_vertices pv
CROSS JOIN LATERAL (
  SELECT name, geom
  FROM coord_points
  ORDER BY pv.vertex_geom <-> geom
  LIMIT 1
) cp
ORDER BY pv.vertex_num;
