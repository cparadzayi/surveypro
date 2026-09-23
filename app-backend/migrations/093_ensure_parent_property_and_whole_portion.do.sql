-- Migration 093: guarantee parent_property + whole_portion on every survey_projects table
--
-- Background: the survey designation is now always derived from the structured
-- township + immediate-parent-property fields (the free-text "Survey Of" input is
-- gone), so both columns must exist in every schema, old and new.
--
--  - parent_property was added to existing schemas by 084, but create_surveyor_schema()
--    was never taught it, so schemas born after 084 lack the column (089 comment:
--    "Migrations 083-088 patched existing schemas without updating this function").
--  - whole_portion was only ever added by 083_add_whole_portion_to_projects.sql, a
--    plain .sql file the runner skips (it only executes *.do.sql), so the column
--    exists nowhere; its value travels today only in workflow_state step_data.
--
-- This migration does both halves, following the 090/091/092 pattern:
--  - 093 backfills every existing surveyor schema + public with parent_property
--    VARCHAR(500) and whole_portion with its CHECK, idempotently.
--  - 093 re-creates create_surveyor_schema() from the live 092 definition with
--    both columns added to the survey_projects CREATE TABLE, so new schemas are
--    born complete and cannot drift again.

BEGIN;

-- ---------------------------------------------------------------------------
-- Backfill: one helper does both columns so the loop and the generator can
-- never disagree about them.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_project_designation_columns_to_schema(p_schema_name VARCHAR)
RETURNS VOID AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = p_schema_name AND table_name = 'survey_projects'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I.survey_projects ADD COLUMN IF NOT EXISTS parent_property VARCHAR(500)',
      p_schema_name
    );
    EXECUTE format(
      'ALTER TABLE %I.survey_projects ADD COLUMN IF NOT EXISTS whole_portion TEXT DEFAULT ''the whole'' CHECK (whole_portion IN (''the whole'', ''the remainder'', ''a portion''))',
      p_schema_name
    );
    RAISE NOTICE 'add_project_designation_columns_to_schema: ensured parent_property + whole_portion on %.survey_projects', p_schema_name;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.add_project_designation_columns_to_schema(VARCHAR) IS
  'Ensures a schema''s survey_projects has parent_property + whole_portion. Called by create_surveyor_schema() and by the 093 backfill. Do not drop: dropping it lets the generator drift again (see migration 093).';

DO $$
DECLARE
  v_schema_name VARCHAR;
  v_count INTEGER := 0;
BEGIN
  FOR v_schema_name IN
    SELECT t.table_schema
    FROM information_schema.tables t
    WHERE t.table_schema LIKE 'surveyor%'
      AND t.table_name = 'survey_projects'
  LOOP
    PERFORM public.add_project_designation_columns_to_schema(v_schema_name);
    v_count := v_count + 1;
  END LOOP;

  PERFORM public.add_project_designation_columns_to_schema('public');

  RAISE NOTICE 'Migration 093: ensured designation columns on % schema(s) + public', v_count;
END $$;

-- ---------------------------------------------------------------------------
-- The generator, so new surveyors are not born with the same fault. This is
-- the live definition of create_surveyor_schema() (as deployed by migration
-- 092) with parent_property + whole_portion added to the survey_projects
-- column list; everything else is byte-for-byte what 092 deployed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_surveyor_schema(p_username character varying)
 RETURNS character varying
 LANGUAGE plpgsql
 AS $function$

DECLARE

  v_schema_name VARCHAR;

