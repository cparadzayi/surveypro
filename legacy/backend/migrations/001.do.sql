-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('user', 'admin', 'viewer')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Projects table
CREATE TABLE projects (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  coordinate_system VARCHAR(100) DEFAULT 'WGS84',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Survey points table with spatial data and Zimbabwe cadastral coordinate system support
CREATE TABLE survey_points (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  point_number VARCHAR(50) NOT NULL,
  
  -- Original coordinates (geodetic - WGS84)
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  elevation DOUBLE PRECISION,
  
  -- Grid coordinates (Zimbabwe Cadastral System - Clarke 1880 Modified)
  -- Format: P(Y,X) where P is beacon name
  y_coordinate DOUBLE PRECISION,  -- Y-Coordinate (Westing): increases westwards from central meridian (negative=east, positive=west)
  x_coordinate DOUBLE PRECISION,  -- X-Coordinate (Southing): increases positively from Equator southwards
  central_meridian INTEGER CHECK (central_meridian IN (25, 27, 29, 31, 33)),
  
  -- Legacy x, y, z fields for backward compatibility
  x DOUBLE PRECISION,
  y DOUBLE PRECISION,
  z DOUBLE PRECISION,
  
  description TEXT,
  point_type VARCHAR(50) DEFAULT 'control' CHECK (point_type IN ('control', 'traverse', 'detail', 'boundary')),
  geometry geometry(PointZ, 4326),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Ensure coordinates are within Zimbabwe's bounds
  CONSTRAINT chk_latitude CHECK (latitude >= -22.5 AND latitude <= -15.5),
  CONSTRAINT chk_longitude CHECK (longitude >= 25.0 AND longitude <= 33.5),
  
  UNIQUE(project_id, point_number)
);

-- Create spatial index on survey_points
CREATE INDEX idx_survey_points_geometry ON survey_points USING GIST(geometry);

-- CAD entities table for drawings
CREATE TABLE cad_entities (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('point', 'line', 'polyline', 'polygon', 'circle', 'arc', 'text')),
  layer VARCHAR(100) DEFAULT 'default',
  color VARCHAR(7) DEFAULT '#000000',
  properties JSONB DEFAULT '{}',
  geometry geometry(Geometry, 4326),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create spatial index on cad_entities
CREATE INDEX idx_cad_entities_geometry ON cad_entities USING GIST(geometry);

-- Computations table for storing calculation results
CREATE TABLE computations (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  computation_type VARCHAR(100) NOT NULL CHECK (computation_type IN ('traverse', 'area', 'volume', 'distance', 'bearing', 'transformation', 'intersection')),
  input_data JSONB NOT NULL,
  result_data JSONB NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Project members table for collaboration
CREATE TABLE project_members (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'viewer' CHECK (role IN ('owner', 'editor', 'viewer')),
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, user_id)
);

-- Indexes for better query performance
CREATE INDEX idx_survey_points_project ON survey_points(project_id);
CREATE INDEX idx_cad_entities_project ON cad_entities(project_id);
CREATE INDEX idx_computations_project ON computations(project_id);
CREATE INDEX idx_projects_owner ON projects(owner_id);
CREATE INDEX idx_project_members_project ON project_members(project_id);
CREATE INDEX idx_project_members_user ON project_members(user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers to auto-update updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_survey_points_updated_at BEFORE UPDATE ON survey_points
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cad_entities_updated_at BEFORE UPDATE ON cad_entities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Zimbabwe Cadastral Coordinate System Functions

-- Function to find the nearest central meridian
CREATE OR REPLACE FUNCTION find_central_meridian(longitude DOUBLE PRECISION)
RETURNS INTEGER AS $$
DECLARE
  meridians INTEGER[] := ARRAY[25, 27, 29, 31, 33];
  min_diff DOUBLE PRECISION := 360;
  best_meridian INTEGER := 31;  -- Default to Harare's meridian
  diff DOUBLE PRECISION;
  m INTEGER;
BEGIN
  FOREACH m IN ARRAY meridians LOOP
    diff := ABS(longitude - m);
    IF diff < min_diff THEN
      min_diff := diff;
      best_meridian := m;
    END IF;
  END LOOP;
  
  RETURN best_meridian;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to update survey point geometry from latitude/longitude
CREATE OR REPLACE FUNCTION update_survey_point_geometry()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the geometry column from latitude/longitude
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    IF NEW.elevation IS NOT NULL THEN
      NEW.geometry = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude, NEW.elevation), 4326);
    ELSE
      NEW.geometry = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude, 0), 4326);
    END IF;
  END IF;
  
  -- Update legacy x, y, z fields for backward compatibility
  NEW.x = NEW.longitude;
  NEW.y = NEW.latitude;
  NEW.z = NEW.elevation;
  
  -- Auto-assign central meridian if not set
  IF NEW.central_meridian IS NULL AND NEW.longitude IS NOT NULL THEN
    NEW.central_meridian = find_central_meridian(NEW.longitude);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update survey point geometry
CREATE TRIGGER update_survey_point_geom
BEFORE INSERT OR UPDATE OF latitude, longitude, elevation ON survey_points
FOR EACH ROW
EXECUTE FUNCTION update_survey_point_geometry();
