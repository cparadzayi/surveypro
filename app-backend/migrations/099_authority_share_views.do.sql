-- 099: authority tenancy, step 4 of 4 (what an authority sees, and how it accepts work).
--
-- An authority reads the survey work done for it the way VunGIS lets councils read its layers: through a login of its own that is
-- tied to ONE authority and can read only views, never the tables behind them.
--
--   survey_share.*       projects, points, parcels, beacons and review decisions. Each view filters itself with the same rule the
--                        tables use (survey.readable_project_ids), so an authority's login sees its own authority's projects and
--                        nothing else, and a surveyor who queries them sees their own work.
--   survey_reader        the group those logins belong to. It may select from survey_share.* and from nothing else.
--   <login> -> authority tenancy.role_authority ties each login to its authority; the database answers who the caller is from the
--                        role first, so a login cannot become somebody else by setting app.user_id (scripts/create-authority-reader.js
--                        creates the login and records the mapping).
--   survey.project_review  an authority's reviewer accepts, rejects or returns a delivered project. Append-only, never by the project's
--                        own surveyor, and never by anyone not appointed reviewer or head surveyor of that authority.
--
-- Coordinates are carried with their axes spelled out. SurveyPro stores Cape / Lo (EPSG:2228x-2229x) south-orientated: the X ordinate is
-- the WESTING and the Y ordinate the SOUTHING. A point in any other system is given as easting / northing. axis_order says which, and
-- srid / lo_zone say in what system, so nothing downstream has to guess (UTM and other projections fit without a change here).

-- ---- reviewers are people, not necessarily surveyors --------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_new_user_type_check') THEN
    ALTER TABLE public.users DROP CONSTRAINT users_new_user_type_check;
  END IF;
  ALTER TABLE public.users ADD CONSTRAINT users_new_user_type_check
    CHECK (user_type::text = ANY (ARRAY['registered_surveyor', 'surveyor_in_training', 'technician', 'student', 'authority_reviewer']));
END $$;

-- ---- delivery and review -------------------------------------------------------------------------------------------------------
ALTER TABLE survey.survey_projects ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
COMMENT ON COLUMN survey.survey_projects.delivered_at IS 'When the surveyor delivered the project to the authority for review. NULL while it is still being worked on.';

CREATE TABLE IF NOT EXISTS survey.project_review (
  id               serial PRIMARY KEY,
  project_id       integer NOT NULL REFERENCES survey.survey_projects (id) ON DELETE CASCADE,
  decision         varchar(12) NOT NULL CHECK (decision IN ('accepted', 'rejected', 'returned')),
  note             text,
  reviewer_user_id integer NOT NULL REFERENCES public.users (id) DEFAULT app.user_id(),
  decided_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_project_review_project ON survey.project_review (project_id, decided_at DESC);

-- projects a person may review: their authority's, appointed reviewer or head surveyor, and never their own work
DROP FUNCTION IF EXISTS survey.reviewable_project_ids(integer, boolean);
CREATE OR REPLACE FUNCTION survey.reviewable_project_ids(p_user integer, p_platform boolean) RETURNS SETOF integer
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, survey, app AS $$
  SELECT p.id
    FROM survey.survey_projects p
   WHERE p.surveyor_user_id <> p_user
     AND (p_platform
          OR (p.authority_id IS NOT NULL AND p.authority_id IN (SELECT app.my_authorities(p_user, ARRAY['head_surveyor', 'reviewer']))))
$$;

ALTER TABLE survey.project_review ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS review_select ON survey.project_review;
DROP POLICY IF EXISTS review_insert ON survey.project_review;
CREATE POLICY review_select ON survey.project_review FOR SELECT
  USING (project_id IN (SELECT survey.readable_project_ids(app.user_id(), app.is_platform(), app.reader_authority())));
CREATE POLICY review_insert ON survey.project_review FOR INSERT
  WITH CHECK (reviewer_user_id = app.user_id() AND project_id IN (SELECT survey.reviewable_project_ids(app.user_id(), app.is_platform())));

-- ---- the groups ----------------------------------------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'survey_reader') THEN
    BEGIN
      CREATE ROLE survey_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'survey_reader does not exist and this login cannot create it: an administrator must run  CREATE ROLE survey_reader NOLOGIN;';
    END;
  END IF;
END $$;

-- ---- the contract grows a class for what an authority may read ------------------------------------------------------------------
ALTER TABLE tenancy.relation_class DROP CONSTRAINT IF EXISTS relation_class_class_check;
ALTER TABLE tenancy.relation_class ADD CONSTRAINT relation_class_class_check
  CHECK (class IN ('tenant', 'tenant_view', 'share_view', 'personal', 'reference', 'system', 'pending'));

CREATE OR REPLACE FUNCTION tenancy.role_can(p_role name, p_rel oid, p_priv text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = p_role) AND has_table_privilege(p_role::text, p_rel, p_priv)
$$;

