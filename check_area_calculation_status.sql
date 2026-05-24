-- Check area calculation status for all projects
SELECT 
    project_id,
    COUNT(*) as total_parcels,
    SUM(CASE WHEN area_calculated = TRUE THEN 1 ELSE 0 END) as calculated_parcels,
    SUM(CASE WHEN area_calculated = FALSE OR area_calculated IS NULL THEN 1 ELSE 0 END) as not_calculated,
    MIN(area_m2) as min_area_m2,
    MAX(area_m2) as max_area_m2,
    AVG(area_m2) as avg_area_m2
FROM land_parcels
GROUP BY project_id
ORDER BY project_id;

-- Check parcels with no area calculation
SELECT 
    id,
    project_id,
    stand,
    area_m2,
    area_ha,
    perimeter_m,
    area_calculated,
    ST_GeometryType(geom) as geom_type,
    ST_IsValid(geom) as is_valid
FROM land_parcels
WHERE area_calculated = FALSE 
   OR area_calculated IS NULL
   OR area_m2 IS NULL
ORDER BY project_id, stand
LIMIT 20;
