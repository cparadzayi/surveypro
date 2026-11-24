-- 102: delivering a project to its authority, and the authority's review of it.
--
-- Until the application is switched onto the shared tables a project lives in its surveyor's private schema, and the council reads the shared
-- tables (survey.* through survey_share.*). Delivery is the act that puts a project in front of the council:
--
--   survey.deliver_project(schema, project, user, authority_code)
--       takes a SNAPSHOT of one project (its points, parcels, beacons, control points, imports and history) into the shared tables, as that
--       surveyor's project for that authority, and stamps delivered_at. Only that project: the rest of the surveyor's work stays private.
--
-- A snapshot, not a sync: what the council reviews is what was delivered, and the surveyor delivers again (after a return or rejection) to
-- replace it. The shared project row is kept across deliveries so its review history is never lost; only what hangs below it is replaced.
-- Once the application runs on the shared tables this becomes "stamp delivered_at" and the copy goes away.
--
-- What it requires (each refusal is a distinct error code the API turns into a message):
--   authority_required   no authority named and the project (opened from a council job) does not carry one
--   unknown_authority    no such authority
--   not_appointed        the surveyor is not appointed to that authority today (as surveyor or head surveyor)
--   no_survey_class      the surveyor has not declared the SI 727 survey class (migration 101): a wrong class silently changes every verdict
--   nothing_to_deliver   no finalized or approved, active parcel
--   awaiting_review      already delivered and no decision yet
--   already_accepted     the council has accepted it: it is final, a changed survey is a new project
--   authority_changed    the project was delivered to another authority before
-- It runs as the application's owner login, so the caller (the route) must pass the signed-in user, never a value from the request body.
--
-- The review side: a decision may only be recorded on a project that is delivered and has no decision since. That rule lives in the database
-- (trigger below), not only in the route, so no other client can record two decisions on one delivery or review work nobody delivered.

CREATE OR REPLACE FUNCTION survey.deliver_project(p_schema text, p_legacy_id integer, p_user_id integer, p_authority_code text DEFAULT NULL)
  RETURNS TABLE (project_id integer, delivered_at timestamptz, points integer, parcels integer) LANGUAGE plpgsql AS $$
DECLARE
  src jsonb;
  meta jsonb;
  auth_id integer;
  eng text;
  cls text;
  jobid uuid;
  cur record;
  sid integer;
  cols text;
  n integer;
  mapped text;
  colset text;
  pts integer;
  pcl integer;
  now_ts timestamptz := now();
