@echo off
REM PGPASSWORD was previously hardcoded here and committed. psql now reads the
REM password from the environment or from a ~/.pgpass / PGPASSFILE entry.
REM Also corrected the database name: this pointed at surveypro_db, but the
REM configured database is surveypro_app.
psql -U postgres -d surveypro_app -f migrations/076.do.sql
pause