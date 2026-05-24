-- Migration 063: Fix SRID from 2053 (Lo29) to 2054 (Lo31)
--
-- PROBLEM: We used EPSG:2053 (Lo29) instead of EPSG:2054 (Lo31)
-- CAUSE: Wrong EPSG code selected for Zimbabwe Lo31 zone
-- SOLUTION: Transform all geometry columns from SRID 2053 to 2054
--
-- NOTE: Both are south-oriented, so no coordinate negation needed
-- The transformation is just updating the SRID metadata

BEGIN;

DO $$
DECLARE
  schema_rec RECORD;
  table_exists BOOLEAN;
  has_geom_column BOOLEAN;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 063: Fix SRID 2053 -> 2054';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Updating from EPSG:2053 (Lo29) to EPSG:2054 (Lo31)';
  RAISE NOTICE '';
  
  -- ============================================================================
  -- FIX PUBLIC SCHEMA
  -- ============================================================================
  
  RAISE NOTICE 'Processing schema: public';
  
  -- Fix coordinate_points
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'coordinate_points'
  ) INTO table_exists;
  
  IF table_exists THEN
    RAISE NOTICE '  [COORDINATE_POINTS] Updating SRID to 2054...';
    
    -- Drop dependent views
    DROP VIEW IF EXISTS public.coordinate_points_full CASCADE;
    
    -- Update SRID
    ALTER TABLE public.coordinate_points 
      ALTER COLUMN geom TYPE GEOMETRY(Point, 2054) 
      USING ST_SetSRID(geom, 2054);
    
    RAISE NOTICE '  [OK] coordinate_points updated to SRID 2054';
  END IF;
  
  -- Fix land_parcels
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'land_parcels'
  ) INTO table_exists;
  
  IF table_exists THEN
    RAISE NOTICE '  [LAND_PARCELS] Updating SRID to 2054...';
    
    -- Drop dependent views
    DROP VIEW IF EXISTS public.land_parcels_full CASCADE;
    
    -- Drop all triggers
    DROP TRIGGER IF EXISTS prevent_parcel_overlap ON public.land_parcels;
    DROP TRIGGER IF EXISTS land_parcels_updated_at ON public.land_parcels;
    DROP TRIGGER IF EXISTS land_parcels_auto_project_id ON public.land_parcels;
    DROP TRIGGER IF EXISTS trigger_update_land_parcels_updated_at ON public.land_parcels;
    DROP TRIGGER IF EXISTS trigger_update_import_has_parcels ON public.land_parcels;
    DROP TRIGGER IF EXISTS land_parcel_auto_calculate ON public.land_parcels;
    
    -- Drop generated columns
    ALTER TABLE public.land_parcels DROP COLUMN IF EXISTS area_m2 CASCADE;
    ALTER TABLE public.land_parcels DROP COLUMN IF EXISTS area_ha CASCADE;
    ALTER TABLE public.land_parcels DROP COLUMN IF EXISTS perimeter_m CASCADE;
    ALTER TABLE public.land_parcels DROP COLUMN IF EXISTS centroid_y CASCADE;
    ALTER TABLE public.land_parcels DROP COLUMN IF EXISTS centroid_x CASCADE;
    
    -- Update SRID
    ALTER TABLE public.land_parcels 
      ALTER COLUMN geom TYPE GEOMETRY(Polygon, 2054) 
      USING ST_SetSRID(geom, 2054);
    
    -- Recreate generated columns
    ALTER TABLE public.land_parcels ADD COLUMN area_m2 NUMERIC GENERATED ALWAYS AS (ST_Area(geom)) STORED;
    ALTER TABLE public.land_parcels ADD COLUMN area_ha NUMERIC GENERATED ALWAYS AS (ST_Area(geom) / 10000) STORED;
    ALTER TABLE public.land_parcels ADD COLUMN perimeter_m NUMERIC GENERATED ALWAYS AS (ST_Perimeter(geom)) STORED;
    ALTER TABLE public.land_parcels ADD COLUMN centroid_y NUMERIC GENERATED ALWAYS AS (ST_Y(ST_Centroid(geom))) STORED;
    ALTER TABLE public.land_parcels ADD COLUMN centroid_x NUMERIC GENERATED ALWAYS AS (ST_X(ST_Centroid(geom))) STORED;
    
    -- Recreate triggers (conditionally based on function existence)
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
    
    RAISE NOTICE '  [OK] land_parcels updated to SRID 2054';
  END IF;
  
  RAISE NOTICE '';
  
  -- ============================================================================
  -- FIX SURVEYOR SCHEMAS
  -- ============================================================================
  
  FOR schema_rec IN 
    SELECT schema_name 
    FROM information_schema.schemata 
    WHERE schema_name LIKE 'surveyor_%'
  LOOP
    RAISE NOTICE 'Processing schema: %', schema_rec.schema_name;
    
    -- Fix coordinate_points
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = schema_rec.schema_name 
      AND table_name = 'coordinate_points'
    ) INTO table_exists;
    
    IF table_exists THEN
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = schema_rec.schema_name 
        AND table_name = 'coordinate_points' 
        AND column_name = 'geom'
      ) INTO has_geom_column;
      
      IF has_geom_column THEN
        RAISE NOTICE '  [COORDINATE_POINTS] Updating SRID to 2054...';
        
        -- Drop dependent views
        EXECUTE format('DROP VIEW IF EXISTS %I.coordinate_points_full CASCADE', schema_rec.schema_name);
        
        -- Update SRID
        EXECUTE format('ALTER TABLE %I.coordinate_points ALTER COLUMN geom TYPE GEOMETRY(Point, 2054) USING ST_SetSRID(geom, 2054)', schema_rec.schema_name);
        
        RAISE NOTICE '  [OK] coordinate_points updated to SRID 2054';
      END IF;
    END IF;
    
    -- Fix land_parcels
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = schema_rec.schema_name 
      AND table_name = 'land_parcels'
    ) INTO table_exists;
    
    IF table_exists THEN
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = schema_rec.schema_name 
        AND table_name = 'land_parcels' 
        AND column_name = 'geom'
      ) INTO has_geom_column;
      
      IF has_geom_column THEN
        RAISE NOTICE '  [LAND_PARCELS] Updating SRID to 2054...';
        
        -- Drop dependent views
        EXECUTE format('DROP VIEW IF EXISTS %I.land_parcels_full CASCADE', schema_rec.schema_name);
        
        -- Drop all triggers
        EXECUTE format('DROP TRIGGER IF EXISTS prevent_parcel_overlap ON %I.land_parcels', schema_rec.schema_name);
        EXECUTE format('DROP TRIGGER IF EXISTS land_parcels_updated_at ON %I.land_parcels', schema_rec.schema_name);
        EXECUTE format('DROP TRIGGER IF EXISTS land_parcels_auto_project_id ON %I.land_parcels', schema_rec.schema_name);
        EXECUTE format('DROP TRIGGER IF EXISTS trigger_update_land_parcels_updated_at ON %I.land_parcels', schema_rec.schema_name);
        EXECUTE format('DROP TRIGGER IF EXISTS trigger_update_import_has_parcels ON %I.land_parcels', schema_rec.schema_name);
        EXECUTE format('DROP TRIGGER IF EXISTS land_parcel_auto_calculate ON %I.land_parcels', schema_rec.schema_name);
        
        -- Drop generated columns
        EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS area_m2 CASCADE', schema_rec.schema_name);
        EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS area_ha CASCADE', schema_rec.schema_name);
        EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS perimeter_m CASCADE', schema_rec.schema_name);
        EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS centroid_y CASCADE', schema_rec.schema_name);
        EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS centroid_x CASCADE', schema_rec.schema_name);
        
        -- Update SRID
        EXECUTE format('ALTER TABLE %I.land_parcels ALTER COLUMN geom TYPE GEOMETRY(Polygon, 2054) USING ST_SetSRID(geom, 2054)', schema_rec.schema_name);
        
        -- Recreate generated columns
        EXECUTE format('ALTER TABLE %I.land_parcels ADD COLUMN area_m2 NUMERIC GENERATED ALWAYS AS (ST_Area(geom)) STORED', schema_rec.schema_name);
        EXECUTE format('ALTER TABLE %I.land_parcels ADD COLUMN area_ha NUMERIC GENERATED ALWAYS AS (ST_Area(geom) / 10000) STORED', schema_rec.schema_name);
        EXECUTE format('ALTER TABLE %I.land_parcels ADD COLUMN perimeter_m NUMERIC GENERATED ALWAYS AS (ST_Perimeter(geom)) STORED', schema_rec.schema_name);
        EXECUTE format('ALTER TABLE %I.land_parcels ADD COLUMN centroid_y NUMERIC GENERATED ALWAYS AS (ST_Y(ST_Centroid(geom))) STORED', schema_rec.schema_name);
        EXECUTE format('ALTER TABLE %I.land_parcels ADD COLUMN centroid_x NUMERIC GENERATED ALWAYS AS (ST_X(ST_Centroid(geom))) STORED', schema_rec.schema_name);
        
        -- Recreate triggers (conditionally based on function existence)
        IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'check_parcel_overlap') THEN
          EXECUTE format('CREATE TRIGGER prevent_parcel_overlap BEFORE INSERT OR UPDATE OF geom ON %I.land_parcels FOR EACH ROW EXECUTE FUNCTION check_parcel_overlap()', schema_rec.schema_name);
        END IF;
        
        IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
          EXECUTE format('CREATE TRIGGER trigger_update_land_parcels_updated_at BEFORE UPDATE ON %I.land_parcels FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', schema_rec.schema_name);
        END IF;
        
        IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_project_id_from_schema') THEN
          EXECUTE format('CREATE TRIGGER land_parcels_auto_project_id BEFORE INSERT ON %I.land_parcels FOR EACH ROW EXECUTE FUNCTION set_project_id_from_schema()', schema_rec.schema_name);
        END IF;
        
        IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_import_has_parcels') THEN
          EXECUTE format('CREATE TRIGGER trigger_update_import_has_parcels AFTER INSERT OR DELETE ON %I.land_parcels FOR EACH ROW EXECUTE FUNCTION update_import_has_parcels()', schema_rec.schema_name);
        END IF;
        
        IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'auto_calculate_parcel_metrics') THEN
          EXECUTE format('CREATE TRIGGER land_parcel_auto_calculate BEFORE INSERT OR UPDATE ON %I.land_parcels FOR EACH ROW EXECUTE FUNCTION auto_calculate_parcel_metrics()', schema_rec.schema_name);
        END IF;
        
        RAISE NOTICE '  [OK] land_parcels updated to SRID 2054';
      END IF;
    END IF;
    
    RAISE NOTICE '';
  END LOOP;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 063 complete!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'All tables now use SRID 2054 (Hartebeesthoek94 Lo31)';
  RAISE NOTICE '';
END $$;

COMMIT;
