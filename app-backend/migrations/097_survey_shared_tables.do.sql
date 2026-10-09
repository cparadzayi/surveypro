-- 097: authority tenancy, step 2 of 4 (the shared, authority-scoped tables).
--
-- Survey working data lives, today, in one schema per surveyor (surveyor_<name>, created by create_surveyor_schema()). That isolates
-- surveyors from each other and from nobody else's view: an authority cannot be shown the work of its own surveyors, and the
-- isolation rests on the application remembering to set search_path (the pooled-connection leak recorded in CLAUDE.md).
--
-- These are the same seven tables in one place, keyed to a PROJECT, which belongs to an AUTHORITY and is administered by a SURVEYOR.
-- Row-level security does the isolating, so it holds whatever code sits on top. Same table and column names as the per-surveyor
-- tables, so the existing SQL runs unchanged against search_path = survey, public.
--
--   who sees a project   its surveyor; the head surveyors and reviewers of its authority; the platform operator
--   who may change it    its surveyor (while appointed to its authority, or if it has none); the head surveyors of its authority;
--                        the platform operator. A reviewer only reads (acceptance is a separate, audited action, migration 099).
--   authority_id NULL    a surveyor's private practice: visible to that surveyor alone (SurveyPro still serves independent surveyors)
--   everything below a project (points, parcels, beacons, imports) follows its project.
--
-- Nothing reads these yet: the application keeps using the per-surveyor schemas until the switch (step 3), and migration 098 moves
-- the existing data. legacy_schema / legacy_id record where each moved row came from, which makes the move repeatable and auditable.

-- ---- projects -----------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS survey.survey_projects (
  id                       serial PRIMARY KEY,
  name                     varchar(255) NOT NULL,
  client_name              varchar(255),
  survey_type              varchar(100),
  township                 varchar(255),
  designation              text,
  parent_property          varchar(500),
  whole_portion            text DEFAULT 'the whole',
  survey_date              date,
  district                 varchar(100),
  central_meridian         varchar(10),
  instruments              varchar(255),
  assisted_by              varchar(255),
  instrument_description   varchar(255),
  instrument_base_serial   varchar(100),
  instrument_rover_serial  varchar(100),
  datum                    varchar(50),
  working_directory        text,
  status                   varchar(50) DEFAULT 'active',
  metadata                 jsonb,
  workflow_state           jsonb DEFAULT '{"step_data": {}, "can_finalize": false, "current_step": "project-setup", "completed_steps": [], "generated_documents": {}}'::jsonb,
  last_used                timestamp,
  created_at               timestamp DEFAULT now(),
  updated_at               timestamp DEFAULT now(),
  -- ownership
  surveyor_user_id         integer NOT NULL REFERENCES public.users (id),
  authority_id             integer REFERENCES survey.authority (id),
  engagement               varchar(20) CHECK (engagement IN ('employed', 'contracted')),
  -- the authority's own reference for the job (VunGIS spatial_planning.survey_task.id), when there is one
  external_job_id          uuid,
  -- where a moved row came from
  legacy_schema            varchar(80),
  legacy_id                integer,
  CONSTRAINT survey_projects_whole_portion_check CHECK (whole_portion = ANY (ARRAY['the whole', 'the remainder', 'a portion'])),
  CONSTRAINT survey_projects_legacy_key UNIQUE (legacy_schema, legacy_id)
);
CREATE INDEX IF NOT EXISTS idx_survey_projects_authority ON survey.survey_projects (authority_id);
CREATE INDEX IF NOT EXISTS idx_survey_projects_surveyor ON survey.survey_projects (surveyor_user_id);
CREATE INDEX IF NOT EXISTS idx_survey_projects_status ON survey.survey_projects (status);
CREATE INDEX IF NOT EXISTS idx_survey_projects_name ON survey.survey_projects (name);
CREATE INDEX IF NOT EXISTS idx_survey_projects_date ON survey.survey_projects (survey_date);
CREATE UNIQUE INDEX IF NOT EXISTS uq_survey_projects_external_job ON survey.survey_projects (authority_id, external_job_id) WHERE external_job_id IS NOT NULL;

