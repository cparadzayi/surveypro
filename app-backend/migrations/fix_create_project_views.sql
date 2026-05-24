-- Fix: Update create_project_views function to use correct column name
-- The column is 'name' not 'project_name'

CREATE OR REPLACE FUNCTION create_project_views(p_project_id INTEGER)
RETURNS jsonb AS $$
DECLARE
  v_coord_view_name TEXT;
  v_parcel_view_name TEXT;
  v_project_name TEXT;
  v_result jsonb;
BEGIN
  -- Get project name for documentation
  SELECT name INTO v_project_name 
  FROM survey_projects 
  WHERE id = p_project_id;
  
  IF v_project_name IS NULL THEN
    RAISE EXCEPTION 'Project % not found', p_project_id;
  END IF;
  
  -- Generate view names
  v_coord_view_name := 'coordinate_points_project_' || p_project_id;
  v_parcel_view_name := 'land_parcels_project_' || p_project_id;
  
  -- ========================================
  -- CREATE COORDINATE POINTS VIEW
  -- ========================================
  
  EXECUTE format('
    CREATE OR REPLACE VIEW %I AS
    SELECT 
      id,
      project_id,
      name,
      geom,
      ST_X(geom) as y,
      ST_Y(geom) as x,
      elevation,
      description,
      survey_date,
      surveyor,
      created_at,
      updated_at
    FROM coordinate_points
    WHERE project_id = %s
  ', v_coord_view_name, p_project_id);
  
  -- Grant permissions
  EXECUTE format('GRANT SELECT ON %I TO postgres', v_coord_view_name);
  
  -- Add comment
  EXECUTE format('
    COMMENT ON VIEW %I IS %L
  ', v_coord_view_name, 'Coordinate points for project ' || p_project_id || ' (' || v_project_name || ') - READ ONLY reference layer for QGIS');
  
  -- ========================================
  -- CREATE LAND PARCELS VIEW
  -- ========================================
  
  EXECUTE format('
    CREATE OR REPLACE VIEW %I AS
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
    WHERE project_id = %s
  ', v_parcel_view_name, p_project_id);
  
  -- Grant full permissions for editing
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO postgres', v_parcel_view_name);
  
  -- Create unique index on id to help QGIS identify primary key
  EXECUTE format('
    CREATE UNIQUE INDEX IF NOT EXISTS %I ON land_parcels(id) 
    WHERE project_id = %s
  ', v_parcel_view_name || '_pkey', p_project_id);
  
  -- Add comment
  EXECUTE format('
    COMMENT ON VIEW %I IS %L
  ', v_parcel_view_name, 'Land parcels for project ' || p_project_id || ' (' || v_project_name || ') - EDITABLE layer for QGIS digitization');
  
  -- ========================================
  -- CREATE INSERT TRIGGER
  -- ========================================
  
  EXECUTE format('
    CREATE OR REPLACE FUNCTION %I()
    RETURNS TRIGGER AS $func$
    BEGIN
      -- Force project_id
      NEW.project_id = %s;
      
      INSERT INTO land_parcels (
        project_id, stand, designation, geom, owner, title_deed, 
        survey_date, surveyor, notes, centroid_y, centroid_x, 
        closure_error_m, closure_ratio, status, digitized_by, metadata
      ) VALUES (
        NEW.project_id, NEW.stand, NEW.designation, NEW.geom, NEW.owner, 
        NEW.title_deed, NEW.survey_date, NEW.surveyor, NEW.notes, 
        NEW.centroid_y, NEW.centroid_x, NEW.closure_error_m, NEW.closure_ratio, 
        COALESCE(NEW.status, ''draft''), NEW.digitized_by, NEW.metadata
      )
      RETURNING * INTO NEW;
      
      -- Notify application of new parcel
      PERFORM pg_notify(''parcel_change'', json_build_object(
        ''action'', ''INSERT'',
        ''project_id'', NEW.project_id,
        ''parcel_id'', NEW.id,
        ''stand'', NEW.stand
      )::text);
      
      RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;
  ', v_parcel_view_name || '_insert', p_project_id);
  
  EXECUTE format('
    DROP TRIGGER IF EXISTS %I ON %I;
    CREATE TRIGGER %I
    INSTEAD OF INSERT ON %I
    FOR EACH ROW
    EXECUTE FUNCTION %I();
  ', 
    v_parcel_view_name || '_insert_trigger',
    v_parcel_view_name,
    v_parcel_view_name || '_insert_trigger',
    v_parcel_view_name,
    v_parcel_view_name || '_insert'
  );
  
  -- ========================================
  -- CREATE UPDATE TRIGGER
  -- ========================================
  
  EXECUTE format('
    CREATE OR REPLACE FUNCTION %I()
    RETURNS TRIGGER AS $func$
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
      WHERE id = NEW.id AND project_id = %s
      RETURNING * INTO NEW;
      
      -- Notify application of update
      PERFORM pg_notify(''parcel_change'', json_build_object(
        ''action'', ''UPDATE'',
        ''project_id'', NEW.project_id,
        ''parcel_id'', NEW.id,
        ''stand'', NEW.stand
      )::text);
      
      RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;
  ', v_parcel_view_name || '_update', p_project_id);
  
  EXECUTE format('
    DROP TRIGGER IF EXISTS %I ON %I;
    CREATE TRIGGER %I
    INSTEAD OF UPDATE ON %I
    FOR EACH ROW
    EXECUTE FUNCTION %I();
  ',
    v_parcel_view_name || '_update_trigger',
    v_parcel_view_name,
    v_parcel_view_name || '_update_trigger',
    v_parcel_view_name,
    v_parcel_view_name || '_update'
  );
  
  -- ========================================
  -- CREATE DELETE TRIGGER
  -- ========================================
  
  EXECUTE format('
    CREATE OR REPLACE FUNCTION %I()
    RETURNS TRIGGER AS $func$
    BEGIN
      DELETE FROM land_parcels
      WHERE id = OLD.id AND project_id = %s;
      
      -- Notify application of deletion
      PERFORM pg_notify(''parcel_change'', json_build_object(
        ''action'', ''DELETE'',
        ''project_id'', OLD.project_id,
        ''parcel_id'', OLD.id,
        ''stand'', OLD.stand
      )::text);
      
      RETURN OLD;
    END;
    $func$ LANGUAGE plpgsql;
  ', v_parcel_view_name || '_delete', p_project_id);
  
  EXECUTE format('
    DROP TRIGGER IF EXISTS %I ON %I;
    CREATE TRIGGER %I
    INSTEAD OF DELETE ON %I
    FOR EACH ROW
    EXECUTE FUNCTION %I();
  ',
    v_parcel_view_name || '_delete_trigger',
    v_parcel_view_name,
    v_parcel_view_name || '_delete_trigger',
    v_parcel_view_name,
    v_parcel_view_name || '_delete'
  );
  
  -- Build result
  v_result := jsonb_build_object(
    'project_id', p_project_id,
    'project_name', v_project_name,
    'coordinate_view', v_coord_view_name,
    'parcel_view', v_parcel_view_name,
    'status', 'created'
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;
