-- Migration: Add control point support to survey projects
-- Projects must be connected to national trig system via control points

BEGIN;

-- Add central meridian to projects
ALTER TABLE survey_projects 
  ADD COLUMN IF NOT EXISTS central_meridian INTEGER CHECK (central_meridian IN (27, 29, 31, 33));

-- Create junction table for project control points
CREATE TABLE IF NOT EXISTS project_control_points (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES survey_projects(id) ON DELETE CASCADE,
  control_point_id INTEGER NOT NULL REFERENCES control_points(id) ON DELETE CASCADE,
  point_order INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, control_point_id)
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_project_control_points_project ON project_control_points(project_id);
CREATE INDEX IF NOT EXISTS idx_project_control_points_control_point ON project_control_points(control_point_id);

-- Comments
COMMENT ON COLUMN survey_projects.central_meridian IS 'Gauss-Conformal central meridian (Lo27, Lo29, Lo31, Lo33)';
COMMENT ON TABLE project_control_points IS 'Control points used to connect survey project to national trig system';
COMMENT ON COLUMN project_control_points.point_order IS 'Display order in coordinate list (1, 2, 3...)';

COMMIT;
