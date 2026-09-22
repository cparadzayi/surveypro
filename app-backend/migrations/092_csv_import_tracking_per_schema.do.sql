-- Migration 092: give every surveyor schema its own CSV-import tracking tables
--
-- Symptom: POST /api/csv-imports returns 500 for every tenant project:
--
--   insert or update on table "project_csv_imports" violates foreign key
--   constraint "project_csv_imports_project_id_fkey"
--   DETAIL: Key (project_id)=(20) is not present in table "survey_projects".
--
-- Root cause: migration 020 created project_csv_imports / coordinate_point_history
-- / v_import_summary only in public, and only ever patched public.coordinate_points /
-- public.land_parcels with import_id / parcel_status. After 040 moved projects and
-- their points/parcels into per-surveyor schemas, search_path falls through to the
-- public copies for every write, whose foreign keys point at public.survey_projects —
-- which does not contain the tenant's project. Exactly the class of fault migration
-- 090 fixed for project_control_points.
--
-- This migration does both halves, following the 090/091 pattern:
--  - 092 backfills every existing surveyor schema with its own project_csv_imports,
--    coordinate_point_history, coordinate_points.import_id, land_parcels.import_id,
--    land_parcels.parcel_status and v_import_summary — all schema-qualified so every
--    foreign key binds to the tenant's own tables.
--  - 092 teaches create_surveyor_schema() to create them for new surveyors. The
--    helper is kept, not dropped, so the backfill and the generator share one
--    definition and cannot drift apart again (migration 090 lesson).
--
-- Idempotent and non-destructive: creates tables/columns/indexes/views, redefines
-- functions. Touches no existing row.

BEGIN;

