-- Undo Migration 035: Remove dynamic project view functions

DROP FUNCTION IF EXISTS create_project_views(INTEGER);
DROP FUNCTION IF EXISTS drop_project_views(INTEGER);
DROP FUNCTION IF EXISTS list_project_views();
