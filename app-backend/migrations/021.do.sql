-- Migration 021: Add area_m2 column to land_parcels
-- Adds area_m2 field to store calculated area in square meters

BEGIN;

-- Add area_m2 column
ALTER TABLE land_parcels 
  ADD COLUMN IF NOT EXISTS area_m2 NUMERIC(15, 3);

-- Add comment
COMMENT ON COLUMN land_parcels.area_m2 IS 'Calculated area in square meters';

COMMIT;
