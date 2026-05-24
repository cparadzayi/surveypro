-- Check if area calculation columns exist
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'land_parcels' 
  AND column_name IN ('area_calculated', 'centroid_y', 'centroid_x', 'calculation_data')
ORDER BY column_name;

-- Check current parcels
SELECT id, stand, project_id, area_m2, area_calculated, centroid_y, centroid_x
FROM land_parcels
WHERE project_id = 11
LIMIT 5;
