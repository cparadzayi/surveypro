-- 104: what a NON-OWNER runtime login needs, and what it must not have.
--
-- Until now the application connected as the owner of its tables (surveypro_app). An owner is not subject to row-level security, so any code that
-- reached survey.* without stepping down to surveypro_request (config/requestDb.js, config/sharedDb.js) ran with every council's rows in reach: one
-- forgotten step-down was a leak nobody would see. This migration is the database half of the fix; the application half is APP_DATABASE_URL.
--
--   owner login (surveypro_app, or whoever runs migrations)   DDL, migrations, operator scripts. DATABASE_URL.
--   runtime login (surveypro_runtime)                          what the server connects as. APP_DATABASE_URL. NOSUPERUSER, NOBYPASSRLS, owns nothing.
--
-- The runtime login has NO privilege on the tenant tables (survey.survey_projects, coordinate_points, land_parcels, ...): it can reach them only by
-- stepping down to surveypro_request, where row-level security applies, so a route that forgets to step down is refused ("permission denied"), not
-- silently served. What it does have:
--   * the ordinary tables of the public schema the application has always used (users, surveyor profiles, the spatial module, control points ...),
--   * the per-surveyor schemas, while SURVEY_STORE=schema is still in use,
--   * SELECT on survey.authority (a reference list) and SELECT / INSERT on survey.launch_token_use (the record that a launch link was used),
--   * EXECUTE on the few functions that need owner power. They are SECURITY DEFINER below, with a fixed search_path, and take WHO IS ASKING as an
--     argument (the lesson of migration 097: a definer function cannot find out for itself). They trust their caller to pass the signed-in person,
--     which is the trust boundary the application server is: the same one VunGIS's system plane is.
--
-- The grants are issued by survey.grant_runtime(role), which the administrator's script (scripts/create-runtime-login.js) calls once the login exists;
-- this migration calls it too if the default login already does. survey.provision_surveyor_schema() creates a surveyor's schema AND gives the
-- calling runtime login its rights on it, so registration keeps working for schemas created after the login was.

-- ---- functions that need owner power run as the owner ---------------------------------------------------------------------------
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'survey.deliver_project(text,integer,integer,text)',
    'survey.deliver_shared_project(integer,integer,text)',
    'public.create_surveyor_schema(character varying)',
    'public.create_project_views(integer)',
    'public.drop_project_views(integer)',
    'public.list_project_views()'] LOOP
    IF to_regprocedure(f) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION %s SECURITY DEFINER SET search_path = pg_catalog, public, survey', f);
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    END IF;
  END LOOP;
END $$;

-- ---- who is appointed, for the checks the server makes on a person's behalf (launch, the register check) --------------------------
-- authority_member has row-level security that answers for the CURRENT person; the server is checking on their behalf with no person set, so the
-- question is asked here, with the person passed in.
CREATE OR REPLACE FUNCTION survey.active_appointment(p_user integer, p_authority_code text, p_roles text[])
  RETURNS TABLE (authority_id integer, role text, engagement text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, survey AS $$
  SELECT a.id, m.role::text, m.engagement::text
    FROM survey.authority_member m JOIN survey.authority a ON a.id = m.authority_id
   WHERE m.user_id = p_user AND a.code = p_authority_code AND a.active AND m.role::text = ANY (p_roles)
     AND m.valid_from <= CURRENT_DATE AND (m.valid_to IS NULL OR m.valid_to > CURRENT_DATE)
   ORDER BY (m.role::text = 'head_surveyor') DESC, m.valid_from DESC
$$;
REVOKE ALL ON FUNCTION survey.active_appointment(integer, text, text[]) FROM PUBLIC;
COMMENT ON FUNCTION survey.active_appointment(integer, text, text[]) IS 'The person''s active appointments at a council, for the server''s own checks on their behalf (migration 104).';

-- ---- a surveyor's schema, created for the runtime login ---------------------------------------------------------------------------
-- create_surveyor_schema() makes the schema as its owner; the login that asked (session_user) is then given its rights on it.
CREATE OR REPLACE FUNCTION public.provision_surveyor_schema(p_username character varying) RETURNS character varying
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  s character varying;
BEGIN
  s := public.create_surveyor_schema(p_username);
  IF s IS NOT NULL AND session_user <> current_user THEN
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I', s, session_user);
    EXECUTE format('GRANT ALL ON ALL TABLES IN SCHEMA %I TO %I', s, session_user);
    EXECUTE format('GRANT ALL ON ALL SEQUENCES IN SCHEMA %I TO %I', s, session_user);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT ALL ON TABLES TO %I', s, session_user);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT ALL ON SEQUENCES TO %I', s, session_user);
  END IF;
  RETURN s;
