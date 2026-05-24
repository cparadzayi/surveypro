-- CORRECTED SQL - Use geom_type instead of geometry_type
-- Run these commands in PostgreSQL (pgAdmin or psql)

-- STEP 1: Find your project ID
SELECT id, name FROM projects WHERE name ILIKE '%avondale%';
-- Note the id (e.g., 1)

-- STEP 2: Create the polygon layer (CORRECTED - uses geom_type)
INSERT INTO layers (project_id, name, geom_type, srid, description)
VALUES (
  1,  -- ← CHANGE THIS to your project_id from Step 1
  'Avondale - Land Parcels',
  'Polygon',
  22291,
  'Land parcels digitized in QGIS'
)
ON CONFLICT (name, project_id) DO NOTHING
RETURNING id, name;
-- Note the returned id (e.g., 6)

-- STEP 3: Link existing polygons to this layer
UPDATE features
SET layer_id = 6  -- ← CHANGE THIS to the layer_id from Step 2
WHERE geometry->>'type' = 'Polygon'
  AND (layer_id IS NULL OR layer_id = 0);

-- STEP 4: Verify the fix
SELECT 
  l.id as layer_id,
  l.name as layer_name,
  l.geom_type,
  COUNT(f.id) as polygon_count
FROM layers l
LEFT JOIN features f ON f.layer_id = l.id
WHERE l.geom_type = 'Polygon'
GROUP BY l.id, l.name, l.geom_type;

-- STEP 5: Check sample polygons
SELECT 
  f.id,
  l.name as layer_name,
  f.properties->>'designation' as designation,
  jsonb_array_length(f.geometry->'coordinates'->0) as vertex_count
FROM features f
JOIN layers l ON l.id = f.layer_id
WHERE f.geometry->>'type' = 'Polygon'
LIMIT 5;
