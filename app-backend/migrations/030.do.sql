-- Migration 030: Add closure_ratio column to land_parcels
-- This column was missing from migration 029

-- Add closure_ratio column
ALTER TABLE land_parcels 
ADD COLUMN IF NOT EXISTS closure_ratio VARCHAR(50);

-- Add comment
COMMENT ON COLUMN land_parcels.closure_ratio IS 'Closure ratio in format 1:XXXX';
