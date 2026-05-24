-- Migration 054: Add Auto-Calculate Trigger to All Surveyor Schemas
-- Purpose: Apply the auto_calculate_parcel_metrics trigger to all surveyor schemas
-- This ensures area calculation works for all surveyors in multi-tenant setup

BEGIN;

-- ============================================================================
-- 1. CREATE TRIGGER FOR EACH SURVEYOR SCHEMA
-- ============================================================================

DO $$
DECLARE
  schema_rec RECORD;
  trigger_count INT := 0;
BEGIN
  RAISE NOTICE '[INFO] Adding auto-calculate trigger to surveyor schemas...';
  RAISE NOTICE '';
  
  -- Loop through all schemas that start with 'surveyor_'
  FOR schema_rec IN 
    SELECT schema_name 
    FROM information_schema.schemata 
    WHERE schema_name LIKE 'surveyor_%'
    ORDER BY schema_name
  LOOP
    -- Check if land_parcels table exists in this schema
    IF EXISTS (
      SELECT 1 
      FROM information_schema.tables 
      WHERE table_schema = schema_rec.schema_name 
      AND table_name = 'land_parcels'
    ) THEN
      
      -- Check if trigger already exists
      IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.triggers 
        WHERE trigger_schema = schema_rec.schema_name 
        AND trigger_name = 'land_parcel_auto_calculate'
        AND event_object_table = 'land_parcels'
      ) THEN
        
        -- Create the trigger
        EXECUTE format(
          'CREATE TRIGGER land_parcel_auto_calculate
           BEFORE INSERT OR UPDATE OF geom ON %I.land_parcels
           FOR EACH ROW
           EXECUTE FUNCTION auto_calculate_parcel_metrics()',
          schema_rec.schema_name
        );
        
        trigger_count := trigger_count + 1;
        RAISE NOTICE '[OK] Created trigger for schema: %', schema_rec.schema_name;
        
      ELSE
        RAISE NOTICE '[SKIP] Trigger already exists for schema: %', schema_rec.schema_name;
      END IF;
      
    ELSE
      RAISE NOTICE '[SKIP] No land_parcels table in schema: %', schema_rec.schema_name;
    END IF;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '[SUCCESS] Created % triggers', trigger_count;
END $$;

-- ============================================================================
-- 2. BACKFILL EXISTING PARCELS IN SURVEYOR SCHEMAS
-- ============================================================================

DO $$
DECLARE
  schema_rec RECORD;
  parcel_count INT;
  total_updated INT := 0;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '[INFO] Recalculating areas for existing parcels...';
  RAISE NOTICE '';
  
  -- Loop through all surveyor schemas
  FOR schema_rec IN 
    SELECT schema_name 
    FROM information_schema.schemata 
    WHERE schema_name LIKE 'surveyor_%'
    ORDER BY schema_name
  LOOP
    -- Check if land_parcels table exists
    IF EXISTS (
      SELECT 1 
      FROM information_schema.tables 
      WHERE table_schema = schema_rec.schema_name 
      AND table_name = 'land_parcels'
    ) THEN
      
      -- Count parcels with geometry
      EXECUTE format(
        'SELECT COUNT(*) FROM %I.land_parcels WHERE geom IS NOT NULL',
        schema_rec.schema_name
      ) INTO parcel_count;
      
      IF parcel_count > 0 THEN
        -- Trigger recalculation by updating geom to itself
        EXECUTE format(
          'UPDATE %I.land_parcels SET geom = geom WHERE geom IS NOT NULL',
          schema_rec.schema_name
        );
        
        total_updated := total_updated + parcel_count;
        RAISE NOTICE '[OK] Recalculated % parcels in schema: %', parcel_count, schema_rec.schema_name;
      ELSE
        RAISE NOTICE '[SKIP] No parcels with geometry in schema: %', schema_rec.schema_name;
      END IF;
      
    END IF;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '[SUCCESS] Recalculated % total parcels across all schemas', total_updated;
END $$;

-- ============================================================================
-- 3. VERIFY RESULTS
-- ============================================================================

DO $$
DECLARE
  schema_rec RECORD;
  parcel_count INT;
  calculated_count INT;
  avg_area NUMERIC;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '===========================================================';
  RAISE NOTICE '[SUCCESS] Migration 054 Complete: Surveyor Schema Triggers';
  RAISE NOTICE '===========================================================';
  RAISE NOTICE '';
  
  -- Show statistics for each schema
  FOR schema_rec IN 
    SELECT schema_name 
    FROM information_schema.schemata 
    WHERE schema_name LIKE 'surveyor_%'
    ORDER BY schema_name
  LOOP
    IF EXISTS (
      SELECT 1 
      FROM information_schema.tables 
      WHERE table_schema = schema_rec.schema_name 
      AND table_name = 'land_parcels'
    ) THEN
      
      -- Get statistics (handle missing area_calculated column)
      BEGIN
        EXECUTE format(
          'SELECT 
            COUNT(*),
            COUNT(*) FILTER (WHERE area_calculated = TRUE),
            ROUND(AVG(area_ha)::NUMERIC, 4)
           FROM %I.land_parcels 
           WHERE geom IS NOT NULL',
          schema_rec.schema_name
        ) INTO parcel_count, calculated_count, avg_area;
      EXCEPTION
        WHEN undefined_column THEN
          -- area_calculated column doesn't exist, just count parcels
          EXECUTE format(
            'SELECT 
              COUNT(*),
              COUNT(*) FILTER (WHERE area_ha IS NOT NULL),
              ROUND(AVG(area_ha)::NUMERIC, 4)
             FROM %I.land_parcels 
             WHERE geom IS NOT NULL',
            schema_rec.schema_name
          ) INTO parcel_count, calculated_count, avg_area;
      END;
      
      IF parcel_count > 0 THEN
        RAISE NOTICE 'Schema: %', schema_rec.schema_name;
        RAISE NOTICE '  Total Parcels: %', parcel_count;
        RAISE NOTICE '  Calculated: %', calculated_count;
        RAISE NOTICE '  Avg Area: % ha', COALESCE(avg_area, 0);
        RAISE NOTICE '';
      END IF;
      
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Features:';
  RAISE NOTICE '  [OK] Automatic area calculation for all surveyor schemas';
  RAISE NOTICE '  [OK] Triggers fire on INSERT/UPDATE of geom column';
  RAISE NOTICE '  [OK] Multi-tenant isolation maintained';
  RAISE NOTICE '===========================================================';
END $$;

COMMIT;
