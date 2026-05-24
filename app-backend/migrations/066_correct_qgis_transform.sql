-- Migration 066: Correct QGIS coordinate transformation
--
-- PROBLEM: EPSG:2054 coordinates are ALREADY in correct orientation (Y=Southing, X=Westing)
--          We were negating them incorrectly!
-- SOLUTION: Transform directly from EPSG:2054 to EPSG:4326 WITHOUT negation
--
-- EPSG:2054 Definition:
-- +proj=tmerc +lat_0=0 +lon_0=31 +k=1.0 +x_0=0 +y_0=0 
-- +axis=wsu +ellps=WGS84 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs
--
-- The axis=wsu means: W=Westing (X), S=Southing (Y), U=Up
-- So X is already negative (west), Y is already positive (south)

BEGIN;

DO $$
DECLARE
  schema_rec RECORD;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 066: Correct QGIS Transform';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Transform EPSG:2054 directly to WGS84';
  RAISE NOTICE '';
  
  -- ============================================================================
  -- PUBLIC SCHEMA
  -- ============================================================================
  
  RAISE NOTICE 'Processing schema: public';
  
  -- Recreate coordinate_points view - NO NEGATION, just transform
  DROP VIEW IF EXISTS public.coordinate_points_qgis CASCADE;
  CREATE VIEW public.coordinate_points_qgis AS
  SELECT 
    *,
    -- Direct transformation from EPSG:2054 to EPSG:4326
    ST_Transform(geom, 4326) as geom_qgis,
    ST_Y(ST_Transform(geom, 4326)) as lat_wgs84,
    ST_X(ST_Transform(geom, 4326)) as lon_wgs84,
    ST_Y(geom) as y_original_2054,
    ST_X(geom) as x_original_2054
  FROM public.coordinate_points;
  
  RAISE NOTICE '  [OK] Fixed coordinate_points_qgis view';
  
  -- Recreate land_parcels view - NO NEGATION, just transform
  DROP VIEW IF EXISTS public.land_parcels_qgis CASCADE;
  CREATE VIEW public.land_parcels_qgis AS
  SELECT 
    id,
    project_id,
    stand,
    designation,
    -- Direct transformation from EPSG:2054 to EPSG:4326
    ST_Transform(geom, 4326) as geom_qgis,
    geom as geom_original,
    area_m2,
    area_ha,
    perimeter_m,
    owner,
    title_deed,
    survey_date,
    surveyor,
    notes,
    status,
    digitized_by,
    metadata,
    created_at,
    updated_at
  FROM public.land_parcels;
  
  RAISE NOTICE '  [OK] Fixed land_parcels_qgis view';
  RAISE NOTICE '';
  
  -- ============================================================================
  -- SURVEYOR SCHEMAS
  -- ============================================================================
  
  FOR schema_rec IN 
    SELECT schema_name 
    FROM information_schema.schemata 
    WHERE schema_name LIKE 'surveyor_%'
  LOOP
    RAISE NOTICE 'Processing schema: %', schema_rec.schema_name;
    
    -- Recreate coordinate_points view
    EXECUTE format('DROP VIEW IF EXISTS %I.coordinate_points_qgis CASCADE', schema_rec.schema_name);
    EXECUTE format('
      CREATE VIEW %I.coordinate_points_qgis AS
      SELECT 
        *,
        ST_Transform(geom, 4326) as geom_qgis,
        ST_Y(ST_Transform(geom, 4326)) as lat_wgs84,
        ST_X(ST_Transform(geom, 4326)) as lon_wgs84
      FROM %I.coordinate_points
    ', schema_rec.schema_name, schema_rec.schema_name);
    
    RAISE NOTICE '  [OK] Fixed coordinate_points_qgis view';
    
    -- Recreate land_parcels view (if exists)
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = schema_rec.schema_name 
      AND table_name = 'land_parcels'
    ) THEN
      EXECUTE format('DROP VIEW IF EXISTS %I.land_parcels_qgis CASCADE', schema_rec.schema_name);
      EXECUTE format('
        CREATE VIEW %I.land_parcels_qgis AS
        SELECT 
          *,
          ST_Transform(geom, 4326) as geom_qgis
        FROM %I.land_parcels
      ', schema_rec.schema_name, schema_rec.schema_name);
      
      RAISE NOTICE '  [OK] Fixed land_parcels_qgis view';
    END IF;
    
    RAISE NOTICE '';
  END LOOP;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 066 complete!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Testing transformation...';
  RAISE NOTICE '';
  
  -- Show sample transformation
  DECLARE
    sample_record RECORD;
  BEGIN
    SELECT 
      name,
      ST_Y(geom) as y_2054,
      ST_X(geom) as x_2054,
      ST_Y(ST_Transform(geom, 4326)) as lat,
      ST_X(ST_Transform(geom, 4326)) as lon
    INTO sample_record
    FROM public.coordinate_points
    LIMIT 1;
    
    RAISE NOTICE 'Sample point: %', sample_record.name;
    RAISE NOTICE '  EPSG:2054: Y=%, X=%', sample_record.y_2054, sample_record.x_2054;
    RAISE NOTICE '  WGS84:     Lat=%, Lon=%', sample_record.lat, sample_record.lon;
    RAISE NOTICE '';
    
    IF sample_record.lat BETWEEN -22 AND -18 AND sample_record.lon BETWEEN 29 AND 32 THEN
      RAISE NOTICE '✓ Coordinates are in Zimbabwe range!';
    ELSE
      RAISE NOTICE '✗ WARNING: Coordinates outside Zimbabwe!';
    END IF;
  END;
  
  RAISE NOTICE '';
END $$;

COMMIT;
