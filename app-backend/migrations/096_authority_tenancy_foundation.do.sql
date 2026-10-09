-- 096: authority tenancy, step 1 of 4 (foundation).
--
-- SurveyPro is offered as a service to local authorities. Until now its only unit of isolation was the surveyor (one schema each),
-- and it had no notion of an authority. A council's survey data was therefore scattered across its surveyors' private schemas, the
-- council could not be given a view of it, and nothing recorded under whose appointment a surveyor was working.
--
-- This migration adds the foundation; nothing the application does today changes:
--   survey.authority          the local authorities that use the service (code = the key VunGIS uses for the same authority)
--   survey.authority_member   who is appointed to an authority, as what, and for how long:
--                               surveyor       works on the authority's projects          (employed or contracted)
--                               head_surveyor  also sees and manages every project of the authority
--                               reviewer       reads the authority's projects and accepts or rejects deliverables
--                             a contracted surveyor may hold appointments with several authorities at once
--   app.*                     who is asking, taken from the connection (the same mechanism VunGIS uses)
--   tenancy.*                 the contract: every relation is classified, and a view lists any that departs from the rules of its class
--   surveypro_request         the role request-scoped work runs as. It neither owns the tables nor bypasses row-level security.
--
-- Migrations 097-099 add the authority-scoped tables, the move of existing data, and the views authorities read.

CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS survey;
CREATE SCHEMA IF NOT EXISTS tenancy;

-- ---- the request role ---------------------------------------------------------------------------------------------------------
-- Creating a role needs CREATEROLE; the application login (surveypro_app) is deliberately not a superuser. If it cannot, say so and
-- carry on: an administrator creates the role once (docs/AUTHORITY_TENANCY.md) and the later migrations grant it what it needs.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'surveypro_request') THEN
    BEGIN
      CREATE ROLE surveypro_request NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'surveypro_request does not exist and this login cannot create it: an administrator must run  CREATE ROLE surveypro_request NOLOGIN;  GRANT surveypro_request TO %;', current_user;
    END;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'surveypro_request') THEN
    BEGIN
      EXECUTE format('GRANT surveypro_request TO %I', current_user);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'could not grant surveypro_request to %: %', current_user, SQLERRM;
    END;
  END IF;
END $$;

