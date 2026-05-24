-- Force regenerate metadata for all parcels in project 5
-- This clears existing metadata and regenerates with correct south-oriented bearings

-- Step 1: Clear existing metadata for all parcels in project 5
UPDATE land_parcels
SET metadata = NULL
WHERE project_id = 5;

-- Step 2: Regenerate metadata for all parcels
SELECT * FROM update_parcels_with_missing_metadata(5);

-- Step 3: Verify the regenerated metadata
SELECT 
  id,
  stand,
  jsonb_array_length(metadata->'residuals'->'edges') as edge_count,
  (metadata->'residuals'->'edges'->0->>'bearingDeg')::numeric as first_bearing,
  metadata->'residuals'->'edges'->0 ? 'from' as has_from,
  metadata->'residuals'->'edges'->0 ? 'to' as has_to
FROM land_parcels
WHERE project_id = 5
ORDER BY stand;

-- Step 4: Show sample edge for parcel 2474 to verify south-oriented bearing
SELECT 
  stand,
  jsonb_pretty(metadata->'residuals'->'edges'->0) as first_edge,
  jsonb_pretty(metadata->'residuals'->'edges'->1) as second_edge
FROM land_parcels
WHERE project_id = 5
  AND stand = '2474';
