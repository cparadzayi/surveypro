-- ============================================================================
-- Fix ALL remaining schemas: remove SRID 22291 constraint from geometry columns
-- Handles views, triggers, and generated columns blocking the ALTER
-- ============================================================================

-- Helper: get SRID from central meridian
CREATE OR REPLACE FUNCTION get_cape_lo_srid(cm integer) RETURNS integer AS $$
BEGIN
  RETURN CASE cm
    WHEN 25 THEN 22285 WHEN 27 THEN 22287 WHEN 29 THEN 22289
    WHEN 31 THEN 22291 WHEN 33 THEN 22293 ELSE 22291
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- 1. surveyor_surveyor_elon
-- ============================================================================
\echo '=== surveyor_surveyor_elon ==='
SET search_path = surveyor_surveyor_elon, public;

-- Drop blocking view
DROP VIEW IF EXISTS coordinate_points_qgis CASCADE;

-- Save and drop triggers on land_parcels
DROP TRIGGER IF EXISTS prevent_parcel_overlap ON land_parcels;
DROP TRIGGER IF EXISTS trigger_update_land_parcels_updated_at ON land_parcels;
DROP TRIGGER IF EXISTS auto_fix_qgis_coordinates ON land_parcels;

-- ALTER columns
ALTER TABLE coordinate_points ALTER COLUMN geom TYPE geometry(Point) USING geom;
ALTER TABLE land_parcels ALTER COLUMN geom TYPE geometry USING geom;

-- Recreate triggers (functions already exist in schema/public)
CREATE TRIGGER prevent_parcel_overlap BEFORE INSERT OR UPDATE ON land_parcels
  FOR EACH ROW EXECUTE FUNCTION prevent_parcel_overlap_fn();
CREATE TRIGGER trigger_update_land_parcels_updated_at BEFORE UPDATE ON land_parcels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER auto_fix_qgis_coordinates BEFORE INSERT OR UPDATE ON land_parcels
  FOR EACH ROW EXECUTE FUNCTION fix_qgis_coordinates();

-- Re-tag data
UPDATE coordinate_points cp SET geom = ST_SetSRID(cp.geom, get_cape_lo_srid(sp.central_meridian::integer))
FROM survey_projects sp WHERE cp.project_id = sp.id AND sp.central_meridian IS NOT NULL;
UPDATE land_parcels lp SET geom = ST_SetSRID(lp.geom, get_cape_lo_srid(sp.central_meridian::integer))
FROM survey_projects sp WHERE lp.project_id = sp.id AND sp.central_meridian IS NOT NULL;

\echo 'Done: surveyor_surveyor_elon'

-- ============================================================================
-- 2. surveyor_surveyor_kuda
-- ============================================================================
\echo '=== surveyor_surveyor_kuda ==='
SET search_path = surveyor_surveyor_kuda, public;

DROP VIEW IF EXISTS coordinate_points_qgis CASCADE;
DROP TRIGGER IF EXISTS prevent_parcel_overlap ON land_parcels;
DROP TRIGGER IF EXISTS trigger_update_land_parcels_updated_at ON land_parcels;
DROP TRIGGER IF EXISTS auto_fix_qgis_coordinates ON land_parcels;

ALTER TABLE coordinate_points ALTER COLUMN geom TYPE geometry(Point) USING geom;
ALTER TABLE land_parcels ALTER COLUMN geom TYPE geometry USING geom;

CREATE TRIGGER prevent_parcel_overlap BEFORE INSERT OR UPDATE ON land_parcels
  FOR EACH ROW EXECUTE FUNCTION prevent_parcel_overlap_fn();
CREATE TRIGGER trigger_update_land_parcels_updated_at BEFORE UPDATE ON land_parcels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER auto_fix_qgis_coordinates BEFORE INSERT OR UPDATE ON land_parcels
  FOR EACH ROW EXECUTE FUNCTION fix_qgis_coordinates();

