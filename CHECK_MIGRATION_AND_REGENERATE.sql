-- Step 1: Check if migration 058 was applied
SELECT * FROM migrations_history WHERE migration_name = '058.do.sql';

-- Step 2: Check if the function exists and test it in surveyor_kuda schema
SELECT surveyor_kuda.generate_parcel_metadata(63) as test_metadata;

-- Step 3: Clear existing metadata for project 5 in surveyor_kuda
UPDATE surveyor_kuda.land_parcels SET metadata = NULL WHERE project_id = 5;

-- Step 4: Regenerate metadata for all parcels in project 5
DO $$
DECLARE
  parcel_record RECORD;
BEGIN
  FOR parcel_record IN 
    SELECT id, stand FROM surveyor_kuda.land_parcels WHERE project_id = 5
  LOOP
    BEGIN
      UPDATE surveyor_kuda.land_parcels
      SET metadata = surveyor_kuda.generate_parcel_metadata(parcel_record.id)
      WHERE id = parcel_record.id;
      RAISE NOTICE 'Updated parcel %: %', parcel_record.id, parcel_record.stand;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Failed to update parcel %: %', parcel_record.id, SQLERRM;
    END;
  END LOOP;
END $$;

-- Step 5: Verify the results
SELECT 
  stand,
  (metadata->'residuals'->'edges'->0->>'bearingDeg')::numeric as first_bearing,
  metadata->'residuals'->'edges'->0->>'distance' as first_distance,
  jsonb_pretty(metadata->'residuals'->'edges'->0) as first_edge_details
FROM surveyor_kuda.land_parcels
WHERE project_id = 5
  AND stand IN ('2474', '2475', '2476')
ORDER BY stand;
