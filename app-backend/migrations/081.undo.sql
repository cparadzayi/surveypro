-- Migration 081 UNDO: Remove centroid and closure error columns from land_parcels

DO $$
BEGIN
  RAISE NOTICE 'Migration 081 UNDO: Removing centroid and closure error columns';
  
  -- Remove columns from public schema
  ALTER TABLE public.land_parcels DROP COLUMN IF EXISTS centroid_y CASCADE;
  ALTER TABLE public.land_parcels DROP COLUMN IF EXISTS centroid_x CASCADE;
  ALTER TABLE public.land_parcels DROP COLUMN IF EXISTS closure_error_m CASCADE;
  ALTER TABLE public.land_parcels DROP COLUMN IF EXISTS calculation_data CASCADE;
  
  RAISE NOTICE 'Migration 081 UNDO: Complete for public schema';
END $$;

-- Remove from surveyor schemas
DO $$
DECLARE
  schema_rec RECORD;
BEGIN
  FOR schema_rec IN 
    SELECT schema_name 
    FROM information_schema.schemata 
    WHERE schema_name LIKE 'surveyor_%'
  LOOP
    EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS centroid_y CASCADE', schema_rec.schema_name);
    EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS centroid_x CASCADE', schema_rec.schema_name);
    EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS closure_error_m CASCADE', schema_rec.schema_name);
    EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS calculation_data CASCADE', schema_rec.schema_name);
    RAISE NOTICE 'Removed columns from %', schema_rec.schema_name;
  END LOOP;
END $$;
