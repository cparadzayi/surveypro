-- Migration 060: Fix Coordinate System from Cape Lo 31 (22291) to Hartebeesthoek94 Lo 31 (2053)
-- 
-- PROBLEM: EPSG:22291 is south-oriented (+axis=wsu), causing data to display upside-down in QGIS
-- SOLUTION: Use EPSG:2053 (Hartebeesthoek94 / Lo31) which is north-oriented and overlays with Google Maps
--
-- This migration transforms all existing geometries from south-oriented Cape datum 
-- to north-oriented Hartebeesthoek94 datum (Zimbabwe's modern standard since 1999)

BEGIN;

-- ============================================================================
-- BACKUP EXISTING DATA
-- ============================================================================

-- Create backup tables with current data
CREATE TABLE IF NOT EXISTS coordinate_points_backup_060 AS 
SELECT * FROM coordinate_points;

CREATE TABLE IF NOT EXISTS land_parcels_backup_060 AS 
SELECT * FROM land_parcels;

RAISE NOTICE 'Backup tables created: coordinate_points_backup_060, land_parcels_backup_060';

-- ============================================================================
-- TRANSFORM COORDINATE POINTS
-- ============================================================================

-- Drop existing spatial index
DROP INDEX IF EXISTS coordinate_points_geom_idx;

-- Transform geometry from EPSG:22291 (Cape Lo 31) to EPSG:2053 (Hartebeesthoek94 Lo 31)
-- ST_Transform handles the datum shift and axis reorientation automatically
ALTER TABLE coordinate_points 
  ALTER COLUMN geom TYPE GEOMETRY(Point, 2053) 
  USING ST_Transform(geom, 2053);

-- Recreate spatial index with new SRID
CREATE INDEX coordinate_points_geom_idx ON coordinate_points USING GIST(geom);

RAISE NOTICE 'Coordinate points transformed to EPSG:2053';

-- ============================================================================
-- TRANSFORM LAND PARCELS
-- ============================================================================

-- Drop existing spatial index
DROP INDEX IF EXISTS land_parcels_geom_idx;

-- Transform geometry from EPSG:22291 to EPSG:2053
ALTER TABLE land_parcels 
  ALTER COLUMN geom TYPE GEOMETRY(Polygon, 2053)
  USING ST_Transform(geom, 2053);

-- Recreate spatial index with new SRID
CREATE INDEX land_parcels_geom_idx ON land_parcels USING GIST(geom);

RAISE NOTICE 'Land parcels transformed to EPSG:2053';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Count records transformed
DO $$
DECLARE
  coord_count INTEGER;
  parcel_count INTEGER;
  coord_srid INTEGER;
  parcel_srid INTEGER;
BEGIN
  -- Count coordinate points
  SELECT COUNT(*) INTO coord_count FROM coordinate_points;
  
  -- Count land parcels
  SELECT COUNT(*) INTO parcel_count FROM land_parcels;
  
  -- Verify SRID
  SELECT DISTINCT ST_SRID(geom) INTO coord_srid FROM coordinate_points LIMIT 1;
  SELECT DISTINCT ST_SRID(geom) INTO parcel_srid FROM land_parcels LIMIT 1;
  
  RAISE NOTICE '✅ Transformation complete:';
  RAISE NOTICE '   - Coordinate points: % records (SRID: %)', coord_count, coord_srid;
  RAISE NOTICE '   - Land parcels: % records (SRID: %)', parcel_count, parcel_srid;
  
  -- Verify SRID is correct
  IF coord_srid != 2053 THEN
    RAISE EXCEPTION 'Coordinate points SRID is %, expected 2053', coord_srid;
  END IF;
  
  IF parcel_srid != 2053 THEN
    RAISE EXCEPTION 'Land parcels SRID is %, expected 2053', parcel_srid;
  END IF;
  
  RAISE NOTICE '✅ SRID verification passed';
END $$;

-- ============================================================================
-- SAMPLE COORDINATE COMPARISON
-- ============================================================================

-- Show before/after coordinates for first 5 points (if any exist)
DO $$
DECLARE
  rec RECORD;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '📍 Sample coordinate comparison (first 5 points):';
  RAISE NOTICE '   Format: Point Name | Old (22291) Y,X | New (2053) Y,X';
  RAISE NOTICE '   --------------------------------------------------------';
  
  FOR rec IN 
    SELECT 
      cp.name,
      ST_Y(backup.geom) as old_y,
      ST_X(backup.geom) as old_x,
      ST_Y(cp.geom) as new_y,
      ST_X(cp.geom) as new_x
    FROM coordinate_points cp
    JOIN coordinate_points_backup_060 backup ON cp.id = backup.id
    LIMIT 5
  LOOP
    RAISE NOTICE '   % | (%.2f, %.2f) → (%.2f, %.2f)', 
      rec.name, rec.old_y, rec.old_x, rec.new_y, rec.new_x;
  END LOOP;
  
  RAISE NOTICE '';
END $$;

-- ============================================================================
-- CLEANUP INSTRUCTIONS
-- ============================================================================

COMMENT ON TABLE coordinate_points_backup_060 IS 
  'Backup of coordinate_points before SRID transformation (Migration 060). 
   Original SRID: 22291 (Cape Lo 31 - South Oriented).
   Safe to drop after verifying QGIS display is correct.
   Drop command: DROP TABLE coordinate_points_backup_060;';

COMMENT ON TABLE land_parcels_backup_060 IS 
  'Backup of land_parcels before SRID transformation (Migration 060).
   Original SRID: 22291 (Cape Lo 31 - South Oriented).
   Safe to drop after verifying QGIS display is correct.
   Drop command: DROP TABLE land_parcels_backup_060;';

RAISE NOTICE '';
RAISE NOTICE '🎉 Migration 060 complete!';
RAISE NOTICE '';
RAISE NOTICE '📋 Next Steps:';
RAISE NOTICE '   1. Update backend code to use SRID 2053 (see FIX_COORDINATE_SYSTEM.md)';
RAISE NOTICE '   2. Test in QGIS 3.44 - data should display north-up';
RAISE NOTICE '   3. Add Google Satellite layer - should overlay perfectly';
RAISE NOTICE '   4. After verification, drop backup tables:';
RAISE NOTICE '      DROP TABLE coordinate_points_backup_060;';
RAISE NOTICE '      DROP TABLE land_parcels_backup_060;';
RAISE NOTICE '';

COMMIT;
