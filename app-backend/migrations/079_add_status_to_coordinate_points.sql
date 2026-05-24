-- Add status column to coordinate_points table in all surveyor schemas
-- Status indicates point type: F=Fixed, P=Peg, etc.
-- Required for Found Beacons Assessment (SI 727 Section 67)

DO $$
DECLARE
  v_schema_name TEXT;
BEGIN
  -- Loop through all surveyor schemas
  FOR v_schema_name IN 
    SELECT schema_name FROM surveyor_profiles WHERE schema_name IS NOT NULL
  LOOP
    -- Add status column if it doesn't exist
    EXECUTE format('
      ALTER TABLE %I.coordinate_points 
      ADD COLUMN IF NOT EXISTS status VARCHAR(10)
    ', v_schema_name);
    
    -- Add description column if it doesn't exist (for consistency)
    EXECUTE format('
      ALTER TABLE %I.coordinate_points 
      ADD COLUMN IF NOT EXISTS description TEXT
    ', v_schema_name);
    
    RAISE NOTICE 'Added status column to %.coordinate_points', v_schema_name;
  END LOOP;
END $$;

COMMENT ON COLUMN surveyor_surveyor_kuda.coordinate_points.status IS 'Point status/type: F=Fixed, P=Peg, WS=Working Station, etc. Used for Found Beacons Assessment.';
