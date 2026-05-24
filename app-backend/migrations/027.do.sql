-- Migration 027: Add Survey Type, Stand Reference, and Township to Survey Projects
-- Purpose: Store persistent project information from Project Setup for auto-population throughout workflow
-- Date: 2025-01-22

-- Add new columns to survey_projects table
ALTER TABLE survey_projects 
ADD COLUMN IF NOT EXISTS survey_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS stand_reference VARCHAR(255),
ADD COLUMN IF NOT EXISTS township VARCHAR(255);

-- Add comments for documentation
COMMENT ON COLUMN survey_projects.survey_type IS 'Survey type (subdivision, mining-lease, state-land, municipal-land, private-land, servitude, replacement, other) - from Project Setup';
COMMENT ON COLUMN survey_projects.stand_reference IS 'Stand/Reference number (e.g., STANDS 1-50, STAND 9723, Mining Lease No.44) - from Project Setup';
COMMENT ON COLUMN survey_projects.township IS 'Township name (e.g., Shabani Mine Surface Rights A, Gweru Township) - from Project Setup';

-- Create index for survey_type for filtering/reporting
CREATE INDEX IF NOT EXISTS idx_survey_projects_survey_type ON survey_projects(survey_type);

-- Create index for stand_reference for searching
CREATE INDEX IF NOT EXISTS idx_survey_projects_stand_reference ON survey_projects(stand_reference);