-- ---- everything below a project -----------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS survey.project_csv_imports (
  id                      serial PRIMARY KEY,
  project_id              integer NOT NULL REFERENCES survey.survey_projects (id) ON DELETE CASCADE,
  import_date             timestamp DEFAULT now(),
  csv_hash                varchar(64) NOT NULL,
  point_count             integer NOT NULL,
  filename                varchar(255),
  imported_by             integer REFERENCES public.users (id) ON DELETE SET NULL,
  coordinate_system       varchar(50),
  metadata                jsonb DEFAULT '{}'::jsonb,
  has_generated_documents boolean DEFAULT false,
  has_land_parcels        boolean DEFAULT false,
  created_at              timestamp DEFAULT now(),
  updated_at              timestamp DEFAULT now(),
  legacy_schema           varchar(80),
  legacy_id               integer,
  CONSTRAINT project_csv_imports_legacy_key UNIQUE (legacy_schema, legacy_id)
);
CREATE INDEX IF NOT EXISTS idx_project_csv_imports_project ON survey.project_csv_imports (project_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_csv_imports_unique ON survey.project_csv_imports (project_id, csv_hash);

CREATE TABLE IF NOT EXISTS survey.coordinate_points (
  id            serial PRIMARY KEY,
  project_id    integer NOT NULL REFERENCES survey.survey_projects (id) ON DELETE CASCADE,
  name          varchar(50) NOT NULL,
  geom          public.geometry(Point),
  elevation     numeric(10, 3),
  description   text,
  survey_date   date,
  surveyor      varchar(255),
  created_at    timestamp DEFAULT now(),
  updated_at    timestamp DEFAULT now(),
  status        varchar(10),
  import_id     integer REFERENCES survey.project_csv_imports (id) ON DELETE SET NULL,
  legacy_schema varchar(80),
  legacy_id     integer,
  CONSTRAINT coordinate_points_project_id_name_key UNIQUE (project_id, name),
  CONSTRAINT coordinate_points_legacy_key UNIQUE (legacy_schema, legacy_id)
);
CREATE INDEX IF NOT EXISTS idx_coord_points_geom ON survey.coordinate_points USING gist (geom);
CREATE INDEX IF NOT EXISTS idx_coord_points_name ON survey.coordinate_points (name);
CREATE INDEX IF NOT EXISTS idx_coord_points_project ON survey.coordinate_points (project_id);
CREATE INDEX IF NOT EXISTS idx_coordinate_points_import_id ON survey.coordinate_points (import_id);

CREATE TABLE IF NOT EXISTS survey.land_parcels (
  id                  serial PRIMARY KEY,
  project_id          integer NOT NULL REFERENCES survey.survey_projects (id) ON DELETE CASCADE,
  stand               varchar(50),
  designation         varchar(255),
  owner               varchar(255),
  title_deed          varchar(100),
  survey_date         date,
  surveyor            varchar(255),
  notes               text,
  centroid_y          numeric(12, 3),
  centroid_x          numeric(12, 3),
  closure_error_m     numeric(10, 3),
  closure_ratio       varchar(20),
  area_m2             numeric(12, 2),
  area_ha             numeric(12, 4),
  perimeter_m         numeric(12, 2),
  area_calculated     boolean DEFAULT false,
  calculation_data    jsonb,
  status              varchar(50) DEFAULT 'draft',
  digitized_by        integer,
  finalized_at        timestamp,
  geom                public.geometry,
  metadata            jsonb,
  created_at          timestamp DEFAULT now(),
  updated_at          timestamp DEFAULT now(),
  import_id           integer REFERENCES survey.project_csv_imports (id) ON DELETE SET NULL,
  parcel_status       varchar(20) DEFAULT 'active',
  legacy_schema       varchar(80),
  legacy_id           integer,
  CONSTRAINT unique_project_stand UNIQUE (project_id, stand),
  CONSTRAINT land_parcels_legacy_key UNIQUE (legacy_schema, legacy_id)
);
CREATE INDEX IF NOT EXISTS idx_land_parcels_geom ON survey.land_parcels USING gist (geom);
CREATE INDEX IF NOT EXISTS idx_land_parcels_import_id ON survey.land_parcels (import_id);
CREATE INDEX IF NOT EXISTS idx_land_parcels_parcel_status ON survey.land_parcels (parcel_status);
CREATE INDEX IF NOT EXISTS idx_land_parcels_project ON survey.land_parcels (project_id);
CREATE INDEX IF NOT EXISTS idx_land_parcels_stand ON survey.land_parcels (stand);
CREATE INDEX IF NOT EXISTS idx_land_parcels_status ON survey.land_parcels (status);

CREATE TABLE IF NOT EXISTS survey.project_adopted_beacons (
  id            serial PRIMARY KEY,
  project_id    integer NOT NULL REFERENCES survey.survey_projects (id) ON DELETE CASCADE,
  sr_number     varchar(20) NOT NULL,
  point_name    varchar(50) NOT NULL,
  y             numeric(14, 3) NOT NULL,
  x             numeric(14, 3) NOT NULL,
  status        varchar(10),
  description   text,
  survey_date   varchar(30),
  point_order   integer NOT NULL DEFAULT 1,
  created_at    timestamp DEFAULT CURRENT_TIMESTAMP,
  updated_at    timestamp DEFAULT CURRENT_TIMESTAMP,
  legacy_schema varchar(80),
  legacy_id     integer,
  CONSTRAINT project_adopted_beacons_project_id_point_name_key UNIQUE (project_id, point_name),
  CONSTRAINT project_adopted_beacons_legacy_key UNIQUE (legacy_schema, legacy_id)
);
CREATE INDEX IF NOT EXISTS idx_project_adopted_beacons_project ON survey.project_adopted_beacons (project_id);
CREATE INDEX IF NOT EXISTS idx_project_adopted_beacons_sr ON survey.project_adopted_beacons (sr_number);

CREATE TABLE IF NOT EXISTS survey.project_control_points (
  id               serial PRIMARY KEY,
  project_id       integer NOT NULL REFERENCES survey.survey_projects (id) ON DELETE CASCADE,
  control_point_id integer NOT NULL REFERENCES public.zim_control_points (id) ON DELETE CASCADE,
  point_order      integer NOT NULL DEFAULT 1,
  created_at       timestamp DEFAULT CURRENT_TIMESTAMP,
  legacy_schema    varchar(80),
  legacy_id        integer,
  CONSTRAINT project_control_points_project_id_control_point_id_key UNIQUE (project_id, control_point_id),
  CONSTRAINT project_control_points_legacy_key UNIQUE (legacy_schema, legacy_id)
);
CREATE INDEX IF NOT EXISTS idx_project_control_points_project ON survey.project_control_points (project_id);
CREATE INDEX IF NOT EXISTS idx_project_control_points_control_point ON survey.project_control_points (control_point_id);

-- The per-surveyor history table has no project_id (it hangs off an import); here it carries one so that it follows its project.
CREATE TABLE IF NOT EXISTS survey.coordinate_point_history (
  id                serial PRIMARY KEY,
  project_id        integer NOT NULL REFERENCES survey.survey_projects (id) ON DELETE CASCADE,
  point_id          integer REFERENCES survey.coordinate_points (id) ON DELETE CASCADE,
  import_id         integer NOT NULL REFERENCES survey.project_csv_imports (id) ON DELETE CASCADE,
  previous_point_id integer REFERENCES survey.coordinate_points (id) ON DELETE SET NULL,
  action            varchar(20) NOT NULL,
  point_name        varchar(50),
  coordinates       jsonb,
  metadata          jsonb DEFAULT '{}'::jsonb,
  created_at        timestamp DEFAULT now(),
  legacy_schema     varchar(80),
  legacy_id         integer,
  CONSTRAINT coordinate_point_history_legacy_key UNIQUE (legacy_schema, legacy_id)
);
CREATE INDEX IF NOT EXISTS idx_coordinate_point_history_project ON survey.coordinate_point_history (project_id);
CREATE INDEX IF NOT EXISTS idx_coordinate_point_history_import ON survey.coordinate_point_history (import_id);
CREATE INDEX IF NOT EXISTS idx_coordinate_point_history_point ON survey.coordinate_point_history (point_id);

-- timestamps maintained as elsewhere in SurveyPro
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['survey_projects', 'coordinate_points', 'land_parcels', 'project_adopted_beacons'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON survey.%I', t || '_updated_at', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON survey.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t || '_updated_at', t);
  END LOOP;
END $$;

-- ---- who may see and change a project ------------------------------------------------------------------------------------------
-- Set-returning, evaluated once per statement (the policies use  project_id IN (SELECT ...)  so the planner hashes it), and run as the
-- owner so the policies on survey_projects do not recurse into themselves. Who is asking is passed IN (see app.my_authorities).
DROP FUNCTION IF EXISTS survey.readable_project_ids();
DROP FUNCTION IF EXISTS survey.writable_project_ids();
CREATE OR REPLACE FUNCTION survey.readable_project_ids(p_user integer, p_platform boolean, p_reader integer) RETURNS SETOF integer
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, survey, app AS $$
  SELECT p.id
    FROM survey.survey_projects p
   WHERE p_platform
      OR p.surveyor_user_id = p_user
      OR p.authority_id = p_reader
      OR (p.authority_id IS NOT NULL AND p.authority_id IN (SELECT app.my_authorities(p_user, ARRAY['head_surveyor', 'reviewer'])))
$$;

CREATE OR REPLACE FUNCTION survey.writable_project_ids(p_user integer, p_platform boolean) RETURNS SETOF integer
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, survey, app AS $$
  SELECT p.id
    FROM survey.survey_projects p
   WHERE p_platform
      OR (p.surveyor_user_id = p_user
          AND (p.authority_id IS NULL OR p.authority_id IN (SELECT app.my_authorities(p_user, ARRAY['surveyor', 'head_surveyor']))))
      OR (p.authority_id IS NOT NULL AND p.authority_id IN (SELECT app.my_authorities(p_user, ARRAY['head_surveyor'])))
$$;

-- ---- row-level security --------------------------------------------------------------------------------------------------------
ALTER TABLE survey.survey_projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_select ON survey.survey_projects;
DROP POLICY IF EXISTS project_insert ON survey.survey_projects;
DROP POLICY IF EXISTS project_update ON survey.survey_projects;
DROP POLICY IF EXISTS project_delete ON survey.survey_projects;
CREATE POLICY project_select ON survey.survey_projects FOR SELECT USING (id IN (SELECT survey.readable_project_ids(app.user_id(), app.is_platform(), app.reader_authority())));
-- a new project is the caller's own, and for an authority only one they are appointed to as a surveyor
CREATE POLICY project_insert ON survey.survey_projects FOR INSERT WITH CHECK (
  app.is_platform()
  OR (surveyor_user_id = app.user_id()
      AND (authority_id IS NULL OR authority_id IN (SELECT app.my_authorities(app.user_id(), ARRAY['surveyor', 'head_surveyor']))))
  OR (authority_id IS NOT NULL AND authority_id IN (SELECT app.my_authorities(app.user_id(), ARRAY['head_surveyor']))));
CREATE POLICY project_update ON survey.survey_projects FOR UPDATE
  USING (id IN (SELECT survey.writable_project_ids(app.user_id(), app.is_platform())))
  WITH CHECK (
    app.is_platform()
    OR (surveyor_user_id = app.user_id()
        AND (authority_id IS NULL OR authority_id IN (SELECT app.my_authorities(app.user_id(), ARRAY['surveyor', 'head_surveyor']))))
    OR (authority_id IS NOT NULL AND authority_id IN (SELECT app.my_authorities(app.user_id(), ARRAY['head_surveyor']))));
CREATE POLICY project_delete ON survey.survey_projects FOR DELETE USING (id IN (SELECT survey.writable_project_ids(app.user_id(), app.is_platform())));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['project_csv_imports', 'coordinate_points', 'land_parcels', 'project_adopted_beacons',
                           'project_control_points', 'coordinate_point_history'] LOOP
    EXECUTE format('ALTER TABLE survey.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS follows_project_select ON survey.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS follows_project_write ON survey.%I', t);
    EXECUTE format('CREATE POLICY follows_project_select ON survey.%I FOR SELECT USING (project_id IN (SELECT survey.readable_project_ids(app.user_id(), app.is_platform(), app.reader_authority())))', t);
    EXECUTE format('CREATE POLICY follows_project_write ON survey.%I FOR ALL USING (project_id IN (SELECT survey.writable_project_ids(app.user_id(), app.is_platform()))) WITH CHECK (project_id IN (SELECT survey.writable_project_ids(app.user_id(), app.is_platform())))', t);
  END LOOP;
END $$;

-- appointments: you see your own; a head surveyor sees and manages their authority's surveyors and reviewers; the platform operator all
ALTER TABLE survey.authority_member ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS member_select ON survey.authority_member;
DROP POLICY IF EXISTS member_write ON survey.authority_member;
CREATE POLICY member_select ON survey.authority_member FOR SELECT USING (
  app.is_platform() OR user_id = app.user_id()
  OR authority_id IN (SELECT app.my_authorities(app.user_id(), ARRAY['head_surveyor', 'reviewer'])));
CREATE POLICY member_write ON survey.authority_member FOR ALL
  USING (app.is_platform() OR (role <> 'head_surveyor' AND authority_id IN (SELECT app.my_authorities(app.user_id(), ARRAY['head_surveyor']))))
  WITH CHECK (app.is_platform() OR (role <> 'head_surveyor' AND authority_id IN (SELECT app.my_authorities(app.user_id(), ARRAY['head_surveyor']))));

-- ---- who imported: the one join to a shared table the summary view needs ---------------------------------------------------------
CREATE OR REPLACE VIEW survey.v_import_summary WITH (security_invoker = true) AS
 SELECT i.id,
    i.project_id,
    i.import_date,
    i.point_count,
    i.filename,
    i.has_generated_documents,
    i.has_land_parcels,
    count(DISTINCT p.id) AS parcel_count,
    count(DISTINCT cp.id) AS active_point_count,
    u.email AS imported_by_username
   FROM survey.project_csv_imports i
     LEFT JOIN survey.land_parcels p ON p.import_id = i.id AND p.parcel_status::text = 'active'
     LEFT JOIN survey.coordinate_points cp ON cp.import_id = i.id
     LEFT JOIN public.users u ON u.id = i.imported_by
  GROUP BY i.id, i.project_id, i.import_date, i.point_count, i.filename, i.has_generated_documents, i.has_land_parcels, u.email;

-- ---- the contract: classify what exists ---------------------------------------------------------------------------------------
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['survey.survey_projects', 'survey.project_csv_imports', 'survey.coordinate_points', 'survey.land_parcels',
                           'survey.project_adopted_beacons', 'survey.project_control_points', 'survey.coordinate_point_history',
                           'survey.authority_member'] LOOP
    PERFORM tenancy.classify(r, 'tenant', 'authority-scoped through the project (migration 097)');
  END LOOP;
  PERFORM tenancy.classify('survey.v_import_summary', 'tenant_view', 'runs as the caller (migration 097)');
  PERFORM tenancy.classify('survey.authority', 'reference', 'the authorities that use the service');
  PERFORM tenancy.classify('tenancy.role_authority', 'system', 'maps a direct-client login to its authority');

  -- the shared tables the application already had: users and profiles are people, the control network is reference data, the old
  -- tables that share names with the survey.* ones are superseded legacy, and the spatial module is the known gap
  FOREACH r IN ARRAY ARRAY['public.users', 'public.surveyor_profiles'] LOOP
    IF to_regclass(r) IS NOT NULL THEN PERFORM tenancy.classify(r, 'personal', 'accounts and profiles'); END IF;
  END LOOP;
  FOREACH r IN ARRAY ARRAY['public.zim_control_points', 'public.control_points'] LOOP
    IF to_regclass(r) IS NOT NULL THEN PERFORM tenancy.classify(r, 'reference', 'the national control network'); END IF;
  END LOOP;
  FOREACH r IN ARRAY ARRAY['public.coordinate_point_history', 'public.coordinate_points', 'public.land_parcels', 'public.project_control_points',
                           'public.project_csv_imports', 'public.survey_projects', 'public.land_parcels_backup_024',
                           'public.parcels_deprecated_backup_029', 'public.surveyors', 'public.migrations_history', 'public.area_parcels',
                           'public.coordinate_points_full', 'public.land_parcels_full', 'public.land_parcels_project_63',
                           'public.v_import_summary', 'admin.schema_storage', 'admin.surveyor_schemas'] LOOP
    IF to_regclass(r) IS NOT NULL THEN PERFORM tenancy.classify(r, 'system', 'legacy: superseded by survey.* (migration 097) or bookkeeping'); END IF;
  END LOOP;
  FOREACH r IN ARRAY ARRAY['public.projects', 'public.layers', 'public.features', 'public.project_meridian_cache', 'public.workflow_states'] LOOP
    IF to_regclass(r) IS NOT NULL THEN PERFORM tenancy.classify(r, 'pending', 'spatial module and caches: owned by a user, not yet by an authority'); END IF;
  END LOOP;
END $$;

-- ---- what the request role may do ----------------------------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'surveypro_request') THEN
    RAISE NOTICE 'no surveypro_request role: grants skipped (create it, then re-run this block; see docs/AUTHORITY_TENANCY.md)';
    RETURN;
  END IF;
  GRANT USAGE ON SCHEMA survey, app TO surveypro_request;
  GRANT SELECT ON survey.authority TO surveypro_request;
  FOREACH t IN ARRAY ARRAY['survey_projects', 'project_csv_imports', 'coordinate_points', 'land_parcels', 'project_adopted_beacons',
                           'project_control_points', 'coordinate_point_history', 'authority_member'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON survey.%I TO surveypro_request', t);
  END LOOP;
  GRANT SELECT ON survey.v_import_summary TO surveypro_request;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA survey TO surveypro_request;
  -- the references the tables point at
  GRANT SELECT ON public.zim_control_points TO surveypro_request;
  GRANT SELECT (id, email) ON public.users TO surveypro_request;
END $$;