BEGIN
  IF p_schema !~ '^surveyor_[a-z0-9_]+$' THEN RAISE EXCEPTION 'not a per-surveyor schema: %', p_schema; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = p_schema) THEN RAISE EXCEPTION 'no such schema: %', p_schema; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN RAISE EXCEPTION 'no such user: %', p_user_id; END IF;

  EXECUTE format('SELECT to_jsonb(p) FROM %I.survey_projects p WHERE p.id = $1', p_schema) INTO src USING p_legacy_id;
  IF src IS NULL THEN RAISE EXCEPTION 'no such project' USING ERRCODE = 'no_data_found'; END IF;
  meta := COALESCE(src -> 'metadata', '{}'::jsonb);

  SELECT a.id INTO auth_id FROM survey.authority a WHERE a.code = COALESCE(NULLIF(p_authority_code, ''), meta ->> 'authority_code');
  IF auth_id IS NULL THEN
    IF COALESCE(NULLIF(p_authority_code, ''), meta ->> 'authority_code') IS NULL THEN RAISE EXCEPTION 'authority_required'; END IF;
    RAISE EXCEPTION 'unknown_authority';
  END IF;

  SELECT m.engagement INTO eng FROM survey.authority_member m
   WHERE m.user_id = p_user_id AND m.authority_id = auth_id AND m.role IN ('surveyor', 'head_surveyor')
     AND m.valid_from <= CURRENT_DATE AND (m.valid_to IS NULL OR m.valid_to > CURRENT_DATE)
   ORDER BY (m.role = 'surveyor') DESC, m.valid_from DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_appointed'; END IF;

  cls := upper(btrim(meta ->> 'survey_class'));
  IF cls IS NULL OR cls NOT IN ('B', 'C') THEN RAISE EXCEPTION 'no_survey_class'; END IF;

  EXECUTE format($q$SELECT count(*) FROM %I.land_parcels WHERE project_id = $1 AND status IN ('finalized', 'approved')
                    AND COALESCE(parcel_status, 'active') = 'active'$q$, p_schema) INTO pcl USING p_legacy_id;
  IF pcl = 0 THEN RAISE EXCEPTION 'nothing_to_deliver'; END IF;

  IF meta ->> 'external_job_id' ~ '^[0-9a-fA-F-]{36}$' THEN jobid := (meta ->> 'external_job_id')::uuid; END IF;

  SELECT p.id, p.authority_id, p.delivered_at AS dat INTO cur FROM survey.survey_projects p WHERE p.legacy_schema = p_schema AND p.legacy_id = p_legacy_id;
  IF FOUND THEN
    sid := cur.id;
    IF cur.authority_id IS NOT NULL AND cur.authority_id <> auth_id THEN RAISE EXCEPTION 'authority_changed'; END IF;
    IF EXISTS (SELECT 1 FROM survey.project_review r WHERE r.project_id = sid AND r.decision = 'accepted') THEN RAISE EXCEPTION 'already_accepted'; END IF;
    IF cur.dat IS NOT NULL AND NOT EXISTS (SELECT 1 FROM survey.project_review r WHERE r.project_id = sid AND r.decided_at >= cur.dat) THEN
      RAISE EXCEPTION 'awaiting_review';
    END IF;
    -- replace the snapshot; the project row (and with it the review history) stays
    DELETE FROM survey.coordinate_point_history WHERE coordinate_point_history.project_id = sid;
    DELETE FROM survey.coordinate_points        WHERE coordinate_points.project_id = sid;
    DELETE FROM survey.land_parcels             WHERE land_parcels.project_id = sid;
    DELETE FROM survey.project_adopted_beacons  WHERE project_adopted_beacons.project_id = sid;
    DELETE FROM survey.project_control_points   WHERE project_control_points.project_id = sid;
    DELETE FROM survey.project_csv_imports      WHERE project_csv_imports.project_id = sid;
    cols := survey.common_columns(p_schema, 'survey_projects', 'survey_projects', ARRAY['id', 'surveyor_user_id', 'authority_id', 'engagement', 'external_job_id', 'legacy_schema', 'legacy_id', 'delivered_at', 'survey_class']);
    SELECT string_agg(format('%I = o.%I', c, c), ', ') INTO colset FROM unnest(string_to_array(cols, ', ')) AS c;
    IF colset IS NOT NULL THEN
      EXECUTE format('UPDATE survey.survey_projects sp SET %s FROM %I.survey_projects o WHERE sp.id = %L AND o.id = %L', colset, p_schema, sid, p_legacy_id);
    END IF;
  ELSE
    cols := survey.common_columns(p_schema, 'survey_projects', 'survey_projects', ARRAY['id', 'surveyor_user_id', 'authority_id', 'engagement', 'external_job_id', 'legacy_schema', 'legacy_id', 'delivered_at', 'survey_class']);
    EXECUTE format(
      'INSERT INTO survey.survey_projects (%s, surveyor_user_id, legacy_schema, legacy_id)
       SELECT %s, %L::integer, %L, id FROM %I.survey_projects WHERE id = %L RETURNING id',
      cols, cols, p_user_id, p_schema, p_schema, p_legacy_id) INTO sid;
  END IF;
  UPDATE survey.survey_projects sp
     SET authority_id = auth_id, engagement = eng, survey_class = cls, external_job_id = jobid, delivered_at = now_ts
   WHERE sp.id = sid;

  -- imports
  cols := survey.common_columns(p_schema, 'project_csv_imports', 'project_csv_imports', ARRAY['id', 'project_id', 'imported_by', 'legacy_schema', 'legacy_id']);
  EXECUTE format(
    'INSERT INTO survey.project_csv_imports (%s, project_id, imported_by, legacy_schema, legacy_id)
     SELECT %s, %L::integer, CASE WHEN EXISTS (SELECT 1 FROM public.users u WHERE u.id = o.imported_by) THEN o.imported_by END, %L, o.id
       FROM %I.project_csv_imports o WHERE o.project_id = %L',
    cols, (SELECT string_agg('o.' || quote_ident(c), ', ') FROM unnest(string_to_array(cols, ', ')) AS c), sid, p_schema, p_schema, p_legacy_id);

  -- points and parcels
  FOREACH mapped IN ARRAY ARRAY['coordinate_points', 'land_parcels'] LOOP
    cols := survey.common_columns(p_schema, mapped, mapped, ARRAY['id', 'project_id', 'import_id', 'legacy_schema', 'legacy_id']);
    EXECUTE format(
      'INSERT INTO survey.%I (%s, project_id, import_id, legacy_schema, legacy_id)
       SELECT %s, %L::integer, ci.id, %L, o.id
         FROM %I.%I o
         LEFT JOIN survey.project_csv_imports ci ON ci.legacy_schema = %L AND ci.legacy_id = o.import_id
        WHERE o.project_id = %L',
      mapped, cols, (SELECT string_agg('o.' || quote_ident(c), ', ') FROM unnest(string_to_array(cols, ', ')) AS c),
      sid, p_schema, p_schema, mapped, p_schema, p_legacy_id);
    GET DIAGNOSTICS n = ROW_COUNT;
    IF mapped = 'coordinate_points' THEN pts := n; END IF;
  END LOOP;

  -- beacons and control points
  FOREACH mapped IN ARRAY ARRAY['project_adopted_beacons', 'project_control_points'] LOOP
    cols := survey.common_columns(p_schema, mapped, mapped, ARRAY['id', 'project_id', 'legacy_schema', 'legacy_id']);
    EXECUTE format(
      'INSERT INTO survey.%I (%s, project_id, legacy_schema, legacy_id)
       SELECT %s, %L::integer, %L, o.id FROM %I.%I o WHERE o.project_id = %L',
      mapped, cols, (SELECT string_agg('o.' || quote_ident(c), ', ') FROM unnest(string_to_array(cols, ', ')) AS c),
      sid, p_schema, p_schema, mapped, p_legacy_id);
  END LOOP;

  -- history (hangs off an import)
  IF to_regclass(format('%I.coordinate_point_history', p_schema)) IS NOT NULL THEN
    cols := survey.common_columns(p_schema, 'coordinate_point_history', 'coordinate_point_history', ARRAY['id', 'project_id', 'point_id', 'import_id', 'previous_point_id', 'legacy_schema', 'legacy_id']);
    EXECUTE format(
      'INSERT INTO survey.coordinate_point_history (%s, project_id, point_id, import_id, previous_point_id, legacy_schema, legacy_id)
       SELECT %s, ci.project_id, cp.id, ci.id, pp.id, %L, o.id
         FROM %I.coordinate_point_history o
         JOIN survey.project_csv_imports ci ON ci.legacy_schema = %L AND ci.legacy_id = o.import_id AND ci.project_id = %L
         LEFT JOIN survey.coordinate_points cp ON cp.legacy_schema = %L AND cp.legacy_id = o.point_id AND cp.project_id = %L
         LEFT JOIN survey.coordinate_points pp ON pp.legacy_schema = %L AND pp.legacy_id = o.previous_point_id AND pp.project_id = %L',
      cols, (SELECT string_agg('o.' || quote_ident(c), ', ') FROM unnest(string_to_array(cols, ', ')) AS c),
      p_schema, p_schema, p_schema, sid, p_schema, sid, p_schema, sid);
  END IF;

  project_id := sid; delivered_at := now_ts; points := pts; parcels := pcl;
  RETURN NEXT;
