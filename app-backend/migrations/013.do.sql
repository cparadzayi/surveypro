-- Migration 013: Add working_directory column to survey_projects table
-- This column stores the working directory path where all project files (input/output) are stored

ALTER TABLE survey_projects 
ADD COLUMN IF NOT EXISTS working_directory TEXT;

-- Add comment to document the column
COMMENT ON COLUMN survey_projects.working_directory IS 'Working directory path for project files (input CSV, output PDFs, etc.)';
