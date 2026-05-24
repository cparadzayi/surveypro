-- Check and add parent_property column to surveyor_surveyor_chitsikef schema
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'surveyor_surveyor_chitsikef'
      AND table_name = 'survey_projects'
      AND column_name = 'parent_property'
  ) THEN
    ALTER TABLE surveyor_surveyor_chitsikef.survey_projects 
    ADD COLUMN parent_property VARCHAR(500);
    RAISE NOTICE 'Added parent_property to surveyor_surveyor_chitsikef.survey_projects';
  ELSE
    RAISE NOTICE 'parent_property already exists in surveyor_surveyor_chitsikef.survey_projects';
  END IF;
END $$;