-- ---- the shared views ----------------------------------------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS survey_share;

CREATE OR REPLACE VIEW survey_share.projects AS
SELECT p.id, a.code AS authority_code, a.name AS authority_name, p.name, p.survey_type, p.client_name, p.township, p.district,
       p.designation, p.parent_property, p.whole_portion, p.survey_date, p.central_meridian, p.datum, p.status,
       p.engagement, p.external_job_id, p.delivered_at,
       sp.name AS surveyor_name, sp.license_number AS surveyor_licence, sp.firm AS surveyor_firm,
       r.decision AS review_decision, r.decided_at AS reviewed_at, r.note AS review_note,
       p.created_at, p.updated_at
  FROM survey.survey_projects p
  LEFT JOIN survey.authority a ON a.id = p.authority_id
  LEFT JOIN public.surveyor_profiles sp ON sp.user_id = p.surveyor_user_id
  LEFT JOIN LATERAL (SELECT x.decision, x.decided_at, x.note FROM survey.project_review x
                      WHERE x.project_id = p.id ORDER BY x.decided_at DESC, x.id DESC LIMIT 1) r ON true
 WHERE p.id IN (SELECT survey.readable_project_ids(app.user_id(), app.is_platform(), app.reader_authority()));

CREATE OR REPLACE VIEW survey_share.points AS
SELECT cp.id, cp.project_id, cp.name, cp.elevation, cp.description, cp.status, cp.survey_date,
       public.ST_SRID(cp.geom) AS srid,
       CASE WHEN public.ST_SRID(cp.geom) IN (22285, 22287, 22289, 22291, 22293) THEN public.ST_SRID(cp.geom) - 22260 END AS lo_zone,
       CASE WHEN public.ST_SRID(cp.geom) IN (22285, 22287, 22289, 22291, 22293) THEN 'westing_southing' ELSE 'easting_northing' END AS axis_order,
       CASE WHEN public.ST_SRID(cp.geom) IN (22285, 22287, 22289, 22291, 22293) THEN public.ST_X(cp.geom) END AS y_westing,
       CASE WHEN public.ST_SRID(cp.geom) IN (22285, 22287, 22289, 22291, 22293) THEN public.ST_Y(cp.geom) END AS x_southing,
       CASE WHEN public.ST_SRID(cp.geom) NOT IN (22285, 22287, 22289, 22291, 22293) THEN public.ST_X(cp.geom) END AS easting,
       CASE WHEN public.ST_SRID(cp.geom) NOT IN (22285, 22287, 22289, 22291, 22293) THEN public.ST_Y(cp.geom) END AS northing,
       cp.geom
  FROM survey.coordinate_points cp
 WHERE cp.geom IS NOT NULL
   AND cp.project_id IN (SELECT survey.readable_project_ids(app.user_id(), app.is_platform(), app.reader_authority()));

CREATE OR REPLACE VIEW survey_share.parcels AS
SELECT lp.id, lp.project_id, lp.stand, lp.designation, lp.owner, lp.title_deed, lp.survey_date, lp.area_m2, lp.area_ha, lp.perimeter_m,
       lp.closure_error_m, lp.closure_ratio, lp.status, lp.parcel_status, public.ST_SRID(lp.geom) AS srid,
       CASE WHEN public.ST_SRID(lp.geom) IN (22285, 22287, 22289, 22291, 22293) THEN public.ST_SRID(lp.geom) - 22260 END AS lo_zone,
       CASE WHEN public.ST_SRID(lp.geom) IN (22285, 22287, 22289, 22291, 22293) THEN 'westing_southing' ELSE 'easting_northing' END AS axis_order,
       lp.geom
  FROM survey.land_parcels lp
 WHERE lp.project_id IN (SELECT survey.readable_project_ids(app.user_id(), app.is_platform(), app.reader_authority()));

CREATE OR REPLACE VIEW survey_share.beacons AS
SELECT b.id, b.project_id, b.sr_number, b.point_name, b.y AS y_westing, b.x AS x_southing, b.status, b.description, b.survey_date, b.point_order
  FROM survey.project_adopted_beacons b
 WHERE b.project_id IN (SELECT survey.readable_project_ids(app.user_id(), app.is_platform(), app.reader_authority()));

CREATE OR REPLACE VIEW survey_share.reviews AS
SELECT r.id, r.project_id, r.decision, r.note, r.decided_at, u.email AS reviewer_email
  FROM survey.project_review r
  LEFT JOIN public.users u ON u.id = r.reviewer_user_id
 WHERE r.project_id IN (SELECT survey.readable_project_ids(app.user_id(), app.is_platform(), app.reader_authority()));

COMMENT ON SCHEMA survey_share IS 'What an authority (and a surveyor, for their own work) may read. Views only; each filters itself with survey.readable_project_ids().';

