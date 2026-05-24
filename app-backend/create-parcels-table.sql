-- Quick setup script for land_parcels table
-- Run this if migration doesn't work: psql -d surveypro -f create-parcels-table.sql

CREATE TABLE IF NOT EXISTS land_parcels (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES survey_projects(id) ON DELETE CASCADE,
  parcel_number VARCHAR(50) NOT NULL,
  parcel_name VARCHAR(255),
  
  -- Boundary points (array of point IDs in order)
  boundary_points TEXT[] NOT NULL,
  
  -- Calculated area
  area_sqm NUMERIC(15, 3),
  area_hectares NUMERIC(15, 6),
  area_acres NUMERIC(15, 6),
  
  -- Status: 'draft' (yellow), 'calculated' (lime green)
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'calculated')),
  
  -- Polygon geometry (GeoJSON)
  geometry_geojson JSONB,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Ensure unique parcel numbers within a project
  CONSTRAINT unique_parcel_per_project UNIQUE (project_id, parcel_number)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_land_parcels_project_id ON land_parcels(project_id);
CREATE INDEX IF NOT EXISTS idx_land_parcels_status ON land_parcels(status);

-- Add comments
COMMENT ON TABLE land_parcels IS 'Land parcels for each survey project with boundary points and calculated areas';
COMMENT ON COLUMN land_parcels.boundary_points IS 'Array of point IDs forming the parcel boundary in clockwise order';
COMMENT ON COLUMN land_parcels.status IS 'draft = yellow (being built), calculated = lime green (area calculated)';
COMMENT ON COLUMN land_parcels.geometry_geojson IS 'GeoJSON polygon geometry for map display';

SELECT 'Land parcels table created successfully!' as result;
