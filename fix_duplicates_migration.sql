-- ============================================================================
-- FIX DUPLICATE COORDINATE POINTS AND COORDINATE ORDER
-- ============================================================================
-- 
-- PROBLEM: Database has duplicate points with swapped coordinates
-- - Each point exists twice: once with correct order, once with wrong order
-- - This happened because old code stored coordinates in wrong order
-- - New imports may have created duplicates instead of updating
--
-- SOLUTION: 
-- 1. Identify and keep the CORRECT version (X=Westing ~97k, Y=Southing ~2.2M)
-- 2. Delete the WRONG version (X=Southing ~2.2M, Y=Westing ~97k)
--
-- ============================================================================

\set SURVEYOR_SCHEMA 'surveyor_kuziva_paradzayi'
SET search_path TO :SURVEYOR_SCHEMA, public;

SELECT current_schema();

-- ============================================================================
-- STEP 1: VERIFY THE PROBLEM
-- ============================================================================

-- Count total points vs unique names
SELECT 
  COUNT(*) as total_points,
  COUNT(DISTINCT name) as unique_names,
  COUNT(*) - COUNT(DISTINCT name) as duplicates
FROM coordinate_points;

-- Show sample duplicates
SELECT 
  name,
  id,
  ST_X(geom) as x_ordinate,
  ST_Y(geom) as y_ordinate,
  CASE 
    WHEN ST_X(geom) BETWEEN 90000 AND 105000 THEN 'CORRECT (X=Westing)'
    WHEN ST_X(geom) BETWEEN 2200000 AND 2300000 THEN 'WRONG (X=Southing)'
    ELSE 'UNKNOWN'
  END as status
FROM coordinate_points
WHERE name IN (
  SELECT name 
  FROM coordinate_points 
  GROUP BY name 
  HAVING COUNT(*) > 1
)
ORDER BY name, id
LIMIT 20;

-- ============================================================================
-- STEP 2: DELETE WRONG DUPLICATES
-- ============================================================================

BEGIN;

-- Delete points where X ordinate is Southing (wrong order)
-- Keep points where X ordinate is Westing (correct order)
DELETE FROM coordinate_points
WHERE id IN (
  SELECT id
  FROM coordinate_points
  WHERE ST_X(geom) BETWEEN 2200000 AND 2300000  -- X is Southing = WRONG
    AND ST_Y(geom) BETWEEN 90000 AND 105000     -- Y is Westing = WRONG
);

-- Log results
DO $$
DECLARE
  deleted_count INTEGER;
BEGIN
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % duplicate points with wrong coordinate order', deleted_count;
END $$;

-- ============================================================================
-- STEP 3: VERIFY THE FIX
-- ============================================================================

-- Count remaining points
SELECT 
  COUNT(*) as total_points,
  COUNT(DISTINCT name) as unique_names,
  COUNT(*) - COUNT(DISTINCT name) as remaining_duplicates
FROM coordinate_points;

-- Verify all remaining points have correct coordinate order
SELECT 
  name,
  ST_X(geom) as x_westing,
  ST_Y(geom) as y_southing,
  CASE 
    WHEN ST_X(geom) BETWEEN 90000 AND 105000 THEN 'X is Westing ✓'
    ELSE 'X is NOT Westing ✗'
  END as x_check,
  CASE 
    WHEN ST_Y(geom) BETWEEN 2200000 AND 2300000 THEN 'Y is Southing ✓'
    ELSE 'Y is NOT Southing ✗'
  END as y_check,
  ROUND(ST_X(ST_Transform(geom, 4326))::numeric, 6) as wgs84_lon,
  ROUND(ST_Y(ST_Transform(geom, 4326))::numeric, 6) as wgs84_lat,
  CASE 
    WHEN ST_X(ST_Transform(geom, 4326)) BETWEEN 25 AND 33 
     AND ST_Y(ST_Transform(geom, 4326)) BETWEEN -23 AND -15 
    THEN 'In Zimbabwe ✓'
    ELSE 'Outside Zimbabwe ✗'
  END as location_check
FROM coordinate_points
ORDER BY name
LIMIT 10;

-- If all checks show ✓ and remaining_duplicates = 0, commit
-- If any checks show ✗ or duplicates remain, rollback

-- COMMIT;  -- Uncomment to commit
-- ROLLBACK;  -- Or uncomment to rollback

-- ============================================================================
-- EXPECTED RESULTS:
-- 
-- Before: total_points = 1752, unique_names = 876, duplicates = 876
-- After:  total_points = 876, unique_names = 876, duplicates = 0
-- 
-- All verification checks should show ✓
-- All points should be "In Zimbabwe ✓"
-- ============================================================================
