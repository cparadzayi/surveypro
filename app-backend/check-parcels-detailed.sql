-- Check all parcels in surveyor_surveyor_kuda schema
SELECT 
  id,
  stand,
  area_m2,
  area_ha,
  CASE 
    WHEN metadata->'cape_lo_points' IS NOT NULL THEN 'YES'
    ELSE 'NO'
  END as has_metadata_points,
  CASE 
    WHEN geom IS NOT NULL THEN 'YES'
    ELSE 'NO'
  END as has_geometry,
  ST_GeometryType(geom) as geom_type,
  ST_NPoints(geom) as point_count,
  project_id
FROM surveyor_surveyor_kuda.land_parcels 
ORDER BY id;

-- Also check the geometry coordinates for one parcel
SELECT 
  id,
  stand,
  ST_AsGeoJSON(geom) as geometry_json
FROM surveyor_surveyor_kuda.land_parcels 
WHERE id = 4
LIMIT 1;
