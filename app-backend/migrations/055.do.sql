-- Migration 055: Backfill Cape Lo Points from Geometry
-- Purpose: Extract Cape Lo coordinates from geometry and store in metadata
-- This fixes parcels saved before the Cape Lo points metadata fix

BEGIN;

DO $$
DECLARE
  schema_rec RECORD;
  parcel_rec RECORD;
  updated_count INT := 0;
  total_count INT := 0;
  points_json JSONB;
  point_array JSONB := '[]'::jsonb;
  coords RECORD;
  point_index INT;
BEGIN
  RAISE NOTICE '[INFO] Backfilling Cape Lo points from geometry...';
  RAISE NOTICE '';
  
  -- Loop through all surveyor schemas
  FOR schema_rec IN 
    SELECT schema_name 
    FROM information_schema.schemata 
    WHERE schema_name LIKE 'surveyor_%'
    ORDER BY schema_name
  LOOP
    -- Check if land_parcels table exists
    IF EXISTS (
      SELECT 1 
      FROM information_schema.tables 
      WHERE table_schema = schema_rec.schema_name 
      AND table_name = 'land_parcels'
    ) THEN
      
      RAISE NOTICE '[INFO] Processing schema: %', schema_rec.schema_name;
      
      -- Loop through parcels that don't have cape_lo_points in metadata
      FOR parcel_rec IN EXECUTE format(
        'SELECT id, stand, geom, metadata 
         FROM %I.land_parcels 
         WHERE geom IS NOT NULL 
         AND (metadata IS NULL OR metadata->''cape_lo_points'' IS NULL)',
        schema_rec.schema_name
      )
      LOOP
        -- Extract coordinates from geometry (EPSG:22291 - Cape Lo 31)
        point_array := '[]'::jsonb;
        point_index := 1;
        
        -- Get exterior ring coordinates (skip last point as it's duplicate of first)
        FOR coords IN EXECUTE format(
          'SELECT ST_Y(geom) as y, ST_X(geom) as x
           FROM (
             SELECT (ST_DumpPoints(ST_ExteriorRing($1))).geom
           ) AS points
           LIMIT (SELECT ST_NPoints(ST_ExteriorRing($1)) - 1)'
        ) USING parcel_rec.geom
        LOOP
          -- Build point object
          points_json := jsonb_build_object(
            'id', 'P' || point_index::text,
            'y', coords.y,
            'x', coords.x,
            'status', 'placed',
            'description', 'Beacon ' || point_index::text
          );
          
          -- Add to array
          point_array := point_array || points_json;
          point_index := point_index + 1;
        END LOOP;
        
        -- Update metadata with Cape Lo points
        IF jsonb_array_length(point_array) > 0 THEN
          EXECUTE format(
            'UPDATE %I.land_parcels 
             SET metadata = COALESCE(metadata, ''{}''::jsonb) || jsonb_build_object(''cape_lo_points'', $1)
             WHERE id = $2',
            schema_rec.schema_name
          ) USING point_array, parcel_rec.id;
          
          updated_count := updated_count + 1;
          RAISE NOTICE '  [OK] Updated parcel % (stand: %) with % points', 
            parcel_rec.id, parcel_rec.stand, jsonb_array_length(point_array);
        END IF;
        
        total_count := total_count + 1;
      END LOOP;
      
    END IF;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '===========================================================';
  RAISE NOTICE '[SUCCESS] Migration 055 Complete';
  RAISE NOTICE '===========================================================';
  RAISE NOTICE 'Total parcels processed: %', total_count;
  RAISE NOTICE 'Parcels updated: %', updated_count;
  RAISE NOTICE '';
  RAISE NOTICE 'All parcels now have Cape Lo points in metadata.';
  RAISE NOTICE 'PDF generation will include all parcels.';
  RAISE NOTICE '===========================================================';
END $$;

COMMIT;
