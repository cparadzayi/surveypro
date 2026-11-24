-- 103: the application runs on the shared tables (SURVEY_STORE=shared).
--
-- Until now a project lived in its surveyor's private schema and the council read a snapshot taken at delivery (migration 102). With
-- SURVEY_STORE=shared the application reads and writes survey.* as the signed-in person (config/sharedDb.js: SET LOCAL ROLE
-- surveypro_request plus app.user_id), so the database itself decides who sees and changes what, and the council's dataset is the working
-- dataset. This migration is what the switch needs below the application:
--
--   1. surveyor_user_id defaults to the person asking (app.user_id()), so a project is always its creator's and a client cannot name another.
--   2. engagement is filled from the surveyor's appointment when a project is created for an authority, so it cannot be claimed or forged.
--   3. a project is FROZEN while it is with the council (delivered, no decision yet) and for good once accepted: nobody but the platform
--      operator changes it. What the council reviews is what they are looking at, and what they accepted cannot move. A return or a rejection
--      unfreezes it for correction; delivering again freezes it again.
--   4. survey.deliver_shared_project(): delivery for a project that already lives in the shared tables is a check and a timestamp, not a copy.
--
-- Nothing here changes the per-surveyor schemas or the snapshot delivery of 102, which stay for as long as SURVEY_STORE=schema is in use.

ALTER TABLE survey.survey_projects ALTER COLUMN surveyor_user_id SET DEFAULT app.user_id();

CREATE OR REPLACE FUNCTION survey.projects_fill_engagement() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, survey AS $$
BEGIN
  IF NEW.authority_id IS NOT NULL AND NEW.engagement IS NULL THEN
    SELECT m.engagement INTO NEW.engagement FROM survey.authority_member m
     WHERE m.user_id = NEW.surveyor_user_id AND m.authority_id = NEW.authority_id AND m.role IN ('surveyor', 'head_surveyor')
       AND m.valid_from <= CURRENT_DATE AND (m.valid_to IS NULL OR m.valid_to > CURRENT_DATE)
     ORDER BY (m.role = 'surveyor') DESC, m.valid_from DESC LIMIT 1;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS survey_projects_fill_engagement ON survey.survey_projects;
CREATE TRIGGER survey_projects_fill_engagement BEFORE INSERT ON survey.survey_projects
  FOR EACH ROW EXECUTE FUNCTION survey.projects_fill_engagement();

-- with the council (delivered and not yet decided), or accepted
CREATE OR REPLACE FUNCTION survey.project_frozen(p_project integer) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, survey AS $$
  SELECT COALESCE((
    SELECT p.delivered_at IS NOT NULL
           AND (NOT EXISTS (SELECT 1 FROM survey.project_review r WHERE r.project_id = p.id AND r.decided_at >= p.delivered_at)
                OR EXISTS (SELECT 1 FROM survey.project_review r WHERE r.project_id = p.id AND r.decision = 'accepted'))
      FROM survey.survey_projects p WHERE p.id = p_project), false)
$$;

CREATE OR REPLACE FUNCTION survey.writable_project_ids(p_user integer, p_platform boolean) RETURNS SETOF integer
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, survey, app AS $$
  SELECT p.id
    FROM survey.survey_projects p
   WHERE p_platform
      OR (NOT survey.project_frozen(p.id)
          AND ((p.surveyor_user_id = p_user
                AND (p.authority_id IS NULL OR p.authority_id IN (SELECT app.my_authorities(p_user, ARRAY['surveyor', 'head_surveyor']))))
               OR (p.authority_id IS NOT NULL AND p.authority_id IN (SELECT app.my_authorities(p_user, ARRAY['head_surveyor'])))))
$$;

-- Delivery of a project that already lives in the shared tables: the checks of survey.deliver_project(), then the timestamp.
CREATE OR REPLACE FUNCTION survey.deliver_shared_project(p_project integer, p_user_id integer, p_authority_code text DEFAULT NULL)
  RETURNS TABLE (project_id integer, delivered_at timestamptz, points integer, parcels integer) LANGUAGE plpgsql AS $$
