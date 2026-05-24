-- Migration 027 Rollback: Remove Survey Type, Stand Reference, and Township columns
-- Purpose: Undo addition of persistent project information fields
-- Date: 2025-01-22

-- Drop indexes
DROP INDEX IF EXISTS idx_survey_projects_stand_reference;
DROP INDEX IF EXISTS idx_survey_projects_survey_type;

-- Remove columns
ALTER TABLE survey_projects 
DROP COLUMN IF EXISTS township,
DROP COLUMN IF EXISTS stand_reference,
DROP COLUMN IF EXISTS survey_type;
