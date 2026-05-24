-- Migration 058: Enable automatic metadata generation for QGIS-digitized parcels
-- This creates an AFTER INSERT/UPDATE trigger that automatically generates
-- traverse metadata (edges, points) from parcel geometry

-- Drop existing trigger function (we need to change it to AFTER trigger)
DROP FUNCTION IF EXISTS trigger_generate_parcel_metadata() CASCADE;

-- New trigger function for AFTER INSERT/UPDATE
-- This works because the row is already inserted, so we have a valid ID
CREATE OR REPLACE FUNCTION trigger_generate_parcel_metadata()
RETURNS TRIGGER AS $$
DECLARE
  generated_metadata JSONB;
BEGIN
  -- Only generate if metadata is missing or incomplete
  IF NEW.metadata IS NULL 
     OR NOT (NEW.metadata ? 'residuals')
     OR NOT (NEW.metadata->'residuals' ? 'edges')
     OR jsonb_array_length(COALESCE(NEW.metadata->'residuals'->'edges', '[]'::jsonb)) = 0
  THEN
    -- Generate metadata from geometry using the newly inserted ID
    generated_metadata := generate_parcel_metadata(NEW.id);
    
    -- Update the row with generated metadata
    UPDATE surveyor_surveyor_kuda.land_parcels
    SET metadata = COALESCE(metadata, '{}'::jsonb) || generated_metadata
    WHERE id = NEW.id;
    
    -- Log for debugging
    RAISE NOTICE 'Auto-generated metadata for parcel % (stand: %)', NEW.id, NEW.stand;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create AFTER INSERT OR UPDATE trigger
-- This runs AFTER the row is inserted, so NEW.id is available
CREATE TRIGGER auto_generate_metadata
AFTER INSERT OR UPDATE OF geom ON surveyor_surveyor_kuda.land_parcels
FOR EACH ROW
WHEN (NEW.geom IS NOT NULL)
EXECUTE FUNCTION trigger_generate_parcel_metadata();

COMMENT ON TRIGGER auto_generate_metadata ON surveyor_surveyor_kuda.land_parcels IS 
'Automatically generates traverse metadata (edges, points) from parcel geometry when parcels are digitized in QGIS';

-- Test the trigger with a sample update
DO $$
DECLARE
  test_parcel_id INTEGER;
BEGIN
  -- Find a parcel without metadata
  SELECT id INTO test_parcel_id
  FROM surveyor_surveyor_kuda.land_parcels
  WHERE metadata IS NULL 
     OR NOT (metadata ? 'residuals')
     OR jsonb_array_length(COALESCE(metadata->'residuals'->'edges', '[]'::jsonb)) = 0
  LIMIT 1;
  
  IF test_parcel_id IS NOT NULL THEN
    RAISE NOTICE 'Testing trigger on parcel %', test_parcel_id;
    
    -- Trigger the metadata generation by updating geom (even if unchanged)
    UPDATE surveyor_surveyor_kuda.land_parcels
    SET geom = geom
    WHERE id = test_parcel_id;
    
    RAISE NOTICE 'Trigger test complete. Check parcel % metadata.', test_parcel_id;
  ELSE
    RAISE NOTICE 'No parcels found without metadata. Trigger is ready for new QGIS parcels.';
  END IF;
END $$;

-- Verify trigger exists
SELECT 
  tgname as trigger_name,
  tgenabled as enabled,
  pg_get_triggerdef(oid) as definition
FROM pg_trigger
WHERE tgrelid = 'surveyor_surveyor_kuda.land_parcels'::regclass
  AND tgname = 'auto_generate_metadata';
