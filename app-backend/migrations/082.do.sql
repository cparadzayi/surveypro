-- Add missing columns to coordinate_points table in all surveyor schemas
-- Required columns for full coordinate point functionality

DO $$
DECLARE
  v_schema_name TEXT;
BEGIN
  -- Loop through all surveyor schemas
  FOR v_schema_name IN
    SELECT schema_name FROM surveyor_profiles WHERE schema_name IS NOT NULL
  LOOP
    -- Add elevation column if it doesn't exist
    EXECUTE format('
      ALTER TABLE %I.coordinate_points
      ADD COLUMN IF NOT EXISTS elevation DECIMAL(10,3)
    ', v_schema_name);

    -- Add survey_date column if it doesn't exist
    EXECUTE format('
      ALTER TABLE %I.coordinate_points
      ADD COLUMN IF NOT EXISTS survey_date TIMESTAMP
    ', v_schema_name);

    -- Add surveyor column if it doesn't exist
    EXECUTE format('
      ALTER TABLE %I.coordinate_points
      ADD COLUMN IF NOT EXISTS surveyor VARCHAR(255)
    ', v_schema_name);

    -- Add updated_at column if it doesn't exist
    EXECUTE format('
      ALTER TABLE %I.coordinate_points
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ', v_schema_name);

    RAISE NOTICE 'Added missing columns to %.coordinate_points', v_schema_name;
  END LOOP;
END $$;
