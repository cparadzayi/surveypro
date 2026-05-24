-- Add default value for project_id in land_parcels table
-- This ensures new rows get a project_id even if QGIS doesn't set it

-- Option 1: Set a fixed default (use if you're only working with project 64)
-- ALTER TABLE land_parcels 
-- ALTER COLUMN project_id SET DEFAULT 64;

-- Option 2: Remove default later when you need flexibility
-- For now, we'll keep it NULL-able but recommend setting in application layer

-- Update existing NULL values to 64 (assuming these are all for project 64)
UPDATE land_parcels 
SET project_id = 64 
WHERE project_id IS NULL;

-- Verify the update
SELECT COUNT(*) as updated_count
FROM land_parcels 
WHERE project_id = 64;
