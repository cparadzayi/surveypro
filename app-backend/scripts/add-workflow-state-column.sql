-- Manually add workflow_state column to existing surveyor schemas
-- This is needed because migration 079 was already marked as applied before the column was added

DO $$
DECLARE
  schema_rec RECORD;
BEGIN
  -- Loop through all surveyor schemas
  FOR schema_rec IN 
    SELECT schema_name 
    FROM surveyor_profiles 
    WHERE schema_name IS NOT NULL
  LOOP
    -- Add workflow_state column if it doesn't exist
    EXECUTE format('
      ALTER TABLE %I.survey_projects 
      ADD COLUMN IF NOT EXISTS workflow_state JSONB DEFAULT ''{"completed_steps": [], "current_step": "project-setup", "step_data": {}, "generated_documents": {}, "can_finalize": false}''::jsonb
    ', schema_rec.schema_name);
    
    RAISE NOTICE 'Added workflow_state column to schema: %', schema_rec.schema_name;
  END LOOP;
END $$;

-- Verify the column was added
SELECT 
  table_schema,
  table_name,
  column_name,
  data_type
FROM information_schema.columns 
WHERE table_name = 'survey_projects' 
  AND column_name = 'workflow_state'
  AND table_schema LIKE 'surveyor_%'
ORDER BY table_schema;
