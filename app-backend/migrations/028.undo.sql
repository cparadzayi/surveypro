-- Undo Migration 028: Remove WGS84 coordinates from control_points table

BEGIN;

-- Drop indexes
DROP INDEX IF EXISTS idx_control_points_lat_wgs84;
DROP INDEX IF EXISTS idx_control_points_lng_wgs84;

-- Drop columns
ALTER TABLE control_points 
  DROP COLUMN IF EXISTS lat_wgs84,
  DROP COLUMN IF EXISTS lng_wgs84;

COMMIT;
