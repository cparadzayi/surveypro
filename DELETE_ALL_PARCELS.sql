-- Delete all parcels to test coordinate fix
-- Run this in your PostgreSQL client

DELETE FROM land_parcels;

-- Verify deletion
SELECT COUNT(*) as remaining_parcels FROM land_parcels;
