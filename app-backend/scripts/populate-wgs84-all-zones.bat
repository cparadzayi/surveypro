@echo off
REM ============================================
REM Populate WGS84 Coordinates for All Lo Zones
REM ============================================
REM This script runs the SQL conversion for all
REM Zimbabwe Lo zones (25, 27, 29, 31, 33)
REM ============================================

echo.
echo ========================================
echo   WGS84 Coordinate Conversion
echo   All Zimbabwe Lo Zones
echo ========================================
echo.
echo This will convert Gauss-Conformal coordinates to WGS84
echo for ALL control points in the database.
echo.
echo Lo Zones: 25, 27, 29, 31, 33
echo.
set /p CONFIRM="Continue? (yes/no): "

if /i not "%CONFIRM%"=="yes" (
    echo.
    echo Conversion cancelled.
    pause
    exit /b
)

echo.
echo ========================================
echo Step 1: Check PostGIS Installation
echo ========================================
echo.

psql -h localhost -U postgres -d surveypro_v1 -c "SELECT PostGIS_Version();" 2>nul

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: PostGIS is not installed!
    echo.
    echo Please install PostGIS first:
    echo   1. Download from: https://postgis.net/windows_downloads/
    echo   2. Or use PostgreSQL Stack Builder
    echo   3. Install PostGIS extension for PostgreSQL
    echo.
    pause
    exit /b 1
)

echo PostGIS is installed ✓

echo.
echo ========================================
echo Step 2: Running Conversion Script
echo ========================================
echo.
echo This may take a few minutes depending on the number of control points...
echo.

psql -h localhost -U postgres -d surveypro_v1 -f scripts/populate-wgs84-all-zones.sql

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo   Conversion Complete!
    echo ========================================
    echo.
    echo Next steps:
    echo   1. Restart backend server
    echo   2. Test control point auto-selection
    echo   3. Check console logs for WGS84 coordinates
    echo.
) else (
    echo.
    echo ========================================
    echo   ERROR: Conversion Failed
    echo ========================================
    echo.
    echo Please check:
    echo   1. PostgreSQL is running
    echo   2. Database 'surveypro_v1' exists
    echo   3. You have correct permissions
    echo   4. PostGIS is properly installed
    echo.
)

pause
