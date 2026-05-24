-- Migration 052 UNDO: Remove land_parcels_qgis views

BEGIN;

DO $$
DECLARE
  schema_rec RECORD;
BEGIN
  RAISE NOTICE '⚠️  Removing land_parcels_qgis views...';
  
  -- Loop through all surveyor schemas
  FOR schema_rec IN 
    SELECT schema_name 
    FROM surveyor_profiles 
    WHERE schema_name IS NOT NULL
    ORDER BY schema_name
  LOOP
    RAISE NOTICE '📂 Dropping view in schema: %', schema_rec.schema_name;
    EXECUTE format('DROP VIEW IF EXISTS %I.land_parcels_qgis CASCADE', schema_rec.schema_name);
  END LOOP;
  
  -- Drop the helper function
  DROP FUNCTION IF EXISTS create_land_parcels_qgis_view(TEXT);
  
  RAISE NOTICE '✅ Migration 052 reverted successfully';
  RAISE NOTICE '⚠️  Remember: You must now use land_parcels table directly in QGIS';
  RAISE NOTICE '⚠️  But this will fail with GENERATED ALWAYS columns!';
  
END $$;

COMMIT;
