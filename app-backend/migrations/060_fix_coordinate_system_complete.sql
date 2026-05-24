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

CREATE TABLE IF NOT EXISTS coordinate_points_backup_060 AS 
SELECT * FROM coordinate_points;

CREATE TABLE IF NOT EXISTS land_parcels_backup_060 AS 
SELECT * FROM land_parcels;

-- ============================================================================
-- DROP ALL DEPENDENCIES ON GEOMETRY COLUMNS
-- ============================================================================

-- Drop views
DROP VIEW IF EXISTS coordinate_points_full CASCADE;
DROP VIEW IF EXISTS land_parcels_full CASCADE;

-- Drop ALL triggers on land_parcels (must drop before altering geom column)
DROP TRIGGER IF EXISTS prevent_parcel_overlap ON land_parcels;
DROP TRIGGER IF EXISTS land_parcels_updated_at ON land_parcels;
DROP TRIGGER IF EXISTS land_parcels_auto_project_id ON land_parcels;
DROP TRIGGER IF EXISTS trigger_update_land_parcels_updated_at ON land_parcels;
DROP TRIGGER IF EXISTS trigger_update_import_has_parcels ON land_parcels;
DROP TRIGGER IF EXISTS land_parcel_auto_calculate ON land_parcels;

-- ============================================================================
-- TRANSFORM COORDINATE POINTS
-- ============================================================================

DROP INDEX IF EXISTS coordinate_points_geom_idx;

ALTER TABLE coordinate_points 
  ALTER COLUMN geom TYPE GEOMETRY(Point, 2053) 
  USING ST_Transform(geom, 2053);

CREATE INDEX coordinate_points_geom_idx ON coordinate_points USING GIST(geom);

-- ============================================================================
-- TRANSFORM LAND PARCELS
-- ============================================================================

DROP INDEX IF EXISTS land_parcels_geom_idx;

-- Drop generated columns
ALTER TABLE land_parcels DROP COLUMN IF EXISTS area_m2 CASCADE;
ALTER TABLE land_parcels DROP COLUMN IF EXISTS area_ha CASCADE;
ALTER TABLE land_parcels DROP COLUMN IF EXISTS perimeter_m CASCADE;

-- Transform geometry
ALTER TABLE land_parcels 
  ALTER COLUMN geom TYPE GEOMETRY(Polygon, 2053)
  USING ST_Transform(geom, 2053);

-- Recreate generated columns
ALTER TABLE land_parcels 
  ADD COLUMN area_m2 NUMERIC GENERATED ALWAYS AS (ST_Area(geom)) STORED;

ALTER TABLE land_parcels 
  ADD COLUMN area_ha NUMERIC GENERATED ALWAYS AS (ST_Area(geom) / 10000) STORED;

ALTER TABLE land_parcels 
  ADD COLUMN perimeter_m NUMERIC GENERATED ALWAYS AS (ST_Perimeter(geom)) STORED;

-- Recreate indexes
CREATE INDEX land_parcels_geom_idx ON land_parcels USING GIST(geom);
CREATE INDEX IF NOT EXISTS land_parcels_area_idx ON land_parcels(area_m2);

-- ============================================================================
-- RECREATE TRIGGERS
-- ============================================================================

-- Trigger: prevent_parcel_overlap (from migration 024)
CREATE TRIGGER prevent_parcel_overlap
  BEFORE INSERT OR UPDATE OF geom ON land_parcels
  FOR EACH ROW
  EXECUTE FUNCTION check_parcel_overlap();

-- Trigger: land_parcels_updated_at (from migration 017)
CREATE TRIGGER land_parcels_updated_at
  BEFORE UPDATE ON land_parcels
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: trigger_update_land_parcels_updated_at (from migration 029)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_land_parcels_updated_at') THEN
    CREATE TRIGGER trigger_update_land_parcels_updated_at
      BEFORE UPDATE ON land_parcels
      FOR EACH ROW
      EXECUTE FUNCTION update_land_parcels_updated_at();
  END IF;
END $$;

-- Trigger: land_parcel_auto_calculate (from migration 053)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'auto_calculate_parcel_metrics') THEN
    CREATE TRIGGER land_parcel_auto_calculate
      BEFORE INSERT OR UPDATE OF geom ON land_parcels
      FOR EACH ROW
      EXECUTE FUNCTION auto_calculate_parcel_metrics();
  END IF;
END $$;

-- Trigger: trigger_update_import_has_parcels (from migration 020)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_import_has_parcels') THEN
    CREATE TRIGGER trigger_update_import_has_parcels
      AFTER INSERT OR DELETE ON land_parcels
      FOR EACH ROW
      EXECUTE FUNCTION update_import_has_parcels();
  END IF;
END $$;

