-- Debug script to see what's in the features table

-- 1. Check total features count
SELECT COUNT(*) as total_features FROM features;

-- 2. Check features by project
SELECT 
    project_id,
    COUNT(*) as feature_count
FROM features
GROUP BY project_id
ORDER BY project_id;

-- 3. Check geometry types in features
SELECT 
    f.geometry->>'type' as geom_type,
    COUNT(*) as count
FROM features f
GROUP BY f.geometry->>'type';

-- 4. Sample features for project 26
SELECT 
    f.id,
    f.project_id,
    f.geometry->>'type' as geom_type,
    f.properties->>'name' as name,
    f.properties
FROM features f
WHERE f.project_id = 26
LIMIT 10;

-- 5. Check if coordinate_points already has data
SELECT 
    project_id,
    COUNT(*) as count
FROM coordinate_points
GROUP BY project_id;

-- 6. Check if land_parcels already has data
SELECT 
    project_id,
    COUNT(*) as count
FROM land_parcels
GROUP BY project_id;

-- 7. Detailed check - what's preventing migration?
SELECT 
    f.id,
    f.project_id,
    f.geometry->>'type' as geom_type,
    COALESCE(
        f.properties->>'name',
        f.properties->>'POINT',
        f.properties->>'point',
        f.properties->>'Point',
        'P' || f.id
    ) as extracted_name,
    EXISTS (
        SELECT 1 FROM coordinate_points cp 
        WHERE cp.project_id = f.project_id 
          AND cp.name = COALESCE(
              f.properties->>'name',
              f.properties->>'POINT',
              f.properties->>'point',
              f.properties->>'Point',
              'P' || f.id
          )
    ) as already_exists
FROM features f
WHERE f.geometry->>'type' = 'Point'
  AND f.project_id = 26
LIMIT 20;
