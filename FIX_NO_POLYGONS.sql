-- FIX: "No polygons found in polygon layer"
-- This means polygons exist but aren't linked to the correct layer_id

-- STEP 1: Find all polygons in the database
SELECT 
  id,
  layer_id,
  properties->>'designation' as designation,
  jsonb_array_length(geometry->'coordinates'->0) as vertices,
  created_at
FROM features
WHERE geometry->>'type' = 'Polygon'
ORDER BY created_at DESC
LIMIT 20;

-- Check the layer_id values. Are they NULL, 0, or a different number?

-- STEP 2: Find your polygon layer ID
SELECT id, name, geom_type 
FROM layers 
WHERE geom_type = 'Polygon' OR name ILIKE '%parcel%';

-- Note the id (e.g., 6)

-- STEP 3: Update ALL polygons to use the correct layer_id
-- Replace 6 with your actual polygon layer_id from STEP 2
UPDATE features
SET layer_id = 6  -- ← CHANGE THIS
WHERE geometry->>'type' = 'Polygon';

-- This will return the number of rows updated (e.g., "UPDATE 25")

-- STEP 4: Verify the fix
SELECT 
  l.id as layer_id,
  l.name as layer_name,
  COUNT(f.id) as polygon_count
FROM layers l
LEFT JOIN features f ON f.layer_id = l.id
WHERE l.geom_type = 'Polygon'
GROUP BY l.id, l.name;

-- Should show: polygon_count > 0

-- STEP 5: Check a sample polygon
SELECT 
  f.id,
  f.layer_id,
  l.name as layer_name,
  f.properties->>'designation' as designation,
  jsonb_array_length(f.geometry->'coordinates'->0) as vertices
FROM features f
LEFT JOIN layers l ON l.id = f.layer_id
WHERE f.geometry->>'type' = 'Polygon'
LIMIT 5;

-- All polygons should now have the correct layer_id and layer_name
