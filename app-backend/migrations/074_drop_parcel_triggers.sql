-- Migration 074: Drop Parcel Metric Calculation Triggers
--
-- PROBLEM: Triggers still trying to populate dropped generated columns
-- SOLUTION: Drop all triggers that reference area_m2, area_ha, perimeter_m, etc.

BEGIN;

DO $$
DECLARE
  schema_rec RECORD;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 074: Drop Parcel Triggers';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  
  -- ============================================================================
  -- PUBLIC SCHEMA
  -- ============================================================================
  
  RAISE NOTICE 'Processing schema: public';
  
  -- Drop triggers
  DROP TRIGGER IF EXISTS auto_calculate_parcel_metrics_trigger ON public.land_parcels;
  DROP TRIGGER IF EXISTS calculate_parcel_metrics_trigger ON public.land_parcels;
  DROP TRIGGER IF EXISTS update_parcel_metrics_trigger ON public.land_parcels;
  
  -- Drop trigger functions
  DROP FUNCTION IF EXISTS public.auto_calculate_parcel_metrics() CASCADE;
  DROP FUNCTION IF EXISTS public.calculate_parcel_metrics() CASCADE;
  DROP FUNCTION IF EXISTS public.update_parcel_metrics() CASCADE;
  
  RAISE NOTICE '  [OK] Dropped triggers and functions';
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
      EXECUTE format('DROP TRIGGER IF EXISTS auto_calculate_parcel_metrics_trigger ON %I.land_parcels', schema_rec.schema_name);
      EXECUTE format('DROP TRIGGER IF EXISTS calculate_parcel_metrics_trigger ON %I.land_parcels', schema_rec.schema_name);
      EXECUTE format('DROP TRIGGER IF EXISTS update_parcel_metrics_trigger ON %I.land_parcels', schema_rec.schema_name);
      
      -- Drop trigger functions
      EXECUTE format('DROP FUNCTION IF EXISTS %I.auto_calculate_parcel_metrics() CASCADE', schema_rec.schema_name);
      EXECUTE format('DROP FUNCTION IF EXISTS %I.calculate_parcel_metrics() CASCADE', schema_rec.schema_name);
      EXECUTE format('DROP FUNCTION IF EXISTS %I.update_parcel_metrics() CASCADE', schema_rec.schema_name);
      
      RAISE NOTICE '  [OK] Dropped triggers and functions';
      
    ELSE
      RAISE NOTICE '  [SKIP] No land_parcels table found';
    END IF;
    
    RAISE NOTICE '';
  END LOOP;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 074 Complete!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'All parcel metric triggers removed';
  RAISE NOTICE 'QGIS should now be able to insert parcels';
  RAISE NOTICE '';
END $$;

COMMIT;
