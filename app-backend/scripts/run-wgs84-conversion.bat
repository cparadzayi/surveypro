@echo off
echo ========================================
echo WGS84 Coordinate Conversion Script
echo ========================================
echo.
echo This will convert all control points from Cape Datum to WGS84
echo Database: surveypro_v1
echo.
pause

echo.
echo Running conversion script...
echo.

psql -h localhost -U postgres -d surveypro_v1 -f populate-wgs84-cape-datum-correct.sql

echo.
echo ========================================
echo Conversion Complete!
echo ========================================
echo.
echo Checking results...
echo.

psql -h localhost -U postgres -d surveypro_v1 -c "SELECT gauss_lo, COUNT(*) as total, COUNT(lat_wgs84) as with_wgs84, ROUND(100.0 * COUNT(lat_wgs84) / COUNT(*), 2) as percent FROM control_points WHERE gauss_lo IS NOT NULL GROUP BY gauss_lo ORDER BY gauss_lo;"

echo.
echo Sample data (first 3 points from Lo31):
echo.

psql -h localhost -U postgres -d surveypro_v1 -c "SELECT monu_num, ROUND(lat_wgs84::numeric, 6) as lat, ROUND(lng_wgs84::numeric, 6) as lng FROM control_points WHERE gauss_lo = 31 AND lat_wgs84 IS NOT NULL LIMIT 3;"

echo.
pause
