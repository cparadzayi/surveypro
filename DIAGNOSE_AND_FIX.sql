-- DIAGNOSTIC AND FIX SCRIPT FOR POLYGON LAYER
-- Run this step by step in PostgreSQL

-- ============================================================================
-- STEP 1: DIAGNOSE - Check what we have
-- ============================================================================

-- 1.1: List all projects
SELECT id, name, created_at 
FROM projects 
ORDER BY created_at DESC;

-- 1.2: List all layers (grouped by project)
SELECT 
  p.name as project_name,
  l.id as layer_id,
  l.name as layer_name,
  l.geometry_type,
  l.srid
FROM projects p
LEFT JOIN layers l ON l.project_id = p.id
ORDER BY p.name, l.created_at DESC;

-- 1.3: Count features by geometry type (regardless of layer)
SELECT 
  geometry->>'type' as geom_type,
  COUNT(*) as count,
  MIN(id) as first_id,
  MAX(id) as last_id
FROM features
GROUP BY geometry->>'type';

-- 1.4: Check if polygons exist but are orphaned (no layer_id or invalid layer_id)
SELECT 
  id,
  layer_id,
  properties->>'designation' as designation,
  jsonb_array_length(geometry->'coordinates'->0) as vertices,
  created_at
FROM features
WHERE geometry->>'type' = 'Polygon'
ORDER BY created_at DESC
LIMIT 10;

-- ============================================================================
-- STEP 2: IDENTIFY THE PROBLEM
-- ============================================================================

-- 2.1: Check if land_parcels layer exists in layers table
SELECT * FROM layers WHERE name ILIKE '%parcel%';

-- 2.2: If no results, the layer doesn't exist in SurveyPro
-- This is the problem! QGIS has the data, but SurveyPro doesn't know about it

-- ============================================================================
-- STEP 3: FIX - Create the missing layer
-- ============================================================================

-- 3.1: Find the Avondale project (or your project name)
SELECT id, name FROM projects WHERE name ILIKE '%avondale%';
-- Note the project ID (e.g., 1)

-- 3.2: Create the land_parcels layer
-- REPLACE 1 with your actual project_id from step 3.1
INSERT INTO layers (project_id, name, geometry_type, srid, description)
VALUES (
  1,  -- ← CHANGE THIS to your project_id
  'Avondale - Land Parcels',
  'Polygon',
  22291,  -- Adjust if your SRID is different
  'Land parcels digitized in QGIS'
)
ON CONFLICT DO NOTHING
RETURNING id, name;
-- Note the returned layer_id (e.g., 6)

-- 3.3: Link existing polygons to this layer
-- REPLACE 6 with the layer_id from step 3.2
UPDATE features
SET layer_id = 6  -- ← CHANGE THIS to your layer_id
WHERE geometry->>'type' = 'Polygon'
  AND (layer_id IS NULL OR layer_id = 0);

-- 3.4: Verify the fix
SELECT 
  l.id as layer_id,
  l.name as layer_name,
  l.geometry_type,
  COUNT(f.id) as polygon_count
FROM layers l
LEFT JOIN features f ON f.layer_id = l.id
WHERE l.geometry_type = 'Polygon'
GROUP BY l.id, l.name, l.geometry_type;

-- ============================================================================
-- STEP 4: VERIFY IN SURVEYPRO
-- ============================================================================

-- After running the above:
-- 1. Refresh your browser (Ctrl+F5)
-- 2. Go to Areas page
-- 3. In "Polygon Layer (from QGIS)" dropdown:
--    - Select the Avondale project
--    - You should now see "Avondale - Land Parcels" in the layer dropdown

-- ============================================================================
-- ALTERNATIVE: If you want to check what QGIS sees vs what SurveyPro sees
-- ============================================================================

-- Check table structure in QGIS
SELECT 
  table_schema,
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'land_parcels'
ORDER BY ordinal_position;

-- If land_parcels is a separate table (not in features table):
-- You need to import it into the features table
-- This would be done through QGIS DB Manager → Import Layer

-- ============================================================================
-- QUICK TEST: Create a sample polygon if none exist
-- ============================================================================

-- Only run this if you want to test with sample data
-- REPLACE layer_id and project_id with your actual values

INSERT INTO features (layer_id, project_id, geometry, properties)
VALUES (
  6,  -- Your polygon layer_id
  1,  -- Your project_id
  '{
    "type": "Polygon",
    "coordinates": [[
      [123.45, 678.90],
      [124.50, 679.20],
      [125.00, 680.00],
      [126.00, 681.00],
      [123.45, 678.90]
    ]]
  }'::jsonb,
  '{
    "designation": "Test Stand 001",
    "area_m2": 1250.5
  }'::jsonb
)
RETURNING id, properties->>'designation';

-- ============================================================================
-- SUMMARY OF LIKELY ISSUE
-- ============================================================================

/*
Based on your screenshot, you have:
1. ✓ Polygons in QGIS (land_parcels layer visible)
2. ✓ Coordinate points in database
3. ✗ No layer record in SurveyPro's layers table for land_parcels

The fix is to create the layer record (step 3.2) and link the polygons (step 3.3).

After this, the dropdown in SurveyPro will show your polygon layer.
*/
