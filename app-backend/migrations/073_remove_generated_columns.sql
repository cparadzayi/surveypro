-- Migration 073: Remove Generated Columns from Land Parcels
--
-- PROBLEM: Generated columns prevent QGIS from loading land_parcels table
-- SOLUTION: Drop generated columns, compute values on-demand in backend/queries
--
-- Rationale:
-- 1. QGIS compatibility is critical
-- 2. Small dataset (hundreds of parcels, not millions)
-- 3. ST_Area() and ST_Perimeter() are fast enough
-- 4. Backend can compute on-demand when needed
-- 5. Simpler schema = fewer issues

BEGIN;

DO $$
DECLARE
  schema_rec RECORD;
  has_area_m2 BOOLEAN;
  has_area_ha BOOLEAN;
  has_perimeter_m BOOLEAN;
  has_centroid_y BOOLEAN;
  has_centroid_x BOOLEAN;
  has_closure_error BOOLEAN;
  has_closure_ratio BOOLEAN;
  has_area_calculated BOOLEAN;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 073: Remove Generated Columns';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Dropping generated columns from land_parcels';
  RAISE NOTICE 'Values will be computed on-demand instead';
  RAISE NOTICE '';
  
  -- ============================================================================
  -- PUBLIC SCHEMA
  -- ============================================================================
  
  RAISE NOTICE 'Processing schema: public';
  
  -- Check which columns exist
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'land_parcels' AND column_name = 'area_m2'
  ) INTO has_area_m2;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'land_parcels' AND column_name = 'area_ha'
  ) INTO has_area_ha;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'land_parcels' AND column_name = 'perimeter_m'
  ) INTO has_perimeter_m;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'land_parcels' AND column_name = 'centroid_y'
  ) INTO has_centroid_y;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'land_parcels' AND column_name = 'centroid_x'
  ) INTO has_centroid_x;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'land_parcels' AND column_name = 'closure_error_m'
  ) INTO has_closure_error;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'land_parcels' AND column_name = 'closure_ratio'
  ) INTO has_closure_ratio;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'land_parcels' AND column_name = 'area_calculated'
  ) INTO has_area_calculated;
  
  -- Drop generated columns if they exist
  IF has_area_m2 THEN
    ALTER TABLE public.land_parcels DROP COLUMN IF EXISTS area_m2 CASCADE;
    RAISE NOTICE '  [OK] Dropped area_m2';
  END IF;
  
  IF has_area_ha THEN
    ALTER TABLE public.land_parcels DROP COLUMN IF EXISTS area_ha CASCADE;
    RAISE NOTICE '  [OK] Dropped area_ha';
  END IF;
  
  IF has_perimeter_m THEN
    ALTER TABLE public.land_parcels DROP COLUMN IF EXISTS perimeter_m CASCADE;
    RAISE NOTICE '  [OK] Dropped perimeter_m';
  END IF;
  
  IF has_centroid_y THEN
    ALTER TABLE public.land_parcels DROP COLUMN IF EXISTS centroid_y CASCADE;
    RAISE NOTICE '  [OK] Dropped centroid_y';
  END IF;
  
  IF has_centroid_x THEN
    ALTER TABLE public.land_parcels DROP COLUMN IF EXISTS centroid_x CASCADE;
    RAISE NOTICE '  [OK] Dropped centroid_x';
  END IF;
  
  IF has_closure_error THEN
    ALTER TABLE public.land_parcels DROP COLUMN IF EXISTS closure_error_m CASCADE;
    RAISE NOTICE '  [OK] Dropped closure_error_m';
  END IF;
  
  IF has_closure_ratio THEN
    ALTER TABLE public.land_parcels DROP COLUMN IF EXISTS closure_ratio CASCADE;
    RAISE NOTICE '  [OK] Dropped closure_ratio';
  END IF;
  
  IF has_area_calculated THEN
    ALTER TABLE public.land_parcels DROP COLUMN IF EXISTS area_calculated CASCADE;
    RAISE NOTICE '  [OK] Dropped area_calculated';
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
      
      -- Drop generated columns
      EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS area_m2 CASCADE', schema_rec.schema_name);
      EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS area_ha CASCADE', schema_rec.schema_name);
      EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS perimeter_m CASCADE', schema_rec.schema_name);
      EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS centroid_y CASCADE', schema_rec.schema_name);
      EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS centroid_x CASCADE', schema_rec.schema_name);
      EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS closure_error_m CASCADE', schema_rec.schema_name);
      EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS closure_ratio CASCADE', schema_rec.schema_name);
      EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS area_calculated CASCADE', schema_rec.schema_name);
      
      RAISE NOTICE '  [OK] Dropped generated columns';
      
    ELSE
      RAISE NOTICE '  [SKIP] No land_parcels table found';
    END IF;
    
    RAISE NOTICE '';
  END LOOP;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 073 Complete!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Simplified land_parcels schema:';
  RAISE NOTICE '- id (primary key)';
  RAISE NOTICE '- project_id';
  RAISE NOTICE '- stand';
  RAISE NOTICE '- designation';
  RAISE NOTICE '- geom (EPSG:22291)';
  RAISE NOTICE '- owner, title_deed, survey_date, surveyor';
  RAISE NOTICE '- notes, status, digitized_by';
  RAISE NOTICE '- metadata (JSONB)';
  RAISE NOTICE '- created_at, updated_at';
  RAISE NOTICE '';
  RAISE NOTICE 'Computed on-demand:';
  RAISE NOTICE '- area_m2 = ST_Area(geom)';
  RAISE NOTICE '- area_ha = ST_Area(geom) / 10000';
  RAISE NOTICE '- perimeter_m = ST_Perimeter(geom)';
  RAISE NOTICE '- centroid_y = ST_Y(ST_Centroid(geom))';
  RAISE NOTICE '- centroid_x = ST_X(ST_Centroid(geom))';
  RAISE NOTICE '';
  RAISE NOTICE 'QGIS should now load land_parcels table!';
  RAISE NOTICE '';
END $$;

COMMIT;
