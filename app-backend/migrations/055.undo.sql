-- Migration 055 Rollback: Remove backfilled Cape Lo points
-- This removes the cape_lo_points from metadata that were added by the backfill

BEGIN;

DO $$
DECLARE
  schema_rec RECORD;
  removed_count INT := 0;
BEGIN
  RAISE NOTICE '[INFO] Removing backfilled Cape Lo points...';
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
      
      -- Remove cape_lo_points from metadata
      EXECUTE format(
        'UPDATE %I.land_parcels 
         SET metadata = metadata - ''cape_lo_points''
         WHERE metadata ? ''cape_lo_points''',
        schema_rec.schema_name
      );
      
      GET DIAGNOSTICS removed_count = ROW_COUNT;
      
      IF removed_count > 0 THEN
        RAISE NOTICE '[OK] Removed cape_lo_points from % parcels in schema: %', 
          removed_count, schema_rec.schema_name;
      END IF;
      
    END IF;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '[SUCCESS] Migration 055 rolled back';
END $$;

COMMIT;