-- ---------------------------------------------------------------------------
-- The one definition of the tracking set, used by the backfill and the generator.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_csv_import_tracking_to_schema(p_schema_name VARCHAR)
RETURNS VOID AS $$
BEGIN
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.project_csv_imports (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES %I.survey_projects(id) ON DELETE CASCADE,
      import_date TIMESTAMP DEFAULT NOW(),
      csv_hash VARCHAR(64) NOT NULL,
      point_count INTEGER NOT NULL,
      filename VARCHAR(255),
      imported_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
      coordinate_system VARCHAR(50),
      metadata JSONB DEFAULT ''{}'',
      has_generated_documents BOOLEAN DEFAULT FALSE,
      has_land_parcels BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )', p_schema_name, p_schema_name);

  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_project_csv_imports_project ON %I.project_csv_imports(project_id)', p_schema_name);
  EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS idx_project_csv_imports_unique ON %I.project_csv_imports(project_id, csv_hash)', p_schema_name);

  -- Older schemas can carry a partial copy of this table (missing the flags / none
  -- of the foreign keys). Heal drift so every schema ends uniformly.
  EXECUTE format('ALTER TABLE IF EXISTS %I.project_csv_imports ADD COLUMN IF NOT EXISTS import_date TIMESTAMP DEFAULT NOW()', p_schema_name);
  EXECUTE format('ALTER TABLE IF EXISTS %I.project_csv_imports ADD COLUMN IF NOT EXISTS has_generated_documents BOOLEAN DEFAULT FALSE', p_schema_name);
  EXECUTE format('ALTER TABLE IF EXISTS %I.project_csv_imports ADD COLUMN IF NOT EXISTS has_land_parcels BOOLEAN DEFAULT FALSE', p_schema_name);
  EXECUTE format('ALTER TABLE IF EXISTS %I.project_csv_imports ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()', p_schema_name);
  EXECUTE format('ALTER TABLE IF EXISTS %I.project_csv_imports DROP CONSTRAINT IF EXISTS project_csv_imports_project_id_fkey', p_schema_name);
  EXECUTE format('ALTER TABLE IF EXISTS %I.project_csv_imports ADD CONSTRAINT project_csv_imports_project_id_fkey FOREIGN KEY (project_id) REFERENCES %I.survey_projects(id) ON DELETE CASCADE', p_schema_name, p_schema_name);

  -- The rest targets coordinate_points / land_parcels. Some (usually half-made test)
  -- schemas carry survey_projects but not those tables; skip rather than explode.
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = p_schema_name AND table_name = 'coordinate_points')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = p_schema_name AND table_name = 'land_parcels')
  THEN
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.coordinate_point_history (
      id SERIAL PRIMARY KEY,
      point_id INTEGER REFERENCES %I.coordinate_points(id) ON DELETE CASCADE,
      import_id INTEGER NOT NULL REFERENCES %I.project_csv_imports(id) ON DELETE CASCADE,
      previous_point_id INTEGER REFERENCES %I.coordinate_points(id) ON DELETE SET NULL,
      action VARCHAR(20) NOT NULL,
      point_name VARCHAR(50),
      coordinates JSONB,
      metadata JSONB DEFAULT ''{}'',
      created_at TIMESTAMP DEFAULT NOW()
    )', p_schema_name, p_schema_name, p_schema_name, p_schema_name);

  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_coordinate_point_history_point ON %I.coordinate_point_history(point_id)', p_schema_name);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_coordinate_point_history_import ON %I.coordinate_point_history(import_id)', p_schema_name);

  EXECUTE format('ALTER TABLE IF EXISTS %I.coordinate_points ADD COLUMN IF NOT EXISTS import_id INTEGER REFERENCES %I.project_csv_imports(id) ON DELETE SET NULL', p_schema_name, p_schema_name);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_coordinate_points_import_id ON %I.coordinate_points(import_id)', p_schema_name);

  EXECUTE format('ALTER TABLE IF EXISTS %I.land_parcels ADD COLUMN IF NOT EXISTS import_id INTEGER REFERENCES %I.project_csv_imports(id) ON DELETE SET NULL', p_schema_name, p_schema_name);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_land_parcels_import_id ON %I.land_parcels(import_id)', p_schema_name);
  EXECUTE format('ALTER TABLE IF EXISTS %I.land_parcels ADD COLUMN IF NOT EXISTS parcel_status VARCHAR(20) DEFAULT ''active''', p_schema_name);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_land_parcels_parcel_status ON %I.land_parcels(parcel_status)', p_schema_name);

  EXECUTE format('
    CREATE OR REPLACE VIEW %I.v_import_summary AS
    SELECT
      i.id,
      i.project_id,
      i.import_date,
      i.point_count,
      i.filename,
      i.has_generated_documents,
      i.has_land_parcels,
      COUNT(DISTINCT p.id) AS parcel_count,
      COUNT(DISTINCT cp.id) AS active_point_count,
      u.email AS imported_by_username
    FROM %I.project_csv_imports i
    LEFT JOIN %I.land_parcels p ON p.import_id = i.id AND p.parcel_status = ''active''
    LEFT JOIN %I.coordinate_points cp ON cp.import_id = i.id
    LEFT JOIN public.users u ON u.id = i.imported_by
    GROUP BY i.id, i.project_id, i.import_date, i.point_count, i.filename,
             i.has_generated_documents, i.has_land_parcels, u.email', p_schema_name, p_schema_name, p_schema_name, p_schema_name);
  ELSE
    RAISE NOTICE 'add_csv_import_tracking_to_schema: % has no coordinate_points/land_parcels, skipping point-facing objects', p_schema_name;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.add_csv_import_tracking_to_schema(VARCHAR) IS
  'Creates a schema''s own CSV-import tracking tables (project_csv_imports, coordinate_point_history, import_id/parcel_status columns, v_import_summary). Called by create_surveyor_schema() and by the 092 backfill. Do not drop: dropping it lets the generator drift again (see migration 092).';

-- ---------------------------------------------------------------------------
-- Backfill. Driven off the schemas that actually exist, so a schema whose
-- profile row has gone is still repaired.
-- ---------------------------------------------------------------------------
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
    PERFORM public.add_csv_import_tracking_to_schema(v_schema_name);
    v_count := v_count + 1;
    RAISE NOTICE 'Migration 092: added CSV-import tracking to schema: %', v_schema_name;
  END LOOP;

  RAISE NOTICE 'Migration 092: repaired % schema(s)', v_count;
END $$;

-- ---------------------------------------------------------------------------
-- The generator, so new surveyors are not born with the same fault. This is the
-- live definition of create_surveyor_schema() (as deployed by migration 091)
-- with one PERFORM added before the grants block; everything else is
-- byte-for-byte what 091 deployed.
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