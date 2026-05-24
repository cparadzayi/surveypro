-- Import land_parcels table into features table
-- This makes the polygons accessible to the batch computation system

-- STEP 1: Check the structure of land_parcels table
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_name = 'land_parcels'
ORDER BY ordinal_position;

-- STEP 2: View sample data from land_parcels
SELECT * FROM land_parcels LIMIT 5;

-- STEP 3: Find or create the polygon layer
-- First, check if it exists
SELECT id, name, geom_type FROM layers WHERE geom_type = 'Polygon';

-- If no polygon layer exists, create one:
-- (Replace project_id with your actual project)
INSERT INTO layers (project_id, name, geom_type, srid)
SELECT 
  id,
  'Land Parcels',
  'Polygon',
  22291  -- Adjust SRID if different
FROM projects
WHERE name ILIKE '%avondale%'  -- Adjust project name
LIMIT 1
ON CONFLICT (name, project_id) DO NOTHING
RETURNING id, name;

-- Note the layer_id (e.g., 19)

-- STEP 4: Import land_parcels into features table
-- This assumes land_parcels has a PostGIS geometry column (usually 'geom' or 'geometry')
-- Adjust column names based on your actual table structure

-- Option A: If land_parcels has PostGIS geometry
INSERT INTO features (layer_id, project_id, geometry, properties)
SELECT 
  19,  -- ← CHANGE to your polygon layer_id from STEP 3
  (SELECT id FROM projects WHERE name ILIKE '%avondale%' LIMIT 1),
  ST_AsGeoJSON(geom)::jsonb,  -- Convert PostGIS geometry to GeoJSON
  jsonb_build_object(
    'designation', COALESCE(designation, stand_number, name, 'Parcel ' || id),
    'area_m2', area_m2,
    'imported_from', 'land_parcels'
  )
FROM land_parcels;

-- Option B: If land_parcels already has GeoJSON geometry
INSERT INTO features (layer_id, project_id, geometry, properties)
SELECT 
  19,  -- ← CHANGE to your polygon layer_id
  (SELECT id FROM projects WHERE name ILIKE '%avondale%' LIMIT 1),
  geometry,  -- Already in GeoJSON format
  jsonb_build_object(
    'designation', COALESCE(designation, stand_number, name, 'Parcel ' || id),
    'imported_from', 'land_parcels'
  )
FROM land_parcels;

-- STEP 5: Verify the import
SELECT 
  l.id as layer_id,
  l.name as layer_name,
  COUNT(f.id) as polygon_count
FROM layers l
LEFT JOIN features f ON f.layer_id = l.id
WHERE l.geom_type = 'Polygon'
GROUP BY l.id, l.name;

-- Should show 4 polygons

-- STEP 6: Check imported polygons
SELECT 
  f.id,
  f.layer_id,
  f.properties->>'designation' as designation,
  f.geometry->>'type' as geom_type,
  jsonb_array_length(f.geometry->'coordinates'->0) as vertices
FROM features f
WHERE f.layer_id = 19  -- Your polygon layer_id
  AND f.geometry->>'type' = 'Polygon'
LIMIT 10;

-- STEP 7: After import, refresh browser and try batch computation again
