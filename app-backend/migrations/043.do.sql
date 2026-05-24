-- Migration 043: Fix migrate_surveyor_to_schema - use 'name' instead of 'username'

DROP FUNCTION IF EXISTS migrate_surveyor_to_schema(INTEGER);

CREATE OR REPLACE FUNCTION migrate_surveyor_to_schema(p_surveyor_id INTEGER)
RETURNS TEXT AS $$
DECLARE
  v_schema_name TEXT;
  v_surveyor_name TEXT;
BEGIN
  -- Get surveyor info (use 'name' column, not 'username')
  SELECT name, schema_name 
  INTO v_surveyor_name, v_schema_name
  FROM surveyor_profiles 
  WHERE id = p_surveyor_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Surveyor with id % not found', p_surveyor_id;
  END IF;
  
  IF v_schema_name IS NULL THEN
    RAISE EXCEPTION 'Surveyor % has no schema assigned. Run create_surveyor_schema() first.', v_surveyor_name;
  END IF;
  
  -- Migrate survey_projects
  EXECUTE format('
    INSERT INTO %I.survey_projects 
      (id, name, project_id, client_name, district, survey_type, survey_date, 
       instruments, designation, status, created_at, updated_at, central_meridian, 
       working_directory, surveyor_profile_id, supervising_surveyor_id, 
       workflow_state, last_used, stand_reference, township)
    SELECT id, name, project_id, client_name, district, survey_type, survey_date,
           instruments, designation, status, created_at, updated_at, central_meridian,
           working_directory, surveyor_profile_id, supervising_surveyor_id,
           workflow_state, last_used, stand_reference, township
    FROM public.survey_projects
    WHERE surveyor_profile_id = %s
    ON CONFLICT (id) DO NOTHING
  ', v_schema_name, p_surveyor_id);
  
  -- Migrate coordinate_points
  EXECUTE format('
    INSERT INTO %I.coordinate_points 
      (id, project_id, name, y, x, elevation, description, created_at, updated_at, geom)
    SELECT cp.id, cp.project_id, cp.name, cp.y, cp.x, cp.elevation, 
           cp.description, cp.created_at, cp.updated_at, cp.geom
    FROM public.coordinate_points cp
    WHERE cp.project_id IN (
      SELECT id FROM public.survey_projects WHERE surveyor_profile_id = %s
    )
    ON CONFLICT (project_id, name) DO NOTHING
  ', v_schema_name, p_surveyor_id);
  
  -- Migrate land_parcels  
  EXECUTE format('
    INSERT INTO %I.land_parcels 
      (id, project_id, stand, designation, area_m2, area_ha, 
       closure_error, geom, created_at, updated_at)
    SELECT lp.id, lp.project_id, lp.stand, lp.designation, 
           lp.area_m2, lp.area_ha, lp.closure_error, lp.geom,
           lp.created_at, lp.updated_at
    FROM public.land_parcels lp
    WHERE lp.project_id IN (
      SELECT id FROM public.survey_projects WHERE surveyor_profile_id = %s
    )
    ON CONFLICT (id) DO NOTHING
  ', v_schema_name, p_surveyor_id);
  
  -- Migrate workflow_states
  EXECUTE format('
    INSERT INTO %I.workflow_states
      (id, project_id, current_step, step_data, completed_steps, created_at, updated_at)
    SELECT ws.id, ws.project_id, ws.current_step, ws.step_data, 
           ws.completed_steps, ws.created_at, ws.updated_at
    FROM public.workflow_states ws
    WHERE ws.project_id IN (
      SELECT id FROM public.survey_projects WHERE surveyor_profile_id = %s
    )
    ON CONFLICT (project_id) DO NOTHING
  ', v_schema_name, p_surveyor_id);
  
  RETURN format('✅ Successfully migrated surveyor %s (ID: %s) to schema %s', 
                v_surveyor_name, p_surveyor_id, v_schema_name);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION migrate_surveyor_to_schema IS 'Migrates surveyor data from public schema to surveyor-specific schema';

SELECT 'Migration 043 completed: Fixed column name (name vs username)' AS status;
