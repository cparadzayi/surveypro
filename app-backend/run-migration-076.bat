@echo off
set PGPASSWORD=cairo2025
psql -U postgres -d surveypro_db -f migrations/076.do.sql
pause