UPDATE coordinate_points cp SET geom = ST_SetSRID(cp.geom, get_cape_lo_srid(sp.central_meridian::integer))
FROM survey_projects sp WHERE cp.project_id = sp.id AND sp.central_meridian IS NOT NULL;
UPDATE land_parcels lp SET geom = ST_SetSRID(lp.geom, get_cape_lo_srid(sp.central_meridian::integer))
FROM survey_projects sp WHERE lp.project_id = sp.id AND sp.central_meridian IS NOT NULL;

\echo 'Done: surveyor_surveyor_kuda'

-- ============================================================================
-- 3. surveyor_surveyor_kuziva
-- ============================================================================
\echo '=== surveyor_surveyor_kuziva ==='
SET search_path = surveyor_surveyor_kuziva, public;

DROP VIEW IF EXISTS coordinate_points_qgis CASCADE;
DROP TRIGGER IF EXISTS prevent_parcel_overlap ON land_parcels;
DROP TRIGGER IF EXISTS trigger_update_land_parcels_updated_at ON land_parcels;
DROP TRIGGER IF EXISTS auto_fix_qgis_coordinates ON land_parcels;

ALTER TABLE coordinate_points ALTER COLUMN geom TYPE geometry(Point) USING geom;
ALTER TABLE land_parcels ALTER COLUMN geom TYPE geometry USING geom;

CREATE TRIGGER prevent_parcel_overlap BEFORE INSERT OR UPDATE ON land_parcels
  FOR EACH ROW EXECUTE FUNCTION prevent_parcel_overlap_fn();
CREATE TRIGGER trigger_update_land_parcels_updated_at BEFORE UPDATE ON land_parcels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER auto_fix_qgis_coordinates BEFORE INSERT OR UPDATE ON land_parcels
  FOR EACH ROW EXECUTE FUNCTION fix_qgis_coordinates();

UPDATE coordinate_points cp SET geom = ST_SetSRID(cp.geom, get_cape_lo_srid(sp.central_meridian::integer))
FROM survey_projects sp WHERE cp.project_id = sp.id AND sp.central_meridian IS NOT NULL;
UPDATE land_parcels lp SET geom = ST_SetSRID(lp.geom, get_cape_lo_srid(sp.central_meridian::integer))
FROM survey_projects sp WHERE lp.project_id = sp.id AND sp.central_meridian IS NOT NULL;

\echo 'Done: surveyor_surveyor_kuziva'

-- ============================================================================
-- 4. surveyor_surveyor_mapamulart (has generated columns + views)
-- ============================================================================
\echo '=== surveyor_surveyor_mapamulart ==='
SET search_path = surveyor_surveyor_mapamulart, public;

-- Drop views
DROP VIEW IF EXISTS coordinate_points_project_26 CASCADE;
DROP VIEW IF EXISTS land_parcels_project_26 CASCADE;
DROP VIEW IF EXISTS coordinate_points_project_1 CASCADE;
DROP VIEW IF EXISTS land_parcels_project_1 CASCADE;

-- Drop generated columns on land_parcels
ALTER TABLE land_parcels DROP COLUMN IF EXISTS area_m2;
ALTER TABLE land_parcels DROP COLUMN IF EXISTS area_ha;
ALTER TABLE land_parcels DROP COLUMN IF EXISTS perimeter_m;

-- ALTER columns
ALTER TABLE coordinate_points ALTER COLUMN geom TYPE geometry(Point) USING geom;
ALTER TABLE land_parcels ALTER COLUMN geom TYPE geometry USING geom;

-- Recreate generated columns
ALTER TABLE land_parcels ADD COLUMN area_m2 numeric GENERATED ALWAYS AS (ST_Area(geom)) STORED;
ALTER TABLE land_parcels ADD COLUMN area_ha numeric GENERATED ALWAYS AS (ST_Area(geom) / 10000.0) STORED;
ALTER TABLE land_parcels ADD COLUMN perimeter_m numeric GENERATED ALWAYS AS (ST_Perimeter(geom)) STORED;

