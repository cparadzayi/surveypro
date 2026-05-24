-- Migration 084: Add parent_property column to survey_projects
-- Supports the "immediate parent property" field for General Plan title blocks
-- e.g. "Shabani Mine Surface Rights A", "Subdivision A of Widdicombe"
-- Per SI 727 Seventh Schedule (b): "being the whole/remainder/portion of [parent property]"

-- Add to the function that creates surveyor schemas (for new surveyors)
CREATE OR REPLACE FUNCTION add_parent_property_if_missing(schema_name TEXT)
RETURNS VOID AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = schema_name
      AND table_name = 'survey_projects'
      AND column_name = 'parent_property'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I.survey_projects ADD COLUMN parent_property VARCHAR(500)',
      schema_name
    );
    RAISE NOTICE 'Added parent_property to %.survey_projects', schema_name;
  ELSE
    RAISE NOTICE 'parent_property already exists in %.survey_projects', schema_name;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Apply to all existing surveyor schemas
DO $$
DECLARE
  schema_rec RECORD;
BEGIN
  FOR schema_rec IN
    SELECT schema_name
    FROM information_schema.schemata
    WHERE schema_name LIKE 'surveyor_%'
  LOOP
    PERFORM add_parent_property_if_missing(schema_rec.schema_name);
  END LOOP;

  -- Also apply to public schema if survey_projects exists there
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'survey_projects'
  ) THEN
    PERFORM add_parent_property_if_missing('public');
  END IF;
END;
$$;

-- Also patch the create_surveyor_schema function to include parent_property in future schemas
-- (It uses a CREATE TABLE statement internally; the column will be added via the function above
--  when new surveyors register until the base function is updated in a future migration)
