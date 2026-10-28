-- Migration 106: one ACTIVE project per name, per surveyor schema, enforced by the database
--
-- POST /survey-projects refuses a name the surveyor already uses (case and edge spaces do not
-- make a new name), and an in-process lock stops a double click creating two. Both live in one
-- server process. This index is the guarantee that survives several processes, a script that
-- inserts directly, or a bug in either guard.
--
-- Archived projects (status <> 'active') are outside the index: archiving frees the name, exactly
-- as the route treats it.
--
-- Following the 090/095 pattern:
--   1. one helper function holds the definition,
--   2. the backfill repairs every existing surveyor schema,
--   3. create_surveyor_schema() gains a PERFORM so new surveyors are born with it.
--
-- Safe on data that already holds duplicates: a schema whose active projects already repeat a name
-- is SKIPPED with a NOTICE naming the repeats. Nothing is renamed, archived or deleted, because a
-- project's name may be used in its folder names and its documents. Resolve those by hand, then run
--   SELECT public.add_unique_active_project_name_to_schema('<schema>');
-- Idempotent and non-destructive: creates an index and redefines a function; no row is touched.

CREATE OR REPLACE FUNCTION public.add_unique_active_project_name_to_schema(p_schema_name VARCHAR)
RETURNS BOOLEAN AS $$
DECLARE
  v_repeats TEXT;
BEGIN
  -- Names that repeat among active projects, as "name (ids 3, 9)".
  EXECUTE format($q$
    SELECT string_agg(format('%%s (ids %%s)', n, ids), '; ')
    FROM (
      SELECT lower(btrim(name)) AS n, string_agg(id::text, ', ' ORDER BY id) AS ids
      FROM %I.survey_projects
      WHERE status = 'active'
      GROUP BY 1
      HAVING count(*) > 1
    ) d
  $q$, p_schema_name) INTO v_repeats;

  IF v_repeats IS NOT NULL THEN
    RAISE NOTICE 'Schema % NOT given a unique project-name index: active projects repeat a name: %', p_schema_name, v_repeats;
    RETURN FALSE;
  END IF;

  EXECUTE format(
    'CREATE UNIQUE INDEX IF NOT EXISTS uq_survey_projects_active_name ON %I.survey_projects (lower(btrim(name))) WHERE status = ''active''',
    p_schema_name
  );
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.add_unique_active_project_name_to_schema(VARCHAR) IS
  'Creates a schema''s unique-active-project-name index, or skips it (returning false) when active projects already repeat a name. Called by create_surveyor_schema() and by the 106 backfill. Do not drop.';

-- Backfill, driven off the schemas that exist.
DO $$
DECLARE
  v_schema_name VARCHAR;
  v_done INTEGER := 0;
  v_skipped INTEGER := 0;
BEGIN
  FOR v_schema_name IN
    SELECT t.table_schema
    FROM information_schema.tables t
    WHERE t.table_name = 'survey_projects'
      AND t.table_schema LIKE 'surveyor%'
  LOOP
    IF public.add_unique_active_project_name_to_schema(v_schema_name) THEN
      v_done := v_done + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'Migration 106: % schema(s) protected, % skipped for existing duplicate names', v_done, v_skipped;
END $$;

-- The generator. Rather than copy the whole function body (which other branches have also
-- changed), patch the LIVE definition: add one PERFORM straight after the adopted-beacons one, the
-- last statement that needs survey_projects to exist. Refuses loudly if that anchor has moved.
DO $$
DECLARE
  v_def TEXT;
  v_new TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'create_surveyor_schema';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'Migration 106: public.create_surveyor_schema() not found';
  END IF;

  IF position('add_unique_active_project_name_to_schema' IN v_def) > 0 THEN
    RAISE NOTICE 'Migration 106: create_surveyor_schema() already calls the helper';
    RETURN;
  END IF;

  v_new := regexp_replace(
    v_def,
    '(PERFORM public\.add_project_adopted_beacons_to_schema\(v_schema_name\);)',
    E'\\1\n\n  -- One active project per name (migration 106).\n  PERFORM public.add_unique_active_project_name_to_schema(v_schema_name);'
  );

  IF v_new = v_def THEN
    RAISE EXCEPTION 'Migration 106: could not find the adopted-beacons PERFORM in create_surveyor_schema(); add the PERFORM by hand';
  END IF;

  EXECUTE v_new;
END $$;
