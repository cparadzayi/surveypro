-- Migration 095: give every surveyor schema its own project_adopted_beacons
--
-- Adopted beacons are coordinates carried forward from a previous approved
-- survey and cited by that survey's record number (e.g. 112/2021). They are
-- never visited in the field: they do not appear in the field book or in
-- Calculations Part 1, but they DO belong on the Co-ordinate List, under the
-- heading ADOPTED BEACONS, where the Calcs column cites the S.R. number and
-- the far-right F. B column cites the survey date of that record.
--
-- They cannot live in coordinate_points: those are this survey's observations,
-- replaced wholesale by a CSV re-import (analyze/execute-merge deletes and
-- re-inserts per import), and a merge would either swallow or orphan the
-- carried-forward rows. A separate table keeps the two kinds of input
-- independent, exactly as project_control_points keeps the national trig
-- selection independent of the imported observations.
--
-- Following the 090/091/092 pattern exactly:
--   1. one helper function holds the table definition,
--   2. the backfill repairs every existing surveyor schema that lacks it,
--   3. create_surveyor_schema() gains a PERFORM so new surveyors are not born
--      with the fault (062 dropped its helper once and six schemas went
--      un-repaired until 090 found them; the helper is never dropped here).
--
-- Idempotent and non-destructive: creates a table and redefines a function,
-- touches no existing row.

BEGIN;

-- ---------------------------------------------------------------------------
-- The one definition of the table, used by both the backfill and the generator.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_project_adopted_beacons_to_schema(p_schema_name VARCHAR)
RETURNS VOID AS $$
BEGIN
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.project_adopted_beacons (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES %I.survey_projects(id) ON DELETE CASCADE,
      sr_number VARCHAR(20) NOT NULL,
      point_name VARCHAR(50) NOT NULL,
      y NUMERIC(14, 3) NOT NULL,
      x NUMERIC(14, 3) NOT NULL,
      status VARCHAR(10),
      description TEXT,
      survey_date VARCHAR(30),
      point_order INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(project_id, point_name)
    )', p_schema_name, p_schema_name);

  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_project_adopted_beacons_project ON %I.project_adopted_beacons(project_id)', p_schema_name);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_project_adopted_beacons_sr ON %I.project_adopted_beacons(sr_number)', p_schema_name);

  EXECUTE format('COMMENT ON TABLE %I.project_adopted_beacons IS ''Beacons carried forward from a previous approved survey, cited by survey record number''', p_schema_name);
  EXECUTE format('COMMENT ON COLUMN %I.project_adopted_beacons.sr_number IS ''Survey record number the beacon is adopted from (e.g. 112/2021)''', p_schema_name);
  EXECUTE format('COMMENT ON COLUMN %I.project_adopted_beacons.survey_date IS ''Survey date of the source record, verbatim (e.g. February-21)''', p_schema_name);
  EXECUTE format('COMMENT ON COLUMN %I.project_adopted_beacons.point_order IS ''Display order within the ADOPTED BEACONS section''', p_schema_name);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.add_project_adopted_beacons_to_schema(VARCHAR) IS
  'Creates a schema''s own project_adopted_beacons table. Called by create_surveyor_schema() and by the 095 backfill. Do not drop: dropping it lets the generator drift again (see migration 090).';

-- ---------------------------------------------------------------------------
-- Backfill. Driven off the schemas that actually exist rather than off
-- surveyor_profiles, so a schema whose profile row has gone is still repaired.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_schema_name VARCHAR;
  v_count INTEGER := 0;
BEGIN
  FOR v_schema_name IN
    SELECT t.table_schema
    FROM information_schema.tables t
    WHERE t.table_name = 'survey_projects'
      AND t.table_schema LIKE 'surveyor%'
      AND NOT EXISTS (
        SELECT 1 FROM information_schema.tables x
        WHERE x.table_schema = t.table_schema
          AND x.table_name = 'project_adopted_beacons'
      )
  LOOP
    PERFORM public.add_project_adopted_beacons_to_schema(v_schema_name);
    v_count := v_count + 1;
    RAISE NOTICE 'Added project_adopted_beacons to schema: %', v_schema_name;
  END LOOP;

  RAISE NOTICE 'Migration 095: repaired % schema(s)', v_count;
END $$;

-- ---------------------------------------------------------------------------
-- The generator, so new surveyors are not born with the same fault. This is the
-- live definition of create_surveyor_schema() as deployed by migration 092 with
-- one PERFORM added before the grants block.
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

      closure_error_m NUMERIC(12, 3),

      closure_ratio VARCHAR(20),

      area_m2 NUMERIC(12, 2),

      area_ha NUMERIC(12, 4),

      perimeter_m NUMERIC(12, 3),

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

  -- =========================================
  -- Create project_adopted_beacons table
  -- =========================================
  -- Delegated to the helper so this definition and the backfill can never drift.
  PERFORM public.add_project_adopted_beacons_to_schema(v_schema_name);

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
