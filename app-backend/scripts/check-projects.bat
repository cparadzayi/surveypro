@echo off
echo ========================================
echo   Checking Survey Projects Database
echo ========================================
echo.

psql -h localhost -U postgres -d surveypro_v1 -f scripts/check-projects.sql

echo.
echo ========================================
echo   Check Complete
echo ========================================
pause
