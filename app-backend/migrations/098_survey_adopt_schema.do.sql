-- 098: authority tenancy, step 3 of 4 (moving existing work into the shared tables).
--
-- survey.adopt_surveyor_schema(schema, user, authority, engagement) copies everything in one surveyor's private schema into survey.*,
-- as that surveyor's projects for that authority (or as private practice when the authority is NULL). It is:
--   * explicit     somebody has to say which authority the work belongs to; nothing is guessed from a name or a firm
--   * repeatable   every copied row remembers where it came from (legacy_schema, legacy_id), so running it twice copies nothing twice
--   * a copy       the private schema is left untouched; retiring it is a separate, later decision
--   * atomic       one transaction: either the whole schema moves or none of it
--   * tolerant     older private schemas lack some columns; only the columns both sides have are copied
-- It is not granted to the request role: moving data is an operator's act. survey.unadopted_schemas lists what is left to move.

CREATE OR REPLACE FUNCTION survey.common_columns(p_src_schema text, p_src_table text, p_dst_table text, p_exclude text[] DEFAULT '{}')
  RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(string_agg(quote_ident(s.column_name), ', ' ORDER BY s.ordinal_position), '')
    FROM information_schema.columns s
    JOIN information_schema.columns d ON d.table_schema = 'survey' AND d.table_name = p_dst_table AND d.column_name = s.column_name
   WHERE s.table_schema = p_src_schema AND s.table_name = p_src_table AND s.column_name <> ALL (p_exclude)
$$;

CREATE OR REPLACE FUNCTION survey.adopt_surveyor_schema(p_schema text, p_user_id integer, p_authority_id integer, p_engagement text DEFAULT NULL)
  RETURNS TABLE (relation text, copied integer) LANGUAGE plpgsql AS $$
DECLARE
  cols text;
  n integer;
  mapped text;
