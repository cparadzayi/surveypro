-- Migration 065: Fix QGIS views to properly transform coordinates
--
-- PROBLEM: Previous migration negated coordinates but didn't transform from meters to degrees
-- SOLUTION: First negate in SRID 2054, then transform to WGS84 (EPSG:4326)

BEGIN;

DO $$
DECLARE
  schema_rec RECORD;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 065: Fix QGIS Coordinate Transform';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  
  -- ============================================================================
  -- PUBLIC SCHEMA
  -- ============================================================================
  
  RAISE NOTICE 'Processing schema: public';
  
  -- Recreate coordinate_points view with proper transformation
  DROP VIEW IF EXISTS public.coordinate_points_qgis CASCADE;
  CREATE VIEW public.coordinate_points_qgis AS
  SELECT 
    *,
    -- Step 1: Negate coordinates in SRID 2054 (meters)
    -- Step 2: Transform to WGS84 EPSG:4326 (degrees)
    ST_Transform(
      ST_SetSRID(ST_MakePoint(-ST_Y(geom), -ST_X(geom)), 2054),
      4326
    ) as geom_qgis,
    -ST_Y(geom) as y_negated,
    -ST_X(geom) as x_negated
  FROM public.coordinate_points;
  
  RAISE NOTICE '  [OK] Fixed coordinate_points_qgis view';
  
  -- Recreate land_parcels view with proper transformation
  DROP VIEW IF EXISTS public.land_parcels_qgis CASCADE;
  CREATE VIEW public.land_parcels_qgis AS
  SELECT 
    id,
    project_id,
    stand,
    designation,
    -- Step 1: Scale by -1 to negate coordinates (in SRID 2054)
    -- Step 2: Transform to WGS84
    ST_Transform(
      ST_SetSRID(
        ST_Scale(geom, -1, -1),
        2054
      ),
      4326
    ) as geom_qgis,
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
        ST_Transform(
          ST_SetSRID(ST_MakePoint(-ST_Y(geom), -ST_X(geom)), 2054),
          4326
        ) as geom_qgis,
        -ST_Y(geom) as y_negated,
        -ST_X(geom) as x_negated
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
          ST_Transform(
            ST_SetSRID(
              ST_Scale(geom, -1, -1),
              2054
            ),
            4326
          ) as geom_qgis
        FROM %I.land_parcels
      ', schema_rec.schema_name, schema_rec.schema_name);
      
      RAISE NOTICE '  [OK] Fixed land_parcels_qgis view';
    END IF;
    
    RAISE NOTICE '';
  END LOOP;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 065 complete!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Now coordinates will be in WGS84 degrees!';
  RAISE NOTICE 'Expected range: 30-31°E, 19-21°S (Zimbabwe)';
  RAISE NOTICE '';
END $$;

COMMIT;
