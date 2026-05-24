@echo off
echo ========================================
echo Fixing Charles Paradzayi's Projects
echo ========================================
echo.

cd /d "%~dp0"
node scripts/fix-charles-projects.js

echo.
echo ========================================
echo Fix Complete!
echo ========================================
pause
