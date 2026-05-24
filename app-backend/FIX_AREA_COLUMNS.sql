-- ============================================================================
-- FIX: Add area columns to land_parcels as regular (non-generated) columns
-- ============================================================================
--
-- PROBLEM: 
-- - Migration 073 removed generated columns for QGIS compatibility
-- - Migration 079 added them back as generated columns in new schemas
-- - Backend code tries to write to these columns, causing HTTP 500 errors
-- - Error: column "area_m2" of relation "land_parcels" does not exist
--
-- SOLUTION:
-- - Add area_m2, area_ha, perimeter_m as regular NUMERIC columns
-- - Backend will compute and store values explicitly
-- - This allows QGIS compatibility AND backend updates
--
-- RUN THIS SCRIPT:
-- psql -U postgres -d surveypro_db -f FIX_AREA_COLUMNS.sql
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

\echo ''
\echo '========================================'
\echo 'Fixing land_parcels area columns'
\echo '========================================'
\echo ''

DO $$
DECLARE
  schema_rec RECORD;
  column_exists BOOLEAN;
BEGIN
  
  -- ============================================================================
  -- PUBLIC SCHEMA
  -- ============================================================================
  
  RAISE NOTICE 'Processing schema: public';
  
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'land_parcels'
  ) THEN
    
    -- Check and add area_m2
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'land_parcels' 
      AND column_name = 'area_m2'
    ) INTO column_exists;
    
    IF NOT column_exists THEN
      ALTER TABLE public.land_parcels ADD COLUMN area_m2 NUMERIC(12, 2);
      RAISE NOTICE '  ✅ Added area_m2';
    ELSE
      RAISE NOTICE '  ⏭️  area_m2 already exists';
    END IF;
    
    -- Check and add area_ha
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'land_parcels' 
      AND column_name = 'area_ha'
    ) INTO column_exists;
    
    IF NOT column_exists THEN
      ALTER TABLE public.land_parcels ADD COLUMN area_ha NUMERIC(12, 4);
      RAISE NOTICE '  ✅ Added area_ha';
    ELSE
      RAISE NOTICE '  ⏭️  area_ha already exists';
    END IF;
    
    -- Check and add perimeter_m
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'land_parcels' 
      AND column_name = 'perimeter_m'
    ) INTO column_exists;
    
    IF NOT column_exists THEN
      ALTER TABLE public.land_parcels ADD COLUMN perimeter_m NUMERIC(12, 2);
      RAISE NOTICE '  ✅ Added perimeter_m';
    ELSE
      RAISE NOTICE '  ⏭️  perimeter_m already exists';
    END IF;
    
    -- Check and add area_calculated
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'land_parcels' 
      AND column_name = 'area_calculated'
    ) INTO column_exists;
    
    IF NOT column_exists THEN
      ALTER TABLE public.land_parcels ADD COLUMN area_calculated BOOLEAN DEFAULT FALSE;
      RAISE NOTICE '  ✅ Added area_calculated';
    ELSE
      RAISE NOTICE '  ⏭️  area_calculated already exists';
    END IF;
    
  ELSE
    RAISE NOTICE '  ⏭️  No land_parcels table in public schema';
  END IF;
  
  RAISE NOTICE '';
  
  -- ============================================================================
  -- SURVEYOR SCHEMAS
  -- ============================================================================
  
  FOR schema_rec IN 
    SELECT schema_name 
    FROM information_schema.schemata 
    WHERE schema_name LIKE 'surveyor_%'
    ORDER BY schema_name
  LOOP
    RAISE NOTICE 'Processing schema: %', schema_rec.schema_name;
    
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = schema_rec.schema_name 
      AND table_name = 'land_parcels'
    ) THEN
      
      -- Drop generated columns if they exist (from migration 079)
      EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS area_m2 CASCADE', schema_rec.schema_name);
      EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS area_ha CASCADE', schema_rec.schema_name);
      EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS perimeter_m CASCADE', schema_rec.schema_name);
      
      -- Add as regular columns
      EXECUTE format('ALTER TABLE %I.land_parcels ADD COLUMN IF NOT EXISTS area_m2 NUMERIC(12, 2)', schema_rec.schema_name);
      EXECUTE format('ALTER TABLE %I.land_parcels ADD COLUMN IF NOT EXISTS area_ha NUMERIC(12, 4)', schema_rec.schema_name);
      EXECUTE format('ALTER TABLE %I.land_parcels ADD COLUMN IF NOT EXISTS perimeter_m NUMERIC(12, 2)', schema_rec.schema_name);
      EXECUTE format('ALTER TABLE %I.land_parcels ADD COLUMN IF NOT EXISTS area_calculated BOOLEAN DEFAULT FALSE', schema_rec.schema_name);
      
      RAISE NOTICE '  ✅ Fixed area columns (removed generated, added regular)';
      
    ELSE
      RAISE NOTICE '  ⏭️  No land_parcels table found';
    END IF;
    
    RAISE NOTICE '';
  END LOOP;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Fix Complete!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Area columns are now regular NUMERIC columns:';
  RAISE NOTICE '  • area_m2 NUMERIC(12, 2)';
  RAISE NOTICE '  • area_ha NUMERIC(12, 4)';
  RAISE NOTICE '  • perimeter_m NUMERIC(12, 2)';
  RAISE NOTICE '  • area_calculated BOOLEAN';
  RAISE NOTICE '';
  RAISE NOTICE 'Backend can now write to these columns ✓';
  RAISE NOTICE 'QGIS can load land_parcels table ✓';
  RAISE NOTICE 'Area calculation endpoint will work ✓';
  RAISE NOTICE '';
END $$;

COMMIT;

\echo ''
\echo '✅ Database schema fixed successfully!'
\echo ''
\echo 'Next steps:'
\echo '1. Restart your backend server'
\echo '2. Try generating the Coordinate List again'
\echo '3. Area calculations should now work'
\echo ''
