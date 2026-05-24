-- Simple migration script - migrates data from features to normalized tables
-- Safe to run multiple times (checks for existing data)

-- ============================================================================
-- STEP 1: Migrate Point features to coordinate_points
-- ============================================================================

DO $$
DECLARE
    point_count INTEGER := 0;
    rec RECORD;
BEGIN
    FOR rec IN 
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
    LOOP
        -- Check if point already exists
        IF NOT EXISTS (
            SELECT 1 FROM coordinate_points 
            WHERE project_id = rec.project_id 
              AND name = rec.name
        ) THEN
            INSERT INTO coordinate_points (
                project_id, name, geom, elevation, description, created_at, updated_at
            ) VALUES (
                rec.project_id, rec.name, rec.geom, rec.elevation, rec.description, rec.created_at, rec.updated_at
            );
            point_count := point_count + 1;
        END IF;
    END LOOP;
    
    RAISE NOTICE '✅ Migrated % coordinate points', point_count;
END $$;

-- ============================================================================
-- STEP 2: Migrate Polygon features to land_parcels
-- ============================================================================

DO $$
DECLARE
    parcel_count INTEGER := 0;
    rec RECORD;
BEGIN
    FOR rec IN 
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
    LOOP
        -- Check if parcel already exists
        IF NOT EXISTS (
            SELECT 1 FROM land_parcels 
            WHERE project_id = rec.project_id 
              AND stand = rec.stand
        ) THEN
            INSERT INTO land_parcels (
                project_id, stand, geom, owner, title_deed, survey_date, surveyor, notes, created_at, updated_at
            ) VALUES (
                rec.project_id, rec.stand, rec.geom, rec.owner, rec.title_deed, rec.survey_date, rec.surveyor, rec.notes, rec.created_at, rec.updated_at
            );
            parcel_count := parcel_count + 1;
        END IF;
    END LOOP;
    
    RAISE NOTICE '✅ Migrated % land parcels', parcel_count;
END $$;

-- ============================================================================
-- STEP 3: Verify migration
-- ============================================================================

-- Count coordinate points by project
SELECT 
    project_id,
    COUNT(*) as coordinate_points_count
FROM coordinate_points
GROUP BY project_id
ORDER BY project_id;

-- Count land parcels by project with total areas
SELECT 
    project_id,
    COUNT(*) as land_parcels_count,
    ROUND(SUM(area_m2)::numeric, 2) as total_area_m2,
    ROUND(SUM(area_ha)::numeric, 4) as total_area_ha
FROM land_parcels
GROUP BY project_id
ORDER BY project_id;

-- Show sample coordinate points for project 26
SELECT 
    id,
    name,
    ROUND(ST_Y(geom)::numeric, 3) as y,
    ROUND(ST_X(geom)::numeric, 3) as x,
    elevation
FROM coordinate_points
WHERE project_id = 26
ORDER BY name
LIMIT 10;

-- Show sample land parcels for project 26
SELECT 
    id,
    stand,
    ROUND(area_m2::numeric, 2) as area_m2,
    ROUND(area_ha::numeric, 4) as area_ha,
    ROUND(perimeter_m::numeric, 2) as perimeter_m
FROM land_parcels
WHERE project_id = 26
ORDER BY stand
LIMIT 10;