UPDATE coordinate_points cp SET geom = ST_SetSRID(cp.geom, get_cape_lo_srid(sp.central_meridian::integer))
FROM survey_projects sp WHERE cp.project_id = sp.id AND sp.central_meridian IS NOT NULL;
UPDATE land_parcels lp SET geom = ST_SetSRID(lp.geom, get_cape_lo_srid(sp.central_meridian::integer))
FROM survey_projects sp WHERE lp.project_id = sp.id AND sp.central_meridian IS NOT NULL;

\echo 'Done: surveyor_surveyor_mapamulart'

-- ============================================================================
-- 5. public schema (has views + triggers)
-- ============================================================================
\echo '=== public ==='
SET search_path = public;

-- Drop views
DROP VIEW IF EXISTS v_beacon_comparison CASCADE;
DROP VIEW IF EXISTS v_import_summary CASCADE;
DROP VIEW IF EXISTS coordinate_points_project_1 CASCADE;
DROP VIEW IF EXISTS land_parcels_project_1 CASCADE;

-- Drop triggers on land_parcels
DROP TRIGGER IF EXISTS prevent_parcel_overlap ON land_parcels;
DROP TRIGGER IF EXISTS auto_generate_metadata ON land_parcels;
DROP TRIGGER IF EXISTS trigger_update_land_parcels_updated_at ON land_parcels;
-- Drop trigger on coordinate_points
DROP TRIGGER IF EXISTS coordinate_points_updated_at ON coordinate_points;

-- ALTER columns
ALTER TABLE coordinate_points ALTER COLUMN geom TYPE geometry(Point) USING geom;
ALTER TABLE land_parcels ALTER COLUMN geom TYPE geometry USING geom;

-- Recreate triggers (best effort — functions may or may not exist in public)
DO $$ BEGIN
  CREATE TRIGGER prevent_parcel_overlap BEFORE INSERT OR UPDATE ON land_parcels
    FOR EACH ROW EXECUTE FUNCTION prevent_parcel_overlap_fn();
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'prevent_parcel_overlap_fn not found in public, skipping trigger'; END $$;

DO $$ BEGIN
  CREATE TRIGGER auto_generate_metadata BEFORE INSERT OR UPDATE ON land_parcels
    FOR EACH ROW EXECUTE FUNCTION auto_generate_metadata_fn();
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'auto_generate_metadata_fn not found in public, skipping trigger'; END $$;

DO $$ BEGIN
  CREATE TRIGGER trigger_update_land_parcels_updated_at BEFORE UPDATE ON land_parcels
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'update_updated_at_column not found in public, skipping trigger'; END $$;

DO $$ BEGIN
  CREATE TRIGGER coordinate_points_updated_at BEFORE UPDATE ON coordinate_points
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'update_updated_at_column not found for coord points, skipping trigger'; END $$;

-- Re-tag public schema data
UPDATE coordinate_points cp SET geom = ST_SetSRID(cp.geom, get_cape_lo_srid(sp.central_meridian::integer))
FROM survey_projects sp WHERE cp.project_id = sp.id AND sp.central_meridian IS NOT NULL;
UPDATE land_parcels lp SET geom = ST_SetSRID(lp.geom, get_cape_lo_srid(sp.central_meridian::integer))
FROM survey_projects sp WHERE lp.project_id = sp.id AND sp.central_meridian IS NOT NULL;

\echo 'Done: public'

-- ============================================================================
-- Verify: Show final state
-- ============================================================================
RESET search_path;

\echo '=== Final geometry column SRIDs ==='
SELECT f_table_schema, f_table_name, srid, type
FROM geometry_columns
WHERE f_table_name IN ('coordinate_points', 'land_parcels')
ORDER BY f_table_schema, f_table_name;
