-- Quick check: Sample control points with WGS84 coordinates
-- This verifies the database has the transformed coordinates

SELECT 
  monu_num,
  monu_name,
  gauss_lo,
  ROUND(y_gauss::numeric, 2) as y_gauss,
  ROUND(x_gauss::numeric, 2) as x_gauss,
  ROUND(lat_wgs84::numeric, 6) as lat_wgs84,
  ROUND(lng_wgs84::numeric, 6) as lng_wgs84,
  area_nm,
  CASE 
    WHEN lat_wgs84 IS NULL THEN '❌ Missing'
    WHEN lat_wgs84 BETWEEN -23 AND -15 AND lng_wgs84 BETWEEN 25 AND 34 THEN '✅ Valid'
    ELSE '⚠️ Out of range'
  END as status
FROM control_points
WHERE gauss_lo = 31
ORDER BY id
LIMIT 20;

-- Summary
SELECT 
  gauss_lo,
  COUNT(*) as total,
  COUNT(lat_wgs84) as with_wgs84,
  COUNT(*) - COUNT(lat_wgs84) as missing_wgs84,
  ROUND(100.0 * COUNT(lat_wgs84) / COUNT(*), 2) as percent_complete
FROM control_points
WHERE gauss_lo IS NOT NULL
GROUP BY gauss_lo
ORDER BY gauss_lo;