-- ---- authorities and appointments ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS survey.authority (
  id          serial PRIMARY KEY,
  code        varchar(30) NOT NULL UNIQUE,
  name        text NOT NULL,
  kind        varchar(20) NOT NULL DEFAULT 'other'
                CHECK (kind IN ('urban', 'rural', 'municipality', 'town_board', 'other')),
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE survey.authority IS 'The local authorities that use SurveyPro. code is the key shared with VunGIS (local_authorities.code).';

CREATE TABLE IF NOT EXISTS survey.authority_member (
  id           serial PRIMARY KEY,
  user_id      integer NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  authority_id integer NOT NULL REFERENCES survey.authority (id),
  role         varchar(20) NOT NULL CHECK (role IN ('surveyor', 'head_surveyor', 'reviewer')),
  engagement   varchar(20) CHECK (engagement IN ('employed', 'contracted')),
  valid_from   date NOT NULL DEFAULT CURRENT_DATE,
  valid_to     date,
  appointed_by integer REFERENCES public.users (id),
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT authority_member_engagement CHECK (role = 'reviewer' OR engagement IS NOT NULL),
  CONSTRAINT authority_member_period CHECK (valid_to IS NULL OR valid_to >= valid_from)
);
-- one open appointment per person, authority and role
CREATE UNIQUE INDEX IF NOT EXISTS uq_authority_member_open ON survey.authority_member (user_id, authority_id, role) WHERE valid_to IS NULL;
CREATE INDEX IF NOT EXISTS idx_authority_member_user ON survey.authority_member (user_id);
CREATE INDEX IF NOT EXISTS idx_authority_member_authority ON survey.authority_member (authority_id);
COMMENT ON TABLE survey.authority_member IS 'Appointments: who works for which authority, as what, employed or contracted, and from when to when.';
COMMENT ON COLUMN survey.authority_member.valid_to IS 'The first day the appointment NO LONGER applies (exclusive), so ending an appointment today takes effect today. NULL = no end.';

-- A login that belongs to one authority and reads its shared views (migration 099). Maps the database role to the authority.
CREATE TABLE IF NOT EXISTS tenancy.role_authority (
  role_name    name PRIMARY KEY,
  authority_id integer NOT NULL REFERENCES survey.authority (id)
);

CREATE OR REPLACE FUNCTION tenancy.role_authority_of(p_role name) RETURNS integer
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
  SELECT authority_id FROM tenancy.role_authority WHERE role_name = p_role
$$;
REVOKE ALL ON FUNCTION tenancy.role_authority_of(name) FROM PUBLIC;

-- ---- who is asking ------------------------------------------------------------------------------------------------------------
-- The application sets app.user_id (users.id) and app.platform for the request it is serving. A direct client (a login in
-- tenancy.role_authority) is answered from its role first, so it cannot become somebody else by setting these itself.
CREATE OR REPLACE FUNCTION app.user_id() RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN tenancy.role_authority_of(current_user) IS NOT NULL THEN NULL
              ELSE NULLIF(current_setting('app.user_id', true), '')::integer END
$$;
CREATE OR REPLACE FUNCTION app.is_platform() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN tenancy.role_authority_of(current_user) IS NOT NULL THEN false
              ELSE COALESCE(NULLIF(current_setting('app.platform', true), '')::boolean, false) END
$$;
CREATE OR REPLACE FUNCTION app.reader_authority() RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT tenancy.role_authority_of(current_user)
$$;

-- The authorities a person is appointed to today, optionally only in certain roles. Reads the appointments as the owner so the
-- policies that call it do not depend on who may read survey.authority_member.
--
-- The person is an ARGUMENT, not read from the connection: inside a SECURITY DEFINER function current_user is the owner, so a
-- function that worked out "who is asking" for itself would believe whatever app.user_id the caller had set. The policies pass
-- app.user_id(), which is evaluated as the caller and answers a direct-client login from its role.
DROP FUNCTION IF EXISTS app.my_authorities(text[]);
CREATE OR REPLACE FUNCTION app.my_authorities(p_user integer, p_roles text[] DEFAULT NULL) RETURNS SETOF integer
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, survey AS $$
  SELECT m.authority_id
    FROM survey.authority_member m
   WHERE m.user_id = p_user
     AND m.valid_from <= CURRENT_DATE AND (m.valid_to IS NULL OR m.valid_to > CURRENT_DATE)
     AND (p_roles IS NULL OR m.role = ANY (p_roles))
$$;

-- ---- the contract -------------------------------------------------------------------------------------------------------------
-- Every relation in the schemas SurveyPro owns has a class; a view lists any that departs from the rules of its class.
--   tenant        rows belong to a project, and through it to an authority and a surveyor: row-level security decides who sees them
--   personal      about one person (accounts, profiles)
--   reference     shared, read-only for request-scoped work (control points, authorities)
--   system        no access for request-scoped work (legacy tables, bookkeeping)
--   pending       a known gap: owned data without row-level security yet. The count may only fall.
CREATE TABLE IF NOT EXISTS tenancy.relation_class (
  relation  text PRIMARY KEY,
  class     text NOT NULL CHECK (class IN ('tenant', 'tenant_view', 'personal', 'reference', 'system', 'pending')),
  note      text
);

CREATE OR REPLACE FUNCTION tenancy.classify(p_relation text, p_class text, p_note text DEFAULT NULL) RETURNS void
  LANGUAGE sql AS $$
  INSERT INTO tenancy.relation_class (relation, class, note) VALUES (p_relation, p_class, p_note)
  ON CONFLICT (relation) DO UPDATE SET class = EXCLUDED.class, note = COALESCE(EXCLUDED.note, tenancy.relation_class.note)
$$;

CREATE OR REPLACE FUNCTION tenancy.request_can(p_rel oid, p_priv text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'surveypro_request') AND has_table_privilege('surveypro_request', p_rel, p_priv)
$$;

-- Per-surveyor schemas (surveyor_<name>) are created at run time and cannot be listed in advance. They are the legacy storage that
-- migration 098 moves into survey.*; until they are retired, the request role must not be able to reach them.
CREATE OR REPLACE VIEW tenancy.surveyor_schema_access AS
  SELECT n.nspname::text AS schema_name, c.relname::text AS relation
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname LIKE 'surveyor\_%' AND c.relkind IN ('r', 'p', 'v', 'm')
     AND (tenancy.request_can(c.oid, 'SELECT') OR tenancy.request_can(c.oid, 'INSERT')
          OR tenancy.request_can(c.oid, 'UPDATE') OR tenancy.request_can(c.oid, 'DELETE'));

CREATE OR REPLACE VIEW tenancy.violations AS
WITH rel AS (
  SELECT n.nspname || '.' || c.relname AS relation, c.oid, c.relkind, c.relrowsecurity AS rls, c.reloptions
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind IN ('r', 'p', 'v', 'm')
     AND n.nspname IN ('public', 'survey', 'admin')
     AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')   -- extension objects (PostGIS and friends)
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
       k.class IN ('system') AND (tenancy.request_can(r.oid, 'SELECT') OR tenancy.request_can(r.oid, 'INSERT')
                                  OR tenancy.request_can(r.oid, 'UPDATE') OR tenancy.request_can(r.oid, 'DELETE')),
       'the request role can reach a system relation'),
    ('reference_writable',
       k.class = 'reference' AND r.relkind IN ('r', 'p')
         AND (tenancy.request_can(r.oid, 'INSERT') OR tenancy.request_can(r.oid, 'UPDATE') OR tenancy.request_can(r.oid, 'DELETE')),
       'reference data must be read-only for request-scoped work')
  ) AS v(rule, broken, detail)
 WHERE v.broken;

CREATE OR REPLACE VIEW tenancy.debt AS
  SELECT split_part(relation, '.', 1) AS schema, count(*)::integer AS relations, string_agg(split_part(relation, '.', 2), ', ' ORDER BY relation) AS names
    FROM tenancy.relation_class WHERE class = 'pending' GROUP BY 1;

COMMENT ON VIEW tenancy.violations IS 'Relations that depart from the rules of their class. Must be empty (scripts/verify-tenancy.js).';

-- ---- what the request role needs to evaluate the policies --------------------------------------------------------------------
-- app.user_id() asks tenancy.role_authority_of() who is calling, so the role must be able to run it (and nothing else in tenancy).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'surveypro_request') THEN
    GRANT USAGE ON SCHEMA tenancy TO surveypro_request;
    GRANT EXECUTE ON FUNCTION tenancy.role_authority_of(name) TO surveypro_request;
  END IF;
END $$;
