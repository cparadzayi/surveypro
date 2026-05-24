-- Migration: Make monu_name nullable for TSM (Temporary Survey Marks)
-- TSM records don't have monument names, only numbers

BEGIN;

-- Make monu_name nullable
ALTER TABLE control_points 
  ALTER COLUMN monu_name DROP NOT NULL;

-- Add comment
COMMENT ON COLUMN control_points.monu_name IS 'Monument name (can be NULL for TSM records)';

COMMIT;
