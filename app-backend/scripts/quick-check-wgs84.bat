@echo off
echo Checking WGS84 coordinates in database...
echo.

psql -h localhost -U postgres -d surveypro_v1 -c "SELECT monu_num, ROUND(lat_wgs84::numeric, 6) as lat, ROUND(lng_wgs84::numeric, 6) as lng FROM control_points WHERE gauss_lo = 31 LIMIT 5;"

echo.
echo Checking count with WGS84...
psql -h localhost -U postgres -d surveypro_v1 -c "SELECT COUNT(*) as total, COUNT(lat_wgs84) as with_wgs84 FROM control_points WHERE gauss_lo = 31;"

echo.
pause
