-- Undo migration: Remove project meridian selections cache table

BEGIN;

DROP TABLE IF EXISTS project_meridian_cache;

COMMIT;
