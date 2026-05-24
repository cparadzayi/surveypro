-- Debug script to identify why trigger isn't generating metadata

-- STEP 1: Check if trigger exists
SELECT 
  trigger_name, 
  event_manipulation, 
  event_object_table,
  action_statement
FROM information_schema.triggers 
WHERE event_object_table = 'land_parcels'
  AND trigger_schema = 'surveyor_surveyor_kuda';

-- STEP 2: Check if function exists
SELECT proname, prosrc 
FROM pg_proc 
WHERE proname = 'generate_parcel_metadata_trigger';

-- STEP 3: Check current metadata state for parcel 2474
SELECT 
  id,
  stand,
  metadata,
  ST_AsText(geom) as geom_wkt,
  ST_NPoints(geom) as point_count
FROM surveyor_surveyor_kuda.land_parcels 
WHERE stand = '2474' AND project_id = 5;

-- STEP 4: Manually test the trigger function
DO $$
DECLARE
  test_parcel RECORD;
  result RECORD;
BEGIN
  -- Get the parcel
  SELECT * INTO test_parcel 
  FROM surveyor_surveyor_kuda.land_parcels 
  WHERE stand = '2474' AND project_id = 5;
  
  -- Simulate trigger execution
  RAISE NOTICE 'Parcel ID: %, Stand: %', test_parcel.id, test_parcel.stand;
  RAISE NOTICE 'Geometry exists: %', (test_parcel.geom IS NOT NULL);
  RAISE NOTICE 'Point count: %', ST_NPoints(test_parcel.geom);
END $$;

-- STEP 5: Force trigger to fire by updating geometry
UPDATE surveyor_surveyor_kuda.land_parcels 
SET geom = geom 
WHERE stand = '2474' AND project_id = 5;

-- STEP 6: Verify metadata was generated
SELECT 
  id,
  stand,
  jsonb_pretty(metadata) as metadata_pretty,
  (metadata->'residuals'->'edges'->0->>'bearingDeg')::numeric as first_bearing,
  (metadata->'residuals'->'edges'->0->>'distance')::numeric as first_distance
FROM surveyor_surveyor_kuda.land_parcels 
WHERE stand = '2474' AND project_id = 5;
