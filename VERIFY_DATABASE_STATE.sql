-- Verify current database state for coordinate points
-- Check if coordinates are still swapped

SET search_path TO surveyor_surveyor_kuda, public;

-- Check a few known points to see their current state
SELECT 
    name,
    ST_Y(geom) as current_y,
    ST_X(geom) as current_x,
    ST_AsText(geom) as geom_wkt,
    CASE 
        WHEN ST_Y(geom) > 2000000 THEN '❌ SWAPPED (Y is too large)'
        WHEN ST_X(geom) < 100000 THEN '❌ SWAPPED (X is too small)'
        ELSE '✅ CORRECT'
    END as status
FROM coordinate_points
WHERE name IN ('1465A', '1465D', '1465E', '1465F', '1466A')
ORDER BY name;

-- Expected CORRECT values:
-- 1465A: Y ≈ 97593.77, X ≈ 2247765.35
-- 1465D: Y ≈ 97603.96, X ≈ 2247782.19
-- 1465E: Y ≈ 97605.31, X ≈ 2247776.71
-- 1465F: Y ≈ 97599.25, X ≈ 2247766.71
-- 1466A: Y ≈ 97589.51, X ≈ 2247767.92

-- If SWAPPED, you'll see:
-- Y values in the 2,247,000 range (should be 97,000 range)
-- X values in the 97,000 range (should be 2,247,000 range)
