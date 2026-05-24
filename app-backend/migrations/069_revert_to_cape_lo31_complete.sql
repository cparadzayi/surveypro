-- Migration 069: Complete Reversion to Cape Lo 31 (EPSG:22291)
--
-- This migration reverts the incorrect transformations from migrations 062 and 063
-- and sets up proper QGIS display views
--
-- IMPORTANT: After running this migration, you MUST re-import your CSV data!
-- The current coordinate values are from incorrect transformations and must be replaced.

BEGIN;

DO $$
DECLARE
  schema_rec RECORD;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 069: Revert to Cape Lo 31';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  
  -- ============================================================================
  -- PUBLIC SCHEMA
  -- ============================================================================
  
  RAISE NOTICE 'Processing schema: public';
  RAISE NOTICE '';
  
  -- Drop QGIS views first
  DROP VIEW IF EXISTS public.coordinate_points_qgis CASCADE;
  DROP VIEW IF EXISTS public.land_parcels_qgis CASCADE;
  
  -- Change coordinate_points back to EPSG:22291
  RAISE NOTICE '  [coordinate_points] Reverting to EPSG:22291...';
  ALTER TABLE public.coordinate_points 
    ALTER COLUMN geom TYPE geometry(Point, 22291) 
    USING ST_SetSRID(geom, 22291);
  
  -- Drop generated columns BEFORE altering land_parcels geom column
  RAISE NOTICE '  [land_parcels] Dropping generated columns...';
  ALTER TABLE public.land_parcels DROP COLUMN IF EXISTS area_m2 CASCADE;
  ALTER TABLE public.land_parcels DROP COLUMN IF EXISTS area_ha CASCADE;
  ALTER TABLE public.land_parcels DROP COLUMN IF EXISTS perimeter_m CASCADE;
  ALTER TABLE public.land_parcels DROP COLUMN IF EXISTS centroid_y CASCADE;
  ALTER TABLE public.land_parcels DROP COLUMN IF EXISTS centroid_x CASCADE;
  
  -- Drop triggers that depend on geom column
  RAISE NOTICE '  [land_parcels] Dropping triggers...';
  DROP TRIGGER IF EXISTS prevent_parcel_overlap ON public.land_parcels;
  DROP TRIGGER IF EXISTS land_parcels_updated_at ON public.land_parcels;
  DROP TRIGGER IF EXISTS land_parcels_auto_project_id ON public.land_parcels;
  DROP TRIGGER IF EXISTS trigger_update_land_parcels_updated_at ON public.land_parcels;
  DROP TRIGGER IF EXISTS trigger_update_import_has_parcels ON public.land_parcels;
  DROP TRIGGER IF EXISTS land_parcel_auto_calculate ON public.land_parcels;
  
  -- Change land_parcels back to EPSG:22291
  RAISE NOTICE '  [land_parcels] Reverting to EPSG:22291...';
  ALTER TABLE public.land_parcels 
    ALTER COLUMN geom TYPE geometry(Polygon, 22291) 
    USING ST_SetSRID(geom, 22291);
  
  -- Recreate triggers
  RAISE NOTICE '  [land_parcels] Recreating triggers...';
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'check_parcel_overlap') THEN
    CREATE TRIGGER prevent_parcel_overlap BEFORE INSERT OR UPDATE OF geom ON public.land_parcels FOR EACH ROW EXECUTE FUNCTION check_parcel_overlap();
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    CREATE TRIGGER trigger_update_land_parcels_updated_at BEFORE UPDATE ON public.land_parcels FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_project_id_from_schema') THEN
    CREATE TRIGGER land_parcels_auto_project_id BEFORE INSERT ON public.land_parcels FOR EACH ROW EXECUTE FUNCTION set_project_id_from_schema();
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_import_has_parcels') THEN
    CREATE TRIGGER trigger_update_import_has_parcels AFTER INSERT OR DELETE ON public.land_parcels FOR EACH ROW EXECUTE FUNCTION update_import_has_parcels();
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'auto_calculate_parcel_metrics') THEN
    CREATE TRIGGER land_parcel_auto_calculate BEFORE INSERT OR UPDATE ON public.land_parcels FOR EACH ROW EXECUTE FUNCTION auto_calculate_parcel_metrics();
  END IF;
  
  ALTER TABLE public.land_parcels 
    ADD COLUMN area_m2 NUMERIC GENERATED ALWAYS AS (ST_Area(geom)) STORED;
  ALTER TABLE public.land_parcels 
    ADD COLUMN area_ha NUMERIC GENERATED ALWAYS AS (ST_Area(geom) / 10000) STORED;
  ALTER TABLE public.land_parcels 
    ADD COLUMN perimeter_m NUMERIC GENERATED ALWAYS AS (ST_Perimeter(geom)) STORED;
  ALTER TABLE public.land_parcels 
    ADD COLUMN centroid_y NUMERIC GENERATED ALWAYS AS (ST_Y(ST_Centroid(geom))) STORED;
  ALTER TABLE public.land_parcels 
    ADD COLUMN centroid_x NUMERIC GENERATED ALWAYS AS (ST_X(ST_Centroid(geom))) STORED;
  
  RAISE NOTICE '  [OK] Public schema reverted to EPSG:22291';
  RAISE NOTICE '';
  
  -- Create QGIS display views
  RAISE NOTICE '  [QGIS VIEWS] Creating display views...';
  
  CREATE VIEW public.coordinate_points_qgis AS
  SELECT 
    *,
    ST_Transform(geom, 4326) as geom_qgis,
    ST_Y(ST_Transform(geom, 4326)) as lat_wgs84,
    ST_X(ST_Transform(geom, 4326)) as lon_wgs84,
    ST_Y(geom) as y_cape_lo31,
    ST_X(geom) as x_cape_lo31
  FROM public.coordinate_points;
  
  CREATE VIEW public.land_parcels_qgis AS
  SELECT 
    id,
    project_id,
    stand,
    designation,
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
  
  RAISE NOTICE '  [OK] QGIS views created';
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
    
    -- Drop QGIS views
    EXECUTE format('DROP VIEW IF EXISTS %I.coordinate_points_qgis CASCADE', schema_rec.schema_name);
    EXECUTE format('DROP VIEW IF EXISTS %I.land_parcels_qgis CASCADE', schema_rec.schema_name);
    
    -- Revert coordinate_points to EPSG:22291
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = schema_rec.schema_name 
      AND table_name = 'coordinate_points'
    ) THEN
      EXECUTE format('
        ALTER TABLE %I.coordinate_points 
        ALTER COLUMN geom TYPE geometry(Point, 22291) 
        USING ST_SetSRID(geom, 22291)
      ', schema_rec.schema_name);
      
      -- Create QGIS view
      EXECUTE format('
        CREATE VIEW %I.coordinate_points_qgis AS
        SELECT 
          *,
          ST_Transform(geom, 4326) as geom_qgis,
          ST_Y(ST_Transform(geom, 4326)) as lat_wgs84,
          ST_X(ST_Transform(geom, 4326)) as lon_wgs84
        FROM %I.coordinate_points
      ', schema_rec.schema_name, schema_rec.schema_name);
    END IF;
    
    -- Revert land_parcels to EPSG:22291
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = schema_rec.schema_name 
      AND table_name = 'land_parcels'
    ) THEN
      -- Drop generated columns first
      EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS area_m2 CASCADE', schema_rec.schema_name);
      EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS area_ha CASCADE', schema_rec.schema_name);
      EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS perimeter_m CASCADE', schema_rec.schema_name);
      EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS centroid_y CASCADE', schema_rec.schema_name);
      EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS centroid_x CASCADE', schema_rec.schema_name);
      
      -- Drop triggers
      EXECUTE format('DROP TRIGGER IF EXISTS prevent_parcel_overlap ON %I.land_parcels', schema_rec.schema_name);
      EXECUTE format('DROP TRIGGER IF EXISTS trigger_update_land_parcels_updated_at ON %I.land_parcels', schema_rec.schema_name);
      EXECUTE format('DROP TRIGGER IF EXISTS land_parcel_auto_calculate ON %I.land_parcels', schema_rec.schema_name);
      
      -- Change SRID
      EXECUTE format('
        ALTER TABLE %I.land_parcels 
        ALTER COLUMN geom TYPE geometry(Polygon, 22291) 
        USING ST_SetSRID(geom, 22291)
      ', schema_rec.schema_name);
      
      -- Recreate triggers
      IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'check_parcel_overlap') THEN
        EXECUTE format('CREATE TRIGGER prevent_parcel_overlap BEFORE INSERT OR UPDATE OF geom ON %I.land_parcels FOR EACH ROW EXECUTE FUNCTION check_parcel_overlap()', schema_rec.schema_name);
      END IF;
      
      IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
        EXECUTE format('CREATE TRIGGER trigger_update_land_parcels_updated_at BEFORE UPDATE ON %I.land_parcels FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', schema_rec.schema_name);
      END IF;
      
      IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'auto_calculate_parcel_metrics') THEN
        EXECUTE format('CREATE TRIGGER land_parcel_auto_calculate BEFORE INSERT OR UPDATE ON %I.land_parcels FOR EACH ROW EXECUTE FUNCTION auto_calculate_parcel_metrics()', schema_rec.schema_name);
      END IF;
      
      -- Recreate generated columns
      EXECUTE format('ALTER TABLE %I.land_parcels ADD COLUMN area_m2 NUMERIC GENERATED ALWAYS AS (ST_Area(geom)) STORED', schema_rec.schema_name);
      EXECUTE format('ALTER TABLE %I.land_parcels ADD COLUMN area_ha NUMERIC GENERATED ALWAYS AS (ST_Area(geom) / 10000) STORED', schema_rec.schema_name);
      EXECUTE format('ALTER TABLE %I.land_parcels ADD COLUMN perimeter_m NUMERIC GENERATED ALWAYS AS (ST_Perimeter(geom)) STORED', schema_rec.schema_name);
      EXECUTE format('ALTER TABLE %I.land_parcels ADD COLUMN centroid_y NUMERIC GENERATED ALWAYS AS (ST_Y(ST_Centroid(geom))) STORED', schema_rec.schema_name);
      EXECUTE format('ALTER TABLE %I.land_parcels ADD COLUMN centroid_x NUMERIC GENERATED ALWAYS AS (ST_X(ST_Centroid(geom))) STORED', schema_rec.schema_name);
      
      -- Create QGIS view
      EXECUTE format('
        CREATE VIEW %I.land_parcels_qgis AS
        SELECT 
          *,
          ST_Transform(geom, 4326) as geom_qgis
        FROM %I.land_parcels
      ', schema_rec.schema_name, schema_rec.schema_name);
    END IF;
    
    RAISE NOTICE '  [OK] Schema reverted to EPSG:22291';
    RAISE NOTICE '';
  END LOOP;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 069 Complete!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'WARNING: Current coordinate values are WRONG!';
  RAISE NOTICE '';
  RAISE NOTICE 'You MUST re-import your CSV data to restore correct coordinates.';
  RAISE NOTICE 'The database is now configured for Cape Lo 31 (EPSG:22291).';
  RAISE NOTICE '';
  RAISE NOTICE 'After re-import, use coordinate_points_qgis view in QGIS.';
  RAISE NOTICE 'Data will display correctly in Zvishavane, Zimbabwe!';
  RAISE NOTICE '';
END $$;

COMMIT;
