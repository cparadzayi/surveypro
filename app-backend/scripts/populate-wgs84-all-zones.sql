-- ============================================
-- Populate WGS84 Coordinates for ALL Lo Zones
-- ============================================
-- This script converts Gauss-Conformal coordinates to WGS84
-- for all control points across all Zimbabwe Lo zones
-- 
-- Zimbabwe Lo Zones and their EPSG codes:
-- Lo25: EPSG:2045 (Western zone - rare)
-- Lo27: EPSG:2046 (Western zone)
-- Lo29: EPSG:2047 (West-central zone)
-- Lo31: EPSG:2048 (East-central zone - most common)
-- Lo33: EPSG:2049 (Eastern zone)
-- ============================================

BEGIN;

-- Step 1: Install PostGIS extension (if not already installed)
CREATE EXTENSION IF NOT EXISTS postgis;

-- Step 2: Add geometry columns (if not already added)
ALTER TABLE control_points 
  ADD COLUMN IF NOT EXISTS geom_gauss GEOMETRY(Point),
  ADD COLUMN IF NOT EXISTS geom_wgs84 GEOMETRY(Point, 4326);

-- Step 3: Create spatial index
CREATE INDEX IF NOT EXISTS idx_control_points_geom_gauss ON control_points USING GIST(geom_gauss);
CREATE INDEX IF NOT EXISTS idx_control_points_geom_wgs84 ON control_points USING GIST(geom_wgs84);

-- ============================================
-- Step 4: Populate Gauss geometry for each Lo zone
-- ============================================

-- Lo25 (EPSG:2045) - Western zone
UPDATE control_points
SET geom_gauss = ST_SetSRID(ST_MakePoint(x_gauss, y_gauss), 2045)
WHERE gauss_lo = 25 
  AND x_gauss IS NOT NULL 
  AND y_gauss IS NOT NULL
  AND geom_gauss IS NULL;

-- Lo27 (EPSG:2046) - Western zone
UPDATE control_points
SET geom_gauss = ST_SetSRID(ST_MakePoint(x_gauss, y_gauss), 2046)
WHERE gauss_lo = 27 
  AND x_gauss IS NOT NULL 
  AND y_gauss IS NOT NULL
  AND geom_gauss IS NULL;

-- Lo29 (EPSG:2047) - West-central zone
UPDATE control_points
SET geom_gauss = ST_SetSRID(ST_MakePoint(x_gauss, y_gauss), 2047)
WHERE gauss_lo = 29 
  AND x_gauss IS NOT NULL 
  AND y_gauss IS NOT NULL
  AND geom_gauss IS NULL;

-- Lo31 (EPSG:2048) - East-central zone (most common)
UPDATE control_points
SET geom_gauss = ST_SetSRID(ST_MakePoint(x_gauss, y_gauss), 2048)
WHERE gauss_lo = 31 
  AND x_gauss IS NOT NULL 
  AND y_gauss IS NOT NULL
  AND geom_gauss IS NULL;

-- Lo33 (EPSG:2049) - Eastern zone
UPDATE control_points
SET geom_gauss = ST_SetSRID(ST_MakePoint(x_gauss, y_gauss), 2049)
WHERE gauss_lo = 33 
  AND x_gauss IS NOT NULL 
  AND y_gauss IS NOT NULL
  AND geom_gauss IS NULL;

-- ============================================
-- Step 5: Transform all Gauss geometries to WGS84
-- ============================================

UPDATE control_points
SET geom_wgs84 = ST_Transform(geom_gauss, 4326)
WHERE geom_gauss IS NOT NULL 
  AND geom_wgs84 IS NULL;

-- ============================================
-- Step 6: Extract lat/lng to dedicated columns
-- ============================================

UPDATE control_points
SET 
  lat_wgs84 = ST_Y(geom_wgs84),
  lng_wgs84 = ST_X(geom_wgs84)
WHERE geom_wgs84 IS NOT NULL 
  AND (lat_wgs84 IS NULL OR lng_wgs84 IS NULL);

-- ============================================
-- Step 7: Validation and Statistics
-- ============================================

-- Show statistics by Lo zone
SELECT 
  gauss_lo,
  COUNT(*) as total_points,
  COUNT(geom_gauss) as with_gauss_geom,
  COUNT(geom_wgs84) as with_wgs84_geom,
  COUNT(lat_wgs84) as with_wgs84_coords,
  ROUND(100.0 * COUNT(lat_wgs84) / NULLIF(COUNT(*), 0), 2) as coverage_percent
FROM control_points
GROUP BY gauss_lo
ORDER BY gauss_lo;

-- Show sample of converted coordinates
SELECT 
  monu_num,
  monu_name,
  gauss_lo,
  ROUND(y_gauss::numeric, 2) as y_gauss,
  ROUND(x_gauss::numeric, 2) as x_gauss,
  ROUND(lat_wgs84::numeric, 6) as lat_wgs84,
  ROUND(lng_wgs84::numeric, 6) as lng_wgs84,
  area_nm
FROM control_points
WHERE lat_wgs84 IS NOT NULL
ORDER BY gauss_lo, monu_num
LIMIT 20;

-- Validate coordinate ranges for Zimbabwe
SELECT 
  COUNT(*) as total_converted,
  COUNT(CASE WHEN lat_wgs84 BETWEEN -23 AND -15 THEN 1 END) as valid_latitude,
  COUNT(CASE WHEN lng_wgs84 BETWEEN 25 AND 34 THEN 1 END) as valid_longitude,
  COUNT(CASE WHEN lat_wgs84 BETWEEN -23 AND -15 AND lng_wgs84 BETWEEN 25 AND 34 THEN 1 END) as fully_valid
FROM control_points
WHERE lat_wgs84 IS NOT NULL;

-- Show any points with invalid coordinates (outside Zimbabwe)
SELECT 
  monu_num,
  monu_name,
  gauss_lo,
  lat_wgs84,
  lng_wgs84,
  area_nm
FROM control_points
WHERE lat_wgs84 IS NOT NULL
  AND (lat_wgs84 NOT BETWEEN -23 AND -15 OR lng_wgs84 NOT BETWEEN 25 AND 34)
ORDER BY monu_num;

COMMIT;

-- ============================================
-- Summary Message
-- ============================================

DO $$
DECLARE
  total_points INTEGER;
  converted_points INTEGER;
  coverage_pct NUMERIC;
BEGIN
  SELECT COUNT(*) INTO total_points FROM control_points;
  SELECT COUNT(*) INTO converted_points FROM control_points WHERE lat_wgs84 IS NOT NULL;
  coverage_pct := ROUND(100.0 * converted_points / NULLIF(total_points, 0), 2);
  
  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'WGS84 Coordinate Conversion Complete!';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Total control points: %', total_points;
  RAISE NOTICE 'Converted to WGS84: %', converted_points;
  RAISE NOTICE 'Coverage: %% ', coverage_pct;
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
END $$;
