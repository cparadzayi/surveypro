-- Migration 047: Fix migration to match ACTUAL surveyor schema structure

DROP FUNCTION IF EXISTS migrate_surveyor_to_schema(INTEGER);

CREATE OR REPLACE FUNCTION migrate_surveyor_to_schema(p_surveyor_id INTEGER)
RETURNS TEXT AS $$
DECLARE
  v_schema_name TEXT;
  v_surveyor_name TEXT;
  v_projects_count INTEGER;
  v_points_count INTEGER;
  v_parcels_count INTEGER;
  v_workflows_count INTEGER;
BEGIN
  -- Get surveyor info
  SELECT name, schema_name 
  INTO v_surveyor_name, v_schema_name
  FROM surveyor_profiles 
  WHERE id = p_surveyor_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Surveyor with id % not found', p_surveyor_id;
  END IF;
  
  IF v_schema_name IS NULL THEN
    RAISE EXCEPTION 'Surveyor % has no schema assigned', v_surveyor_name;
  END IF;
  
  -- Migrate survey_projects
  EXECUTE format('
    INSERT INTO %I.survey_projects 
      (id, name, client_name, survey_type, survey_date, district, 
       central_meridian, working_directory, status, created_at, updated_at)
    SELECT id, name, client_name, survey_type, survey_date, district,
           central_meridian::VARCHAR(10), working_directory, status, created_at, updated_at
    FROM public.survey_projects
    WHERE surveyor_profile_id = %s
    ON CONFLICT (id) DO NOTHING
  ', v_schema_name, p_surveyor_id);
  
  GET DIAGNOSTICS v_projects_count = ROW_COUNT;
  
  -- Migrate coordinate_points
  -- ACTUAL surveyor schema has: id, project_id, name, geom, elevation, description, 
  --                             survey_date, surveyor, created_at, updated_at
  -- NO y, x, z columns - coordinates are in geom geometry column!
  EXECUTE format('
    INSERT INTO %I.coordinate_points 
      (id, project_id, name, geom, elevation, description, created_at, updated_at)
    SELECT cp.id, cp.project_id, cp.name, cp.geom, cp.elevation, 
           cp.description, cp.created_at, cp.updated_at
    FROM public.coordinate_points cp
    WHERE cp.project_id IN (
      SELECT id FROM public.survey_projects WHERE surveyor_profile_id = %s
    )
    ON CONFLICT (project_id, name) DO NOTHING
  ', v_schema_name, p_surveyor_id);
  
  GET DIAGNOSTICS v_points_count = ROW_COUNT;
  
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
  
  GET DIAGNOSTICS v_parcels_count = ROW_COUNT;
  
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
  
  GET DIAGNOSTICS v_workflows_count = ROW_COUNT;
  
  RETURN format('✅ Successfully migrated surveyor "%s" (ID: %s) to schema %s

📊 Migration Summary:
  • Projects:          %s
  • Coordinate Points: %s  
  • Land Parcels:      %s
  • Workflow States:   %s', 
                v_surveyor_name, p_surveyor_id, v_schema_name,
                v_projects_count, v_points_count, v_parcels_count, v_workflows_count);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION migrate_surveyor_to_schema IS 'Migrates surveyor data from public to surveyor schema (matches actual table structure)';

SELECT '✅ Migration 047: Fixed to match ACTUAL surveyor schema structure' AS status;
