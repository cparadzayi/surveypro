-- Migration 018 UNDO: Rollback users and surveyor_profiles refactoring

BEGIN;

-- This is a destructive rollback - backup data first!
-- The original tables (users, surveyors) should still exist if migration was cautious

-- Restore survey_projects.surveyor_id if needed
-- UPDATE survey_projects sp
-- SET surveyor_id = (
--   SELECT s.id FROM surveyors s
--   JOIN surveyor_profiles p ON p.license_number = s.license_number
--   WHERE p.id = sp.surveyor_profile_id
-- );

-- Drop new tables
DROP TABLE IF EXISTS surveyor_profiles CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Note: Original users and surveyors tables should be restored from backup
-- if they were dropped during migration

COMMIT;
