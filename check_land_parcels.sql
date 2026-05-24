-- Check land parcels in database

-- 1. Count parcels by project
SELECT 
    project_id,
    COUNT(*) as parcel_count
FROM land_parcels
GROUP BY project_id
ORDER BY project_id;

-- 2. Show parcels for project 26 with all details
SELECT 
    id,
    project_id,
    stand,
    ROUND(area_m2::numeric, 2) as area_m2,
    ROUND(area_ha::numeric, 4) as area_ha,
    ROUND(perimeter_m::numeric, 2) as perimeter_m,
    owner,
    ST_GeometryType(geom) as geom_type,
    ST_SRID(geom) as srid,
    ST_IsValid(geom) as is_valid
FROM land_parcels
WHERE project_id = 26
ORDER BY stand;

-- 3. Check if geometries are valid
SELECT 
    id,
    stand,
    ST_IsValid(geom) as is_valid,
    CASE 
        WHEN NOT ST_IsValid(geom) THEN ST_IsValidReason(geom)
        ELSE 'Valid'
    END as validation_message,
    ST_NumPoints(geom) as num_vertices
FROM land_parcels
WHERE project_id = 26;
