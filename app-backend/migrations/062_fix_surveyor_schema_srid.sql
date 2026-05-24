-- Migration 062: Fix SRID in surveyor schema coordinate_points and land_parcels tables
--
-- PROBLEM: Surveyor schema tables still use SRID 22291, but backend code uses SRID 2053
-- CAUSE: Migration 060 only updated public schema, not surveyor schemas
-- SOLUTION: Transform geometry columns in all surveyor schemas from SRID 22291 to 2053

BEGIN;

DO $$
DECLARE
  schema_rec RECORD;
  table_exists BOOLEAN;
  view_exists BOOLEAN;
  has_geom_column BOOLEAN;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 062: Fix SRID in Surveyor Schemas';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  
  -- Loop through all surveyor schemas
  FOR schema_rec IN 
    SELECT schema_name 
    FROM information_schema.schemata 
    WHERE schema_name LIKE 'surveyor_%'
  LOOP
    RAISE NOTICE 'Processing schema: %', schema_rec.schema_name;
    
    -- ============================================================================
    -- FIX COORDINATE_POINTS TABLE
    -- ============================================================================
    
    -- Check if coordinate_points table exists
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = schema_rec.schema_name 
      AND table_name = 'coordinate_points'
    ) INTO table_exists;
    
    IF table_exists THEN
      -- Check if geom column exists
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = schema_rec.schema_name 
        AND table_name = 'coordinate_points' 
        AND column_name = 'geom'
      ) INTO has_geom_column;
      
      IF has_geom_column THEN
        RAISE NOTICE '  [COORDINATE_POINTS] Transforming geometry from SRID 22291 to 2053...';
        
        -- Drop dependent views if they exist
        EXECUTE format('DROP VIEW IF EXISTS %I.coordinate_points_full CASCADE', schema_rec.schema_name);
        
        -- Transform geometry column
        EXECUTE format('ALTER TABLE %I.coordinate_points ALTER COLUMN geom TYPE GEOMETRY(Point, 2053) USING ST_Transform(geom, 2053)', schema_rec.schema_name);
        
        -- Recreate spatial index
        EXECUTE format('DROP INDEX IF EXISTS %I.idx_coordinate_points_geom', schema_rec.schema_name);
        EXECUTE format('CREATE INDEX idx_coordinate_points_geom ON %I.coordinate_points USING GIST(geom)', schema_rec.schema_name);
        
        RAISE NOTICE '  [OK] coordinate_points transformed to SRID 2053';
      ELSE
        RAISE NOTICE '  [SKIP] coordinate_points has no geom column';
      END IF;
    ELSE
      RAISE NOTICE '  [SKIP] coordinate_points table does not exist';
    END IF;
    
    -- ============================================================================
    -- FIX LAND_PARCELS TABLE
    -- ============================================================================
    
    -- Check if land_parcels table exists
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = schema_rec.schema_name 
      AND table_name = 'land_parcels'
    ) INTO table_exists;
    
    IF table_exists THEN
      -- Check if geom column exists
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = schema_rec.schema_name 
        AND table_name = 'land_parcels' 
        AND column_name = 'geom'
      ) INTO has_geom_column;
      
      IF has_geom_column THEN
        RAISE NOTICE '  [LAND_PARCELS] Transforming geometry from SRID 22291 to 2053...';
        
        -- Drop dependent views if they exist
        EXECUTE format('DROP VIEW IF EXISTS %I.land_parcels_full CASCADE', schema_rec.schema_name);
        
        -- Drop all triggers on land_parcels
        EXECUTE format('DROP TRIGGER IF EXISTS prevent_parcel_overlap ON %I.land_parcels', schema_rec.schema_name);
        EXECUTE format('DROP TRIGGER IF EXISTS land_parcels_updated_at ON %I.land_parcels', schema_rec.schema_name);
        EXECUTE format('DROP TRIGGER IF EXISTS land_parcels_auto_project_id ON %I.land_parcels', schema_rec.schema_name);
        EXECUTE format('DROP TRIGGER IF EXISTS trigger_update_land_parcels_updated_at ON %I.land_parcels', schema_rec.schema_name);
        EXECUTE format('DROP TRIGGER IF EXISTS trigger_update_import_has_parcels ON %I.land_parcels', schema_rec.schema_name);
        EXECUTE format('DROP TRIGGER IF EXISTS land_parcel_auto_calculate ON %I.land_parcels', schema_rec.schema_name);
        
        -- Drop generated columns (they depend on geom)
        EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS area_m2 CASCADE', schema_rec.schema_name);
        EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS area_ha CASCADE', schema_rec.schema_name);
        EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS perimeter_m CASCADE', schema_rec.schema_name);
        EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS centroid_y CASCADE', schema_rec.schema_name);
        EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS centroid_x CASCADE', schema_rec.schema_name);
        
        -- Transform geometry column
        EXECUTE format('ALTER TABLE %I.land_parcels ALTER COLUMN geom TYPE GEOMETRY(Polygon, 2053) USING ST_Transform(geom, 2053)', schema_rec.schema_name);
        
        -- Recreate generated columns
        EXECUTE format('ALTER TABLE %I.land_parcels ADD COLUMN area_m2 NUMERIC GENERATED ALWAYS AS (ST_Area(geom)) STORED', schema_rec.schema_name);
        EXECUTE format('ALTER TABLE %I.land_parcels ADD COLUMN area_ha NUMERIC GENERATED ALWAYS AS (ST_Area(geom) / 10000) STORED', schema_rec.schema_name);
        EXECUTE format('ALTER TABLE %I.land_parcels ADD COLUMN perimeter_m NUMERIC GENERATED ALWAYS AS (ST_Perimeter(geom)) STORED', schema_rec.schema_name);
        EXECUTE format('ALTER TABLE %I.land_parcels ADD COLUMN centroid_y NUMERIC GENERATED ALWAYS AS (ST_Y(ST_Centroid(geom))) STORED', schema_rec.schema_name);
        EXECUTE format('ALTER TABLE %I.land_parcels ADD COLUMN centroid_x NUMERIC GENERATED ALWAYS AS (ST_X(ST_Centroid(geom))) STORED', schema_rec.schema_name);
        
        -- Recreate spatial index
        EXECUTE format('DROP INDEX IF EXISTS %I.idx_land_parcels_geom', schema_rec.schema_name);
        EXECUTE format('CREATE INDEX idx_land_parcels_geom ON %I.land_parcels USING GIST(geom)', schema_rec.schema_name);
        
        -- Recreate triggers (conditionally based on function existence)
        -- Note: Triggers will be recreated by application migrations if functions exist
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
        
        RAISE NOTICE '  [OK] land_parcels transformed to SRID 2053';
      ELSE
        RAISE NOTICE '  [SKIP] land_parcels has no geom column';
      END IF;
    ELSE
      RAISE NOTICE '  [SKIP] land_parcels table does not exist';
    END IF;
    
    RAISE NOTICE '';
  END LOOP;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 062 complete!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'All surveyor schema tables now use SRID 2053';
  RAISE NOTICE '';
END $$;

COMMIT;
