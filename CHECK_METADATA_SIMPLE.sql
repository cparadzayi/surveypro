-- Simple check of what's in the metadata for parcels in project 5

-- Check parcel 2474 specifically
SELECT 
  id,
  stand,
  metadata->'residuals'->'edges'->0->>'bearingDeg' as first_bearing,
  metadata->'residuals'->'edges'->0->>'distance' as first_distance,
  metadata->'residuals'->'edges'->0->'from'->>'y' as from_y,
  metadata->'residuals'->'edges'->0->'from'->>'x' as from_x,
  metadata->'residuals'->'edges'->0->'to'->>'y' as to_y,
  metadata->'residuals'->'edges'->0->'to'->>'x' as to_x
FROM land_parcels
WHERE project_id = 5
  AND stand IN ('2474', '2475', '2476')
ORDER BY stand;

-- Check if metadata exists at all
SELECT 
  stand,
  metadata IS NOT NULL as has_metadata,
  metadata ? 'residuals' as has_residuals,
  metadata->'residuals' ? 'edges' as has_edges
FROM land_parcels
WHERE project_id = 5
ORDER BY stand;
