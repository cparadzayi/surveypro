-- ============================================================================
-- COORDINATE ORDER FIX MIGRATION (Schema-Per-Surveyor)
-- ============================================================================
-- 
-- PURPOSE: Fix coordinate order in PostGIS storage to match EPSG:22291 axis definition
-- 
-- PROBLEM: Coordinates were stored as ST_MakePoint(Southing, Westing) 
--          but EPSG:22291 expects ST_MakePoint(Westing, Southing)
--          This caused QGIS to display points far outside Zimbabwe
--
-- SOLUTION: Swap X and Y ordinates for all coordinate points
--
-- IMPACT: This will fix QGIS display while maintaining MapLibre compatibility
--
-- SCHEMA-PER-SURVEYOR: This script works with the surveyor schema isolation
--
-- ============================================================================

-- IMPORTANT: Set your surveyor schema name here
-- Replace 'surveyor_john_doe' with your actual schema name
-- You can find your schema name by running: SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'surveyor_%';

\set SURVEYOR_SCHEMA 'surveyor_kuziva_paradzayi'

-- Set search path to your surveyor schema
SET search_path TO :SURVEYOR_SCHEMA, public;

-- Verify you're in the correct schema
SELECT current_schema();

-- ============================================================================

-- STEP 1: BACKUP YOUR DATA FIRST!
-- Run this before executing the migration:
-- 
-- pg_dump -h localhost -U postgres -d surveypro -n surveyor_john_doe -t coordinate_points > coordinate_points_backup.sql
--
-- Or from within PostgreSQL (replace schema name):
-- COPY surveyor_john_doe.coordinate_points TO '/path/to/backup/coordinate_points_backup.csv' CSV HEADER;

-- STEP 2: VERIFY CURRENT STATE
-- Check a few points to see if they need fixing
SELECT 
  name,
  ST_SRID(geom) as srid,
  ST_X(geom) as x_ordinate,
  ST_Y(geom) as y_ordinate,
  CASE 
    WHEN ST_X(geom) BETWEEN 90000 AND 105000 THEN 'X looks like Westing ✓'
    WHEN ST_X(geom) BETWEEN 2200000 AND 2300000 THEN 'X looks like Southing ✗ NEEDS FIX'
    ELSE 'X is out of expected range'
  END as x_check,
  CASE 
    WHEN ST_Y(geom) BETWEEN 2200000 AND 2300000 THEN 'Y looks like Southing ✓'
    WHEN ST_Y(geom) BETWEEN 90000 AND 105000 THEN 'Y looks like Westing ✗ NEEDS FIX'
    ELSE 'Y is out of expected range'
  END as y_check,
  ST_X(ST_Transform(geom, 4326)) as wgs84_lon,
  ST_Y(ST_Transform(geom, 4326)) as wgs84_lat,
  CASE 
    WHEN ST_X(ST_Transform(geom, 4326)) BETWEEN 25 AND 33 
     AND ST_Y(ST_Transform(geom, 4326)) BETWEEN -23 AND -15 
    THEN 'In Zimbabwe ✓'
    ELSE 'Outside Zimbabwe ✗ NEEDS FIX'
  END as location_check
FROM coordinate_points
ORDER BY name
LIMIT 10;

-- If you see "NEEDS FIX" in the output, proceed with the migration below.
-- If you see all ✓ marks, your data is already correct - DO NOT run the migration!

-- ============================================================================
-- STEP 3: RUN THE MIGRATION
-- ============================================================================

-- This will swap X and Y ordinates for all coordinate points in your surveyor schema
-- The SRID is preserved

BEGIN;

-- Verify we're in the correct schema before updating
DO $$
BEGIN
  RAISE NOTICE 'Running migration in schema: %', current_schema();
  RAISE NOTICE 'Search path: %', current_setting('search_path');
END $$;

-- Update all coordinate points by swapping X and Y ordinates
-- This only affects points in the current surveyor schema
UPDATE coordinate_points
SET geom = ST_SetSRID(
  ST_MakePoint(ST_Y(geom), ST_X(geom)),  -- Swap: new X = old Y, new Y = old X
  ST_SRID(geom)                          -- Preserve SRID
)
WHERE ST_SRID(geom) IN (22287, 22289, 22290, 22291, 22293);  -- Only Cape Lo SRIDs

-- Log the number of points updated
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Updated % coordinate points in schema %', updated_count, current_schema();
END $$;

-- STEP 4: VERIFY THE FIX
-- Check the same points again to confirm they're now correct
SELECT 
  name,
  ST_SRID(geom) as srid,
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

-- If all checks show ✓, commit the transaction
-- If any checks show ✗, rollback and investigate

-- COMMIT;  -- Uncomment this line to commit the changes
-- ROLLBACK;  -- Or uncomment this line to rollback if something looks wrong

-- ============================================================================
-- STEP 5: FINAL VERIFICATION IN QGIS
-- ============================================================================
-- 
-- After committing the migration:
-- 1. Open QGIS
-- 2. Add PostGIS layer from your surveyor schema:
--    - Schema: surveyor_john_doe (or your schema name)
--    - Table: coordinate_points
-- 3. Verify CRS is EPSG:22291
-- 4. Add OpenStreetMap basemap
-- 5. Confirm points appear in Zimbabwe (central region, near Zvishavane/Gweru)
-- 6. Check coordinates in attribute table:
--    - X (Westing) should be ~97,000
--    - Y (Southing) should be ~2,247,000
--
-- ============================================================================

-- EXPECTED RESULTS AFTER FIX:
-- 
-- For Point P2 (from your CSV sample):
-- - x_westing: 97538.004
-- - y_southing: 2247107.9
-- - wgs84_lon: ~30.12 (within Zimbabwe 25-33°E)
-- - wgs84_lat: ~-20.3 (within Zimbabwe -15 to -23°S)
-- - All checks: ✓
--
-- ============================================================================

-- NOTES:
-- 
-- 1. This migration only affects coordinate_points table
-- 2. Land parcels (land_parcels table) may need similar fix if affected
-- 3. After migration, new CSV imports will use correct coordinate order
-- 4. MapLibre will continue to work correctly (it compensates for the swap)
-- 5. QGIS will now display points in correct location
--
-- ============================================================================
