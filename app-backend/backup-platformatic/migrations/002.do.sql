-- Spatial Phase 1 schema
-- Ensure pgcrypto for gen_random_uuid (safe if already installed)
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- Projects table: logical container for layers & features
CREATE TABLE projects (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(50) UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Feature layers: typed collections of features within a project
CREATE TABLE feature_layers (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  layer_type VARCHAR(40) NOT NULL DEFAULT 'generic', -- e.g. control_points, boundaries
  geom_type VARCHAR(24), -- POINT, LINESTRING, POLYGON, COLLECTION
  srid INTEGER DEFAULT 4326,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, name)
);

-- Features: current canonical record (geometry & properties JSONB)
CREATE TABLE features (
  id SERIAL PRIMARY KEY,
  layer_id INTEGER NOT NULL REFERENCES feature_layers(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  fid UUID NOT NULL DEFAULT gen_random_uuid(),
  geometry JSONB, -- GeoJSON geometry object
  properties JSONB DEFAULT '{}'::jsonb,
  bbox DOUBLE PRECISION[] , -- [minx, miny, maxx, maxy]
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(layer_id, fid)
);

-- Feature revisions: append-only audit trail
CREATE TABLE feature_revisions (
  id SERIAL PRIMARY KEY,
  feature_id INTEGER NOT NULL REFERENCES features(id) ON DELETE CASCADE,
  layer_id INTEGER NOT NULL REFERENCES feature_layers(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rev INTEGER NOT NULL,
  geometry JSONB,
  properties JSONB,
  bbox DOUBLE PRECISION[],
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(feature_id, rev)
);

-- Revision counter helper via trigger
CREATE OR REPLACE FUNCTION feature_revision_trigger() RETURNS trigger AS $$
DECLARE
  next_rev INTEGER;
BEGIN
  IF TG_OP = 'INSERT' THEN
    next_rev := 1;
  ELSIF TG_OP = 'UPDATE' THEN
    SELECT COALESCE(MAX(rev),0)+1 INTO next_rev FROM feature_revisions WHERE feature_id = NEW.id;
  END IF;
  INSERT INTO feature_revisions(feature_id, layer_id, project_id, rev, geometry, properties, bbox)
  VALUES (NEW.id, NEW.layer_id, NEW.project_id, next_rev, NEW.geometry, NEW.properties, NEW.bbox);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER feature_revisions_insert
AFTER INSERT ON features
FOR EACH ROW EXECUTE FUNCTION feature_revision_trigger();

CREATE TRIGGER feature_revisions_update
AFTER UPDATE ON features
FOR EACH ROW EXECUTE FUNCTION feature_revision_trigger();

-- Indexes for performance
CREATE INDEX idx_feature_layers_project ON feature_layers(project_id);
CREATE INDEX idx_features_layer ON features(layer_id);
CREATE INDEX idx_features_project ON features(project_id);
CREATE INDEX idx_features_bbox ON features USING GIN (bbox);
CREATE INDEX idx_features_fid ON features(fid);
CREATE INDEX idx_feature_revisions_feature ON feature_revisions(feature_id);
