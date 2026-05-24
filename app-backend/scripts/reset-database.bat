@echo off
REM ============================================
REM SurveyPro Database Reset Script
REM ============================================
REM This script will:
REM 1. Backup current database (optional)
REM 2. Drop existing database
REM 3. Create fresh database
REM 4. Migrations will run automatically on server start
REM ============================================

echo.
echo ========================================
echo   SurveyPro Database Reset
echo ========================================
echo.
echo WARNING: This will DELETE ALL DATA in the database!
echo.
set /p CONFIRM="Are you sure you want to continue? (yes/no): "

if /i not "%CONFIRM%"=="yes" (
    echo.
    echo Reset cancelled.
    pause
    exit /b
)

echo.
echo ========================================
echo Step 1: Backup Current Database
echo ========================================
echo.
set /p BACKUP="Do you want to backup the current database? (yes/no): "

if /i "%BACKUP%"=="yes" (
    echo Creating backup...
    set BACKUP_FILE=backup-pre-reset-%date:~-4,4%%date:~-7,2%%date:~-10,2%_%time:~0,2%%time:~3,2%%time:~6,2%.dump
    set BACKUP_FILE=%BACKUP_FILE: =0%
    
    pg_dump -h localhost -U postgres -d surveypro_app -F c -f %BACKUP_FILE%
    
    if %ERRORLEVEL% EQU 0 (
        echo Backup created successfully: %BACKUP_FILE%
    ) else (
        echo ERROR: Backup failed!
        echo Please check your PostgreSQL connection.
        pause
        exit /b 1
    )
) else (
    echo Skipping backup...
)

echo.
echo ========================================
echo Step 2: Drop Existing Database
echo ========================================
echo.
echo Dropping database surveypro_app...

psql -h localhost -U postgres -c "DROP DATABASE IF EXISTS surveypro_app;"

if %ERRORLEVEL% EQU 0 (
    echo Database dropped successfully.
) else (
    echo ERROR: Failed to drop database!
    echo Make sure:
    echo   1. PostgreSQL is running
    echo   2. No connections to surveypro_app database
    echo   3. Backend server is stopped
    pause
    exit /b 1
)

echo.
echo ========================================
echo Step 3: Create Fresh Database
echo ========================================
echo.
echo Creating new database surveypro_app...

psql -h localhost -U postgres -c "CREATE DATABASE surveypro_app;"

if %ERRORLEVEL% EQU 0 (
    echo Database created successfully.
) else (
    echo ERROR: Failed to create database!
    pause
    exit /b 1
)

echo.
echo ========================================
echo Step 4: Grant Permissions
echo ========================================
echo.
echo Granting permissions...

psql -h localhost -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE surveypro_app TO postgres;"

if %ERRORLEVEL% EQU 0 (
    echo Permissions granted successfully.
) else (
    echo WARNING: Failed to grant permissions (may not be needed)
)

echo.
echo ========================================
echo   Database Reset Complete!
echo ========================================
echo.
echo Next steps:
echo   1. Start the backend server: npm start
echo   2. Migrations will run automatically
echo   3. Open frontend: http://localhost:5173
echo   4. Register first user
echo   5. Import control points (if needed)
echo.
echo IMPORTANT: Update .env file with production settings!
echo   - Generate new JWT_SECRET
echo   - Set secure database password
echo   - Configure for production environment
echo.
pause
