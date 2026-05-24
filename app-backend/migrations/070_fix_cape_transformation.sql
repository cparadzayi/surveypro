-- Migration 070: Fix Cape Lo 31 to WGS84 Transformation
--
-- PROBLEM: Direct ST_Transform from EPSG:22291 to EPSG:4326 produces wrong results
--          Shows coordinates in Gabon (11°E) instead of Zimbabwe (30°E)
--
-- ROOT CAUSE: PostGIS transformation from south-oriented Cape Lo 31 projection
--             to WGS84 is not handling the datum shift correctly
--
-- SOLUTION: Transform in two steps:
--           1. Cape Lo 31 (22291) → Cape Geographic (4222)
--           2. Cape Geographic (4222) → WGS84 (4326)
--
-- This ensures the datum transformation (TOWGS84 parameters) is applied correctly

BEGIN;

DO $$
DECLARE
  schema_rec RECORD;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 070: Fix Cape Transformation';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  
  -- Test the transformation first
  RAISE NOTICE 'Testing transformation methods:';
  RAISE NOTICE '';
  
  DECLARE
    test_y NUMERIC := 97057.022;
    test_x NUMERIC := 2247854.388;
    direct_lat NUMERIC;
    direct_lon NUMERIC;
    twostep_lat NUMERIC;
    twostep_lon NUMERIC;
  BEGIN
    -- Method 1: Direct transformation (current, wrong)
    SELECT 
      ST_Y(ST_Transform(ST_SetSRID(ST_MakePoint(test_y, test_x), 22291), 4326)),
      ST_X(ST_Transform(ST_SetSRID(ST_MakePoint(test_y, test_x), 22291), 4326))
    INTO direct_lat, direct_lon;
    
    RAISE NOTICE 'Method 1 (Direct 22291→4326):';
    RAISE NOTICE '  Lat: %, Lon: %', direct_lat, direct_lon;
    RAISE NOTICE '  Location: %', 
      CASE 
        WHEN direct_lon BETWEEN 9 AND 13 THEN 'Gabon/Central Africa (WRONG!)'
        WHEN direct_lon BETWEEN 29 AND 32 THEN 'Zimbabwe (CORRECT!)'
        ELSE 'Unknown'
      END;
    RAISE NOTICE '';
    
    -- Method 2: Two-step transformation (22291→4222→4326)
    SELECT 
      ST_Y(ST_Transform(ST_Transform(ST_SetSRID(ST_MakePoint(test_y, test_x), 22291), 4222), 4326)),
      ST_X(ST_Transform(ST_Transform(ST_SetSRID(ST_MakePoint(test_y, test_x), 22291), 4222), 4326))
    INTO twostep_lat, twostep_lon;
    
    RAISE NOTICE 'Method 2 (Two-step 22291→4222→4326):';
    RAISE NOTICE '  Lat: %, Lon: %', twostep_lat, twostep_lon;
    RAISE NOTICE '  Location: %',
      CASE 
        WHEN twostep_lon BETWEEN 9 AND 13 THEN 'Gabon/Central Africa (WRONG!)'
        WHEN twostep_lon BETWEEN 29 AND 32 THEN 'Zimbabwe (CORRECT!)'
        ELSE 'Unknown'
      END;
    RAISE NOTICE '';
  END;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Updating QGIS views...';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  
  -- ============================================================================
  -- PUBLIC SCHEMA
  -- ============================================================================
  
  RAISE NOTICE 'Processing schema: public';
  
  DROP VIEW IF EXISTS public.coordinate_points_qgis CASCADE;
  CREATE VIEW public.coordinate_points_qgis AS
  SELECT 
    *,
    -- Use two-step transformation: 22291 → 4222 → 4326
    ST_Transform(ST_Transform(geom, 4222), 4326) as geom_qgis,
    ST_Y(ST_Transform(ST_Transform(geom, 4222), 4326)) as lat_wgs84,
    ST_X(ST_Transform(ST_Transform(geom, 4222), 4326)) as lon_wgs84,
    ST_Y(geom) as y_cape_lo31,
    ST_X(geom) as x_cape_lo31
  FROM public.coordinate_points;
  
  RAISE NOTICE '  [OK] Updated coordinate_points_qgis view';
  
  DROP VIEW IF EXISTS public.land_parcels_qgis CASCADE;
  CREATE VIEW public.land_parcels_qgis AS
  SELECT 
    id,
    project_id,
    stand,
    designation,
    -- Use two-step transformation for polygons too
    ST_Transform(ST_Transform(geom, 4222), 4326) as geom_qgis,
    geom as geom_original,
    area_m2,
    area_ha,
    perimeter_m,
    centroid_y,
    centroid_x,
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
  
  RAISE NOTICE '  [OK] Updated land_parcels_qgis view';
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
    
    EXECUTE format('DROP VIEW IF EXISTS %I.coordinate_points_qgis CASCADE', schema_rec.schema_name);
    EXECUTE format('
      CREATE VIEW %I.coordinate_points_qgis AS
      SELECT 
        *,
        ST_Transform(ST_Transform(geom, 4222), 4326) as geom_qgis,
        ST_Y(ST_Transform(ST_Transform(geom, 4222), 4326)) as lat_wgs84,
        ST_X(ST_Transform(ST_Transform(geom, 4222), 4326)) as lon_wgs84
      FROM %I.coordinate_points
    ', schema_rec.schema_name, schema_rec.schema_name);
    
    RAISE NOTICE '  [OK] Updated coordinate_points_qgis view';
    
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
          ST_Transform(ST_Transform(geom, 4222), 4326) as geom_qgis
        FROM %I.land_parcels
      ', schema_rec.schema_name, schema_rec.schema_name);
      
      RAISE NOTICE '  [OK] Updated land_parcels_qgis view';
    END IF;
    
    RAISE NOTICE '';
  END LOOP;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 070 Complete!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Verify with:';
  RAISE NOTICE '  SELECT name, lat_wgs84, lon_wgs84';
  RAISE NOTICE '  FROM surveyor_surveyor_kuda.coordinate_points_qgis';
  RAISE NOTICE '  LIMIT 3;';
  RAISE NOTICE '';
  RAISE NOTICE 'Expected: Lat ~-20.32, Lon ~30.07 (Zimbabwe)';
  RAISE NOTICE '';
END $$;

COMMIT;
