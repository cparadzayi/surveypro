-- Migration 084: Add parent_property column to survey_projects in all surveyor schemas
-- Per SI 727 Seventh Schedule (b): "being the whole/remainder/portion of [parent property]"

DO $$
DECLARE
  schema_rec RECORD;
BEGIN
  -- Apply to all surveyor schemas
  FOR schema_rec IN
    SELECT schema_name
    FROM information_schema.schemata
    WHERE schema_name LIKE 'surveyor_%'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = schema_rec.schema_name
        AND table_name = 'survey_projects'
        AND column_name = 'parent_property'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I.survey_projects ADD COLUMN parent_property VARCHAR(500)',
        schema_rec.schema_name
      );
      RAISE NOTICE 'Added parent_property to %.survey_projects', schema_rec.schema_name;
    END IF;
  END LOOP;

  -- Also apply to public schema if survey_projects exists there
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'survey_projects'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'survey_projects'
        AND column_name = 'parent_property'
    ) THEN
      ALTER TABLE public.survey_projects ADD COLUMN parent_property VARCHAR(500);
      RAISE NOTICE 'Added parent_property to public.survey_projects';
    END IF;
  END IF;
END;
$$;
