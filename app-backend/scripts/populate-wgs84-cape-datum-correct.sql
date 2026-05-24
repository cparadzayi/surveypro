-- ============================================================================
-- WGS84 Coordinate Population for Zimbabwe Control Points
-- Using CORRECT Cape Datum EPSG Codes
-- ============================================================================
--
-- CRITICAL DISCOVERY:
-- Zimbabwe uses Cape Datum (Clarke 1880 Arc ellipsoid) NOT Arc 1950!
-- The previous script used incorrect EPSG codes (2045-2049) which are for 
-- Hartebeesthoek94 datum, causing coordinates in wrong hemisphere.
--
-- CORRECT EPSG CODES FOR CAPE DATUM:
-- - Lo25: EPSG:22285 (Cape / Lo25)
-- - Lo27: EPSG:22287 (Cape / Lo27)
-- - Lo29: EPSG:22289 (Cape / Lo29)
-- - Lo31: EPSG:22291 (Cape / Lo31)
-- - Lo33: EPSG:22293 (Cape / Lo33)
--
-- Datum Parameters:
-- - Ellipsoid: Clarke 1880 (Arc) - a=6378249.145m, 1/f=293.4663077
-- - TOWGS84: -136,-108,-292,0,0,0,0
-- - Projection: Transverse Mercator (South Orientated)
-- - Axis Order: Y (westing), X (southing)
--
-- Expected WGS84 Coordinates for Zimbabwe:
-- - Latitude: -15° to -23° (southern hemisphere)
-- - Longitude: 25° to 34° (eastern hemisphere)
--
-- ============================================================================

BEGIN;

-- Ensure PostGIS is available
CREATE EXTENSION IF NOT EXISTS postgis;

-- Add WGS84 coordinate columns if they don't exist
ALTER TABLE control_points 
  ADD COLUMN IF NOT EXISTS lat_wgs84 DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng_wgs84 DOUBLE PRECISION;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_control_points_wgs84_lat ON control_points(lat_wgs84);
CREATE INDEX IF NOT EXISTS idx_control_points_wgs84_lng ON control_points(lng_wgs84);

-- Clear any existing incorrect WGS84 coordinates
UPDATE control_points SET lat_wgs84 = NULL, lng_wgs84 = NULL;

-- ============================================================================
-- TRANSFORMATION FUNCTION
-- ============================================================================
-- This function transforms Cape Datum Gauss-Conformal coordinates to WGS84
-- using the correct EPSG codes and handles the South Orientated axis order.
--
-- CRITICAL: Cape Datum uses South Orientated projection where:
-- - Y axis points WEST (not East)
-- - X axis points SOUTH (not North)
-- - Therefore, coordinates are stored as (Y_westing, X_southing)
-- ============================================================================

DO $$
DECLARE
  rec RECORD;
  gauss_point geometry;
  wgs84_point geometry;
  epsg_code INTEGER;
  point_count INTEGER := 0;
  success_count INTEGER := 0;
  error_count INTEGER := 0;
BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Starting WGS84 Coordinate Transformation';
  RAISE NOTICE 'Using CORRECT Cape Datum EPSG Codes';
  RAISE NOTICE '============================================================================';
  
  -- Loop through all control points with Gauss coordinates
  FOR rec IN 
    SELECT id, monu_num, gauss_lo, y_gauss, x_gauss, area_nm
    FROM control_points 
    WHERE y_gauss IS NOT NULL 
      AND x_gauss IS NOT NULL 
      AND gauss_lo IS NOT NULL
    ORDER BY gauss_lo, id
  LOOP
    point_count := point_count + 1;
    
    BEGIN
      -- Determine correct EPSG code based on Lo zone
      epsg_code := CASE rec.gauss_lo
        WHEN 25 THEN 22285  -- Cape / Lo25
        WHEN 27 THEN 22287  -- Cape / Lo27
        WHEN 29 THEN 22289  -- Cape / Lo29
        WHEN 31 THEN 22291  -- Cape / Lo31
        WHEN 33 THEN 22293  -- Cape / Lo33
        ELSE NULL
      END;
      
      IF epsg_code IS NULL THEN
        RAISE WARNING 'Point % (%) has invalid Lo zone: %', rec.monu_num, rec.id, rec.gauss_lo;
        error_count := error_count + 1;
        CONTINUE;
      END IF;
      
      -- Create geometry point from Gauss coordinates
      -- CRITICAL: Use ST_MakePoint(Y, X) because Cape Datum is South Orientated
      -- Y = westing (first coordinate), X = southing (second coordinate)
      gauss_point := ST_SetSRID(ST_MakePoint(rec.y_gauss, rec.x_gauss), epsg_code);
      
      -- Transform to WGS84 (EPSG:4326)
      wgs84_point := ST_Transform(gauss_point, 4326);
      
      -- Extract latitude and longitude
      -- ST_Y = latitude, ST_X = longitude
      UPDATE control_points
      SET 
        lat_wgs84 = ST_Y(wgs84_point),
        lng_wgs84 = ST_X(wgs84_point)
      WHERE id = rec.id;
      
      success_count := success_count + 1;
      
      -- Log progress every 1000 points
      IF point_count % 1000 = 0 THEN
        RAISE NOTICE 'Processed % points... (% successful, % errors)', point_count, success_count, error_count;
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Error transforming point % (%): %', rec.monu_num, rec.id, SQLERRM;
      error_count := error_count + 1;
    END;
  END LOOP;
  
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Transformation Complete';
  RAISE NOTICE 'Total points processed: %', point_count;
  RAISE NOTICE 'Successful transformations: %', success_count;
  RAISE NOTICE 'Errors: %', error_count;
  RAISE NOTICE '============================================================================';
