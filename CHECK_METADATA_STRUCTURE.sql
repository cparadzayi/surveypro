-- Check the full metadata structure for parcel 2474
SELECT 
  stand,
  jsonb_pretty(metadata) as full_metadata
FROM land_parcels
WHERE project_id = 5
  AND stand = '2474';

-- Check if the function exists and works
SELECT generate_parcel_metadata(63);