BEGIN

  -- Generate schema name

  v_schema_name := generate_schema_name(p_username);

  -- Create schema

  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', v_schema_name);

  -- =========================================

  -- Create survey_projects table

  -- =========================================

  EXECUTE format('

    CREATE TABLE IF NOT EXISTS %I.survey_projects (

      id SERIAL PRIMARY KEY,

      name VARCHAR(255) NOT NULL,

      client_name VARCHAR(255),

      survey_type VARCHAR(100),

      township VARCHAR(255),

      designation TEXT,

      parent_property VARCHAR(500),

      whole_portion TEXT DEFAULT ''the whole'' CHECK (whole_portion IN (''the whole'', ''the remainder'', ''a portion'')),

      survey_date DATE,

      district VARCHAR(100),

      central_meridian VARCHAR(10),

      instruments VARCHAR(255),

      assisted_by VARCHAR(255),

      instrument_description VARCHAR(255),

      instrument_base_serial VARCHAR(100),

      instrument_rover_serial VARCHAR(100),

      datum VARCHAR(50),

      working_directory TEXT,

      status VARCHAR(50) DEFAULT ''active'',

      metadata JSONB,

      workflow_state JSONB DEFAULT ''{"completed_steps": [], "current_step": "project-setup", "step_data": {}, "generated_documents": {}, "can_finalize": false}''::jsonb,

      last_used TIMESTAMP,

      created_at TIMESTAMP DEFAULT NOW(),

      updated_at TIMESTAMP DEFAULT NOW()

    )', v_schema_name);

  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_projects_name ON %I.survey_projects(name)', v_schema_name);

  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_projects_date ON %I.survey_projects(survey_date)', v_schema_name);

  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_projects_status ON %I.survey_projects(status)', v_schema_name);

  -- =========================================

  -- Create coordinate_points table

  -- =========================================

  EXECUTE format('

    CREATE TABLE IF NOT EXISTS %I.coordinate_points (

      id SERIAL PRIMARY KEY,

      project_id INTEGER REFERENCES %I.survey_projects(id) ON DELETE CASCADE,

      name VARCHAR(50) NOT NULL,

      geom geometry(Point),

      elevation NUMERIC(10, 3),

      description TEXT,

      survey_date DATE,

      surveyor VARCHAR(255),

      created_at TIMESTAMP DEFAULT NOW(),

      updated_at TIMESTAMP DEFAULT NOW(),

      UNIQUE(project_id, name)

    )', v_schema_name, v_schema_name);

  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_coord_points_project ON %I.coordinate_points(project_id)', v_schema_name);

  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_coord_points_name ON %I.coordinate_points(name)', v_schema_name);

  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_coord_points_geom ON %I.coordinate_points USING GIST(geom)', v_schema_name);

  -- status/description come from the helper so backfill and generator can never drift.
  PERFORM public.add_coordinate_points_status_to_schema(v_schema_name);

  -- =========================================

  -- Create land_parcels table

  -- =========================================

  EXECUTE format('

    CREATE TABLE IF NOT EXISTS %I.land_parcels (

      id SERIAL PRIMARY KEY,

      project_id INTEGER REFERENCES %I.survey_projects(id) ON DELETE CASCADE,

      stand VARCHAR(50),

      designation VARCHAR(255),

      owner VARCHAR(255),

      title_deed VARCHAR(100),

      survey_date DATE,

      surveyor VARCHAR(255),

      notes TEXT,

      centroid_y NUMERIC(12, 3),

      centroid_x NUMERIC(12, 3),

      closure_error_m NUMERIC(10, 3),

      closure_ratio VARCHAR(20),

      area_m2 NUMERIC(12, 2),

      area_ha NUMERIC(12, 4),

      perimeter_m NUMERIC(12, 2),

      area_calculated BOOLEAN DEFAULT FALSE,

      calculation_data JSONB,

      status VARCHAR(50) DEFAULT ''draft'',

      digitized_by INTEGER,

      finalized_at TIMESTAMP,

      geom geometry,

      metadata JSONB,

      created_at TIMESTAMP DEFAULT NOW(),

      updated_at TIMESTAMP DEFAULT NOW(),

      CONSTRAINT unique_project_stand UNIQUE(project_id, stand)

    )', v_schema_name, v_schema_name);

  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_land_parcels_project ON %I.land_parcels(project_id)', v_schema_name);

  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_land_parcels_stand ON %I.land_parcels(stand)', v_schema_name);

  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_land_parcels_status ON %I.land_parcels(status)', v_schema_name);

  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_land_parcels_geom ON %I.land_parcels USING GIST(geom)', v_schema_name);

  -- =========================================
  -- Create project_control_points table
  -- =========================================
  -- Delegated to the helper so this definition and the backfill can never drift.
  PERFORM public.add_project_control_points_to_schema(v_schema_name);

  -- =========================================
  -- Create CSV-import tracking tables
  -- =========================================
  -- Delegated to the helper so this definition and the backfill can never drift.
  PERFORM public.add_csv_import_tracking_to_schema(v_schema_name);

  -- Grant permissions to application role (if exists)

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'surveypro_app') THEN

    EXECUTE format('GRANT USAGE ON SCHEMA %I TO surveypro_app', v_schema_name);

    EXECUTE format('GRANT ALL ON ALL TABLES IN SCHEMA %I TO surveypro_app', v_schema_name);

    EXECUTE format('GRANT ALL ON ALL SEQUENCES IN SCHEMA %I TO surveypro_app', v_schema_name);

    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT ALL ON TABLES TO surveypro_app', v_schema_name);

    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT ALL ON SEQUENCES TO surveypro_app', v_schema_name);

  END IF;

  RAISE NOTICE 'Created schema: % with all tables', v_schema_name;

  RETURN v_schema_name;

END;

$function$;

COMMIT;