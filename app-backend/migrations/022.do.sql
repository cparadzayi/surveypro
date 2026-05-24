-- Migration 022: Remove old surveyor_id column from survey_projects
-- The table now uses surveyor_profile_id instead

-- Drop the old surveyor_id column if it exists
ALTER TABLE survey_projects 
DROP COLUMN IF EXISTS surveyor_id;
