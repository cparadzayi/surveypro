-- Check current layers in database
-- Run this in PostgreSQL to see what you have

-- 1. List all layers
SELECT 
  id,
  name,
  geometry_type,
  srid,
  created_at
FROM layers
ORDER BY created_at DESC;

-- 2. Count features by layer and geometry type
SELECT 
  l.id as layer_id,
  l.name as layer_name,
  l.geometry_type as layer_type,
  COUNT(f.id) as feature_count,
  f.geometry->>'type' as actual_geom_type
FROM layers l
LEFT JOIN features f ON f.layer_id = l.id
GROUP BY l.id, l.name, l.geometry_type, f.geometry->>'type'
ORDER BY l.id;

-- 3. Check for orphaned polygons (not linked to any layer)
SELECT 
  COUNT(*) as orphaned_polygons
FROM features
WHERE geometry->>'type' = 'Polygon'
  AND (layer_id IS NULL OR layer_id NOT IN (SELECT id FROM layers));

-- 4. If orphaned polygons exist, show them
SELECT 
  id,
  layer_id,
  properties->>'designation' as designation,
  geometry->'coordinates'->0->0 as first_vertex,
  created_at
FROM features
WHERE geometry->>'type' = 'Polygon'
  AND (layer_id IS NULL OR layer_id NOT IN (SELECT id FROM layers))
LIMIT 10;

-- 5. Check geometry types in features table
SELECT 
  geometry->>'type' as geom_type,
  COUNT(*) as count
FROM features
GROUP BY geometry->>'type';
