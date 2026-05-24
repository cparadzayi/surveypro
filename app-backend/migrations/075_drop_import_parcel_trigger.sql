-- Migration 075: Drop Import Has Parcels Trigger
--
-- PROBLEM: Trigger trying to reference non-existent import_id field
-- SOLUTION: Drop the update_import_has_parcels trigger and function

BEGIN;

DO $$
DECLARE
  schema_rec RECORD;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 075: Drop Import Trigger';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  
  -- ============================================================================
  -- PUBLIC SCHEMA
  -- ============================================================================
  
  RAISE NOTICE 'Processing schema: public';
  
  -- Drop trigger
  DROP TRIGGER IF EXISTS update_import_has_parcels_trigger ON public.land_parcels;
  DROP TRIGGER IF EXISTS land_parcels_import_trigger ON public.land_parcels;
  
  -- Drop function
  DROP FUNCTION IF EXISTS public.update_import_has_parcels() CASCADE;
  
  RAISE NOTICE '  [OK] Dropped import triggers and functions';
  RAISE NOTICE '';
  
  -- ============================================================================
  -- SURVEYOR SCHEMAS
  -- ============================================================================
  
  FOR schema_rec IN 
    SELECT schema_name 
    FROM information_schema.schemata 
    WHERE schema_name LIKE 'surveyor_%'
  LOOP
    RAISE NOTICE 'Processing schema: %', schema_rec.schema_name;
    
    -- Check if land_parcels table exists
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = schema_rec.schema_name 
      AND table_name = 'land_parcels'
    ) THEN
      
      -- Drop triggers
      EXECUTE format('DROP TRIGGER IF EXISTS update_import_has_parcels_trigger ON %I.land_parcels', schema_rec.schema_name);
      EXECUTE format('DROP TRIGGER IF EXISTS land_parcels_import_trigger ON %I.land_parcels', schema_rec.schema_name);
      
      -- Drop functions
      EXECUTE format('DROP FUNCTION IF EXISTS %I.update_import_has_parcels() CASCADE', schema_rec.schema_name);
      
      RAISE NOTICE '  [OK] Dropped import triggers and functions';
      
    ELSE
      RAISE NOTICE '  [SKIP] No land_parcels table found';
    END IF;
    
    RAISE NOTICE '';
  END LOOP;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 075 Complete!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Import tracking trigger removed';
  RAISE NOTICE 'QGIS should now be able to insert parcels';
  RAISE NOTICE '';
END $$;

COMMIT;
