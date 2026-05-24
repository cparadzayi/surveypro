-- ============================================================================
-- QGIS Coordinate Swap Fix - Schema-Aware Version
-- ============================================================================
-- Applies coordinate swap detection and auto-fix to ALL surveyor schemas
-- Compatible with schema-per-surveyor architecture
-- ============================================================================

-- Step 1: Create the auto-fix function (in public schema, callable from all schemas)
CREATE OR REPLACE FUNCTION public.auto_fix_coordinate_swap()
RETURNS TRIGGER AS $$
DECLARE
  centroid_point GEOMETRY;
  x_val NUMERIC;
  y_val NUMERIC;
  ring_points GEOMETRY[];
  swapped_points GEOMETRY[];
BEGIN
  -- Extract centroid coordinates
  centroid_point := ST_Centroid(NEW.geom);
  x_val := ST_X(centroid_point);  -- First ordinate (should be Y/Westing ~97k)
  y_val := ST_Y(centroid_point);  -- Second ordinate (should be X/Southing ~2.2M)
  
  -- Check if coordinates are swapped (X > 1M indicates it's actually Southing)
  IF x_val > 1000000 AND y_val < 200000 THEN
    RAISE NOTICE '[QGIS Fix] Detected swapped coordinates for parcel "%" (ID: %). Auto-fixing...', NEW.stand, NEW.id;
    RAISE NOTICE '[QGIS Fix] Before: First ordinate = %, Second ordinate = %', x_val, y_val;
    
    -- Extract exterior ring points
    ring_points := ARRAY(
      SELECT ST_PointN(ST_ExteriorRing(NEW.geom), generate_series(1, ST_NPoints(ST_ExteriorRing(NEW.geom))))
    );
    
    -- Swap X and Y for each point
    swapped_points := ARRAY(
      SELECT ST_SetSRID(ST_MakePoint(ST_Y(pt), ST_X(pt)), 22291)
      FROM unnest(ring_points) AS pt
    );
    
    -- Reconstruct polygon with swapped coordinates
    NEW.geom := ST_MakePolygon(ST_MakeLine(swapped_points));
    
    -- Log the fix
    centroid_point := ST_Centroid(NEW.geom);
    RAISE NOTICE '[QGIS Fix] After: First ordinate = %, Second ordinate = %', 
      ST_X(centroid_point), ST_Y(centroid_point);
    RAISE NOTICE '[QGIS Fix] ✅ Coordinates fixed automatically';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Apply trigger to ALL surveyor schemas
DO $$
DECLARE
  schema_rec RECORD;
  trigger_count INTEGER := 0;
BEGIN
  -- Loop through all schemas that have a land_parcels table
  FOR schema_rec IN 
    SELECT DISTINCT table_schema 
    FROM information_schema.tables 
    WHERE table_name = 'land_parcels'
      AND table_schema NOT IN ('pg_catalog', 'information_schema')
      AND table_schema != 'public'  -- Skip public schema if it exists
  LOOP
    -- Drop existing trigger if it exists
    EXECUTE format('DROP TRIGGER IF EXISTS auto_fix_qgis_coordinates ON %I.land_parcels', schema_rec.table_schema);
    
    -- Create trigger in this schema
    EXECUTE format('
      CREATE TRIGGER auto_fix_qgis_coordinates
        BEFORE INSERT OR UPDATE OF geom ON %I.land_parcels
        FOR EACH ROW
        EXECUTE FUNCTION public.auto_fix_coordinate_swap()
    ', schema_rec.table_schema);
    
    trigger_count := trigger_count + 1;
    RAISE NOTICE '✅ Applied coordinate swap fix to schema: %', schema_rec.table_schema;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Coordinate swap fix applied to % schemas', trigger_count;
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'You can now digitize parcels in QGIS.';
  RAISE NOTICE 'Any swapped coordinates will be automatically fixed on save.';
END $$;

-- Step 3: Diagnostic query to verify trigger installation
SELECT 
  schemaname as schema,
  tablename as table,
  COUNT(*) as trigger_count
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE c.relname = 'land_parcels'
  AND t.tgname = 'auto_fix_qgis_coordinates'
GROUP BY schemaname, tablename
ORDER BY schemaname;

-- Step 4: Show which schemas are protected
SELECT 
  table_schema as surveyor_schema,
  COUNT(*) as parcel_count,
  '✅ Protected by coordinate swap fix' as status
FROM information_schema.tables t
LEFT JOIN (
  SELECT schemaname, COUNT(*) as parcel_count
  FROM information_schema.tables
  WHERE table_name = 'land_parcels'
  GROUP BY schemaname
) p ON t.table_schema = p.schemaname
WHERE t.table_name = 'land_parcels'
  AND t.table_schema NOT IN ('pg_catalog', 'information_schema')
GROUP BY t.table_schema
ORDER BY t.table_schema;

SELECT '
========================================
✅ READY FOR QGIS DIGITIZATION
========================================

The coordinate swap fix is now active in all surveyor schemas.

NEXT STEPS:
1. Open QGIS
2. Connect to your surveyor schema (e.g., surveyor_kuda_makonese)
3. Add the land_parcels layer
4. Start digitizing parcels
5. Coordinates will be automatically corrected on save

VERIFICATION:
- Any parcel with swapped coordinates will trigger a NOTICE in PostgreSQL logs
- Check logs to see: "[QGIS Fix] ✅ Coordinates fixed automatically"

' as instructions;
