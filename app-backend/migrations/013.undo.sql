-- Undo Migration 013: Remove working_directory column from survey_projects table

ALTER TABLE survey_projects 
DROP COLUMN IF EXISTS working_directory;
