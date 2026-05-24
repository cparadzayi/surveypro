-- Migrate existing data from features table to normalized tables
-- This script moves Point features to coordinate_points and Polygon features to land_parcels

-- ============================================================================
-- OPTIONAL: Clear existing data (uncomment if you want to re-migrate)
-- ============================================================================
-- DELETE FROM land_parcels;
-- DELETE FROM coordinate_points;

-- ============================================================================
-- STEP 1: Migrate Point features to coordinate_points
-- ============================================================================

INSERT INTO coordinate_points (
    project_id,
    name,
    geom,
    elevation,
    description,
    created_at,
    updated_at
)
SELECT 
    f.project_id,
    COALESCE(
        f.properties->>'name',
        f.properties->>'POINT',
        f.properties->>'point',
        f.properties->>'Point',
        'P' || f.id
    ) as name,
    ST_SetSRID(
        ST_GeomFromGeoJSON(f.geometry::text),
        22291
    ) as geom,
    CASE 
        WHEN f.properties->>'elevation' ~ '^[0-9]+\.?[0-9]*$' 
        THEN (f.properties->>'elevation')::numeric
        ELSE NULL
    END as elevation,
    f.properties->>'description' as description,
    f.created_at,
    f.updated_at
FROM features f
JOIN layers l ON l.id = f.layer_id
WHERE f.geometry->>'type' = 'Point'
ORDER BY f.project_id, f.id
ON CONFLICT (project_id, name) DO NOTHING;

-- ============================================================================
-- STEP 2: Migrate Polygon features to land_parcels
-- ============================================================================

INSERT INTO land_parcels (
    project_id,
    stand,
    geom,
    owner,
    title_deed,
    survey_date,
    surveyor,
    notes,
    created_at,
    updated_at
)
SELECT 
    f.project_id,
    COALESCE(
        f.properties->>'stand',
        f.properties->>'Stand',
        f.properties->>'STAND',
        f.properties->>'designation',
        f.properties->>'name',
        'Parcel-' || f.id
    ) as stand,
    ST_SetSRID(
        ST_GeomFromGeoJSON(f.geometry::text),
        22291
    ) as geom,
    f.properties->>'owner' as owner,
    f.properties->>'title_deed' as title_deed,
    CASE 
        WHEN f.properties->>'survey_date' ~ '^\d{4}-\d{2}-\d{2}' 
        THEN (f.properties->>'survey_date')::date
        ELSE NULL
    END as survey_date,
    f.properties->>'surveyor' as surveyor,
    f.properties->>'notes' as notes,
    f.created_at,
    f.updated_at
FROM features f
JOIN layers l ON l.id = f.layer_id
WHERE f.geometry->>'type' = 'Polygon'
ORDER BY f.project_id, f.id
ON CONFLICT (project_id, stand) DO NOTHING;

-- ============================================================================
-- STEP 3: Verify migration
-- ============================================================================

-- Count migrated coordinate points
SELECT 
    project_id,
    COUNT(*) as coordinate_points_count
FROM coordinate_points
GROUP BY project_id
ORDER BY project_id;

-- Count migrated land parcels
SELECT 
    project_id,
    COUNT(*) as land_parcels_count,
    SUM(area_m2) as total_area_m2,
    SUM(area_ha) as total_area_ha
FROM land_parcels
GROUP BY project_id
ORDER BY project_id;

-- Show sample coordinate points
SELECT 
    id,
    project_id,
    name,
    ST_Y(geom) as y,
    ST_X(geom) as x,
    elevation
FROM coordinate_points
ORDER BY project_id, name
LIMIT 20;

-- Show sample land parcels with auto-calculated areas
SELECT 
    id,
    project_id,
    stand,
    ROUND(area_m2::numeric, 2) as area_m2,
    ROUND(area_ha::numeric, 4) as area_ha,
    ROUND(perimeter_m::numeric, 2) as perimeter_m
FROM land_parcels
ORDER BY project_id, stand
LIMIT 20;

-- ============================================================================
-- NOTES:
-- ============================================================================
-- 1. This script is safe to run multiple times (uses NOT EXISTS to prevent duplicates)
-- 2. Areas are automatically calculated by the generated columns in land_parcels
-- 3. The old features table is NOT deleted (kept for backup)
-- 4. If you need to re-migrate, delete from coordinate_points and land_parcels first
