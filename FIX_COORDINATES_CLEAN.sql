-- FINAL FIX: Swap X and Y coordinates in the database
-- Clean version without special characters

SET search_path TO surveyor_surveyor_kuda, public;

-- Start transaction
BEGIN;

-- Show BEFORE state
SELECT 
    'BEFORE' as status,
    name,
    ST_Y(geom) as y_before,
    ST_X(geom) as x_before,
    ST_AsText(geom) as geom_before
FROM coordinate_points
WHERE name IN ('1465A', '1465D', '1465E', '1465F', '1466A')
ORDER BY name;

-- Apply the fix: Swap X and Y
UPDATE coordinate_points
SET geom = ST_SetSRID(
    ST_MakePoint(ST_Y(geom), ST_X(geom)),
    ST_SRID(geom)
);

-- Show AFTER state
SELECT 
    'AFTER' as status,
    name,
    ST_Y(geom) as y_after,
    ST_X(geom) as x_after,
    ST_AsText(geom) as geom_after
FROM coordinate_points
WHERE name IN ('1465A', '1465D', '1465E', '1465F', '1466A')
ORDER BY name;

-- Commit the transaction
COMMIT;

-- Final verification
SELECT 
    'DISTANCE_CHECK' as test,
    cp.name,
    ROUND(ST_Y(cp.geom)::numeric, 2) as point_y,
    ROUND(ST_X(cp.geom)::numeric, 2) as point_x,
    ROUND(ST_Distance(
        cp.geom,
        ST_SetSRID(ST_MakePoint(
            CASE cp.name
                WHEN '1465A' THEN 97593.77
                WHEN '1465D' THEN 97603.96
                WHEN '1465E' THEN 97605.31
                WHEN '1465F' THEN 97599.25
                WHEN '1466A' THEN 97589.51
            END,
            CASE cp.name
                WHEN '1465A' THEN 2247765.35
                WHEN '1465D' THEN 2247782.19
                WHEN '1465E' THEN 2247776.71
                WHEN '1465F' THEN 2247766.71
                WHEN '1466A' THEN 2247767.92
            END
        ), 22291)
    )::numeric, 3) as distance_m
FROM coordinate_points cp
WHERE name IN ('1465A', '1465D', '1465E', '1465F', '1466A')
ORDER BY name;
