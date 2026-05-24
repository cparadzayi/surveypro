-- Migration 031: Create project-specific land parcels view for QGIS
-- This allows users to work with parcels for a specific project without seeing others

-- Example: Create view for project 63 (Elon Estates Gwelo)
-- You can create similar views for other projects as needed

CREATE OR REPLACE VIEW land_parcels_project_63 AS
SELECT 
  id,
  project_id,
  stand,
  designation,
  geom,
  owner,
  title_deed,
  survey_date,
  surveyor,
  notes,
  area_m2,
  area_ha,
  perimeter_m,
  centroid_y,
  centroid_x,
  closure_error_m,
  closure_ratio,
  status,
  digitized_by,
  metadata,
  created_at,
  updated_at
FROM land_parcels
WHERE project_id = 63;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON land_parcels_project_63 TO postgres;

-- Add comment
COMMENT ON VIEW land_parcels_project_63 IS 'Land parcels for project 63 (Elon Estates Gwelo) - for QGIS integration';

-- Create trigger to allow INSERT/UPDATE/DELETE on view
CREATE OR REPLACE FUNCTION land_parcels_project_63_insert()
RETURNS TRIGGER AS $$
BEGIN
  -- Force project_id to 63
  NEW.project_id = 63;
  
  INSERT INTO land_parcels (
    project_id, stand, designation, geom, owner, title_deed, 
    survey_date, surveyor, notes, centroid_y, centroid_x, 
    closure_error_m, closure_ratio, status, digitized_by, metadata
  ) VALUES (
    NEW.project_id, NEW.stand, NEW.designation, NEW.geom, NEW.owner, 
    NEW.title_deed, NEW.survey_date, NEW.surveyor, NEW.notes, 
    NEW.centroid_y, NEW.centroid_x, NEW.closure_error_m, NEW.closure_ratio, 
    COALESCE(NEW.status, 'draft'), NEW.digitized_by, NEW.metadata
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER land_parcels_project_63_insert_trigger
INSTEAD OF INSERT ON land_parcels_project_63
FOR EACH ROW
EXECUTE FUNCTION land_parcels_project_63_insert();

-- Update trigger
CREATE OR REPLACE FUNCTION land_parcels_project_63_update()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE land_parcels
  SET
    stand = NEW.stand,
    designation = NEW.designation,
    geom = NEW.geom,
    owner = NEW.owner,
    title_deed = NEW.title_deed,
    survey_date = NEW.survey_date,
    surveyor = NEW.surveyor,
    notes = NEW.notes,
    centroid_y = NEW.centroid_y,
    centroid_x = NEW.centroid_x,
    closure_error_m = NEW.closure_error_m,
    closure_ratio = NEW.closure_ratio,
    status = NEW.status,
    digitized_by = NEW.digitized_by,
    metadata = NEW.metadata
  WHERE id = NEW.id AND project_id = 63;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER land_parcels_project_63_update_trigger
INSTEAD OF UPDATE ON land_parcels_project_63
FOR EACH ROW
EXECUTE FUNCTION land_parcels_project_63_update();

-- Delete trigger
CREATE OR REPLACE FUNCTION land_parcels_project_63_delete()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM land_parcels
  WHERE id = OLD.id AND project_id = 63;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER land_parcels_project_63_delete_trigger
INSTEAD OF DELETE ON land_parcels_project_63
FOR EACH ROW
EXECUTE FUNCTION land_parcels_project_63_delete();
