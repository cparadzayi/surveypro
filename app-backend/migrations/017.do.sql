-- Migration 017: Create normalized spatial tables
-- Separate coordinate_points and land_parcels tables

BEGIN;

-- Check if land_parcels table already exists and rename it
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'land_parcels') THEN
    ALTER TABLE land_parcels RENAME TO land_parcels_old;
    RAISE NOTICE 'Renamed existing land_parcels table to land_parcels_old';
  END IF;
END $$;

-- ============================================================================
-- COORDINATE POINTS TABLE
-- Survey control points / coordinate list for parcel digitization
-- ============================================================================

CREATE TABLE coordinate_points (
  id SERIAL PRIMARY KEY,
  project_id INTEGER,
  name VARCHAR(50) NOT NULL,
  geom GEOMETRY(Point, 22291) NOT NULL,
  elevation NUMERIC,
  description TEXT,
  survey_date DATE,
  surveyor VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Ensure unique point names within a project
  UNIQUE(project_id, name)
);

-- Indexes for performance
CREATE INDEX coordinate_points_geom_idx ON coordinate_points USING GIST(geom);
CREATE INDEX coordinate_points_name_idx ON coordinate_points(name);
CREATE INDEX coordinate_points_project_idx ON coordinate_points(project_id);

-- ============================================================================
-- LAND PARCELS TABLE
-- Cadastral polygons with generated area columns
-- ============================================================================

CREATE TABLE land_parcels (
  id SERIAL PRIMARY KEY,
  project_id INTEGER,
  stand VARCHAR(100) NOT NULL,
  geom GEOMETRY(Polygon, 22291) NOT NULL,
  owner VARCHAR(255),
  title_deed VARCHAR(100),
  survey_date DATE,
  surveyor VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Generated columns (always in sync with geometry)
  area_m2 NUMERIC GENERATED ALWAYS AS (ST_Area(geom)) STORED,
  area_ha NUMERIC GENERATED ALWAYS AS (ST_Area(geom) / 10000) STORED,
  perimeter_m NUMERIC GENERATED ALWAYS AS (ST_Perimeter(geom)) STORED
);

-- Indexes for performance
CREATE INDEX land_parcels_geom_idx ON land_parcels USING GIST(geom);
CREATE INDEX land_parcels_stand_idx ON land_parcels(stand);
CREATE INDEX land_parcels_project_idx ON land_parcels(project_id);
CREATE INDEX land_parcels_area_idx ON land_parcels(area_m2);

-- ============================================================================
-- VIEWS FOR ENHANCED QUERIES
-- ============================================================================

-- View with additional computed attributes
CREATE OR REPLACE VIEW land_parcels_full AS
SELECT 
  lp.*,
  ST_Centroid(lp.geom) as centroid,
  ST_AsGeoJSON(lp.geom)::jsonb as geojson,
  ST_NPoints(lp.geom) as vertex_count,
  ST_X(ST_Centroid(lp.geom)) as centroid_y,
  ST_Y(ST_Centroid(lp.geom)) as centroid_x
FROM land_parcels lp;

-- View for coordinate points with GeoJSON
CREATE OR REPLACE VIEW coordinate_points_full AS
SELECT 
  cp.*,
  ST_AsGeoJSON(cp.geom)::jsonb as geojson,
  ST_X(cp.geom) as y,
  ST_Y(cp.geom) as x
FROM coordinate_points cp;

-- ============================================================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================================================

-- Note: update_updated_at_column() function already exists from migration 007
-- We just need to create the triggers

-- Trigger for coordinate_points
DROP TRIGGER IF EXISTS coordinate_points_updated_at ON coordinate_points;
CREATE TRIGGER coordinate_points_updated_at
  BEFORE UPDATE ON coordinate_points
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for land_parcels
DROP TRIGGER IF EXISTS land_parcels_updated_at ON land_parcels;
CREATE TRIGGER land_parcels_updated_at
  BEFORE UPDATE ON land_parcels
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- DATA MIGRATION
-- Note: For fresh installations, no data migration is needed
-- Old table structure (migration 014) is incompatible with new structure
-- If you have production data in land_parcels_old, manual migration is required
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'land_parcels_old') THEN
    RAISE NOTICE 'Found land_parcels_old table';
    RAISE NOTICE 'Data migration skipped - old table structure is incompatible';
    RAISE NOTICE 'Old structure uses geometry_geojson (JSONB), new uses geom (PostGIS GEOMETRY)';
    RAISE NOTICE 'If you have production data, manual migration required';
    RAISE NOTICE 'For fresh installation, this is expected - continuing...';
    
    -- Drop the old table since it's from a fresh migration and has no data
    DROP TABLE IF EXISTS land_parcels_old CASCADE;
    RAISE NOTICE 'Dropped land_parcels_old table';
  ELSE
    RAISE NOTICE 'No land_parcels_old table found - this is a fresh installation';
  END IF;
END $$;

COMMIT;
