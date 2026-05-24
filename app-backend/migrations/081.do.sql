-- Migration 081: Add centroid and closure error columns to land_parcels
-- These columns are needed for area calculation results storage

DO $$
BEGIN
  RAISE NOTICE 'Migration 081: Adding centroid and closure error columns to land_parcels';
  
  -- Add centroid_y column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'land_parcels' 
      AND column_name = 'centroid_y'
  ) THEN
    ALTER TABLE public.land_parcels ADD COLUMN centroid_y NUMERIC(12, 3);
    RAISE NOTICE '  [OK] Added centroid_y';
  ELSE
    RAISE NOTICE '  [SKIP] centroid_y already exists';
  END IF;
  
  -- Add centroid_x column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'land_parcels' 
      AND column_name = 'centroid_x'
  ) THEN
    ALTER TABLE public.land_parcels ADD COLUMN centroid_x NUMERIC(12, 3);
    RAISE NOTICE '  [OK] Added centroid_x';
  ELSE
    RAISE NOTICE '  [SKIP] centroid_x already exists';
  END IF;
  
  -- Add closure_error_m column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'land_parcels' 
      AND column_name = 'closure_error_m'
  ) THEN
    ALTER TABLE public.land_parcels ADD COLUMN closure_error_m NUMERIC(12, 3);
    RAISE NOTICE '  [OK] Added closure_error_m';
  ELSE
    RAISE NOTICE '  [SKIP] closure_error_m already exists';
  END IF;
  
  -- Add calculation_data JSONB column if it doesn't exist (for storing full calculation results)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'land_parcels' 
      AND column_name = 'calculation_data'
  ) THEN
    ALTER TABLE public.land_parcels ADD COLUMN calculation_data JSONB;
    RAISE NOTICE '  [OK] Added calculation_data';
  ELSE
    RAISE NOTICE '  [SKIP] calculation_data already exists';
  END IF;
  
  RAISE NOTICE 'Migration 081: Complete';
END $$;

-- Add columns to surveyor schemas if they exist
DO $$
DECLARE
  schema_rec RECORD;
BEGIN
  RAISE NOTICE 'Checking surveyor schemas...';
  
  FOR schema_rec IN 
    SELECT schema_name 
    FROM information_schema.schemata 
    WHERE schema_name LIKE 'surveyor_%'
  LOOP
    RAISE NOTICE 'Processing schema: %', schema_rec.schema_name;
    
    -- Add centroid_y
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = schema_rec.schema_name 
        AND table_name = 'land_parcels' 
        AND column_name = 'centroid_y'
    ) THEN
      EXECUTE format('ALTER TABLE %I.land_parcels ADD COLUMN centroid_y NUMERIC(12, 3)', schema_rec.schema_name);
      RAISE NOTICE '  [OK] Added centroid_y to %', schema_rec.schema_name;
    END IF;
    
    -- Add centroid_x
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = schema_rec.schema_name 
        AND table_name = 'land_parcels' 
        AND column_name = 'centroid_x'
    ) THEN
      EXECUTE format('ALTER TABLE %I.land_parcels ADD COLUMN centroid_x NUMERIC(12, 3)', schema_rec.schema_name);
      RAISE NOTICE '  [OK] Added centroid_x to %', schema_rec.schema_name;
    END IF;
    
    -- Add closure_error_m
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = schema_rec.schema_name 
        AND table_name = 'land_parcels' 
        AND column_name = 'closure_error_m'
    ) THEN
      EXECUTE format('ALTER TABLE %I.land_parcels ADD COLUMN closure_error_m NUMERIC(12, 3)', schema_rec.schema_name);
      RAISE NOTICE '  [OK] Added closure_error_m to %', schema_rec.schema_name;
    END IF;
    
    -- Add calculation_data
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = schema_rec.schema_name 
        AND table_name = 'land_parcels' 
        AND column_name = 'calculation_data'
    ) THEN
      EXECUTE format('ALTER TABLE %I.land_parcels ADD COLUMN calculation_data JSONB', schema_rec.schema_name);
      RAISE NOTICE '  [OK] Added calculation_data to %', schema_rec.schema_name;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Surveyor schemas updated';
END $$;

COMMENT ON COLUMN public.land_parcels.centroid_y IS 'Centroid Y coordinate (Westing) in Cape Lo 31';
COMMENT ON COLUMN public.land_parcels.centroid_x IS 'Centroid X coordinate (Southing) in Cape Lo 31';
COMMENT ON COLUMN public.land_parcels.closure_error_m IS 'Closure error in meters from area calculation';
COMMENT ON COLUMN public.land_parcels.calculation_data IS 'Full area calculation results (JSONB)';