BEGIN
  IF p_schema !~ '^surveyor_[a-z0-9_]+$' THEN RAISE EXCEPTION 'not a per-surveyor schema: %', p_schema; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = p_schema) THEN RAISE EXCEPTION 'no such schema: %', p_schema; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN RAISE EXCEPTION 'no such user: %', p_user_id; END IF;
  IF p_authority_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM survey.authority WHERE id = p_authority_id) THEN RAISE EXCEPTION 'no such authority: %', p_authority_id; END IF;
    IF p_engagement IS NULL OR p_engagement NOT IN ('employed', 'contracted') THEN RAISE EXCEPTION 'say whether the surveyor is employed or contracted'; END IF;
  END IF;

  -- projects
  cols := survey.common_columns(p_schema, 'survey_projects', 'survey_projects', ARRAY['id', 'surveyor_user_id', 'authority_id', 'engagement', 'external_job_id', 'legacy_schema', 'legacy_id']);
  EXECUTE format(
    'INSERT INTO survey.survey_projects (%s, surveyor_user_id, authority_id, engagement, legacy_schema, legacy_id)
     SELECT %s, %L::integer, %L::integer, %L, %L, id FROM %I.survey_projects
     ON CONFLICT (legacy_schema, legacy_id) DO NOTHING', cols, cols, p_user_id, p_authority_id, p_engagement, p_schema, p_schema);
  GET DIAGNOSTICS n = ROW_COUNT; relation := 'survey_projects'; copied := n; RETURN NEXT;
  -- A project opened from an authority's job (POST /auth/launch) remembers, in its metadata, which authority it is for, how the
  -- surveyor was engaged, and the authority's reference for the job. Those win over the authority named for the whole schema.
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = p_schema AND table_name = 'survey_projects' AND column_name = 'metadata') THEN
    EXECUTE format(
      'UPDATE survey.survey_projects sp
          SET authority_id = COALESCE(a.id, sp.authority_id),
              engagement = COALESCE(NULLIF(o.metadata ->> ''engagement'', ''''), sp.engagement),
              external_job_id = CASE WHEN o.metadata ->> ''external_job_id'' ~ ''^[0-9a-fA-F-]{36}$'' THEN (o.metadata ->> ''external_job_id'')::uuid ELSE sp.external_job_id END
         FROM %I.survey_projects o
         LEFT JOIN survey.authority a ON a.code = o.metadata ->> ''authority_code''
        WHERE sp.legacy_schema = %L AND sp.legacy_id = o.id AND o.metadata ? ''external_job_id''',
      p_schema, p_schema);
  END IF;

  -- imports (their project)
  cols := survey.common_columns(p_schema, 'project_csv_imports', 'project_csv_imports', ARRAY['id', 'project_id', 'imported_by', 'legacy_schema', 'legacy_id']);
  EXECUTE format(
    'INSERT INTO survey.project_csv_imports (%s, project_id, imported_by, legacy_schema, legacy_id)
     SELECT %s, sp.id, CASE WHEN EXISTS (SELECT 1 FROM public.users u WHERE u.id = o.imported_by) THEN o.imported_by END, %L, o.id
       FROM %I.project_csv_imports o
       JOIN survey.survey_projects sp ON sp.legacy_schema = %L AND sp.legacy_id = o.project_id
     ON CONFLICT (legacy_schema, legacy_id) DO NOTHING',
    cols, (SELECT string_agg('o.' || quote_ident(c), ', ') FROM unnest(string_to_array(cols, ', ')) AS c), p_schema, p_schema, p_schema);
  GET DIAGNOSTICS n = ROW_COUNT; relation := 'project_csv_imports'; copied := n; RETURN NEXT;

  -- points and parcels (their project, and the import they came from)
  FOREACH mapped IN ARRAY ARRAY['coordinate_points', 'land_parcels'] LOOP
    cols := survey.common_columns(p_schema, mapped, mapped, ARRAY['id', 'project_id', 'import_id', 'legacy_schema', 'legacy_id']);
    EXECUTE format(
      'INSERT INTO survey.%I (%s, project_id, import_id, legacy_schema, legacy_id)
       SELECT %s, sp.id, ci.id, %L, o.id
         FROM %I.%I o
         JOIN survey.survey_projects sp ON sp.legacy_schema = %L AND sp.legacy_id = o.project_id
         LEFT JOIN survey.project_csv_imports ci ON ci.legacy_schema = %L AND ci.legacy_id = o.import_id
       ON CONFLICT (legacy_schema, legacy_id) DO NOTHING',
      mapped, cols, (SELECT string_agg('o.' || quote_ident(c), ', ') FROM unnest(string_to_array(cols, ', ')) AS c),
      p_schema, p_schema, mapped, p_schema, p_schema);
    GET DIAGNOSTICS n = ROW_COUNT; relation := mapped; copied := n; RETURN NEXT;
  END LOOP;

  -- beacons and control points (their project)
  FOREACH mapped IN ARRAY ARRAY['project_adopted_beacons', 'project_control_points'] LOOP
    cols := survey.common_columns(p_schema, mapped, mapped, ARRAY['id', 'project_id', 'legacy_schema', 'legacy_id']);
    EXECUTE format(
      'INSERT INTO survey.%I (%s, project_id, legacy_schema, legacy_id)
       SELECT %s, sp.id, %L, o.id
         FROM %I.%I o
         JOIN survey.survey_projects sp ON sp.legacy_schema = %L AND sp.legacy_id = o.project_id
       ON CONFLICT (legacy_schema, legacy_id) DO NOTHING',
      mapped, cols, (SELECT string_agg('o.' || quote_ident(c), ', ') FROM unnest(string_to_array(cols, ', ')) AS c),
      p_schema, p_schema, mapped, p_schema);
    GET DIAGNOSTICS n = ROW_COUNT; relation := mapped; copied := n; RETURN NEXT;
  END LOOP;

  -- history (hangs off an import; carries the import's project here)
  IF to_regclass(format('%I.coordinate_point_history', p_schema)) IS NOT NULL THEN
    cols := survey.common_columns(p_schema, 'coordinate_point_history', 'coordinate_point_history', ARRAY['id', 'project_id', 'point_id', 'import_id', 'previous_point_id', 'legacy_schema', 'legacy_id']);
    EXECUTE format(
      'INSERT INTO survey.coordinate_point_history (%s, project_id, point_id, import_id, previous_point_id, legacy_schema, legacy_id)
       SELECT %s, ci.project_id, cp.id, ci.id, pp.id, %L, o.id
         FROM %I.coordinate_point_history o
         JOIN survey.project_csv_imports ci ON ci.legacy_schema = %L AND ci.legacy_id = o.import_id
         LEFT JOIN survey.coordinate_points cp ON cp.legacy_schema = %L AND cp.legacy_id = o.point_id
         LEFT JOIN survey.coordinate_points pp ON pp.legacy_schema = %L AND pp.legacy_id = o.previous_point_id
       ON CONFLICT (legacy_schema, legacy_id) DO NOTHING',
      cols, (SELECT string_agg('o.' || quote_ident(c), ', ') FROM unnest(string_to_array(cols, ', ')) AS c),
      p_schema, p_schema, p_schema, p_schema, p_schema);
    GET DIAGNOSTICS n = ROW_COUNT; relation := 'coordinate_point_history'; copied := n; RETURN NEXT;
  END IF;
END $$;

REVOKE ALL ON FUNCTION survey.adopt_surveyor_schema(text, integer, integer, text) FROM PUBLIC;

-- What is left to move: each surveyor profile that still has a private schema, and whether its rows are in survey.* yet.
CREATE OR REPLACE VIEW survey.unadopted_schemas AS
  SELECT sp.id AS profile_id, sp.user_id, sp.name, sp.firm, sp.schema_name,
         EXISTS (SELECT 1 FROM survey.survey_projects p WHERE p.legacy_schema = sp.schema_name) AS adopted
    FROM public.surveyor_profiles sp
   WHERE sp.schema_name LIKE 'surveyor\_%';
COMMENT ON VIEW survey.unadopted_schemas IS 'Per-surveyor schemas and whether survey.adopt_surveyor_schema() has moved them. Operator use.';

SELECT tenancy.classify('survey.unadopted_schemas', 'system', 'operator view: per-surveyor schemas still to be moved (migration 098)');
