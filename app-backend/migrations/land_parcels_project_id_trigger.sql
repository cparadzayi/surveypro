-- Trigger to auto-set project_id based on geometry location
-- This is a fallback if QGIS default values don't work

CREATE OR REPLACE FUNCTION auto_set_land_parcel_project_id()
RETURNS TRIGGER AS $$
BEGIN
  -- If project_id is NULL, try to infer from nearby coordinate_points
  IF NEW.project_id IS NULL THEN
    -- Find project_id from coordinate_points that are close to this parcel
    SELECT DISTINCT cp.project_id INTO NEW.project_id
    FROM coordinate_points cp
    WHERE ST_DWithin(cp.geom, ST_Centroid(NEW.geom), 1000) -- within 1km
    LIMIT 1;
    
    -- If still NULL, you could set a default project (uncomment if needed)
    -- IF NEW.project_id IS NULL THEN
    --   NEW.project_id := 64;  -- or get from session/context
    -- END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS land_parcels_auto_project_id ON land_parcels;
CREATE TRIGGER land_parcels_auto_project_id
  BEFORE INSERT ON land_parcels
  FOR EACH ROW
  EXECUTE FUNCTION auto_set_land_parcel_project_id();

COMMENT ON FUNCTION auto_set_land_parcel_project_id() IS 
  'Auto-assigns project_id to land parcels based on nearby coordinate points';
