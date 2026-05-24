-- ============================================================================
-- Diagnostic Query: Check WGS84 Coverage in Control Points Table
-- ============================================================================

-- 1. Count total points and those with WGS84 coordinates
SELECT 
  COUNT(*) as total_points,
  COUNT(y_gauss) as with_gauss_coords,
  COUNT(lat_wgs84) as with_wgs84_coords,
  COUNT(*) - COUNT(lat_wgs84) as missing_wgs84,
  ROUND(100.0 * COUNT(lat_wgs84) / NULLIF(COUNT(*), 0), 2) as wgs84_coverage_percent
FROM control_points;

-- 2. Breakdown by central meridian
SELECT 
  gauss_lo,
  COUNT(*) as total_points,
  COUNT(lat_wgs84) as with_wgs84,
  COUNT(*) - COUNT(lat_wgs84) as missing_wgs84,
  ROUND(100.0 * COUNT(lat_wgs84) / NULLIF(COUNT(*), 0), 2) as coverage_percent
FROM control_points
WHERE gauss_lo IS NOT NULL
GROUP BY gauss_lo
ORDER BY gauss_lo;

-- 3. Sample control points (first 10) showing both coordinate systems
SELECT 
  id,
  monu_num,
  monu_name,
  type,
  gauss_lo,
  ROUND(y_gauss::numeric, 2) as y_gauss,
  ROUND(x_gauss::numeric, 2) as x_gauss,
  ROUND(lat_wgs84::numeric, 6) as lat_wgs84,
  ROUND(lng_wgs84::numeric, 6) as lng_wgs84,
  CASE 
    WHEN lat_wgs84 IS NULL THEN '❌ Missing WGS84'
    WHEN lat_wgs84 BETWEEN -23 AND -15 AND lng_wgs84 BETWEEN 25 AND 34 THEN '✅ Valid'
    ELSE '⚠️ Out of range'
  END as status
FROM control_points
ORDER BY gauss_lo, id
LIMIT 10;

-- 4. Check if PostGIS is installed (required for transformation)
SELECT 
  EXISTS(
    SELECT 1 FROM pg_extension WHERE extname = 'postgis'
  ) as postgis_installed;

-- ============================================================================
-- SOLUTION: Run the WGS84 population script if coverage is low
-- ============================================================================
-- If wgs84_coverage_percent is < 100%, run this:
-- \i app-backend/scripts/populate-wgs84-cape-datum-correct.sql
