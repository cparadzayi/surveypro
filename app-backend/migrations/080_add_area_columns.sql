-- Migration 080: Add area columns as regular (non-generated) columns
--
-- PROBLEM: Migration 073 removed generated columns for QGIS compatibility
--          Migration 079 added them back as generated columns in new schemas
--          Backend code tries to write to these columns, causing errors
--
-- SOLUTION: Add area_m2, area_ha, perimeter_m as regular NUMERIC columns
--           Backend will compute and store values explicitly
--           This allows QGIS compatibility AND backend updates

BEGIN;

DO $$
DECLARE
  schema_rec RECORD;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 080: Add Area Columns';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Adding area_m2, area_ha, perimeter_m as regular columns';
  RAISE NOTICE 'Backend will compute and store values explicitly';
  RAISE NOTICE '';
  
  -- ============================================================================
  -- PUBLIC SCHEMA
  -- ============================================================================
  
  RAISE NOTICE 'Processing schema: public';
  
  -- Check if land_parcels table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'land_parcels'
  ) THEN
    
    -- Add area_m2 if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'land_parcels' 
      AND column_name = 'area_m2'
    ) THEN
      ALTER TABLE public.land_parcels ADD COLUMN area_m2 NUMERIC(12, 2);
      RAISE NOTICE '  [OK] Added area_m2';
    ELSE
      RAISE NOTICE '  [SKIP] area_m2 already exists';
    END IF;
    
    -- Add area_ha if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'land_parcels' 
      AND column_name = 'area_ha'
    ) THEN
      ALTER TABLE public.land_parcels ADD COLUMN area_ha NUMERIC(12, 4);
      RAISE NOTICE '  [OK] Added area_ha';
    ELSE
      RAISE NOTICE '  [SKIP] area_ha already exists';
    END IF;
    
    -- Add perimeter_m if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'land_parcels' 
      AND column_name = 'perimeter_m'
    ) THEN
      ALTER TABLE public.land_parcels ADD COLUMN perimeter_m NUMERIC(12, 2);
      RAISE NOTICE '  [OK] Added perimeter_m';
    ELSE
      RAISE NOTICE '  [SKIP] perimeter_m already exists';
    END IF;
    
    -- Add area_calculated if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'land_parcels' 
      AND column_name = 'area_calculated'
    ) THEN
      ALTER TABLE public.land_parcels ADD COLUMN area_calculated BOOLEAN DEFAULT FALSE;
      RAISE NOTICE '  [OK] Added area_calculated';
    ELSE
      RAISE NOTICE '  [SKIP] area_calculated already exists';
    END IF;
    
  ELSE
    RAISE NOTICE '  [SKIP] No land_parcels table found';
  END IF;
  
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
      
      -- Drop generated columns if they exist (from migration 079)
      EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS area_m2 CASCADE', schema_rec.schema_name);
      EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS area_ha CASCADE', schema_rec.schema_name);
      EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS perimeter_m CASCADE', schema_rec.schema_name);
      
      -- Add as regular columns
      EXECUTE format('ALTER TABLE %I.land_parcels ADD COLUMN IF NOT EXISTS area_m2 NUMERIC(12, 2)', schema_rec.schema_name);
      EXECUTE format('ALTER TABLE %I.land_parcels ADD COLUMN IF NOT EXISTS area_ha NUMERIC(12, 4)', schema_rec.schema_name);
      EXECUTE format('ALTER TABLE %I.land_parcels ADD COLUMN IF NOT EXISTS perimeter_m NUMERIC(12, 2)', schema_rec.schema_name);
      EXECUTE format('ALTER TABLE %I.land_parcels ADD COLUMN IF NOT EXISTS area_calculated BOOLEAN DEFAULT FALSE', schema_rec.schema_name);
      
      RAISE NOTICE '  [OK] Added area columns as regular (non-generated) columns';
      
    ELSE
      RAISE NOTICE '  [SKIP] No land_parcels table found';
    END IF;
    
    RAISE NOTICE '';
  END LOOP;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 080 Complete!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Area columns added as regular NUMERIC columns:';
  RAISE NOTICE '- area_m2 NUMERIC(12, 2)';
  RAISE NOTICE '- area_ha NUMERIC(12, 4)';
  RAISE NOTICE '- perimeter_m NUMERIC(12, 2)';
  RAISE NOTICE '- area_calculated BOOLEAN';
  RAISE NOTICE '';
  RAISE NOTICE 'Backend will compute and store values explicitly';
  RAISE NOTICE 'QGIS can now load and edit land_parcels table!';
  RAISE NOTICE '';
END $$;

COMMIT;