-- ---- the guard learns about them ------------------------------------------------------------------------------------------------
-- Same rules as before, plus: the reader group may reach nothing but share views.
CREATE OR REPLACE VIEW tenancy.violations AS
WITH rel AS (
  SELECT n.nspname || '.' || c.relname AS relation, c.oid, c.relkind, c.relrowsecurity AS rls, c.reloptions
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind IN ('r', 'p', 'v', 'm')
     AND n.nspname IN ('public', 'survey', 'survey_share', 'admin')
     AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
)
SELECT r.relation, COALESCE(k.class, '(none)') AS class, v.rule, v.detail
  FROM rel r
  LEFT JOIN tenancy.relation_class k ON k.relation = r.relation
  CROSS JOIN LATERAL (VALUES
    ('unclassified'::text,
       k.relation IS NULL,
       'not in tenancy.relation_class: classify it'),
    ('needs_rls',
       k.class = 'tenant' AND r.relkind IN ('r', 'p') AND NOT r.rls,
       'tenant data without row-level security'),
    ('view_runs_as_owner',
       k.class = 'tenant_view' AND NOT COALESCE(r.reloptions @> ARRAY['security_invoker=true'], false),
       'a tenant view must be security_invoker, or it shows the owner''s rows to everyone'),
    ('system_reachable',
       k.class = 'system' AND (tenancy.request_can(r.oid, 'SELECT') OR tenancy.request_can(r.oid, 'INSERT')
                               OR tenancy.request_can(r.oid, 'UPDATE') OR tenancy.request_can(r.oid, 'DELETE')),
       'the request role can reach a system relation'),
    ('reference_writable',
       k.class = 'reference' AND r.relkind IN ('r', 'p')
         AND (tenancy.request_can(r.oid, 'INSERT') OR tenancy.request_can(r.oid, 'UPDATE') OR tenancy.request_can(r.oid, 'DELETE')),
       'reference data must be read-only for request-scoped work'),
    ('reader_reaches_base',
       k.class IN ('tenant', 'tenant_view', 'personal', 'system', 'pending', 'reference')
         AND (tenancy.role_can('survey_reader', r.oid, 'SELECT') OR tenancy.role_can('survey_reader', r.oid, 'INSERT')
              OR tenancy.role_can('survey_reader', r.oid, 'UPDATE') OR tenancy.role_can('survey_reader', r.oid, 'DELETE')),
       'an authority''s reader login may read share views only, never the tables behind them'),
    ('reader_writes',
       k.class = 'share_view'
         AND (tenancy.role_can('survey_reader', r.oid, 'INSERT') OR tenancy.role_can('survey_reader', r.oid, 'UPDATE') OR tenancy.role_can('survey_reader', r.oid, 'DELETE')),
       'a share view is read-only')
  ) AS v(rule, broken, detail)
 WHERE v.broken;

-- ---- classify and grant ----------------------------------------------------------------------------------------------------------
SELECT tenancy.classify('survey.project_review', 'tenant', 'append-only decisions of an authority''s reviewers (migration 099)');
SELECT tenancy.classify('survey_share.projects', 'share_view', 'what an authority may read (migration 099)');
SELECT tenancy.classify('survey_share.points', 'share_view', 'what an authority may read (migration 099)');
SELECT tenancy.classify('survey_share.parcels', 'share_view', 'what an authority may read (migration 099)');
SELECT tenancy.classify('survey_share.beacons', 'share_view', 'what an authority may read (migration 099)');
SELECT tenancy.classify('survey_share.reviews', 'share_view', 'what an authority may read (migration 099)');

DO $$
DECLARE v text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'survey_reader') THEN
    GRANT USAGE ON SCHEMA survey_share TO survey_reader;
    FOREACH v IN ARRAY ARRAY['projects', 'points', 'parcels', 'beacons', 'reviews'] LOOP
      EXECUTE format('GRANT SELECT ON survey_share.%I TO survey_reader', v);
    END LOOP;
    -- a reader login evaluates the filter, so it must be able to run what the filter calls
    GRANT USAGE ON SCHEMA app, tenancy TO survey_reader;
    GRANT EXECUTE ON FUNCTION tenancy.role_authority_of(name) TO survey_reader;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'surveypro_request') THEN
    GRANT USAGE ON SCHEMA survey_share TO surveypro_request;
    FOREACH v IN ARRAY ARRAY['projects', 'points', 'parcels', 'beacons', 'reviews'] LOOP
      EXECUTE format('GRANT SELECT ON survey_share.%I TO surveypro_request', v);
    END LOOP;
    GRANT SELECT, INSERT ON survey.project_review TO surveypro_request;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA survey TO surveypro_request;
    GRANT SELECT (id, email) ON public.users TO surveypro_request;
  END IF;
END $$;
