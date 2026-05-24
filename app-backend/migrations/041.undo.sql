-- Undo Migration 041: Remove workflow_states table
-- Created: 2025-12-06

-- Drop trigger and function
DROP TRIGGER IF EXISTS workflow_states_updated_at_trigger ON workflow_states;
DROP FUNCTION IF EXISTS update_workflow_states_updated_at();

-- Drop indexes
DROP INDEX IF EXISTS idx_workflow_states_step_data;
DROP INDEX IF EXISTS idx_workflow_states_updated_at;
DROP INDEX IF EXISTS idx_workflow_states_current_step;
DROP INDEX IF EXISTS idx_workflow_states_project_id;

-- Drop table
DROP TABLE IF EXISTS workflow_states;

-- Undo complete
SELECT 'Migration 041 undone: workflow_states table removed' AS status;
