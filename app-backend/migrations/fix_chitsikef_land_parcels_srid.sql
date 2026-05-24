-- ============================================================================
-- Fix surveyor_surveyor_chitsikef.land_parcels SRID constraint
-- Drop generated columns, ALTER geom, recreate generated columns
-- Then re-tag CheshirePegging data (Lo 29) with correct SRID 22289
-- ============================================================================

SET search_path = surveyor_surveyor_chitsikef, public;

-- Step 1: Drop generated columns that depend on geom
ALTER TABLE land_parcels DROP COLUMN IF EXISTS area_m2;
ALTER TABLE land_parcels DROP COLUMN IF EXISTS area_ha;
ALTER TABLE land_parcels DROP COLUMN IF EXISTS perimeter_m;

-- Step 2: Remove SRID constraint from geom column
ALTER TABLE land_parcels ALTER COLUMN geom TYPE geometry USING geom;

-- Step 3: Recreate generated columns
ALTER TABLE land_parcels ADD COLUMN area_m2 numeric GENERATED ALWAYS AS (ST_Area(geom)) STORED;
ALTER TABLE land_parcels ADD COLUMN area_ha numeric GENERATED ALWAYS AS (ST_Area(geom) / 10000.0) STORED;
ALTER TABLE land_parcels ADD COLUMN perimeter_m numeric GENERATED ALWAYS AS (ST_Perimeter(geom)) STORED;

-- Step 4: Re-tag existing geometry with correct SRID based on project's central_meridian
-- The coordinate VALUES are already correct, just the SRID tag is wrong (22291 instead of 22289)
UPDATE land_parcels lp
SET geom = ST_SetSRID(lp.geom, 
  CASE sp.central_meridian::integer
    WHEN 25 THEN 22285
    WHEN 27 THEN 22287
    WHEN 29 THEN 22289
    WHEN 31 THEN 22291
    WHEN 33 THEN 22293
    ELSE 22291
  END
)
FROM survey_projects sp
WHERE lp.project_id = sp.id
  AND sp.central_meridian IS NOT NULL;

-- Also re-tag coordinate_points (column already unconstrained from previous migration)
UPDATE coordinate_points cp
SET geom = ST_SetSRID(cp.geom,
  CASE sp.central_meridian::integer
    WHEN 25 THEN 22285
    WHEN 27 THEN 22287
    WHEN 29 THEN 22289
    WHEN 31 THEN 22291
    WHEN 33 THEN 22293
    ELSE 22291
  END
)
FROM survey_projects sp
WHERE cp.project_id = sp.id
  AND sp.central_meridian IS NOT NULL;

-- Verify
SELECT 'land_parcels' as tbl, ST_SRID(geom) as srid, count(*) as cnt
FROM land_parcels WHERE geom IS NOT NULL GROUP BY ST_SRID(geom)
UNION ALL
SELECT 'coordinate_points', ST_SRID(geom), count(*)
FROM coordinate_points WHERE geom IS NOT NULL GROUP BY ST_SRID(geom);

RESET search_path;
