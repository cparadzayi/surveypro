-- Migration 071: Simplify QGIS Transformation (Use Direct Transform)
--
-- PROBLEM: QGIS displays map upside-down despite correct coordinates
-- ROOT CAUSE: Two-step transformation (22291→4222→4326) may confuse QGIS
-- SOLUTION: Use direct single-step transformation (22291→4326)
--
-- Test confirmed direct transformation produces correct results:
--   Lat: -20.32° (Southern hemisphere - Zimbabwe)
--   Lon: 30.07° (East of Prime Meridian - Zimbabwe)

BEGIN;

DO $$
DECLARE
  schema_rec RECORD;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 071: Simplify QGIS Transform';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Using direct ST_Transform(geom, 4326)';
  RAISE NOTICE 'Expected: Lat ~-20.32, Lon ~30.07';
  RAISE NOTICE '';
  
  -- ============================================================================
  -- PUBLIC SCHEMA
  -- ============================================================================
  
  RAISE NOTICE 'Processing schema: public';
  
  DROP VIEW IF EXISTS public.coordinate_points_qgis CASCADE;
  CREATE VIEW public.coordinate_points_qgis AS
  SELECT 
    *,
    -- Direct transformation: 22291 → 4326
    ST_Transform(geom, 4326) as geom_qgis,
    ST_Y(ST_Transform(geom, 4326)) as lat_wgs84,
    ST_X(ST_Transform(geom, 4326)) as lon_wgs84,
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
    -- Direct transformation for polygons
    ST_Transform(geom, 4326) as geom_qgis,
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
        ST_Transform(geom, 4326) as geom_qgis,
        ST_Y(ST_Transform(geom, 4326)) as lat_wgs84,
        ST_X(ST_Transform(geom, 4326)) as lon_wgs84
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
          ST_Transform(geom, 4326) as geom_qgis
        FROM %I.land_parcels
      ', schema_rec.schema_name, schema_rec.schema_name);
      
      RAISE NOTICE '  [OK] Updated land_parcels_qgis view';
    END IF;
    
    RAISE NOTICE '';
  END LOOP;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 071 Complete!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'QGIS Setup:';
  RAISE NOTICE '1. Add layer: surveyor_surveyor_kuda.coordinate_points_qgis';
  RAISE NOTICE '2. Geometry column: geom_qgis';
  RAISE NOTICE '3. CRS: EPSG:4326 (auto-detected)';
  RAISE NOTICE '4. If map appears upside-down:';
  RAISE NOTICE '   - Check Project CRS is EPSG:4326';
  RAISE NOTICE '   - Verify "On-the-fly CRS transformation" is enabled';
  RAISE NOTICE '';
END $$;

COMMIT;
