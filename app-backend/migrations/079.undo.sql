-- Migration 079 Undo: Remove added columns from survey_projects
-- Purpose: Rollback designation, instruments, datum, and workflow_state fields
-- Date: 2025-12-29

-- Remove columns from all surveyor schemas
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
    -- Remove workflow_state column if it exists
    EXECUTE format('
      ALTER TABLE %I.survey_projects 
      DROP COLUMN IF EXISTS workflow_state
    ', schema_rec.schema_name);
    
    -- Remove datum column if it exists
    EXECUTE format('
      ALTER TABLE %I.survey_projects 
      DROP COLUMN IF EXISTS datum
    ', schema_rec.schema_name);
    
    -- Remove instruments column if it exists
    EXECUTE format('
      ALTER TABLE %I.survey_projects 
      DROP COLUMN IF EXISTS instruments
    ', schema_rec.schema_name);
    
    -- Remove designation column if it exists
    EXECUTE format('
      ALTER TABLE %I.survey_projects 
      DROP COLUMN IF EXISTS designation
    ', schema_rec.schema_name);
    
    RAISE NOTICE 'Removed columns from schema: %', schema_rec.schema_name;
  END LOOP;
END $$;
