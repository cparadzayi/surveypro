-- Migration 057 Undo: Restore land_parcels_qgis View
-- This recreates the view if needed for rollback

BEGIN;

-- Restore the view creation function
CREATE OR REPLACE FUNCTION create_land_parcels_qgis_view(schema_name TEXT)
RETURNS void AS $$
DECLARE
  has_status BOOLEAN;
BEGIN
  -- Check if status column exists
  EXECUTE format('
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = %L 
      AND table_name = ''land_parcels'' 
      AND column_name = ''status''
    )
  ', schema_name) INTO has_status;
  
  -- Create the view (excludes generated columns)
  IF has_status THEN
    EXECUTE format('
      CREATE OR REPLACE VIEW %I.land_parcels_qgis AS
      SELECT 
        id, project_id, stand, designation, geom, status, metadata,
        created_at, updated_at
      FROM %I.land_parcels
    ', schema_name, schema_name);
  ELSE
    EXECUTE format('
      CREATE OR REPLACE VIEW %I.land_parcels_qgis AS
      SELECT 
        id, project_id, stand, designation, geom, metadata,
        created_at, updated_at
      FROM %I.land_parcels
    ', schema_name, schema_name);
  END IF;

  -- Create INSERT rule
  IF has_status THEN
    EXECUTE format('
      CREATE OR REPLACE RULE land_parcels_qgis_insert AS
      ON INSERT TO %I.land_parcels_qgis
      DO INSTEAD
      INSERT INTO %I.land_parcels (project_id, stand, designation, geom, status, metadata)
      VALUES (NEW.project_id, NEW.stand, NEW.designation, NEW.geom, 
              COALESCE(NEW.status, ''draft''), NEW.metadata)
      RETURNING id, project_id, stand, designation, geom, status, metadata, 
                created_at, updated_at
    ', schema_name, schema_name);
  ELSE
    EXECUTE format('
      CREATE OR REPLACE RULE land_parcels_qgis_insert AS
      ON INSERT TO %I.land_parcels_qgis
      DO INSTEAD
      INSERT INTO %I.land_parcels (project_id, stand, designation, geom, metadata)
      VALUES (NEW.project_id, NEW.stand, NEW.designation, NEW.geom, NEW.metadata)
      RETURNING id, project_id, stand, designation, geom, metadata, 
                created_at, updated_at
    ', schema_name, schema_name);
  END IF;

  -- Create UPDATE rule
  IF has_status THEN
    EXECUTE format('
      CREATE OR REPLACE RULE land_parcels_qgis_update AS
      ON UPDATE TO %I.land_parcels_qgis
      DO INSTEAD
      UPDATE %I.land_parcels
      SET project_id = NEW.project_id, stand = NEW.stand, 
          designation = NEW.designation, geom = NEW.geom,
          status = NEW.status, metadata = NEW.metadata, updated_at = NOW()
      WHERE id = OLD.id
      RETURNING id, project_id, stand, designation, geom, status, metadata, 
                created_at, updated_at
    ', schema_name, schema_name);
  ELSE
    EXECUTE format('
      CREATE OR REPLACE RULE land_parcels_qgis_update AS
      ON UPDATE TO %I.land_parcels_qgis
      DO INSTEAD
      UPDATE %I.land_parcels
      SET project_id = NEW.project_id, stand = NEW.stand, 
          designation = NEW.designation, geom = NEW.geom,
          metadata = NEW.metadata, updated_at = NOW()
      WHERE id = OLD.id
      RETURNING id, project_id, stand, designation, geom, metadata, 
                created_at, updated_at
    ', schema_name, schema_name);
  END IF;

  -- Create DELETE rule
  EXECUTE format('
    CREATE OR REPLACE RULE land_parcels_qgis_delete AS
    ON DELETE TO %I.land_parcels_qgis
    DO INSTEAD
    DELETE FROM %I.land_parcels WHERE id = OLD.id
  ', schema_name, schema_name);

  RAISE NOTICE 'Restored land_parcels_qgis view in schema: %', schema_name;
END;
$$ LANGUAGE plpgsql;

-- Recreate views in all surveyor schemas
DO $$
DECLARE
  schema_rec RECORD;
BEGIN
  FOR schema_rec IN 
    SELECT schema_name FROM surveyor_profiles WHERE schema_name IS NOT NULL
  LOOP
    PERFORM create_land_parcels_qgis_view(schema_rec.schema_name);
  END LOOP;
END $$;

COMMIT;
