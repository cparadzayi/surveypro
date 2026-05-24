-- Migration 072: Create QGIS-Friendly Editing View for Land Parcels
--
-- PROBLEM: QGIS can't load land_parcels table due to generated columns and complex constraints
-- SOLUTION: Create an updatable view that hides generated columns and simplifies editing
--
-- This view:
-- 1. Exposes only user-editable columns
-- 2. Hides generated columns (area_m2, area_ha, perimeter_m, etc.)
-- 3. Provides INSTEAD OF triggers for INSERT/UPDATE/DELETE
-- 4. Works seamlessly with QGIS digitizing

BEGIN;

DO $$
DECLARE
  schema_rec RECORD;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 072: Land Parcels Edit View';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  
  -- ============================================================================
  -- PUBLIC SCHEMA
  -- ============================================================================
  
  RAISE NOTICE 'Processing schema: public';
  
  -- Drop existing view if it exists
  DROP VIEW IF EXISTS public.land_parcels_edit CASCADE;
  
  -- Create updatable view with only user-editable columns
  CREATE VIEW public.land_parcels_edit AS
  SELECT 
    id,
    project_id,
    stand,
    designation,
    geom,
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
  
  RAISE NOTICE '  [OK] Created land_parcels_edit view';
  
  -- Create INSTEAD OF INSERT trigger
  CREATE OR REPLACE FUNCTION public.land_parcels_edit_insert()
  RETURNS TRIGGER AS $func$
  BEGIN
    INSERT INTO public.land_parcels (
      project_id, stand, designation, geom, owner, title_deed,
      survey_date, surveyor, notes, status, digitized_by, metadata
    ) VALUES (
      NEW.project_id, NEW.stand, NEW.designation, NEW.geom, NEW.owner, NEW.title_deed,
      NEW.survey_date, NEW.surveyor, NEW.notes, NEW.status, NEW.digitized_by, NEW.metadata
    );
    RETURN NEW;
  END;
  $func$ LANGUAGE plpgsql;
  
  CREATE TRIGGER land_parcels_edit_insert_trigger
    INSTEAD OF INSERT ON public.land_parcels_edit
    FOR EACH ROW EXECUTE FUNCTION public.land_parcels_edit_insert();
  
  RAISE NOTICE '  [OK] Created INSERT trigger';
  
  -- Create INSTEAD OF UPDATE trigger
  CREATE OR REPLACE FUNCTION public.land_parcels_edit_update()
  RETURNS TRIGGER AS $func$
  BEGIN
    UPDATE public.land_parcels SET
      project_id = NEW.project_id,
      stand = NEW.stand,
      designation = NEW.designation,
      geom = NEW.geom,
      owner = NEW.owner,
      title_deed = NEW.title_deed,
      survey_date = NEW.survey_date,
      surveyor = NEW.surveyor,
      notes = NEW.notes,
      status = NEW.status,
      digitized_by = NEW.digitized_by,
      metadata = NEW.metadata
    WHERE id = OLD.id;
    RETURN NEW;
  END;
  $func$ LANGUAGE plpgsql;
  
  CREATE TRIGGER land_parcels_edit_update_trigger
    INSTEAD OF UPDATE ON public.land_parcels_edit
    FOR EACH ROW EXECUTE FUNCTION public.land_parcels_edit_update();
  
  RAISE NOTICE '  [OK] Created UPDATE trigger';
  
  -- Create INSTEAD OF DELETE trigger
  CREATE OR REPLACE FUNCTION public.land_parcels_edit_delete()
  RETURNS TRIGGER AS $func$
  BEGIN
    DELETE FROM public.land_parcels WHERE id = OLD.id;
    RETURN OLD;
  END;
  $func$ LANGUAGE plpgsql;
  
  CREATE TRIGGER land_parcels_edit_delete_trigger
    INSTEAD OF DELETE ON public.land_parcels_edit
    FOR EACH ROW EXECUTE FUNCTION public.land_parcels_edit_delete();
  
  RAISE NOTICE '  [OK] Created DELETE trigger';
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
    
    -- Check if land_parcels table exists
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = schema_rec.schema_name 
      AND table_name = 'land_parcels'
    ) THEN
      
      -- Drop existing view
      EXECUTE format('DROP VIEW IF EXISTS %I.land_parcels_edit CASCADE', schema_rec.schema_name);
      
      -- Create view
      EXECUTE format('
        CREATE VIEW %I.land_parcels_edit AS
        SELECT 
          id, project_id, stand, designation, geom, owner, title_deed,
          survey_date, surveyor, notes, status, digitized_by, metadata,
          created_at, updated_at
        FROM %I.land_parcels
      ', schema_rec.schema_name, schema_rec.schema_name);
      
      RAISE NOTICE '  [OK] Created land_parcels_edit view';
      
      -- Create INSERT trigger function
      EXECUTE format('
        CREATE OR REPLACE FUNCTION %I.land_parcels_edit_insert()
        RETURNS TRIGGER AS $func$
        BEGIN
          INSERT INTO %I.land_parcels (
            project_id, stand, designation, geom, owner, title_deed,
            survey_date, surveyor, notes, status, digitized_by, metadata
          ) VALUES (
            NEW.project_id, NEW.stand, NEW.designation, NEW.geom, NEW.owner, NEW.title_deed,
            NEW.survey_date, NEW.surveyor, NEW.notes, NEW.status, NEW.digitized_by, NEW.metadata
          );
          RETURN NEW;
        END;
        $func$ LANGUAGE plpgsql;
      ', schema_rec.schema_name, schema_rec.schema_name);
      
      EXECUTE format('
        CREATE TRIGGER land_parcels_edit_insert_trigger
          INSTEAD OF INSERT ON %I.land_parcels_edit
          FOR EACH ROW EXECUTE FUNCTION %I.land_parcels_edit_insert()
      ', schema_rec.schema_name, schema_rec.schema_name);
      
      RAISE NOTICE '  [OK] Created INSERT trigger';
      
      -- Create UPDATE trigger function
      EXECUTE format('
        CREATE OR REPLACE FUNCTION %I.land_parcels_edit_update()
        RETURNS TRIGGER AS $func$
        BEGIN
          UPDATE %I.land_parcels SET
            project_id = NEW.project_id,
            stand = NEW.stand,
            designation = NEW.designation,
            geom = NEW.geom,
            owner = NEW.owner,
            title_deed = NEW.title_deed,
            survey_date = NEW.survey_date,
            surveyor = NEW.surveyor,
            notes = NEW.notes,
            status = NEW.status,
            digitized_by = NEW.digitized_by,
            metadata = NEW.metadata
          WHERE id = OLD.id;
          RETURN NEW;
        END;
        $func$ LANGUAGE plpgsql;
      ', schema_rec.schema_name, schema_rec.schema_name);
      
      EXECUTE format('
        CREATE TRIGGER land_parcels_edit_update_trigger
          INSTEAD OF UPDATE ON %I.land_parcels_edit
          FOR EACH ROW EXECUTE FUNCTION %I.land_parcels_edit_update()
      ', schema_rec.schema_name, schema_rec.schema_name);
      
      RAISE NOTICE '  [OK] Created UPDATE trigger';
      
      -- Create DELETE trigger function
      EXECUTE format('
        CREATE OR REPLACE FUNCTION %I.land_parcels_edit_delete()
        RETURNS TRIGGER AS $func$
        BEGIN
          DELETE FROM %I.land_parcels WHERE id = OLD.id;
          RETURN OLD;
        END;
        $func$ LANGUAGE plpgsql;
      ', schema_rec.schema_name, schema_rec.schema_name);
      
      EXECUTE format('
        CREATE TRIGGER land_parcels_edit_delete_trigger
          INSTEAD OF DELETE ON %I.land_parcels_edit
          FOR EACH ROW EXECUTE FUNCTION %I.land_parcels_edit_delete()
      ', schema_rec.schema_name, schema_rec.schema_name);
      
      RAISE NOTICE '  [OK] Created DELETE trigger';
      
    ELSE
      RAISE NOTICE '  [SKIP] No land_parcels table found';
    END IF;
    
    RAISE NOTICE '';
  END LOOP;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 072 Complete!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'QGIS Setup:';
  RAISE NOTICE '1. Add layer: surveyor_surveyor_kuda.land_parcels_edit';
  RAISE NOTICE '2. Geometry column: geom';
  RAISE NOTICE '3. Primary key: id';
  RAISE NOTICE '4. Filter: "project_id" = 4';
  RAISE NOTICE '5. Set default: project_id = 4';
  RAISE NOTICE '';
  RAISE NOTICE 'Benefits:';
  RAISE NOTICE '- No generated columns (QGIS compatible)';
  RAISE NOTICE '- Full INSERT/UPDATE/DELETE support';
  RAISE NOTICE '- Areas auto-calculated in base table';
  RAISE NOTICE '';
END $$;

COMMIT;
