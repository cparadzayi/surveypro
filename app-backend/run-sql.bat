@echo off
echo Running SQL to check/add parent_property column...
psql -U postgres -d surveypro_v1 -f fix-parent-property.sql
echo Done.
pause
