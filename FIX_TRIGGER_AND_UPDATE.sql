-- Complete fix: Apply trigger and update all parcels in project 5

-- STEP 1: Verify trigger exists
SELECT trigger_name FROM information_schema.triggers 
WHERE event_object_table = 'land_parcels' 
  AND trigger_schema = 'surveyor_surveyor_kuda';

-- STEP 2: Force trigger to fire for ALL parcels in project 5
-- This updates the geometry column which triggers metadata generation
UPDATE surveyor_surveyor_kuda.land_parcels 
SET geom = geom 
WHERE project_id = 5;

-- STEP 3: Verify results for all parcels
SELECT 
  id,
  stand,
  (metadata->'residuals'->'edges'->0->>'bearingDeg')::numeric as first_bearing,
  (metadata->'residuals'->'edges'->0->>'distance')::numeric as first_distance,
  (metadata->>'points_count')::integer as point_count,
  metadata->>'generated_at' as generated_at
FROM surveyor_surveyor_kuda.land_parcels 
WHERE project_id = 5
  AND stand IN ('2474', '2475', '2476')
ORDER BY stand;

-- STEP 4: Check detailed edge data for parcel 2474
SELECT 
  stand,
  jsonb_pretty(metadata->'residuals'->'edges') as edges_data
FROM surveyor_surveyor_kuda.land_parcels 
WHERE stand = '2474' AND project_id = 5;
