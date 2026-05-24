-- Migration 026: Add last_used tracking to survey_projects
-- Purpose: Track when projects were last accessed for "Recent Projects" feature

-- Add last_used column to survey_projects
ALTER TABLE survey_projects 
ADD COLUMN IF NOT EXISTS last_used TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Create index for efficient recent projects queries
CREATE INDEX IF NOT EXISTS idx_survey_projects_last_used 
ON survey_projects(surveyor_profile_id, last_used DESC);

-- Update existing projects to have last_used = created_at
UPDATE survey_projects 
SET last_used = created_at 
WHERE last_used IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN survey_projects.last_used IS 'Timestamp of when project was last accessed/selected by user';

-- Create function to update last_used timestamp
CREATE OR REPLACE FUNCTION update_project_last_used(project_id_param INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE survey_projects 
  SET last_used = CURRENT_TIMESTAMP 
  WHERE id = project_id_param;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_project_last_used IS 'Updates the last_used timestamp for a project when it is accessed';
