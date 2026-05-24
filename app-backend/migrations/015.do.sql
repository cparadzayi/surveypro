-- Migration 015: Enhance land_parcels table with QGIS-style validation and statistics
-- Adds perimeter, compactness, shape classification, and validation fields

-- Add perimeter and compactness measurements
ALTER TABLE land_parcels ADD COLUMN IF NOT EXISTS perimeter_m NUMERIC(15, 3);
ALTER TABLE land_parcels ADD COLUMN IF NOT EXISTS compactness_index NUMERIC(10, 6);

-- Add shape statistics
ALTER TABLE land_parcels ADD COLUMN IF NOT EXISTS shape_type VARCHAR(30);
ALTER TABLE land_parcels ADD COLUMN IF NOT EXISTS elongation_ratio NUMERIC(10, 3);
ALTER TABLE land_parcels ADD COLUMN IF NOT EXISTS longest_side_m NUMERIC(15, 3);
ALTER TABLE land_parcels ADD COLUMN IF NOT EXISTS shortest_side_m NUMERIC(15, 3);
ALTER TABLE land_parcels ADD COLUMN IF NOT EXISTS average_side_m NUMERIC(15, 3);

-- Add validation fields
ALTER TABLE land_parcels ADD COLUMN IF NOT EXISTS is_valid_geometry BOOLEAN DEFAULT true;
ALTER TABLE land_parcels ADD COLUMN IF NOT EXISTS validation_errors TEXT[];
ALTER TABLE land_parcels ADD COLUMN IF NOT EXISTS validation_warnings TEXT[];
ALTER TABLE land_parcels ADD COLUMN IF NOT EXISTS closure_error_m NUMERIC(10, 3);
ALTER TABLE land_parcels ADD COLUMN IF NOT EXISTS self_intersections INTEGER DEFAULT 0;
ALTER TABLE land_parcels ADD COLUMN IF NOT EXISTS has_spikes INTEGER DEFAULT 0;

-- Add bounding box for spatial queries
ALTER TABLE land_parcels ADD COLUMN IF NOT EXISTS bounding_box NUMERIC[4]; -- [minY, minX, maxY, maxX]

-- Add comments for documentation
COMMENT ON COLUMN land_parcels.perimeter_m IS 'Polygon perimeter in meters';
COMMENT ON COLUMN land_parcels.compactness_index IS 'Polsby-Popper compactness index (0-1, circle=1)';
COMMENT ON COLUMN land_parcels.shape_type IS 'Shape classification: Regular, Moderate, Irregular, Highly Irregular';
COMMENT ON COLUMN land_parcels.elongation_ratio IS 'Bounding box length/width ratio';
COMMENT ON COLUMN land_parcels.is_valid_geometry IS 'Whether polygon passes QGIS-style validation';
COMMENT ON COLUMN land_parcels.validation_errors IS 'Array of validation error messages';
COMMENT ON COLUMN land_parcels.validation_warnings IS 'Array of validation warning messages';
COMMENT ON COLUMN land_parcels.closure_error_m IS 'Distance between first and last point in meters';
COMMENT ON COLUMN land_parcels.self_intersections IS 'Number of self-intersections detected';
COMMENT ON COLUMN land_parcels.has_spikes IS 'Number of spikes (acute angles < 10 degrees)';
COMMENT ON COLUMN land_parcels.bounding_box IS 'Bounding box coordinates [minY, minX, maxY, maxX]';

-- Create index on validation status for filtering
CREATE INDEX IF NOT EXISTS idx_land_parcels_valid ON land_parcels(is_valid_geometry);
CREATE INDEX IF NOT EXISTS idx_land_parcels_shape_type ON land_parcels(shape_type);
