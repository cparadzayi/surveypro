-- Migration 091: coordinate_points.status + native-SRID geometry in every schema
--
-- Symptom: the active schema (surveyor_surveyor_surveypro, project 1 = Scenic
-- Shurugwi, Lo 29) throws:
--   GET /api/coordinate-points       -> 500 column "status" does not exist
--   POST /api/coordinate-points/batch -> 500 (insert targets status)
--   POST /api/land-parcels           -> 500 Geometry SRID (22289) does not match
--                                        column SRID (22291)
--
-- Root cause: every schema born from create_surveyor_schema() is created with
--  - coordinate_points WITHOUT the status column (migration 079/086 backfilled
--    only the schemas that existed at the time; the generator was never taught),
--  - geom columns hardcoded to SRID 22291, which rejects the Lo 25/27/29/33
--    native geometry the app actually writes (see capeLoSRID.js). The shared
--    fix_all_schemas_srid.sql patched old schemas by hand, not the generator, so
--    post-start schemas (surveyor_surveyor_surveypro, surveyor_surveyor_cline)
--    are still stuck at 22291.
--
-- This migration does both halves, following the 090 pattern:
--  - 091 backfills status/description on coordinate_points wherever missing, and
--    drops the SRID constraint on coordinate_points.geom / land_parcels.geom
--    everywhere it is still present.
--  - 091 redefines create_surveyor_schema() so new schemas include status and
--    ship SRID-stripped (native-SRID) geometry columns.
--
-- Idempotent and non-destructive: adds columns, relaxes a constraint, redefines
-- a function. Touches no existing row.

BEGIN;

-- ---------------------------------------------------------------------------
-- Helper: ensure coordinate_points has status + description in one schema.
-- Used by the backfill and by the generator so the two can never drift apart.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_coordinate_points_status_to_schema(p_schema_name VARCHAR)
RETURNS VOID AS $$
BEGIN
  EXECUTE format('ALTER TABLE IF EXISTS %I.coordinate_points ADD COLUMN IF NOT EXISTS status VARCHAR(10)', p_schema_name);
  EXECUTE format('ALTER TABLE IF EXISTS %I.coordinate_points ADD COLUMN IF NOT EXISTS description TEXT', p_schema_name);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.add_coordinate_points_status_to_schema(VARCHAR) IS
  'Ensures coordinate_points in a surveyor schema has status + description. Called by create_surveyor_schema() and by the 091 backfill. Do not drop: dropping it lets the generator drift again (see migration 091).';

-- ---------------------------------------------------------------------------
-- Helper: drop any generated area/perimeter columns on land_parcels (they depend
-- on geom and would block the ALTER), drop the SRID typmod on the geometry
-- columns, then restore the generated columns. No-op when geom already has no
-- SRID constraint.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_native_srid_geometry(p_schema_name VARCHAR)
RETURNS VOID AS $$
DECLARE
  v_has_generated BOOLEAN;
  v_cp_srid INTEGER;
  v_lp_srid INTEGER;
BEGIN
  SELECT postgis_typmod_srid(a.atttypmod)
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = p_schema_name AND c.relname = 'coordinate_points' AND a.attname = 'geom'
  INTO v_cp_srid;

  SELECT postgis_typmod_srid(a.atttypmod)
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = p_schema_name AND c.relname = 'land_parcels' AND a.attname = 'geom'
  INTO v_lp_srid;

  IF v_cp_srid IS NOT NULL AND v_cp_srid > 0 THEN
    EXECUTE format('ALTER TABLE %I.coordinate_points ALTER COLUMN geom TYPE geometry(Point) USING geom', p_schema_name);
  END IF;

  IF v_lp_srid IS NOT NULL AND v_lp_srid > 0 THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = p_schema_name AND table_name = 'land_parcels'
        AND is_generated = 'ALWAYS'
    ) INTO v_has_generated;

    IF v_has_generated THEN
      EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS area_m2', p_schema_name);
      EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS area_ha', p_schema_name);
      EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS perimeter_m', p_schema_name);
    END IF;

    EXECUTE format('ALTER TABLE %I.land_parcels ALTER COLUMN geom TYPE geometry USING geom', p_schema_name);

    IF v_has_generated THEN
      EXECUTE format('ALTER TABLE %I.land_parcels ADD COLUMN area_m2 numeric GENERATED ALWAYS AS (ST_Area(geom)) STORED', p_schema_name);
      EXECUTE format('ALTER TABLE %I.land_parcels ADD COLUMN area_ha numeric GENERATED ALWAYS AS (ST_Area(geom) / 10000.0) STORED', p_schema_name);
      EXECUTE format('ALTER TABLE %I.land_parcels ADD COLUMN perimeter_m numeric GENERATED ALWAYS AS (ST_Perimeter(geom)) STORED', p_schema_name);
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.restore_native_srid_geometry(VARCHAR) IS
  'Strips the legacy 22291 SRID typmod from a schema''s coordinate_points.geom and land_parcels.geom so native per-project SRIDs (Lo 25/27/29/31/33) can be stored. Called by the 091 backfill and by create_surveyor_schema().';

-- ---------------------------------------------------------------------------
-- Backfill every existing surveyor schema. Driven off the tables that exist
-- (like 090) rather than off surveyor_profiles, so schemas whose profile row has
-- gone are still repaired.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_schema_name VARCHAR;
  v_count INTEGER := 0;
BEGIN
  FOR v_schema_name IN
    SELECT DISTINCT t.table_schema
    FROM information_schema.tables t
    WHERE t.table_schema LIKE 'surveyor%'
      AND t.table_name IN ('coordinate_points', 'land_parcels')
    ORDER BY 1
  LOOP
    PERFORM public.add_coordinate_points_status_to_schema(v_schema_name);
    PERFORM public.restore_native_srid_geometry(v_schema_name);
    v_count := v_count + 1;
    RAISE NOTICE 'Migration 091: repaired %, coordinate_points, land_parcels', v_schema_name;
  END LOOP;

  RAISE NOTICE 'Migration 091: repaired % schema(s)', v_count;
END $$;

-- ---------------------------------------------------------------------------
-- The generator, so new surveyors are not born with the same faults. This is the
-- live create_surveyor_schema() (as deployed by migration 090) with two changes:
--   1. coordinate_points gains status VARCHAR(10) + the status helper call.
--   2. geom columns are created without an SRID typmod (geometry(Point) / geometry).
-- Everything else is byte-for-byte what 090 deployed.
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