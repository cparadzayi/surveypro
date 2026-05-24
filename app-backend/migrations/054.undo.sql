-- Migration 054 Rollback: Remove Auto-Calculate Triggers from Surveyor Schemas

BEGIN;

DO $$
DECLARE
  schema_rec RECORD;
  trigger_count INT := 0;
BEGIN
  RAISE NOTICE '[INFO] Removing auto-calculate triggers from surveyor schemas...';
  RAISE NOTICE '';
  
  -- Loop through all surveyor schemas
  FOR schema_rec IN 
    SELECT schema_name 
    FROM information_schema.schemata 
    WHERE schema_name LIKE 'surveyor_%'
    ORDER BY schema_name
  LOOP
    -- Check if trigger exists
    IF EXISTS (
      SELECT 1 
      FROM information_schema.triggers 
      WHERE trigger_schema = schema_rec.schema_name 
      AND trigger_name = 'land_parcel_auto_calculate'
    ) THEN
      
      -- Drop the trigger
      EXECUTE format(
        'DROP TRIGGER IF EXISTS land_parcel_auto_calculate ON %I.land_parcels',
        schema_rec.schema_name
      );
      
      trigger_count := trigger_count + 1;
      RAISE NOTICE '[OK] Removed trigger from schema: %', schema_rec.schema_name;
      
    END IF;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '===========================================================';
  RAISE NOTICE '[SUCCESS] Migration 054 Rolled Back';
  RAISE NOTICE '===========================================================';
  RAISE NOTICE 'Removed % triggers from surveyor schemas', trigger_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Note: Existing calculated area values are preserved.';
  RAISE NOTICE 'You will need to manually call /calculate-areas endpoint';
  RAISE NOTICE 'after geometry updates.';
  RAISE NOTICE '===========================================================';
END $$;

COMMIT;
