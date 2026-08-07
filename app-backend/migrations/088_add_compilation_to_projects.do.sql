-- Migration 088: Add compilation column to survey_projects in all surveyor
-- schemas. "Compilation" on the SI 727 Diagram reference grid was previously
-- treated as Surveyor-General's-office-only (always blank); the surveyor can
-- in fact record who/what compiled the diagram at submission time, so it
-- becomes a tenth captured reg-53 field alongside the nine from migrations
-- 085/087.

DO $$
DECLARE
  schema_rec RECORD;
BEGIN
  -- Every surveyor schema
  FOR schema_rec IN
    SELECT schema_name FROM information_schema.schemata
    WHERE schema_name LIKE 'surveyor_%'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = schema_rec.schema_name
        AND table_name = 'survey_projects'
        AND column_name = 'compilation'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I.survey_projects ADD COLUMN compilation VARCHAR(100)',
        schema_rec.schema_name
      );
      RAISE NOTICE 'Added compilation to %.survey_projects', schema_rec.schema_name;
    END IF;
  END LOOP;

  -- public schema too, if survey_projects exists there
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'survey_projects'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'survey_projects'
        AND column_name = 'compilation'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.survey_projects ADD COLUMN compilation VARCHAR(100)'
      );
      RAISE NOTICE 'Added compilation to public.survey_projects';
    END IF;
  END IF;
END;
$$;
