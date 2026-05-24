-- Undo Migration 015: Remove QGIS-style validation and statistics columns

DROP INDEX IF EXISTS idx_land_parcels_shape_type;
DROP INDEX IF EXISTS idx_land_parcels_valid;

ALTER TABLE land_parcels DROP COLUMN IF EXISTS bounding_box;
ALTER TABLE land_parcels DROP COLUMN IF EXISTS has_spikes;
ALTER TABLE land_parcels DROP COLUMN IF EXISTS self_intersections;
ALTER TABLE land_parcels DROP COLUMN IF EXISTS closure_error_m;
ALTER TABLE land_parcels DROP COLUMN IF EXISTS validation_warnings;
ALTER TABLE land_parcels DROP COLUMN IF EXISTS validation_errors;
ALTER TABLE land_parcels DROP COLUMN IF EXISTS is_valid_geometry;
ALTER TABLE land_parcels DROP COLUMN IF EXISTS average_side_m;
ALTER TABLE land_parcels DROP COLUMN IF EXISTS shortest_side_m;
ALTER TABLE land_parcels DROP COLUMN IF EXISTS longest_side_m;
ALTER TABLE land_parcels DROP COLUMN IF EXISTS elongation_ratio;
ALTER TABLE land_parcels DROP COLUMN IF EXISTS shape_type;
ALTER TABLE land_parcels DROP COLUMN IF EXISTS compactness_index;
ALTER TABLE land_parcels DROP COLUMN IF EXISTS perimeter_m;
