-- Undo Migration 019: Remove area calculation tracking fields

BEGIN;

-- Drop index
DROP INDEX IF EXISTS idx_land_parcels_area_calculated;

-- Remove columns
ALTER TABLE land_parcels DROP COLUMN IF EXISTS calculation_data;
ALTER TABLE land_parcels DROP COLUMN IF EXISTS centroid_x;
ALTER TABLE land_parcels DROP COLUMN IF EXISTS centroid_y;
ALTER TABLE land_parcels DROP COLUMN IF EXISTS area_calculated;

COMMIT;
