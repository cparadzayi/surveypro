-- Migration 041: Add workflow_states table for cadastral workflow persistence
-- Created: 2025-12-06
-- Purpose: Store workflow state for each survey project to enable resume and data persistence

-- Create workflow_states table
CREATE TABLE IF NOT EXISTS workflow_states (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES survey_projects(id) ON DELETE CASCADE,
  current_step VARCHAR(100) NOT NULL,
  step_data JSONB NOT NULL DEFAULT '{}',
  completed_steps TEXT[] DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_workflow_states_project_id ON workflow_states(project_id);
CREATE INDEX IF NOT EXISTS idx_workflow_states_current_step ON workflow_states(current_step);
CREATE INDEX IF NOT EXISTS idx_workflow_states_updated_at ON workflow_states(updated_at);

-- Create GIN index for JSONB step_data for fast queries
CREATE INDEX IF NOT EXISTS idx_workflow_states_step_data ON workflow_states USING GIN (step_data);

-- Add comment
COMMENT ON TABLE workflow_states IS 'Stores cadastral workflow state for each project including imported points, calculations, and step progress';
COMMENT ON COLUMN workflow_states.project_id IS 'Foreign key to survey_projects table';
COMMENT ON COLUMN workflow_states.current_step IS 'Current workflow step (e.g., csv-import, field-book, calculations-part1)';
COMMENT ON COLUMN workflow_states.step_data IS 'JSONB object containing data for each step (points, calculations, documents, etc.)';
COMMENT ON COLUMN workflow_states.completed_steps IS 'Array of completed step names';

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_workflow_states_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS workflow_states_updated_at_trigger ON workflow_states;
CREATE TRIGGER workflow_states_updated_at_trigger
BEFORE UPDATE ON workflow_states
FOR EACH ROW
EXECUTE FUNCTION update_workflow_states_updated_at();

-- Migration complete
SELECT 'Migration 041 completed: workflow_states table created' AS status;
