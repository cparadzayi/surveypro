-- Migration 019: Add area calculation tracking fields to land_parcels
-- Adds fields to track whether area has been calculated and store calculation data

BEGIN;

-- Add area calculation tracking fields
ALTER TABLE land_parcels ADD COLUMN IF NOT EXISTS area_calculated BOOLEAN DEFAULT FALSE;
ALTER TABLE land_parcels ADD COLUMN IF NOT EXISTS centroid_y NUMERIC(15, 3);
ALTER TABLE land_parcels ADD COLUMN IF NOT EXISTS centroid_x NUMERIC(15, 3);
ALTER TABLE land_parcels ADD COLUMN IF NOT EXISTS calculation_data JSONB;

-- Add index for filtering calculated parcels
CREATE INDEX IF NOT EXISTS idx_land_parcels_area_calculated ON land_parcels(area_calculated);

-- Add comments
COMMENT ON COLUMN land_parcels.area_calculated IS 'Whether area has been calculated using shoelace method';
COMMENT ON COLUMN land_parcels.centroid_y IS 'Centroid Y-coordinate (Westing)';
COMMENT ON COLUMN land_parcels.centroid_x IS 'Centroid X-coordinate (Southing)';
COMMENT ON COLUMN land_parcels.calculation_data IS 'Full calculation data including edges, bearings, and residuals';

COMMIT;
