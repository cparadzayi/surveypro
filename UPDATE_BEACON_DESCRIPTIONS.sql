-- Update beacon descriptions in coordinate_points table
-- This will enable proper grouping in the Beacon Description block

-- Example: Update specific beacons to "Not beaconed"
-- UPDATE coordinate_points 
-- SET description = 'Not beaconed'
-- WHERE project_id = 5 
-- AND name IN ('M5', 'M6', 'M7', 'M8', 'M9');

-- Example: Update specific beacons to "50mm Iron Pipe in Concrete"
-- UPDATE coordinate_points 
-- SET description = '50mm Iron Pipe in Concrete'
-- WHERE project_id = 5 
-- AND name IN ('P2', 'ZA', 'ZD', 'ZE', 'ZG');

-- Example: Update all other beacons to default
-- UPDATE coordinate_points 
-- SET description = '12mm iron peg in concrete'
-- WHERE project_id = 5 
-- AND (description IS NULL OR description LIKE 'Exported from Coordinate List%');

-- ============================================================================
-- INSTRUCTIONS:
-- ============================================================================
-- 1. Uncomment the UPDATE statements above
-- 2. Adjust the beacon names (M5, M6, etc.) to match your actual data
-- 3. Run this SQL in your PostgreSQL database
-- 4. Regenerate the PDF - beacons will now be properly grouped
--
-- Beacon Description Types (examples):
-- - "Not beaconed"
-- - "50mm Iron Pipe in Concrete"
-- - "12mm iron peg in concrete"
-- - "50mm x 50mm concrete beacons"
-- - "Steel pegs, 25mm diameter"
-- ============================================================================
