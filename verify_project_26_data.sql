-- Verify data exists for project 26

-- 1. Check coordinate_points for project 26
SELECT 
    id,
    project_id,
    name,
    ST_Y(geom) as y,
    ST_X(geom) as x,
    elevation,
    description
FROM coordinate_points
WHERE project_id = 26
ORDER BY name
LIMIT 20;

-- 2. Check land_parcels for project 26
SELECT 
    id,
    project_id,
    stand,
    ROUND(area_m2::numeric, 2) as area_m2,
    ROUND(area_ha::numeric, 4) as area_ha,
    ROUND(perimeter_m::numeric, 2) as perimeter_m,
    owner
FROM land_parcels
WHERE project_id = 26
ORDER BY stand
LIMIT 20;

-- 3. Count by project
SELECT 
    'coordinate_points' as table_name,
    project_id,
    COUNT(*) as count
FROM coordinate_points
GROUP BY project_id
UNION ALL
SELECT 
    'land_parcels' as table_name,
    project_id,
    COUNT(*) as count
FROM land_parcels
GROUP BY project_id
ORDER BY table_name, project_id;

-- 4. Check what project_id the frontend is actually using
SELECT id, name, code, description FROM projects WHERE id = 26;
