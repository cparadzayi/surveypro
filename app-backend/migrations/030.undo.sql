-- Undo Migration 030: Remove closure_ratio column

ALTER TABLE land_parcels 
DROP COLUMN IF EXISTS closure_ratio;
