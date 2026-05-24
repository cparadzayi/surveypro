-- QUICK FIX: Link polygons to polygon layer
-- Run these 3 commands in order

-- 1. Find polygon layer ID
SELECT id, name FROM layers WHERE geom_type = 'Polygon' OR name ILIKE '%parcel%';

-- 2. Update polygons (replace 6 with the id from step 1)
UPDATE features SET layer_id = 6 WHERE geometry->>'type' = 'Polygon';

-- 3. Verify
SELECT COUNT(*) as polygon_count FROM features WHERE layer_id = 6 AND geometry->>'type' = 'Polygon';
