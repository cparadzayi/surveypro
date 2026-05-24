-- Check how coordinate points appear for QGIS

-- 1. Check geometry type and SRID
SELECT 
    id,
    name,
    ST_GeometryType(geom) as geom_type,
    ST_SRID(geom) as srid,
    ST_AsText(geom) as wkt,
    ST_Y(geom) as y,
    ST_X(geom) as x,
    elevation
FROM coordinate_points
WHERE project_id = 26
ORDER BY name
LIMIT 10;

-- 2. Check if geometries are valid
SELECT 
    id,
    name,
    ST_IsValid(geom) as is_valid,
    ST_IsEmpty(geom) as is_empty,
    CASE 
        WHEN NOT ST_IsValid(geom) THEN ST_IsValidReason(geom)
        ELSE 'Valid'
    END as validation_message
FROM coordinate_points
WHERE project_id = 26
LIMIT 10;

-- 3. Get bounding box to check coordinate range
SELECT 
    MIN(ST_X(geom)) as min_x,
    MAX(ST_X(geom)) as max_x,
    MIN(ST_Y(geom)) as min_y,
    MAX(ST_Y(geom)) as max_y,
    (SELECT ST_SRID(geom) FROM coordinate_points WHERE project_id = 26 LIMIT 1) as srid
FROM coordinate_points
WHERE project_id = 26;

-- 4. Sample data with all attributes for QGIS
SELECT 
    id,
    project_id,
    name,
    ST_AsText(geom) as geometry_wkt,
    ST_X(geom) as x_coord,
    ST_Y(geom) as y_coord,
    elevation,
    description,
    created_at
FROM coordinate_points
WHERE project_id = 26
ORDER BY name
LIMIT 20;

-- 5. Check if there are any NULL geometries
SELECT 
    COUNT(*) as total_points,
    COUNT(geom) as points_with_geom,
    COUNT(*) - COUNT(geom) as null_geoms
FROM coordinate_points
WHERE project_id = 26;