DECLARE
  cur record;
  auth_id integer;
  eng text;
  now_ts timestamptz := now();
  pcl integer;
  pts integer;
BEGIN
  SELECT p.id, p.surveyor_user_id, p.authority_id, p.survey_class, p.delivered_at AS dat INTO cur FROM survey.survey_projects p WHERE p.id = p_project;
  IF NOT FOUND OR cur.surveyor_user_id <> p_user_id THEN RAISE EXCEPTION 'no such project' USING ERRCODE = 'no_data_found'; END IF;

  IF cur.authority_id IS NOT NULL THEN
    auth_id := cur.authority_id;
    IF NULLIF(p_authority_code, '') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM survey.authority a WHERE a.id = auth_id AND a.code = p_authority_code) THEN
      RAISE EXCEPTION 'authority_changed';
    END IF;
  ELSE
    IF NULLIF(p_authority_code, '') IS NULL THEN RAISE EXCEPTION 'authority_required'; END IF;
    SELECT a.id INTO auth_id FROM survey.authority a WHERE a.code = p_authority_code;
    IF auth_id IS NULL THEN RAISE EXCEPTION 'unknown_authority'; END IF;
  END IF;

  SELECT m.engagement INTO eng FROM survey.authority_member m
   WHERE m.user_id = p_user_id AND m.authority_id = auth_id AND m.role IN ('surveyor', 'head_surveyor')
     AND m.valid_from <= CURRENT_DATE AND (m.valid_to IS NULL OR m.valid_to > CURRENT_DATE)
   ORDER BY (m.role = 'surveyor') DESC, m.valid_from DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_appointed'; END IF;

  IF cur.survey_class IS NULL THEN RAISE EXCEPTION 'no_survey_class'; END IF;
  SELECT count(*)::int INTO pcl FROM survey.land_parcels lp
   WHERE lp.project_id = p_project AND lp.status IN ('finalized', 'approved') AND COALESCE(lp.parcel_status, 'active') = 'active';
  IF pcl = 0 THEN RAISE EXCEPTION 'nothing_to_deliver'; END IF;

  IF EXISTS (SELECT 1 FROM survey.project_review r WHERE r.project_id = p_project AND r.decision = 'accepted') THEN RAISE EXCEPTION 'already_accepted'; END IF;
  IF cur.dat IS NOT NULL AND NOT EXISTS (SELECT 1 FROM survey.project_review r WHERE r.project_id = p_project AND r.decided_at >= cur.dat) THEN
    RAISE EXCEPTION 'awaiting_review';
  END IF;

  UPDATE survey.survey_projects sp
     SET authority_id = auth_id, engagement = COALESCE(sp.engagement, eng), delivered_at = now_ts
   WHERE sp.id = p_project;
  SELECT count(*)::int INTO pts FROM survey.coordinate_points cp WHERE cp.project_id = p_project;
  project_id := p_project; delivered_at := now_ts; points := pts; parcels := pcl;
  RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION survey.deliver_shared_project(integer, integer, text) FROM PUBLIC;
COMMENT ON FUNCTION survey.deliver_shared_project(integer, integer, text) IS
  'Deliver a project that lives in the shared tables: the checks of deliver_project(), then delivered_at. Called by the API as the signed-in surveyor; see migration 103.';

-- A person must be able to read back the project they just created. INSERT ... RETURNING checks the new row against the SELECT policy, and
-- that policy asked a function that queries survey_projects, which cannot see a row inserted by the very statement asking. Naming the owner
-- in the policy itself answers it without the function. It grants nothing new: readable_project_ids() already included the owner's own work.
DROP POLICY IF EXISTS project_select ON survey.survey_projects;
CREATE POLICY project_select ON survey.survey_projects FOR SELECT
  USING (surveyor_user_id = app.user_id()
         OR id IN (SELECT survey.readable_project_ids(app.user_id(), app.is_platform(), app.reader_authority())));
