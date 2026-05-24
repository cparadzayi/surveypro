-- Check which parcels have Cape Lo points in metadata
SELECT 
  id, 
  stand,
  CASE 
    WHEN metadata->'cape_lo_points' IS NOT NULL THEN 'YES'
    ELSE 'NO'
  END as has_cape_lo_points,
  jsonb_array_length(metadata->'cape_lo_points') as point_count,
  area_m2,
  area_ha
FROM surveyor_surveyor_kuda.land_parcels 
ORDER BY id;
