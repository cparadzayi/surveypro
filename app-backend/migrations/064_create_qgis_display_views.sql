-- Migration 064: Create QGIS-friendly display views with negated coordinates
--
-- PROBLEM: EPSG:2054 is south-oriented (wsu axis), QGIS displays incorrectly
-- SOLUTION: Create views with negated coordinates for north-up display
--
-- NOTE: This doesn't change the actual data, just creates display views

BEGIN;

DO $$
DECLARE
  schema_rec RECORD;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 064: Create QGIS Display Views';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Creating north-oriented views for QGIS';
  RAISE NOTICE '';
  
  -- ============================================================================
  -- PUBLIC SCHEMA
  -- ============================================================================
  
  RAISE NOTICE 'Processing schema: public';
  
  -- Create coordinate_points view for QGIS (negated coordinates)
  DROP VIEW IF EXISTS public.coordinate_points_qgis CASCADE;
  CREATE VIEW public.coordinate_points_qgis AS
  SELECT 
    id,
    project_id,
    name,
    -- Negate coordinates for north-up display in QGIS
    ST_SetSRID(ST_MakePoint(-ST_Y(geom), -ST_X(geom)), 4326) as geom,
    -ST_Y(geom) as y_display,
    -ST_X(geom) as x_display,
    ST_Y(geom) as y_original,
    ST_X(geom) as x_original,
    elevation,
    description,
    survey_date,
    surveyor,
    import_id,
    created_at,
    updated_at
  FROM public.coordinate_points;
  
  RAISE NOTICE '  [OK] Created coordinate_points_qgis view';
  
  -- Create land_parcels view for QGIS (negated coordinates)
  DROP VIEW IF EXISTS public.land_parcels_qgis CASCADE;
  CREATE VIEW public.land_parcels_qgis AS
  SELECT 
    id,
    project_id,
    stand,
    designation,
    -- Transform geometry: negate coordinates and convert to WGS84
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
        4326
      ),
      4326
    ) as geom,
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
  
  RAISE NOTICE '  [OK] Created land_parcels_qgis view';
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
    
    -- Create coordinate_points view for QGIS
    EXECUTE format('DROP VIEW IF EXISTS %I.coordinate_points_qgis CASCADE', schema_rec.schema_name);
    EXECUTE format('
      CREATE VIEW %I.coordinate_points_qgis AS
      SELECT 
        id,
        project_id,
        name,
        ST_SetSRID(ST_MakePoint(-ST_Y(geom), -ST_X(geom)), 4326) as geom,
        -ST_Y(geom) as y_display,
        -ST_X(geom) as x_display,
        ST_Y(geom) as y_original,
        ST_X(geom) as x_original,
        elevation,
        description,
        survey_date,
        surveyor,
        created_at,
        updated_at
      FROM %I.coordinate_points
    ', schema_rec.schema_name, schema_rec.schema_name);
    
    RAISE NOTICE '  [OK] Created coordinate_points_qgis view';
    
    -- Create land_parcels view for QGIS
    EXECUTE format('DROP VIEW IF EXISTS %I.land_parcels_qgis CASCADE', schema_rec.schema_name);
    EXECUTE format('
      CREATE VIEW %I.land_parcels_qgis AS
      SELECT 
        id,
        project_id,
        stand,
        designation,
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
            4326
          ),
          4326
        ) as geom,
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
      FROM %I.land_parcels
    ', schema_rec.schema_name, schema_rec.schema_name);
    
    RAISE NOTICE '  [OK] Created land_parcels_qgis view';
    RAISE NOTICE '';
  END LOOP;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 064 complete!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Use *_qgis views in QGIS for correct display';
  RAISE NOTICE 'Original tables still use SRID 2054 (south-oriented)';
  RAISE NOTICE '';
END $$;

COMMIT;
