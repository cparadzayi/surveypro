-- Migration 051: Fix land_parcels area columns to use GENERATED ALWAYS
-- Purpose: Convert regular columns to auto-calculated columns in surveyor schemas
-- This fixes the issue where area_m2, area_ha, and perimeter_m were showing zero values

BEGIN;

DO $$
DECLARE
  schema_rec RECORD;
  parcel_count INTEGER;
BEGIN
  RAISE NOTICE '🔧 Starting land_parcels area column fix...';
  RAISE NOTICE '📋 This migration will convert area columns to GENERATED ALWAYS in all surveyor schemas';
  RAISE NOTICE '';
  
  -- Loop through all surveyor schemas
  FOR schema_rec IN 
    SELECT schema_name 
    FROM surveyor_profiles 
    WHERE schema_name IS NOT NULL
    ORDER BY schema_name
  LOOP
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE '📂 Processing schema: %', schema_rec.schema_name;
    
    -- Check if land_parcels table exists in this schema
    EXECUTE format('
      SELECT COUNT(*) 
      FROM information_schema.tables 
      WHERE table_schema = %L 
      AND table_name = ''land_parcels''
    ', schema_rec.schema_name) INTO parcel_count;
    
    IF parcel_count = 0 THEN
      RAISE NOTICE '⏭️  No land_parcels table found, skipping...';
      CONTINUE;
    END IF;
    
    -- Count existing parcels
    EXECUTE format('SELECT COUNT(*) FROM %I.land_parcels', schema_rec.schema_name) INTO parcel_count;
    RAISE NOTICE '📊 Found % existing parcels', parcel_count;
    
    -- Drop existing area columns (they will be recreated as GENERATED)
    RAISE NOTICE '🗑️  Dropping old area columns...';
    EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS area_m2', schema_rec.schema_name);
    EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS area_ha', schema_rec.schema_name);
    EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS perimeter_m', schema_rec.schema_name);
    
    -- Add GENERATED ALWAYS columns
    RAISE NOTICE '✨ Adding GENERATED ALWAYS columns...';
    EXECUTE format('
      ALTER TABLE %I.land_parcels 
      ADD COLUMN area_m2 NUMERIC(12, 2) GENERATED ALWAYS AS (ST_Area(geom)) STORED,
      ADD COLUMN area_ha NUMERIC(12, 4) GENERATED ALWAYS AS (ST_Area(geom) / 10000) STORED,
      ADD COLUMN perimeter_m NUMERIC(12, 2) GENERATED ALWAYS AS (ST_Perimeter(geom)) STORED
    ', schema_rec.schema_name);
    
    -- Verify the fix by checking a sample parcel
    IF parcel_count > 0 THEN
      DECLARE
        sample_area NUMERIC;
      BEGIN
        EXECUTE format('
          SELECT area_m2 
          FROM %I.land_parcels 
          WHERE geom IS NOT NULL 
          LIMIT 1
        ', schema_rec.schema_name) INTO sample_area;
        
        IF sample_area IS NOT NULL AND sample_area > 0 THEN
          RAISE NOTICE '✅ Verification passed: Sample area = % m²', sample_area;
        ELSE
          RAISE WARNING '⚠️  Verification warning: Sample area is NULL or zero';
        END IF;
      END;
    END IF;
    
    RAISE NOTICE '✅ Fixed schema: %', schema_rec.schema_name;
    RAISE NOTICE '';
  END LOOP;
  
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '🎉 Migration complete! All surveyor schemas updated successfully!';
  RAISE NOTICE '';
  RAISE NOTICE '📝 Summary:';
  RAISE NOTICE '   - Converted area_m2, area_ha, perimeter_m to GENERATED ALWAYS columns';
  RAISE NOTICE '   - Areas are now auto-calculated by PostgreSQL from geometry';
  RAISE NOTICE '   - No manual area calculation needed on INSERT/UPDATE';
  RAISE NOTICE '';
  RAISE NOTICE '🔍 To verify, run:';
  RAISE NOTICE '   SET search_path = surveyor_YOUR_USERNAME, public;';
  RAISE NOTICE '   SELECT stand, area_m2, area_ha FROM land_parcels LIMIT 5;';
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION '❌ Migration failed: %', SQLERRM;
END $$;

COMMIT;
