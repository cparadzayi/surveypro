-- Migration 080 Undo: Remove area columns

BEGIN;

DO $$
DECLARE
  schema_rec RECORD;
BEGIN
  RAISE NOTICE 'Undoing Migration 080: Removing area columns';
  
  -- PUBLIC SCHEMA
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'land_parcels'
  ) THEN
    ALTER TABLE public.land_parcels DROP COLUMN IF EXISTS area_m2 CASCADE;
    ALTER TABLE public.land_parcels DROP COLUMN IF EXISTS area_ha CASCADE;
    ALTER TABLE public.land_parcels DROP COLUMN IF EXISTS perimeter_m CASCADE;
    ALTER TABLE public.land_parcels DROP COLUMN IF EXISTS area_calculated CASCADE;
    RAISE NOTICE 'Removed area columns from public.land_parcels';
  END IF;
  
  -- SURVEYOR SCHEMAS
  FOR schema_rec IN 
    SELECT schema_name 
    FROM information_schema.schemata 
    WHERE schema_name LIKE 'surveyor_%'
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = schema_rec.schema_name 
      AND table_name = 'land_parcels'
    ) THEN
      EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS area_m2 CASCADE', schema_rec.schema_name);
      EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS area_ha CASCADE', schema_rec.schema_name);
      EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS perimeter_m CASCADE', schema_rec.schema_name);
      EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS area_calculated CASCADE', schema_rec.schema_name);
      RAISE NOTICE 'Removed area columns from %.land_parcels', schema_rec.schema_name;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Migration 080 undone successfully';
END $$;

COMMIT;
