-- Migration 052: Create editable view for QGIS to work with land_parcels
-- Purpose: QGIS cannot insert into GENERATED ALWAYS columns, so we create a view that excludes them
-- The view has INSERT/UPDATE/DELETE rules that properly handle the generated columns

BEGIN;

-- Function to create land_parcels_qgis view in a given schema
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
  -- Only include essential columns that are guaranteed to exist
  IF has_status THEN
    EXECUTE format('
      CREATE OR REPLACE VIEW %I.land_parcels_qgis AS
      SELECT 
        id,
        project_id,
        stand,
        designation,
        geom,
        status,
        metadata,
        created_at,
        updated_at
        -- NOTE: area_m2, area_ha, perimeter_m are excluded (they are GENERATED ALWAYS)
        -- NOTE: Other optional columns excluded for compatibility
      FROM %I.land_parcels
    ', schema_name, schema_name);
  ELSE
    -- Create view without status column
    EXECUTE format('
      CREATE OR REPLACE VIEW %I.land_parcels_qgis AS
      SELECT 
        id,
        project_id,
        stand,
        designation,
        geom,
        metadata,
        created_at,
        updated_at
        -- NOTE: area_m2, area_ha, perimeter_m are excluded (they are GENERATED ALWAYS)
        -- NOTE: status column not present in this schema
      FROM %I.land_parcels
    ', schema_name, schema_name);
  END IF;

  -- Make view insertable (only insert essential columns)
  IF has_status THEN
    EXECUTE format('
      CREATE OR REPLACE RULE land_parcels_qgis_insert AS
      ON INSERT TO %I.land_parcels_qgis
      DO INSTEAD
      INSERT INTO %I.land_parcels (
        project_id, stand, designation, geom, status, metadata
      )
      VALUES (
        NEW.project_id, NEW.stand, NEW.designation, NEW.geom, 
        COALESCE(NEW.status, ''draft''), NEW.metadata
      )
      RETURNING 
        id, project_id, stand, designation, geom, status, metadata, 
        created_at, updated_at
    ', schema_name, schema_name);
  ELSE
    EXECUTE format('
      CREATE OR REPLACE RULE land_parcels_qgis_insert AS
      ON INSERT TO %I.land_parcels_qgis
      DO INSTEAD
      INSERT INTO %I.land_parcels (
        project_id, stand, designation, geom, metadata
      )
      VALUES (
        NEW.project_id, NEW.stand, NEW.designation, NEW.geom, NEW.metadata
      )
      RETURNING 
        id, project_id, stand, designation, geom, metadata, 
        created_at, updated_at
    ', schema_name, schema_name);
  END IF;

  -- Make view updatable (only update essential columns)
  IF has_status THEN
    EXECUTE format('
      CREATE OR REPLACE RULE land_parcels_qgis_update AS
      ON UPDATE TO %I.land_parcels_qgis
      DO INSTEAD
      UPDATE %I.land_parcels
      SET
        project_id = NEW.project_id,
        stand = NEW.stand,
        designation = NEW.designation,
        geom = NEW.geom,
        status = NEW.status,
        metadata = NEW.metadata,
        updated_at = NOW()
      WHERE id = OLD.id
      RETURNING 
        id, project_id, stand, designation, geom, status, metadata, 
        created_at, updated_at
    ', schema_name, schema_name);
  ELSE
    EXECUTE format('
      CREATE OR REPLACE RULE land_parcels_qgis_update AS
      ON UPDATE TO %I.land_parcels_qgis
      DO INSTEAD
      UPDATE %I.land_parcels
      SET
        project_id = NEW.project_id,
        stand = NEW.stand,
        designation = NEW.designation,
        geom = NEW.geom,
        metadata = NEW.metadata,
        updated_at = NOW()
      WHERE id = OLD.id
      RETURNING 
        id, project_id, stand, designation, geom, metadata, 
        created_at, updated_at
    ', schema_name, schema_name);
  END IF;

  -- Make view deletable
  IF has_status THEN
    EXECUTE format('
      CREATE OR REPLACE RULE land_parcels_qgis_delete AS
      ON DELETE TO %I.land_parcels_qgis
      DO INSTEAD
      DELETE FROM %I.land_parcels
      WHERE id = OLD.id
      RETURNING 
        id, project_id, stand, designation, geom, status, metadata, 
        created_at, updated_at
    ', schema_name, schema_name);
  ELSE
    EXECUTE format('
      CREATE OR REPLACE RULE land_parcels_qgis_delete AS
      ON DELETE TO %I.land_parcels_qgis
      DO INSTEAD
      DELETE FROM %I.land_parcels
      WHERE id = OLD.id
      RETURNING 
        id, project_id, stand, designation, geom, metadata, 
        created_at, updated_at
    ', schema_name, schema_name);
  END IF;

  RAISE NOTICE '✅ Created land_parcels_qgis view in schema: %', schema_name;
END;
$$ LANGUAGE plpgsql;

-- Apply to all existing surveyor schemas
DO $$
DECLARE
  schema_rec RECORD;
BEGIN
  RAISE NOTICE '🔧 Creating land_parcels_qgis views for QGIS compatibility...';
  RAISE NOTICE '📋 This view excludes GENERATED ALWAYS columns (area_m2, area_ha, perimeter_m)';
  RAISE NOTICE '';
  
  -- Loop through all surveyor schemas
  FOR schema_rec IN 
    SELECT schema_name 
    FROM surveyor_profiles 
    WHERE schema_name IS NOT NULL
    ORDER BY schema_name
  LOOP
    RAISE NOTICE '📂 Processing schema: %', schema_rec.schema_name;
    PERFORM create_land_parcels_qgis_view(schema_rec.schema_name);
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '🎉 Migration complete! All surveyor schemas now have land_parcels_qgis view';
  RAISE NOTICE '';
  RAISE NOTICE '📝 QGIS Setup Instructions:';
  RAISE NOTICE '   1. Remove existing land_parcels layer from QGIS';
  RAISE NOTICE '   2. Add PostGIS layer: land_parcels_qgis (use this instead)';
  RAISE NOTICE '   3. Digitize polygons normally';
  RAISE NOTICE '   4. Save - areas will auto-calculate!';
  RAISE NOTICE '   5. To see calculated areas, add land_parcels table as read-only layer';
  RAISE NOTICE '';
  RAISE NOTICE '💡 Tip: You can have both layers:';
  RAISE NOTICE '   - land_parcels_qgis (for editing/digitizing)';
  RAISE NOTICE '   - land_parcels (read-only, shows area_m2, area_ha, perimeter_m)';
  
END $$;

COMMIT;
