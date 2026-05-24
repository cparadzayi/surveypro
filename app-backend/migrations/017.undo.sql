-- Undo Migration 017: Drop coordinate_points and land_parcels tables

BEGIN;

-- Drop views
DROP VIEW IF EXISTS land_parcels_full;
DROP VIEW IF EXISTS coordinate_points_full;

-- Drop triggers
DROP TRIGGER IF EXISTS coordinate_points_updated_at ON coordinate_points;
DROP TRIGGER IF EXISTS land_parcels_updated_at ON land_parcels;

-- Note: Don't drop update_updated_at_column() function as it's used by other tables

-- Drop tables
DROP TABLE IF EXISTS land_parcels;
DROP TABLE IF EXISTS coordinate_points;

COMMIT;
