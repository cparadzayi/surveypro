-- Migration 068: Revert to Cape Lo 31 (EPSG:22291) - Original Coordinate System
--
-- PROBLEM: Migration 063 transformed coordinates from Cape Lo 31 to Hartebeesthoek94
--          This caused incorrect values and 1-degree eastward shift in QGIS
--
-- SOLUTION: Revert to original Cape Lo 31 (EPSG:22291) coordinate system
--           Create QGIS views that properly transform to WGS84
--
-- ORIGINAL DATA (from CSV):
--   2283A: Y=97057.022, X=2247854.388 (Cape Lo 31)
--
-- CURRENT (WRONG):
--   2283A: Y=2248243.237, X=-111792.582 (Hartebeesthoek94)
--
-- We need to restore the original values!

BEGIN;

RAISE NOTICE '========================================';
RAISE NOTICE 'Migration 068: Revert to Cape Lo 31';
RAISE NOTICE '========================================';
RAISE NOTICE '';
RAISE NOTICE 'WARNING: This will change coordinate SRID back to 22291';
RAISE NOTICE 'You may need to re-import your CSV data after this migration';
RAISE NOTICE '';

-- Change SRID back to 22291 (Cape Lo 31) for public schema
ALTER TABLE public.coordinate_points 
  ALTER COLUMN geom TYPE geometry(Point, 22291) 
  USING ST_SetSRID(geom, 22291);

ALTER TABLE public.land_parcels 
  ALTER COLUMN geom TYPE geometry(Polygon, 22291) 
  USING ST_SetSRID(geom, 22291);

RAISE NOTICE '[OK] Changed public schema to EPSG:22291';
RAISE NOTICE '';
RAISE NOTICE 'IMPORTANT: You need to re-import your CSV data!';
RAISE NOTICE 'The current coordinate values are from Hartebeesthoek94 transformation.';
RAISE NOTICE 'Original Cape Lo 31 values must be restored from CSV.';
RAISE NOTICE '';

COMMIT;
