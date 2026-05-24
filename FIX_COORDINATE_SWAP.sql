-- ============================================================================
-- CRITICAL FIX: Delete parcels with wrong coordinate order
-- ============================================================================
-- 
-- PROBLEM: Parcels were digitized with OLD code that saved coordinates as [Y, X]
--          New code expects standard GeoJSON [X, Y] order
--          This causes Y and X to appear swapped in the display
--
-- SOLUTION: Delete all parcels and re-digitize with FIXED code
--
-- ============================================================================

-- Step 1: Verify the problem (check a sample parcel)
-- If first_ordinate shows ~97k and second_ordinate shows ~2.2M, coordinates are SWAPPED
SELECT 
    stand,
    ST_X(ST_PointN(ST_ExteriorRing(geom), 1)) as first_ordinate,
    ST_Y(ST_PointN(ST_ExteriorRing(geom), 1)) as second_ordinate
FROM land_parcels
ORDER BY stand
LIMIT 5;

-- Expected CORRECT values:
-- first_ordinate (X) should be ~2,200,000 (Southing)
-- second_ordinate (Y) should be ~97,000 (Westing)

-- If you see the OPPOSITE (first ~97k, second ~2.2M), run the DELETE below:

-- ============================================================================
-- Step 2: DELETE ALL PARCELS (they have wrong coordinate order)
-- ============================================================================

-- UNCOMMENT THE LINE BELOW TO DELETE:
-- DELETE FROM land_parcels;

-- ============================================================================
-- Step 3: After deletion, re-digitize parcels
-- ============================================================================
-- 1. Refresh browser (Ctrl+Shift+R)
-- 2. Re-digitize parcels in MapLibreAreaView or QGIS
-- 3. Verify Y column shows ~97k, X column shows ~2.2M
-- ============================================================================
