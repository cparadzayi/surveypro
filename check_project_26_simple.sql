-- Simple check for project 26 data

-- Count coordinate points
SELECT COUNT(*) as coordinate_points_count 
FROM coordinate_points 
WHERE project_id = 26;

-- Count land parcels  
SELECT COUNT(*) as land_parcels_count 
FROM land_parcels 
WHERE project_id = 26;

-- Show first 5 coordinate points
SELECT 
    id,
    name,
    ROUND(ST_Y(geom)::numeric, 3) as y,
    ROUND(ST_X(geom)::numeric, 3) as x
FROM coordinate_points
WHERE project_id = 26
ORDER BY name
LIMIT 5;

-- Show first 5 land parcels
SELECT 
    id,
    stand,
    ROUND(area_m2::numeric, 2) as area_m2,
    ROUND(area_ha::numeric, 4) as area_ha
FROM land_parcels
WHERE project_id = 26
ORDER BY stand
LIMIT 5;