END $$;
REVOKE ALL ON FUNCTION public.provision_surveyor_schema(character varying) FROM PUBLIC;

-- ---- the grants, in one place ------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION survey.grant_runtime(p_role name) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  s text;
  f text;
  t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = p_role) THEN RAISE EXCEPTION 'no such role: %', p_role; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = p_role AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION '% is a superuser or bypasses row-level security: it is not a runtime login', p_role;
  END IF;

  -- the ordinary tables of public (including the ones migrations add later)
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', p_role);
  -- table by table, and only the ones the caller owns: public also holds extension tables (PostGIS's geocoder) owned by somebody else, which a plain
  -- GRANT ... ON ALL TABLES refuses to touch ("permission denied for table us_lex") and which the application does not use
  FOR t IN SELECT format('%I.%I', n.nspname, c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v') AND pg_has_role(current_user, c.relowner, 'USAGE') LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %s TO %I', t, p_role);
  END LOOP;
  FOR t IN SELECT format('%I.%I', n.nspname, c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'S' AND pg_has_role(current_user, c.relowner, 'USAGE') LOOP
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO %I', t, p_role);
  END LOOP;
  EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I', p_role);
  EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I', p_role);

  -- the per-surveyor schemas that exist now
  FOR s IN SELECT nspname FROM pg_namespace WHERE nspname LIKE 'surveyor\_%' LOOP
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I', s, p_role);
    EXECUTE format('GRANT ALL ON ALL TABLES IN SCHEMA %I TO %I', s, p_role);
    EXECUTE format('GRANT ALL ON ALL SEQUENCES IN SCHEMA %I TO %I', s, p_role);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT ALL ON TABLES TO %I', s, p_role);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT ALL ON SEQUENCES TO %I', s, p_role);
  END LOOP;

  -- survey: the reference list, the launch record, and the functions that need owner power. NOTHING on the tenant tables.
  EXECUTE format('GRANT USAGE ON SCHEMA survey TO %I', p_role);
  EXECUTE format('GRANT SELECT ON survey.authority TO %I', p_role);
  EXECUTE format('GRANT SELECT, INSERT ON survey.launch_token_use TO %I', p_role);
  FOREACH f IN ARRAY ARRAY[
    'survey.deliver_project(text,integer,integer,text)',
    'survey.deliver_shared_project(integer,integer,text)',
    'survey.active_appointment(integer,text,text[])',
    'public.provision_surveyor_schema(character varying)',
    'public.create_project_views(integer)',
    'public.drop_project_views(integer)',
    'public.list_project_views()'] LOOP
    IF to_regprocedure(f) IS NOT NULL THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', f, p_role); END IF;
  END LOOP;
  -- the sequence behind launch_token_use, if it has one
  FOR s IN SELECT format('%I.%I', n.nspname, c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'survey' AND c.relkind = 'S' AND c.relname LIKE 'launch_token_use%' LOOP
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO %I', s, p_role);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION survey.grant_runtime(name) FROM PUBLIC;

-- ---- what a login can reach in the tenant schemas: the contract's check -----------------------------------------------------------
-- tenancy.runtime_reach('surveypro_runtime') must list only survey.authority and survey.launch_token_use (scripts/verify-runtime-login.js).
CREATE OR REPLACE FUNCTION tenancy.runtime_reach(p_role name)
  RETURNS TABLE (relation text, privilege text) LANGUAGE sql STABLE AS $$
  SELECT n.nspname || '.' || c.relname, p.priv
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS p(priv)
   WHERE n.nspname IN ('survey', 'survey_share') AND c.relkind IN ('r', 'p', 'v', 'm')
     AND has_table_privilege(p_role, c.oid, p.priv)
   ORDER BY 1, 2
$$;

-- a login that already exists under the default name is granted now; otherwise create-runtime-login.js does it
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'surveypro_runtime' AND NOT rolsuper AND NOT rolbypassrls) THEN
    PERFORM survey.grant_runtime('surveypro_runtime');
  END IF;
END $$;
