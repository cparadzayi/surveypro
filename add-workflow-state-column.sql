-- Add workflow_state column to survey_projects in all surveyor schemas
-- Run with: psql -U postgres -d surveypro_db -f add-workflow-state-column.sql

-- Step 1: Add workflow_state and last_used columns to surveyor_kuziva_paradzayi schema
ALTER TABLE surveyor_kuziva_paradzayi.survey_projects 
ADD COLUMN IF NOT EXISTS workflow_state JSONB DEFAULT '{"completed_steps": [], "current_step": "project-setup", "step_data": {}, "generated_documents": {}, "can_finalize": false}'::jsonb,
ADD COLUMN IF NOT EXISTS last_used TIMESTAMP;

-- Step 2: Add to surveyor_surveyor_elon schema (if it exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'surveyor_surveyor_elon') THEN
    ALTER TABLE surveyor_surveyor_elon.survey_projects 
    ADD COLUMN IF NOT EXISTS workflow_state JSONB DEFAULT '{"completed_steps": [], "current_step": "project-setup", "step_data": {}, "generated_documents": {}, "can_finalize": false}'::jsonb,
    ADD COLUMN IF NOT EXISTS last_used TIMESTAMP;
  END IF;
END $$;

-- Step 3: Verify the columns were added
SELECT 
  schemaname,
  tablename,
  column_name,
  data_type
FROM pg_catalog.pg_tables t
JOIN information_schema.columns c ON c.table_name = t.tablename AND c.table_schema = t.schemaname
WHERE t.schemaname LIKE 'surveyor_%'
  AND t.tablename = 'survey_projects'
  AND c.column_name IN ('workflow_state', 'last_used')
ORDER BY schemaname, column_name;

-- Step 4: Show current projects
SELECT 
  id,
  name,
  district,
  workflow_state->>'current_step' as current_step,
  jsonb_array_length(COALESCE(workflow_state->'completed_steps', '[]'::jsonb)) as completed_count
FROM surveyor_kuziva_paradzayi.survey_projects
ORDER BY id;
