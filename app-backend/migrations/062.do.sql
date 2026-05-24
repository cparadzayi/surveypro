-- Migration 062: Add project_control_points table to existing surveyor schemas
-- Purpose: Fix missing table that causes 500 error when saving control points
-- This table was missing from the schema-per-surveyor migration (040.do.sql)

BEGIN;

-- Function to add project_control_points table to a specific surveyor schema
CREATE OR REPLACE FUNCTION add_project_control_points_to_schema(p_schema_name VARCHAR)
RETURNS VOID AS $$
BEGIN
  -- Create project_control_points table
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.project_control_points (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES %I.survey_projects(id) ON DELETE CASCADE,
      control_point_id INTEGER NOT NULL REFERENCES public.zim_control_points(id) ON DELETE CASCADE,
      point_order INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(project_id, control_point_id)
    )', p_schema_name, p_schema_name);
  
  -- Create indexes
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_project_control_points_project ON %I.project_control_points(project_id)', p_schema_name);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_project_control_points_control_point ON %I.project_control_points(control_point_id)', p_schema_name);
  
  -- Add comments
  EXECUTE format('COMMENT ON TABLE %I.project_control_points IS ''Control points used to connect survey project to national trig system''', p_schema_name);
  EXECUTE format('COMMENT ON COLUMN %I.project_control_points.point_order IS ''Display order in coordinate list (1, 2, 3...)''', p_schema_name);
  
  RAISE NOTICE 'Added project_control_points table to schema: %', p_schema_name;
END;
$$ LANGUAGE plpgsql;

-- Add table to all existing surveyor schemas
DO $$
DECLARE
  v_schema_name VARCHAR;
BEGIN
  FOR v_schema_name IN 
    SELECT schema_name 
    FROM surveyor_profiles 
    WHERE schema_name IS NOT NULL
  LOOP
    PERFORM add_project_control_points_to_schema(v_schema_name);
  END LOOP;
  
  RAISE NOTICE 'Migration 062 completed: Added project_control_points to all surveyor schemas';
END $$;

-- Clean up temporary function
DROP FUNCTION IF EXISTS add_project_control_points_to_schema(VARCHAR);

COMMIT;
