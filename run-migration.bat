@echo off
echo Running database migration...
cd app-backend
node scripts/migrate.js
pause
