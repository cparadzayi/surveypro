-- Diagnose Batch Computation 400 Error
-- Run these queries to find the problem

-- STEP 1: Check which layers you selected
-- Look at the browser console or network tab to see the layer IDs being sent
-- The request body should show: polygon_layer_id and coordinate_layer_id

-- STEP 2: Verify coordinate list layer has points
-- Replace 5 with your actual coordinate_layer_id
SELECT 
  l.id as layer_id,
  l.name as layer_name,
  COUNT(f.id) as feature_count,
  COUNT(CASE WHEN f.geometry->>'type' = 'Point' THEN 1 END) as point_count
FROM layers l
LEFT JOIN features f ON f.layer_id = l.id
WHERE l.id = 5  -- ← CHANGE THIS to your coordinate_layer_id
GROUP BY l.id, l.name;

-- Expected: point_count > 0
-- If point_count = 0, this is the problem!

-- STEP 3: Verify polygon layer has polygons
-- Replace 6 with your actual polygon_layer_id
SELECT 
  l.id as layer_id,
  l.name as layer_name,
  COUNT(f.id) as feature_count,
  COUNT(CASE WHEN f.geometry->>'type' = 'Polygon' THEN 1 END) as polygon_count
FROM layers l
LEFT JOIN features f ON f.layer_id = l.id
WHERE l.id = 6  -- ← CHANGE THIS to your polygon_layer_id
GROUP BY l.id, l.name;

-- Expected: polygon_count > 0
-- If polygon_count = 0, this is the problem!

-- STEP 4: Check if polygons have the correct layer_id
SELECT 
  id,
  layer_id,
  geometry->>'type' as geom_type,
  properties->>'designation' as designation,
  created_at
FROM features
WHERE geometry->>'type' = 'Polygon'
ORDER BY created_at DESC
LIMIT 10;

-- Check if layer_id matches your polygon layer

-- STEP 5: Check if coordinate points have the correct layer_id
SELECT 
  id,
  layer_id,
  geometry->>'type' as geom_type,
  properties->>'name' as name,
  geometry->'coordinates' as coords,
  created_at
FROM features
WHERE geometry->>'type' = 'Point'
ORDER BY created_at DESC
LIMIT 10;

-- Check if layer_id matches your coordinate layer

-- STEP 6: List all layers to see what you have
SELECT 
  l.id,
  l.name,
  l.geom_type,
  COUNT(f.id) as features,
  COUNT(CASE WHEN f.geometry->>'type' = 'Point' THEN 1 END) as points,
  COUNT(CASE WHEN f.geometry->>'type' = 'Polygon' THEN 1 END) as polygons
FROM layers l
LEFT JOIN features f ON f.layer_id = l.id
GROUP BY l.id, l.name, l.geom_type
ORDER BY l.id;

-- This shows all layers and their feature counts

-- ============================================================================
-- COMMON PROBLEMS AND FIXES
-- ============================================================================

-- PROBLEM 1: Polygons have NULL or wrong layer_id
-- FIX: Update polygons to correct layer_id
UPDATE features
SET layer_id = 6  -- ← Your polygon layer_id
WHERE geometry->>'type' = 'Polygon'
  AND (layer_id IS NULL OR layer_id != 6);

-- PROBLEM 2: Points have NULL or wrong layer_id  
-- FIX: Update points to correct layer_id
UPDATE features
SET layer_id = 5  -- ← Your coordinate layer_id
WHERE geometry->>'type' = 'Point'
  AND (layer_id IS NULL OR layer_id != 5);

-- PROBLEM 3: No features in the layers at all
-- This means the data wasn't imported from QGIS
-- You need to import the QGIS layers into the features table

-- ============================================================================
-- VERIFICATION AFTER FIX
-- ============================================================================

-- Run this to confirm both layers have the right data:
SELECT 
  l.id,
  l.name,
  l.geom_type,
  COUNT(f.id) as total_features,
  COUNT(CASE WHEN f.geometry->>'type' = 'Point' THEN 1 END) as points,
  COUNT(CASE WHEN f.geometry->>'type' = 'Polygon' THEN 1 END) as polygons
FROM layers l
LEFT JOIN features f ON f.layer_id = l.id
WHERE l.id IN (5, 6)  -- ← Your layer IDs
GROUP BY l.id, l.name, l.geom_type;

-- Expected output:
-- id | name                          | geom_type | total | points | polygons
-- 5  | Avondale - Coordinate List... | Point     | 50    | 50     | 0
-- 6  | Avondale - Land Parcels       | Polygon   | 25    | 0      | 25
