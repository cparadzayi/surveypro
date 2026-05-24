-- Check if there's data in the old tables that needs migration
-- Run this in pgAdmin or psql

-- 1. Check coordinate_points table (new normalized table)
SELECT COUNT(*) as coordinate_points_count FROM coordinate_points WHERE project_id = 26;

-- 2. Check land_parcels table (new normalized table)
SELECT COUNT(*) as land_parcels_count FROM land_parcels WHERE project_id = 26;

-- 3. Check if there's data in the old features table
SELECT COUNT(*) as old_features_count FROM features WHERE project_id = 26;

-- 4. Check layers for this project
SELECT id, name, layer_type, geom_type FROM layers WHERE project_id = 26;

-- 5. Check features by layer
SELECT 
    l.name as layer_name,
    l.geom_type,
    COUNT(f.id) as feature_count
FROM layers l
LEFT JOIN features f ON f.layer_id = l.id
WHERE l.project_id = 26
GROUP BY l.id, l.name, l.geom_type
ORDER BY l.name;

-- 6. Sample some features to see what's there
SELECT 
    f.id,
    l.name as layer_name,
    l.geom_type,
    f.properties->>'name' as feature_name,
    ST_GeometryType(f.geometry) as geom_type
FROM features f
JOIN layers l ON l.id = f.layer_id
WHERE l.project_id = 26
LIMIT 10;
