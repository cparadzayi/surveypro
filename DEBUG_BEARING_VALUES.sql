-- Debug bearing values for parcel 2474 to see what's stored vs what should be displayed

SELECT 
  stand,
  jsonb_pretty(metadata->'residuals'->'edges') as all_edges
FROM land_parcels
WHERE project_id = 5
  AND stand = '2474';

-- Show each edge separately with from/to coordinates
SELECT 
  stand,
  edge_index,
  (edge->>'bearingDeg')::numeric as bearing_deg,
  edge->>'distance' as distance,
  jsonb_pretty(edge->'from') as from_coord,
  jsonb_pretty(edge->'to') as to_coord
FROM land_parcels,
  jsonb_array_elements(metadata->'residuals'->'edges') WITH ORDINALITY AS t(edge, edge_index)
WHERE project_id = 5
  AND stand = '2474'
ORDER BY edge_index;