-- Trigger: land_parcels_auto_project_id (if function exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'auto_set_land_parcel_project_id') THEN
    CREATE TRIGGER land_parcels_auto_project_id
      BEFORE INSERT ON land_parcels
      FOR EACH ROW
      EXECUTE FUNCTION auto_set_land_parcel_project_id();
  END IF;
END $$;

-- ============================================================================
-- RECREATE VIEWS
-- ============================================================================

CREATE OR REPLACE VIEW land_parcels_full AS
SELECT 
  lp.*,
  ST_Centroid(lp.geom) as centroid,
  ST_AsGeoJSON(lp.geom)::jsonb as geojson,
  ST_NPoints(lp.geom) as vertex_count
FROM land_parcels lp;

CREATE OR REPLACE VIEW coordinate_points_full AS
SELECT 
  cp.*,
  ST_AsGeoJSON(cp.geom)::jsonb as geojson,
  ST_X(cp.geom) as y,
  ST_Y(cp.geom) as x
FROM coordinate_points cp;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
  coord_count INTEGER;
  parcel_count INTEGER;
  coord_srid INTEGER;
  parcel_srid INTEGER;
BEGIN
  SELECT COUNT(*) INTO coord_count FROM coordinate_points;
  SELECT COUNT(*) INTO parcel_count FROM land_parcels;
  
  SELECT DISTINCT ST_SRID(geom) INTO coord_srid FROM coordinate_points LIMIT 1;
  SELECT DISTINCT ST_SRID(geom) INTO parcel_srid FROM land_parcels LIMIT 1;
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'TRANSFORMATION COMPLETE';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Coordinate points: % records (SRID: %)', coord_count, coord_srid;
  RAISE NOTICE 'Land parcels: % records (SRID: %)', parcel_count, parcel_srid;
  
  IF coord_srid != 2053 THEN
    RAISE EXCEPTION 'Coordinate points SRID is %, expected 2053', coord_srid;
  END IF;
  
  IF parcel_srid != 2053 THEN
    RAISE EXCEPTION 'Land parcels SRID is %, expected 2053', parcel_srid;
  END IF;
  
  RAISE NOTICE 'SRID verification: PASSED';
  RAISE NOTICE 'Generated columns: RECREATED';
  RAISE NOTICE 'Triggers: RECREATED';
  RAISE NOTICE 'Views: RECREATED';
  RAISE NOTICE '';
END $$;

-- ============================================================================
-- SAMPLE DATA
-- ============================================================================

DO $$
DECLARE
  rec RECORD;
  point_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO point_count FROM coordinate_points;
  
  IF point_count > 0 THEN
    RAISE NOTICE 'Sample coordinates (first 5 points):';
    RAISE NOTICE 'Point | Old Y,X (22291) | New Y,X (2053)';
    RAISE NOTICE '-------------------------------------------';
    
    FOR rec IN 
      SELECT 
        cp.name,
        ROUND(ST_Y(backup.geom)::numeric, 2) as old_y,
        ROUND(ST_X(backup.geom)::numeric, 2) as old_x,
        ROUND(ST_Y(cp.geom)::numeric, 2) as new_y,
        ROUND(ST_X(cp.geom)::numeric, 2) as new_x
      FROM coordinate_points cp
      JOIN coordinate_points_backup_060 backup ON cp.id = backup.id
      LIMIT 5
    LOOP
      RAISE NOTICE '% | (%, %) -> (%, %)', 
        rec.name, rec.old_y, rec.old_x, rec.new_y, rec.new_x;
    END LOOP;
    RAISE NOTICE '';
  END IF;
END $$;

-- ============================================================================
-- CLEANUP INSTRUCTIONS
-- ============================================================================

COMMENT ON TABLE coordinate_points_backup_060 IS 
  'Backup before SRID transformation. Drop after QGIS verification: DROP TABLE coordinate_points_backup_060;';

COMMENT ON TABLE land_parcels_backup_060 IS 
  'Backup before SRID transformation. Drop after QGIS verification: DROP TABLE land_parcels_backup_060;';

-- ============================================================================
-- FINAL MESSAGE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'MIGRATION 060 SUCCESS!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Next Steps:';
  RAISE NOTICE '1. Restart backend server';
  RAISE NOTICE '2. Test in QGIS 3.44:';
  RAISE NOTICE '   - Add coordinate_points (base table)';
  RAISE NOTICE '   - Add land_parcels (base table)';
  RAISE NOTICE '   - Add Google Satellite layer';
  RAISE NOTICE '   - Verify: north = UP, perfect overlay';
  RAISE NOTICE '3. After verification:';
  RAISE NOTICE '   DROP TABLE coordinate_points_backup_060;';
  RAISE NOTICE '   DROP TABLE land_parcels_backup_060;';
  RAISE NOTICE '';
END $$;

COMMIT;
