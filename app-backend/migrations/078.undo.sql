-- Undo Migration 078: Historical Survey Points

DROP TRIGGER IF EXISTS trigger_historical_survey_points_updated ON historical_survey_points;
DROP FUNCTION IF EXISTS update_historical_survey_points_timestamp();
DROP VIEW IF EXISTS v_beacon_comparison;
DROP TABLE IF EXISTS historical_survey_points;
