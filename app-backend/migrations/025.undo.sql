-- Undo Migration 025: Drop parcels table

-- Drop trigger and function
DROP TRIGGER IF EXISTS trigger_update_parcels_updated_at ON parcels;
DROP FUNCTION IF EXISTS update_parcels_updated_at();

-- Drop indexes
DROP INDEX IF EXISTS idx_parcels_created_at;
DROP INDEX IF EXISTS idx_parcels_geometry;
DROP INDEX IF EXISTS idx_parcels_designation;
DROP INDEX IF EXISTS idx_parcels_status;
DROP INDEX IF EXISTS idx_parcels_project_id;

-- Drop table
DROP TABLE IF EXISTS parcels;
