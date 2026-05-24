-- Rename columns in survey_projects table for cadastral surveying terminology
-- location -> district
-- description -> designation

BEGIN;

-- Rename location to district
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'survey_projects' AND column_name = 'location'
  ) THEN
    ALTER TABLE survey_projects RENAME COLUMN location TO district;
  END IF;
END $$;

-- Rename description to designation
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'survey_projects' AND column_name = 'description'
  ) THEN
    ALTER TABLE survey_projects RENAME COLUMN description TO designation;
  END IF;
END $$;

COMMIT;
