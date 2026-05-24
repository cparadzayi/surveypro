-- ============================================================================
-- QGIS Coordinate Swap Fix - For surveyor_surveyor_kuda Schema
-- ============================================================================

-- Step 1: Create the auto-fix function (if not exists)
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

-- Step 2: Drop existing trigger if it exists
DROP TRIGGER IF EXISTS auto_fix_qgis_coordinates ON surveyor_surveyor_kuda.land_parcels;

-- Step 3: Create trigger in surveyor_surveyor_kuda schema
CREATE TRIGGER auto_fix_qgis_coordinates
  BEFORE INSERT OR UPDATE OF geom ON surveyor_surveyor_kuda.land_parcels
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_fix_coordinate_swap();

-- Step 4: Verify installation
SELECT 
  'surveyor_surveyor_kuda' as schema,
  'land_parcels' as table,
  trigger_name,
  event_manipulation,
  'INSTALLED ✅' as status
FROM information_schema.triggers
WHERE trigger_schema = 'surveyor_surveyor_kuda'
  AND trigger_name = 'auto_fix_qgis_coordinates'
  AND event_object_table = 'land_parcels';

-- Success message
SELECT '
========================================
✅ COORDINATE FIX INSTALLED
========================================

Schema: surveyor_surveyor_kuda
Table: land_parcels
Trigger: auto_fix_qgis_coordinates

The coordinate swap fix is now active.

NEXT STEPS:
1. Open QGIS
2. Connect to: surveyor_surveyor_kuda.land_parcels
3. Set CRS: EPSG:22291
4. Start digitizing parcels for Project 7
5. Coordinates will be automatically corrected on save

QGIS CONNECTION:
- Host: localhost
- Database: surveypro_db
- Schema: surveyor_surveyor_kuda
- Table: land_parcels
- Primary Key: id

' as instructions;
