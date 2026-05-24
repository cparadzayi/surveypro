-- Migration: Add project meridian selections cache table
-- This table stores control point selections for each meridian during project editing
-- Allows users to switch between meridians without losing their selections

BEGIN;

-- Create table to cache control point selections per meridian
CREATE TABLE IF NOT EXISTS project_meridian_cache (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES survey_projects(id) ON DELETE CASCADE,
  meridian INTEGER NOT NULL CHECK (meridian IN (27, 29, 31, 33)),
  control_point_ids INTEGER[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, meridian)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_project_meridian_cache_project_id 
  ON project_meridian_cache(project_id);

-- Comments
COMMENT ON TABLE project_meridian_cache IS 'Temporary cache of control point selections per meridian during project editing';
COMMENT ON COLUMN project_meridian_cache.project_id IS 'Reference to survey project';
COMMENT ON COLUMN project_meridian_cache.meridian IS 'Central meridian (Lo27, Lo29, Lo31, Lo33)';
COMMENT ON COLUMN project_meridian_cache.control_point_ids IS 'Array of control point IDs selected for this meridian';
COMMENT ON COLUMN project_meridian_cache.updated_at IS 'Last update timestamp';

COMMIT;
