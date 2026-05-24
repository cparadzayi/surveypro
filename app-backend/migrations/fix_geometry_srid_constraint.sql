-- ============================================================================
-- Migration: Remove hardcoded SRID 22291 constraint from geometry columns
-- ============================================================================
-- Problem: All geometry columns are constrained to SRID 22291 (Cape Lo 31).
--   This forces ALL projects to store geometry as Lo 31, even if the project
--   uses Lo 29, Lo 27, etc. The actual coordinate VALUES are in the project's
--   native CRS but tagged with the wrong SRID (22291).
--
-- Fix: 
--   1. Remove SRID constraint (allow any SRID per row)
--   2. Re-tag existing data with correct SRID based on project's central_meridian
-- ============================================================================

-- Helper function: Convert central meridian to EPSG SRID
CREATE OR REPLACE FUNCTION get_cape_lo_srid(cm integer) RETURNS integer AS $$
BEGIN
  RETURN CASE cm
    WHEN 25 THEN 22285
    WHEN 27 THEN 22287
    WHEN 29 THEN 22289
    WHEN 31 THEN 22291
    WHEN 33 THEN 22293
    ELSE 22291  -- fallback
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- Step 1a: Drop dependent views on public schema that block ALTER
-- ============================================================================
DROP VIEW IF EXISTS public.coordinate_points_qgis CASCADE;
DROP VIEW IF EXISTS public.land_parcels_qgis CASCADE;

-- ============================================================================
-- Step 1b: Remove SRID constraint from ALL schemas (with error handling per schema)
-- ============================================================================
DO $$
DECLARE
  schema_rec RECORD;
  has_cp BOOLEAN;
  has_lp BOOLEAN;
BEGIN
  FOR schema_rec IN
    SELECT DISTINCT f_table_schema as schema_name
    FROM geometry_columns
    WHERE f_table_name IN ('coordinate_points', 'land_parcels')
  LOOP
    -- coordinate_points
    SELECT EXISTS(
      SELECT 1 FROM geometry_columns 
      WHERE f_table_schema = schema_rec.schema_name 
        AND f_table_name = 'coordinate_points'
        AND srid != 0
    ) INTO has_cp;
    
    IF has_cp THEN
      BEGIN
        RAISE NOTICE 'Removing SRID constraint from %.coordinate_points', schema_rec.schema_name;
        EXECUTE format(
          'ALTER TABLE %I.coordinate_points ALTER COLUMN geom TYPE geometry(Point) USING geom',
          schema_rec.schema_name
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Failed for %.coordinate_points: %', schema_rec.schema_name, SQLERRM;
      END;
    END IF;
    
    -- land_parcels
    SELECT EXISTS(
      SELECT 1 FROM geometry_columns 
      WHERE f_table_schema = schema_rec.schema_name 
        AND f_table_name = 'land_parcels'
        AND srid != 0
    ) INTO has_lp;
    
    IF has_lp THEN
      BEGIN
        RAISE NOTICE 'Removing SRID constraint from %.land_parcels', schema_rec.schema_name;
        EXECUTE format(
          'ALTER TABLE %I.land_parcels ALTER COLUMN geom TYPE geometry USING geom',
          schema_rec.schema_name
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Failed for %.land_parcels: %', schema_rec.schema_name, SQLERRM;
      END;
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- Step 2: Re-tag existing data with correct SRID based on project central_meridian
-- The coordinate VALUES are already correct (in native CRS), just the SRID tag is wrong.
-- We use ST_SetSRID (NOT ST_Transform) because we're fixing the tag, not the coordinates.
-- ============================================================================
DO $$
DECLARE
  schema_rec RECORD;
  cp_count INTEGER;
  lp_count INTEGER;
BEGIN
  FOR schema_rec IN
    SELECT DISTINCT f_table_schema as schema_name
    FROM geometry_columns
    WHERE f_table_name IN ('coordinate_points', 'land_parcels')
      AND f_table_schema != 'public'  -- Skip public schema (legacy data)
  LOOP
    BEGIN
      -- Re-tag coordinate_points with correct SRID from project's central_meridian
      -- Cast central_meridian to integer (it may be VARCHAR in some schemas)
      EXECUTE format(
        'UPDATE %I.coordinate_points cp
         SET geom = ST_SetSRID(cp.geom, get_cape_lo_srid(sp.central_meridian::integer))
         FROM %I.survey_projects sp
         WHERE cp.project_id = sp.id
           AND sp.central_meridian IS NOT NULL
           AND sp.central_meridian::integer != 31',
        schema_rec.schema_name, schema_rec.schema_name
      );
      GET DIAGNOSTICS cp_count = ROW_COUNT;
      
      -- Re-tag land_parcels with correct SRID from project's central_meridian
      EXECUTE format(
        'UPDATE %I.land_parcels lp
         SET geom = ST_SetSRID(lp.geom, get_cape_lo_srid(sp.central_meridian::integer))
         FROM %I.survey_projects sp
         WHERE lp.project_id = sp.id
           AND sp.central_meridian IS NOT NULL
           AND sp.central_meridian::integer != 31',
        schema_rec.schema_name, schema_rec.schema_name
      );
      GET DIAGNOSTICS lp_count = ROW_COUNT;
      
      IF cp_count > 0 OR lp_count > 0 THEN
        RAISE NOTICE 'Re-tagged % — % coordinate_points, % land_parcels', schema_rec.schema_name, cp_count, lp_count;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed re-tagging %: %', schema_rec.schema_name, SQLERRM;
    END;
  END LOOP;
END $$;

-- ============================================================================
-- Verify: Show updated geometry column SRIDs
-- ============================================================================
SELECT f_table_schema, f_table_name, f_geometry_column, srid, type
FROM geometry_columns
WHERE f_table_name IN ('coordinate_points', 'land_parcels')
ORDER BY f_table_schema, f_table_name;