END $$;

-- ============================================================================
-- VALIDATION QUERIES
-- ============================================================================

-- 1. Coverage by Lo Zone
SELECT 
  gauss_lo,
  COUNT(*) as total_points,
  COUNT(lat_wgs84) as with_wgs84_coords,
  ROUND(100.0 * COUNT(lat_wgs84) / COUNT(*), 2) as coverage_percent
FROM control_points
WHERE gauss_lo IS NOT NULL
GROUP BY gauss_lo
ORDER BY gauss_lo;

-- 2. Sample Transformed Points (First 20 from each zone)
SELECT 
  monu_num,
  monu_name,
  gauss_lo,
  y_gauss,
  x_gauss,
  ROUND(lat_wgs84::numeric, 6) as lat_wgs84,
  ROUND(lng_wgs84::numeric, 6) as lng_wgs84,
  area_nm
FROM control_points
WHERE lat_wgs84 IS NOT NULL
ORDER BY gauss_lo, id
LIMIT 20;

-- 3. Coordinate Range Validation (Zimbabwe should be -15° to -23° lat, 25° to 34° lng)
SELECT 
  COUNT(*) as total_converted,
  COUNT(CASE WHEN lat_wgs84 BETWEEN -23 AND -15 THEN 1 END) as valid_latitude,
  COUNT(CASE WHEN lng_wgs84 BETWEEN 25 AND 34 THEN 1 END) as valid_longitude,
  COUNT(CASE WHEN lat_wgs84 BETWEEN -23 AND -15 AND lng_wgs84 BETWEEN 25 AND 34 THEN 1 END) as fully_valid
FROM control_points
WHERE lat_wgs84 IS NOT NULL;

-- 4. Out-of-Range Points (Should be ZERO for Zimbabwe)
SELECT 
  monu_num,
  monu_name,
  gauss_lo,
  ROUND(lat_wgs84::numeric, 6) as lat_wgs84,
  ROUND(lng_wgs84::numeric, 6) as lng_wgs84,
  area_nm,
  CASE 
    WHEN lat_wgs84 NOT BETWEEN -23 AND -15 THEN 'Invalid Latitude'
    WHEN lng_wgs84 NOT BETWEEN 25 AND 34 THEN 'Invalid Longitude'
  END as issue
FROM control_points
WHERE lat_wgs84 IS NOT NULL
  AND (lat_wgs84 NOT BETWEEN -23 AND -15 OR lng_wgs84 NOT BETWEEN 25 AND 34)
ORDER BY gauss_lo, monu_num
LIMIT 50;

-- 5. Summary Statistics
SELECT 
  'Latitude' as coordinate,
  ROUND(MIN(lat_wgs84)::numeric, 6) as min_value,
  ROUND(MAX(lat_wgs84)::numeric, 6) as max_value,
  ROUND(AVG(lat_wgs84)::numeric, 6) as avg_value
FROM control_points
WHERE lat_wgs84 IS NOT NULL
UNION ALL
SELECT 
  'Longitude' as coordinate,
  ROUND(MIN(lng_wgs84)::numeric, 6) as min_value,
  ROUND(MAX(lng_wgs84)::numeric, 6) as max_value,
  ROUND(AVG(lng_wgs84)::numeric, 6) as avg_value
FROM control_points
WHERE lng_wgs84 IS NOT NULL;

COMMIT;

-- ============================================================================
-- EXPECTED RESULTS
-- ============================================================================
-- After running this script, you should see:
--
-- 1. Coverage: 100% for all Lo zones (25, 27, 29, 31, 33)
--
-- 2. Sample coordinates should be in Zimbabwe range:
--    - Harare area (Lo31): ~-17.8°, ~31.0°
--    - Bulawayo area (Lo29): ~-20.1°, ~28.6°
--    - Victoria Falls (Lo27): ~-17.9°, ~25.8°
--
-- 3. Validation: fully_valid count should equal total_converted
--
-- 4. Out-of-range: Should return 0 rows
--
-- 5. Statistics:
--    - Latitude: -23° to -15° (Zimbabwe spans this range)
--    - Longitude: 25° to 34° (Zimbabwe spans this range)
--
-- ============================================================================
