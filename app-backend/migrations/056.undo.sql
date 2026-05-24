-- Migration 056 Undo: Remove Vertex Labeling Support

BEGIN;

-- Drop helper functions
DROP FUNCTION IF EXISTS update_parcel_vertices(INTEGER, TEXT[]);
DROP FUNCTION IF EXISTS extract_vertices_from_geometry(GEOMETRY, TEXT);

-- Reset metadata column comment to original
COMMENT ON COLUMN land_parcels.metadata IS 'JSONB metadata for land parcel';

COMMIT;
