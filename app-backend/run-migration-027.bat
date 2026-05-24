@echo off
REM Migration 027: Apply Survey Type, Stand Reference, and Township columns
REM Date: 2025-01-22

echo ========================================
echo Migration 027: Project Setup Enhancement
echo ========================================
echo.

REM Check if PostgreSQL is accessible
echo Checking PostgreSQL connection...
psql -U postgres -d surveypro -c "SELECT version();" > nul 2>&1
if errorlevel 1 (
    echo ERROR: Cannot connect to PostgreSQL database
    echo Please ensure PostgreSQL is running and credentials are correct
    pause
    exit /b 1
)

echo PostgreSQL connection: OK
echo.

REM Backup database
echo Creating backup...
set BACKUP_FILE=backup_before_027_%date:~-4,4%%date:~-10,2%%date:~-7,2%_%time:~0,2%%time:~3,2%%time:~6,2%.sql
set BACKUP_FILE=%BACKUP_FILE: =0%
pg_dump -U postgres surveypro > %BACKUP_FILE%
if errorlevel 1 (
    echo ERROR: Backup failed
    pause
    exit /b 1
)

echo Backup created: %BACKUP_FILE%
echo.

REM Show current table structure
echo Current survey_projects table structure:
psql -U postgres -d surveypro -c "\d survey_projects"
echo.

REM Confirm migration
echo Ready to apply migration 027
echo This will add the following columns:
echo   - survey_type (VARCHAR 50)
echo   - stand_reference (VARCHAR 255)
echo   - township (VARCHAR 255)
echo.
set /p CONFIRM=Continue with migration? (y/n): 

if /i not "%CONFIRM%"=="y" (
    echo Migration cancelled
    pause
    exit /b 0
)

echo.
echo Applying migration...
psql -U postgres -d surveypro -f migrations/027.do.sql
if errorlevel 1 (
    echo.
    echo ERROR: Migration failed!
    echo Backup file: %BACKUP_FILE%
    echo To rollback: psql -U postgres -d surveypro -f migrations/027.undo.sql
    pause
    exit /b 1
)

echo.
echo Migration applied successfully!
echo.

REM Verify migration
echo Verifying new columns...
psql -U postgres -d surveypro -c "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'survey_projects' AND column_name IN ('survey_type', 'stand_reference', 'township');"
echo.

echo Verifying indexes...
psql -U postgres -d surveypro -c "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'survey_projects' AND indexname LIKE 'idx_survey_projects_%%';"
echo.

echo ========================================
echo Migration 027: COMPLETE
echo ========================================
echo.
echo Backup file: %BACKUP_FILE%
echo.
echo Next steps:
echo 1. Test application with new project
echo 2. Verify DSG Certificate auto-population
echo 3. Monitor application logs
echo.
echo To rollback if needed:
echo   psql -U postgres -d surveypro -f migrations/027.undo.sql
echo.

pause
