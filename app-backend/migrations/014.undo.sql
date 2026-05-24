-- Undo Migration 014: Drop land_parcels table

DROP INDEX IF EXISTS idx_land_parcels_status;
DROP INDEX IF EXISTS idx_land_parcels_project_id;
DROP TABLE IF EXISTS land_parcels;
