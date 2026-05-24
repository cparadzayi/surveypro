-- Migration 025: Create parcels table for area computation persistence
-- This migration creates the parcels table to store digitized land parcels
-- with their geometries, areas, and metadata for the cadastral workflow

-- Create parcels table
CREATE TABLE IF NOT EXISTS parcels (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES survey_projects(id) ON DELETE CASCADE,
  designation VARCHAR(100) NOT NULL,
  geometry GEOMETRY(Polygon, 4326) NOT NULL,
  area_sqm NUMERIC(12, 2),
  perimeter_m NUMERIC(12, 2),
  closure_ratio VARCHAR(50),
  closure_error NUMERIC(12, 6),
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'finalized', 'approved')),
  digitized_at TIMESTAMP DEFAULT NOW(),
  digitized_by INTEGER REFERENCES users(id),
  finalized_at TIMESTAMP,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_parcels_project_id ON parcels(project_id);
CREATE INDEX idx_parcels_status ON parcels(status);
CREATE INDEX idx_parcels_designation ON parcels(designation);
CREATE INDEX idx_parcels_geometry ON parcels USING GIST(geometry);
CREATE INDEX idx_parcels_created_at ON parcels(created_at);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_parcels_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_parcels_updated_at
  BEFORE UPDATE ON parcels
  FOR EACH ROW
  EXECUTE FUNCTION update_parcels_updated_at();

-- Add comments for documentation
COMMENT ON TABLE parcels IS 'Stores digitized land parcels with geometries and computed areas';
COMMENT ON COLUMN parcels.designation IS 'Parcel designation/stand number (e.g., "2418", "Stand 2438")';
COMMENT ON COLUMN parcels.geometry IS 'Polygon geometry in WGS84 (EPSG:4326)';
COMMENT ON COLUMN parcels.area_sqm IS 'Computed area in square meters';
COMMENT ON COLUMN parcels.perimeter_m IS 'Computed perimeter in meters';
COMMENT ON COLUMN parcels.closure_ratio IS 'Closure ratio (e.g., "1:3,919")';
COMMENT ON COLUMN parcels.closure_error IS 'Closure error in meters';
COMMENT ON COLUMN parcels.status IS 'Parcel status: draft (auto-saved), finalized (user confirmed), approved (surveyor approved)';
COMMENT ON COLUMN parcels.metadata IS 'Additional metadata (colors, labels, user notes, etc.)';
