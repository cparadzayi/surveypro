-- Drop foreign key constraint on historical_survey_points
-- The project_id references survey_projects but projects are stored elsewhere

ALTER TABLE historical_survey_points 
DROP CONSTRAINT IF EXISTS historical_survey_points_project_id_fkey;

-- Also drop the import_id foreign key constraint if it exists
ALTER TABLE historical_survey_points 
DROP CONSTRAINT IF EXISTS historical_survey_points_import_id_fkey;
