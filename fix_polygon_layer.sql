-- Fix polygon layer visibility in SurveyPro
-- Run these queries in PostgreSQL

-- STEP 1: Check if land_parcels layer exists
SELECT id, name, geometry_type, srid, project_id
FROM layers
WHERE name LIKE '%land_parcel%' OR name LIKE '%parcel%'
ORDER BY created_at DESC;

-- STEP 2: Check if polygons exist in features table
SELECT 
  layer_id,
  COUNT(*) as polygon_count,
  MIN(id) as first_id,
  MAX(id) as last_id
FROM features
WHERE geometry->>'type' = 'Polygon'
GROUP BY layer_id;

-- STEP 3: If layer exists but geometry_type is wrong, fix it
-- (Replace layer_id with the actual id from STEP 1)
UPDATE layers
SET geometry_type = 'Polygon'
WHERE name LIKE '%land_parcel%'
  AND geometry_type != 'Polygon';

-- STEP 4: If layer doesn't exist, create it
-- First, find the project_id for Avondale
SELECT id, name FROM projects WHERE name LIKE '%Avondale%';

-- Then create the layer (use the project_id from above)
INSERT INTO layers (project_id, name, geometry_type, srid, description)
SELECT 
  p.id,
  'Avondale - Land Parcels',
  'Polygon',
  22291,
  'Land parcels digitized in QGIS'
FROM projects p
WHERE p.name LIKE '%Avondale%'
  AND NOT EXISTS (
    SELECT 1 FROM layers 
    WHERE name = 'Avondale - Land Parcels'
  )
RETURNING id, name;

-- STEP 5: Link existing polygons to the layer
-- First, get the layer_id we just created or found
WITH target_layer AS (
  SELECT id FROM layers 
  WHERE name LIKE '%Land Parcel%' 
  ORDER BY created_at DESC 
  LIMIT 1
)
UPDATE features
SET layer_id = (SELECT id FROM target_layer)
WHERE geometry->>'type' = 'Polygon'
  AND (layer_id IS NULL 
       OR layer_id NOT IN (SELECT id FROM layers WHERE geometry_type = 'Polygon'));

-- STEP 6: Verify the fix
SELECT 
  l.id as layer_id,
  l.name as layer_name,
  l.geometry_type,
  COUNT(f.id) as feature_count
FROM layers l
LEFT JOIN features f ON f.layer_id = l.id
WHERE l.geometry_type = 'Polygon'
GROUP BY l.id, l.name, l.geometry_type;

-- STEP 7: Check a sample polygon
SELECT 
  f.id,
  l.name as layer_name,
  f.properties->>'designation' as designation,
  jsonb_array_length(f.geometry->'coordinates'->0) as vertex_count,
  f.geometry->'coordinates'->0->0 as first_vertex
FROM features f
JOIN layers l ON l.id = f.layer_id
WHERE f.geometry->>'type' = 'Polygon'
LIMIT 5;
