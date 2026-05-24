-- Migration 020: Add closure error field to land_parcels
-- Adds closure_error_m field to store calculation closure error

BEGIN;

-- Add closure error field
ALTER TABLE land_parcels ADD COLUMN IF NOT EXISTS closure_error_m NUMERIC(15, 3);

-- Add comment
COMMENT ON COLUMN land_parcels.closure_error_m IS 'Closure error in meters from area calculation';

COMMIT;
