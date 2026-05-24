-- Quick fix for control points import
-- Run this with: psql -U postgres -d surveypro -f fix-import.sql

BEGIN;

-- Make monu_name nullable (for TSM records without names)
ALTER TABLE control_points 
  ALTER COLUMN monu_name DROP NOT NULL;

-- Also update the type constraint to include TSM
ALTER TABLE control_points 
  DROP CONSTRAINT IF EXISTS control_points_type_check;

ALTER TABLE control_points 
  ADD CONSTRAINT control_points_type_check 
  CHECK (type IN ('PRIM', 'SEC', 'TERT', 'QUART', 'TSM'));

COMMIT;

-- Verify the changes
SELECT 
  column_name, 
  is_nullable, 
  data_type 
FROM information_schema.columns 
WHERE table_name = 'control_points' 
  AND column_name = 'monu_name';

SELECT 
  conname, 
  pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conname = 'control_points_type_check';