END $$;

REVOKE ALL ON FUNCTION survey.deliver_project(text, integer, integer, text) FROM PUBLIC;
COMMENT ON FUNCTION survey.deliver_project(text, integer, integer, text) IS
  'Snapshot one project of a surveyor''s private schema into the shared tables and stamp delivered_at. Called by the API as the signed-in surveyor; see migration 102.';

-- ---- a decision is recorded once per delivery ----------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION survey.project_review_guard() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, survey AS $$
DECLARE
  dat timestamptz;
BEGIN
  SELECT p.delivered_at INTO dat FROM survey.survey_projects p WHERE p.id = NEW.project_id;
  IF dat IS NULL THEN RAISE EXCEPTION 'not_delivered: this project has not been delivered for review' USING ERRCODE = 'check_violation'; END IF;
  IF EXISTS (SELECT 1 FROM survey.project_review r WHERE r.project_id = NEW.project_id AND r.decided_at >= dat) THEN
    RAISE EXCEPTION 'already_decided: this delivery has been decided already' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.decision IN ('rejected', 'returned') AND COALESCE(btrim(NEW.note), '') = '' THEN
    RAISE EXCEPTION 'note_required: say why it is %', NEW.decision USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS project_review_guard ON survey.project_review;
CREATE TRIGGER project_review_guard BEFORE INSERT ON survey.project_review
  FOR EACH ROW EXECUTE FUNCTION survey.project_review_guard();
