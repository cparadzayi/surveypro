-- Migration 051 UNDO: Revert land_parcels area columns back to regular columns
-- WARNING: This will lose the auto-calculation feature and areas will need manual updates

BEGIN;

DO $$
DECLARE
  schema_rec RECORD;
BEGIN
  RAISE NOTICE '⚠️  WARNING: Reverting GENERATED ALWAYS columns to regular columns';
  RAISE NOTICE '⚠️  Areas will NO LONGER auto-calculate from geometry';
  RAISE NOTICE '';
  
  -- Loop through all surveyor schemas
  FOR schema_rec IN 
    SELECT schema_name 
    FROM surveyor_profiles 
    WHERE schema_name IS NOT NULL
    ORDER BY schema_name
  LOOP
    RAISE NOTICE '📂 Reverting schema: %', schema_rec.schema_name;
    
    -- Drop GENERATED ALWAYS columns
    EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS area_m2', schema_rec.schema_name);
    EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS area_ha', schema_rec.schema_name);
    EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS perimeter_m', schema_rec.schema_name);
    
    -- Add regular columns (no auto-calculation)
    EXECUTE format('
      ALTER TABLE %I.land_parcels 
      ADD COLUMN area_m2 NUMERIC(12, 2),
      ADD COLUMN area_ha NUMERIC(12, 4),
      ADD COLUMN perimeter_m NUMERIC(12, 2)
    ', schema_rec.schema_name);
    
    RAISE NOTICE '✅ Reverted schema: %', schema_rec.schema_name;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  Migration 051 reverted successfully';
  RAISE NOTICE '⚠️  Remember: Areas must now be calculated manually via /land-parcels/calculate-areas endpoint';
  
END $$;

COMMIT;
