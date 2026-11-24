-- 101: a project records the SI 727 survey class it was done to.
--
-- SI 727 (the Land Survey (General) Regulations, 1979, Second Schedule paras 7 and 8) prescribes limits of error for survey classes. Para 1
-- defines class A (town survey-marks), B (townships) and C (every other survey); a parcel survey is B or C, which are the two the code holds limits
-- for (app-shared/si727Tolerances.js). The class changes every verdict made against
-- those limits, and a wrong class does so silently, so the surveyor must DECLARE it rather than leave it to a default. Until now it was only a
-- temporary choice in an analysis dialog and was never saved on the project, so nothing downstream (the council reading the work, the cadastre
-- the work enters) could know which limits the survey was held to.
--
--   survey.survey_projects.survey_class   'B' or 'C', NULL until declared
--
-- A class is a property of the SURVEY. It says nothing about how far the record has got (delivered, accepted by the council, approved by the
-- Surveyor-General): that is shown by delivered_at, survey.project_review and the council's own register.
--
-- Before the application is switched to the shared tables a project lives in its surveyor's schema, where the class is declared in the project's
-- metadata (PATCH /api/survey-projects/:id/survey-class). The trigger below promotes it to the column when survey.adopt_surveyor_schema() copies
-- the project, the same way the launch's authority, engagement and job link are promoted.

ALTER TABLE survey.survey_projects ADD COLUMN IF NOT EXISTS survey_class char(1);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'survey_projects_survey_class_check') THEN
    ALTER TABLE survey.survey_projects ADD CONSTRAINT survey_projects_survey_class_check CHECK (survey_class IN ('B', 'C'));
  END IF;
END $$;
COMMENT ON COLUMN survey.survey_projects.survey_class IS 'SI 727 survey class the project was done to (B or C), declared by the surveyor. A property of the survey, not of the record''s state.';

CREATE OR REPLACE FUNCTION survey.projects_fill_survey_class() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.survey_class IS NULL AND upper(btrim(NEW.metadata ->> 'survey_class')) IN ('B', 'C') THEN
    NEW.survey_class := upper(btrim(NEW.metadata ->> 'survey_class'));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS survey_projects_fill_survey_class ON survey.survey_projects;
CREATE TRIGGER survey_projects_fill_survey_class BEFORE INSERT ON survey.survey_projects
  FOR EACH ROW EXECUTE FUNCTION survey.projects_fill_survey_class();

-- what the council reads: the same view as before, with the class added at the end
CREATE OR REPLACE VIEW survey_share.projects AS
SELECT p.id, a.code AS authority_code, a.name AS authority_name, p.name, p.survey_type, p.client_name, p.township, p.district,
       p.designation, p.parent_property, p.whole_portion, p.survey_date, p.central_meridian, p.datum, p.status,
       p.engagement, p.external_job_id, p.delivered_at,
       sp.name AS surveyor_name, sp.license_number AS surveyor_licence, sp.firm AS surveyor_firm,
       r.decision AS review_decision, r.decided_at AS reviewed_at, r.note AS review_note,
       p.created_at, p.updated_at,
       p.survey_class
  FROM survey.survey_projects p
  LEFT JOIN survey.authority a ON a.id = p.authority_id
  LEFT JOIN public.surveyor_profiles sp ON sp.user_id = p.surveyor_user_id
  LEFT JOIN LATERAL (SELECT x.decision, x.decided_at, x.note FROM survey.project_review x
                      WHERE x.project_id = p.id ORDER BY x.decided_at DESC, x.id DESC LIMIT 1) r ON true
 WHERE p.id IN (SELECT survey.readable_project_ids(app.user_id(), app.is_platform(), app.reader_authority()));
