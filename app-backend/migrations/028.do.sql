-- Migration 028: Add WGS84 coordinates to control_points table
-- Purpose: Enable distance-based searches for control point auto-selection
-- Created: 2025-11-23

BEGIN;

-- Add WGS84 coordinate columns
ALTER TABLE control_points 
  ADD COLUMN IF NOT EXISTS lat_wgs84 NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS lng_wgs84 NUMERIC(10, 7);

-- Add indexes for spatial queries
CREATE INDEX IF NOT EXISTS idx_control_points_lat_wgs84 ON control_points(lat_wgs84);
CREATE INDEX IF NOT EXISTS idx_control_points_lng_wgs84 ON control_points(lng_wgs84);

-- Add comments
COMMENT ON COLUMN control_points.lat_wgs84 IS 'Latitude in WGS84 decimal degrees';
COMMENT ON COLUMN control_points.lng_wgs84 IS 'Longitude in WGS84 decimal degrees';

-- Note: WGS84 coordinates need to be populated via coordinate transformation
-- from Gauss-Conformal (y_gauss, x_gauss) using appropriate conversion tools
-- or imported from external sources

COMMIT;
