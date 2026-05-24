-- Check parcel metadata status for project 5

-- 1. List all parcels with their metadata status
SELECT 
  id,
  stand,
  metadata IS NOT NULL as has_metadata,
  metadata ? 'residuals' as has_residuals,
  metadata->'residuals' ? 'edges' as has_edges,
  jsonb_array_length(COALESCE(metadata->'residuals'->'edges', '[]'::jsonb)) as edge_count,
  jsonb_pretty(metadata->'residuals'->'edges'->0) as first_edge_sample
FROM land_parcels
WHERE project_id = 5
ORDER BY stand;

-- 2. Check if any parcels need metadata generation
SELECT 
  COUNT(*) as parcels_needing_metadata
FROM land_parcels
WHERE project_id = 5
  AND (
    metadata IS NULL 
    OR NOT (metadata ? 'residuals')
    OR NOT (metadata->'residuals' ? 'edges')
    OR jsonb_array_length(COALESCE(metadata->'residuals'->'edges', '[]'::jsonb)) = 0
  );

-- 3. Show detailed metadata for one parcel
SELECT 
  id,
  stand,
  jsonb_pretty(metadata) as metadata_full
FROM land_parcels
WHERE project_id = 5
  AND stand = '2474'
LIMIT 1;
