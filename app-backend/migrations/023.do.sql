-- Migration 023: Add workflow state tracking for cadastral projects
-- Enables dynamic workflow with step completion tracking and document metadata

ALTER TABLE survey_projects 
ADD COLUMN IF NOT EXISTS workflow_state JSONB DEFAULT '{
  "completed_steps": [],
  "current_step": "import_csv",
  "step_data": {},
  "generated_documents": {},
  "can_finalize": false,
  "finalized_at": null
}'::jsonb;

-- Add index for faster workflow state queries
CREATE INDEX IF NOT EXISTS idx_survey_projects_workflow_state 
ON survey_projects USING gin (workflow_state);

-- Add comment for documentation
COMMENT ON COLUMN survey_projects.workflow_state IS 
'Tracks cadastral workflow progress: completed steps, current step, document metadata, and finalization status';
