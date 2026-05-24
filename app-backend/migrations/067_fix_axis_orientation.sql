-- Migration 067: Fix axis orientation for QGIS display
--
-- PROBLEM: EPSG:2054 has +axis=wsu (Westing, Southing, Up)
--          PostGIS ST_Transform may not handle axis swap correctly
--          Result: 1 degree eastward shift
--
-- SOLUTION: Manually swap and negate axes before transformation
--
-- In EPSG:2054 (south-oriented):
--   Y = Westing (positive = west of central meridian)
--   X = Southing (positive = south of equator)
--
-- For WGS84 (north-oriented):
--   Longitude = Easting (positive = east)
--   Latitude = Northing (positive = north)
--
-- Therefore:
--   WGS84_Lon should come from -Y (negate westing to get easting)
--   WGS84_Lat should come from -X (negate southing to get northing)

BEGIN;

DO $$
DECLARE
  schema_rec RECORD;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 067: Fix Axis Orientation';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  
  -- ============================================================================
  -- PUBLIC SCHEMA
  -- ============================================================================
  
  RAISE NOTICE 'Processing schema: public';
  
  -- Recreate coordinate_points view with manual axis swap
  DROP VIEW IF EXISTS public.coordinate_points_qgis CASCADE;
  CREATE VIEW public.coordinate_points_qgis AS
  SELECT 
    *,
    -- Create point with swapped/negated axes, then transform
    ST_Transform(
      ST_SetSRID(
        ST_MakePoint(
          -ST_Y(geom),  -- Negate Y (westing) to get easting
          -ST_X(geom)   -- Negate X (southing) to get northing
        ),
        4148  -- EPSG:4148 = Hartebeesthoek94 geographic (no projection)
      ),
      4326  -- Transform to WGS84
    ) as geom_qgis,
    ST_Y(geom) as y_original_2054,
    ST_X(geom) as x_original_2054
  FROM public.coordinate_points;
  
  RAISE NOTICE '  [OK] Fixed coordinate_points_qgis view';
  
  -- Recreate land_parcels view with manual axis swap
  DROP VIEW IF EXISTS public.land_parcels_qgis CASCADE;
  CREATE VIEW public.land_parcels_qgis AS
  SELECT 
    id,
    project_id,
    stand,
    designation,
    -- Transform polygon with axis swap
    ST_Transform(
      ST_SetSRID(
        ST_GeomFromText(
          ST_AsText(
            ST_Translate(
              ST_Scale(geom, -1, -1),  -- Negate both axes
              0, 0
            )
          )
        ),
        4148  -- Hartebeesthoek94 geographic
      ),
      4326  -- WGS84
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
    
    EXECUTE format('DROP VIEW IF EXISTS %I.coordinate_points_qgis CASCADE', schema_rec.schema_name);
    EXECUTE format('
      CREATE VIEW %I.coordinate_points_qgis AS
      SELECT 
        *,
        ST_Transform(
          ST_SetSRID(
            ST_MakePoint(-ST_Y(geom), -ST_X(geom)),
            4148
          ),
          4326
        ) as geom_qgis
      FROM %I.coordinate_points
    ', schema_rec.schema_name, schema_rec.schema_name);
    
    RAISE NOTICE '  [OK] Fixed coordinate_points_qgis view';
    
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
              ST_GeomFromText(
                ST_AsText(
                  ST_Translate(
                    ST_Scale(geom, -1, -1),
                    0, 0
                  )
                )
              ),
              4148
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
  RAISE NOTICE 'Testing transformation...';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  
  -- Show sample transformation
  DECLARE
    sample_record RECORD;
  BEGIN
    SELECT 
      name,
      ST_Y(geom) as y_2054,
      ST_X(geom) as x_2054,
      ST_Y(ST_Transform(ST_SetSRID(ST_MakePoint(-ST_Y(geom), -ST_X(geom)), 4148), 4326)) as lat,
      ST_X(ST_Transform(ST_SetSRID(ST_MakePoint(-ST_Y(geom), -ST_X(geom)), 4148), 4326)) as lon
    INTO sample_record
    FROM public.coordinate_points
    LIMIT 1;
    
    RAISE NOTICE 'Sample point: %', sample_record.name;
    RAISE NOTICE '  EPSG:2054: Y=%, X=%', sample_record.y_2054, sample_record.x_2054;
    RAISE NOTICE '  After axis swap: Lon=%, Lat=%', -sample_record.y_2054, -sample_record.x_2054;
    RAISE NOTICE '  WGS84: Lat=%, Lon=%', sample_record.lat, sample_record.lon;
    RAISE NOTICE '';
    
    IF sample_record.lat BETWEEN -22 AND -18 AND sample_record.lon BETWEEN 29 AND 32 THEN
      RAISE NOTICE '✓ Coordinates are in Zimbabwe range!';
    ELSE
      RAISE NOTICE '✗ WARNING: Coordinates outside Zimbabwe!';
      RAISE NOTICE '  Expected: Lat -22 to -18, Lon 29 to 32';
    END IF;
  END;
  
  RAISE NOTICE '';
END $$;

COMMIT;
