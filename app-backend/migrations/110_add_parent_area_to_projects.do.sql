-- Migration 110: persist the registered parent area captured in Project Setup.
--
-- The Project Setup form asks for "Original Area of Parent Property (m²)" so the
-- working plan can compare the sum of the new mutations and the remaining extent
-- against the area on the title diagram. The field was added to the form but not
-- to survey_projects, so SurveyProject.update skipped it as an unknown column and
-- the value was lost as soon as the user left the step. This is the same shape as
-- migrations 093 and 105: backfill every schema, then teach the live schema
-- generator so a surveyor registered after this deploy is born with the column.

BEGIN;

CREATE OR REPLACE FUNCTION public.add_parent_area_to_schema(p_schema_name VARCHAR)
RETURNS VOID AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = p_schema_name AND table_name = 'survey_projects'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I.survey_projects ADD COLUMN IF NOT EXISTS parent_area NUMERIC(14,2)',
      p_schema_name
    );
    RAISE NOTICE 'add_parent_area_to_schema: ensured parent_area on %.survey_projects', p_schema_name;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.add_parent_area_to_schema(VARCHAR) IS
  'Ensures a schema''s survey_projects has parent_area. Called by the 110 backfill and by create_surveyor_schema(); do not drop.';

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
    PERFORM public.add_parent_area_to_schema(v_schema_name);
    v_count := v_count + 1;
  END LOOP;

  PERFORM public.add_parent_area_to_schema('public');

  RAISE NOTICE 'Migration 110: ensured parent_area on % schema(s) + public', v_count;
END $$;

-- Patch the deployed generator from its live definition, as migration 105 does,
-- so nothing added by a later migration is overwritten. Skipped when already
-- present; refuses to guess if the anchor is not found exactly once.
DO $$
DECLARE
  v_def TEXT;
  v_anchor CONSTANT TEXT := 'datum VARCHAR(50),';
  v_replacement CONSTANT TEXT := E'parent_area NUMERIC(14,2),\n\n      datum VARCHAR(50),';
BEGIN
  v_def := pg_get_functiondef('public.create_surveyor_schema(character varying)'::regprocedure);

  IF position('parent_area' IN v_def) > 0 THEN
    RAISE NOTICE 'Migration 110: create_surveyor_schema() already creates parent_area';
  ELSIF (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 THEN
    RAISE EXCEPTION 'Migration 110: expected exactly one "%" in create_surveyor_schema(); not patching', v_anchor;
  ELSE
    EXECUTE replace(v_def, v_anchor, v_replacement);
    RAISE NOTICE 'Migration 110: create_surveyor_schema() now creates parent_area';
  END IF;
END $$;

COMMIT;
