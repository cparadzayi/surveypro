-- Migration 064: Create QGIS-friendly display views with negated coordinates
--
-- PROBLEM: EPSG:2054 is south-oriented (wsu axis), QGIS displays incorrectly
-- SOLUTION: Create views with negated coordinates for north-up display
--
-- NOTE: Uses only common columns that exist in all schemas

BEGIN;

DO $$
DECLARE
  schema_rec RECORD;
  column_list TEXT;
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
  -- SURVEYOR SCHEMAS - Use minimal common columns
  -- ============================================================================
  
  FOR schema_rec IN 
    SELECT schema_name 
    FROM information_schema.schemata 
    WHERE schema_name LIKE 'surveyor_%'
  LOOP
    RAISE NOTICE 'Processing schema: %', schema_rec.schema_name;
    
    -- Build column list dynamically based on what exists
    SELECT string_agg(
      CASE column_name
        WHEN 'id' THEN 'id'
        WHEN 'project_id' THEN 'project_id'
        WHEN 'name' THEN 'name'
        WHEN 'y' THEN 'y'
        WHEN 'x' THEN 'x'
        WHEN 'z' THEN 'z'
        WHEN 'elevation' THEN 'elevation'
        WHEN 'description' THEN 'description'
        WHEN 'fp' THEN 'fp'
        WHEN 'status' THEN 'status'
        WHEN 'point_type' THEN 'point_type'
        WHEN 'date_surveyed' THEN 'date_surveyed'
        WHEN 'survey_date' THEN 'survey_date'
        WHEN 'surveyor' THEN 'surveyor'
        WHEN 'metadata' THEN 'metadata'
        WHEN 'created_at' THEN 'created_at'
        WHEN 'updated_at' THEN 'updated_at'
      END,
      ', '
    ) INTO column_list
    FROM information_schema.columns
    WHERE table_schema = schema_rec.schema_name
      AND table_name = 'coordinate_points'
      AND column_name IN ('id', 'project_id', 'name', 'y', 'x', 'z', 'elevation', 'description', 
                          'fp', 'status', 'point_type', 'date_surveyed', 'survey_date', 'surveyor', 
                          'metadata', 'created_at', 'updated_at')
    ORDER BY 
      CASE column_name
        WHEN 'id' THEN 1
        WHEN 'project_id' THEN 2
        WHEN 'name' THEN 3
        WHEN 'y' THEN 4
        WHEN 'x' THEN 5
        WHEN 'z' THEN 6
        WHEN 'elevation' THEN 7
        WHEN 'description' THEN 8
        WHEN 'fp' THEN 9
        WHEN 'status' THEN 10
        WHEN 'point_type' THEN 11
        WHEN 'date_surveyed' THEN 12
        WHEN 'survey_date' THEN 13
        WHEN 'surveyor' THEN 14
        WHEN 'metadata' THEN 15
        WHEN 'created_at' THEN 16
        WHEN 'updated_at' THEN 17
      END;
    
    -- Create coordinate_points view for QGIS (minimal version)
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
        %s
      FROM %I.coordinate_points
    ', schema_rec.schema_name, column_list, schema_rec.schema_name);
    
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
  RAISE NOTICE 'Set CRS to EPSG:4326 (WGS84) in QGIS';
  RAISE NOTICE 'Data will display in Zvishavane, Zimbabwe';
  RAISE NOTICE '';
END $$;

COMMIT;
