@echo off
echo Fixing parent_property column in surveyor schema...
cd /d "%~dp0"

echo Running Node.js script to add the column...
node check-db.js

echo.
echo If the script fails, run this SQL manually in PostgreSQL:
echo ALTER TABLE surveyor_surveyor_chitsikef.survey_projects ADD COLUMN parent_property VARCHAR(500);
echo.
pause
