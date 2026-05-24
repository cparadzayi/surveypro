-- ============================================================================
-- QGIS Coordinate Swap Diagnosis and Fix
-- ============================================================================
-- This script diagnoses and fixes coordinate swaps in QGIS-digitized parcels
-- 
-- Cape Lo 31 (EPSG:22291) Convention:
--   X = Southing (~2,247,000m)
--   Y = Westing (~97,000m)
--   PostGIS: ST_MakePoint(Y, X) - first ordinate is Y, second is X
--   GeoJSON: [X, Y] - standard order
-- ============================================================================

-- Step 1: Diagnose - Check current parcel coordinates
SELECT 
  id,
  stand,
  designation,
  ST_X(ST_Centroid(geom)) as first_ordinate,
  ST_Y(ST_Centroid(geom)) as second_ordinate,
  ST_AsText(ST_Centroid(geom)) as centroid_wkt,
  CASE 
    WHEN ST_X(ST_Centroid(geom)) > 1000000 AND ST_Y(ST_Centroid(geom)) < 200000 
    THEN '❌ SWAPPED - First ordinate is Southing (should be Westing)'
    WHEN ST_X(ST_Centroid(geom)) < 200000 AND ST_Y(ST_Centroid(geom)) > 1000000
    THEN '✅ CORRECT - First ordinate is Westing, second is Southing'
    ELSE '⚠️ UNKNOWN - Coordinates outside expected range'
  END as diagnosis,
  area_m2,
  created_at
FROM land_parcels
ORDER BY created_at DESC
LIMIT 20;

-- Step 2: Count parcels with swapped coordinates
SELECT 
  COUNT(*) as total_parcels,
  COUNT(*) FILTER (WHERE ST_X(ST_Centroid(geom)) > 1000000 AND ST_Y(ST_Centroid(geom)) < 200000) as swapped_parcels,
  COUNT(*) FILTER (WHERE ST_X(ST_Centroid(geom)) < 200000 AND ST_Y(ST_Centroid(geom)) > 1000000) as correct_parcels,
  COUNT(*) FILTER (WHERE NOT (
    (ST_X(ST_Centroid(geom)) > 1000000 AND ST_Y(ST_Centroid(geom)) < 200000) OR
    (ST_X(ST_Centroid(geom)) < 200000 AND ST_Y(ST_Centroid(geom)) > 1000000)
  )) as unknown_parcels
FROM land_parcels;

-- Step 3: Create function to swap coordinates
CREATE OR REPLACE FUNCTION swap_parcel_coordinates(parcel_id INTEGER)
RETURNS TABLE(
  id INTEGER,
  stand VARCHAR,
  old_centroid TEXT,
  new_centroid TEXT,
  status TEXT
) AS $$
DECLARE
  parcel_geom GEOMETRY;
  swapped_geom GEOMETRY;
  point_array GEOMETRY[];
  swapped_points GEOMETRY[];
  i INTEGER;
  ring_points GEOMETRY[];
BEGIN
  -- Get the parcel geometry
  SELECT geom INTO parcel_geom FROM land_parcels WHERE land_parcels.id = parcel_id;
  
  IF parcel_geom IS NULL THEN
    RETURN QUERY SELECT 
      parcel_id, 
      NULL::VARCHAR, 
      NULL::TEXT, 
      NULL::TEXT, 
      'Parcel not found'::TEXT;
    RETURN;
  END IF;
  
  -- Extract exterior ring points
  ring_points := ARRAY(
    SELECT ST_PointN(ST_ExteriorRing(parcel_geom), generate_series(1, ST_NPoints(ST_ExteriorRing(parcel_geom))))
  );
  
  -- Swap X and Y for each point
  swapped_points := ARRAY(
    SELECT ST_SetSRID(ST_MakePoint(ST_Y(pt), ST_X(pt)), 22291)
    FROM unnest(ring_points) AS pt
  );
  
  -- Reconstruct polygon with swapped coordinates
  swapped_geom := ST_MakePolygon(
    ST_MakeLine(swapped_points)
  );
  
  -- Update the parcel
  UPDATE land_parcels 
  SET geom = swapped_geom
  WHERE land_parcels.id = parcel_id;
  
  -- Return result
  RETURN QUERY SELECT 
    parcel_id,
    (SELECT land_parcels.stand FROM land_parcels WHERE land_parcels.id = parcel_id),
    ST_AsText(ST_Centroid(parcel_geom)),
    ST_AsText(ST_Centroid(swapped_geom)),
    'Coordinates swapped successfully'::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Batch fix all swapped parcels
-- UNCOMMENT TO RUN THE FIX (after verifying diagnosis)
/*
DO $$
DECLARE
  parcel_rec RECORD;
  fixed_count INTEGER := 0;
BEGIN
  FOR parcel_rec IN 
    SELECT id, stand
    FROM land_parcels
    WHERE ST_X(ST_Centroid(geom)) > 1000000 
      AND ST_Y(ST_Centroid(geom)) < 200000
  LOOP
    PERFORM swap_parcel_coordinates(parcel_rec.id);
    fixed_count := fixed_count + 1;
    RAISE NOTICE 'Fixed parcel %: %', parcel_rec.id, parcel_rec.stand;
  END LOOP;
  
  RAISE NOTICE 'Total parcels fixed: %', fixed_count;
END $$;
*/

-- Step 5: Create trigger to auto-fix on INSERT/UPDATE (preventive measure)
CREATE OR REPLACE FUNCTION auto_fix_coordinate_swap()
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

-- Apply trigger to land_parcels table
DROP TRIGGER IF EXISTS auto_fix_qgis_coordinates ON land_parcels;
CREATE TRIGGER auto_fix_qgis_coordinates
  BEFORE INSERT OR UPDATE OF geom ON land_parcels
  FOR EACH ROW
  EXECUTE FUNCTION auto_fix_coordinate_swap();

-- Step 6: Verify the fix
SELECT 
  'After Fix - Verification' as step,
  COUNT(*) as total_parcels,
  COUNT(*) FILTER (WHERE ST_X(ST_Centroid(geom)) > 1000000 AND ST_Y(ST_Centroid(geom)) < 200000) as swapped_parcels,
  COUNT(*) FILTER (WHERE ST_X(ST_Centroid(geom)) < 200000 AND ST_Y(ST_Centroid(geom)) > 1000000) as correct_parcels
FROM land_parcels;

-- ============================================================================
-- USAGE INSTRUCTIONS
-- ============================================================================
-- 1. Run Step 1 to diagnose current parcels
-- 2. Run Step 2 to count swapped vs correct parcels
-- 3. If swapped parcels found:
--    a. Uncomment and run Step 4 to batch fix existing parcels
--    b. Step 5 trigger is already created to prevent future swaps
-- 4. Run Step 6 to verify all parcels are now correct
-- ============================================================================

SELECT '✅ Diagnostic script completed. Trigger installed to auto-fix future QGIS imports.' as status;
