-- Backfill missing spatial tables if prior migration (002) not applied
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Add optional columns if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='code') THEN
    ALTER TABLE projects ADD COLUMN code VARCHAR(50) UNIQUE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='description') THEN
    ALTER TABLE projects ADD COLUMN description TEXT;
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS feature_layers (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  layer_type VARCHAR(40) NOT NULL DEFAULT 'generic',
  geom_type VARCHAR(24),
  srid INTEGER DEFAULT 4326,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, name)
);

CREATE TABLE IF NOT EXISTS features (
  id SERIAL PRIMARY KEY,
  layer_id INTEGER NOT NULL REFERENCES feature_layers(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  fid UUID NOT NULL DEFAULT gen_random_uuid(),
  geometry JSONB,
  properties JSONB DEFAULT '{}'::jsonb,
  bbox DOUBLE PRECISION[],
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(layer_id, fid)
);

CREATE TABLE IF NOT EXISTS feature_revisions (
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

-- Create trigger function (idempotent pattern)
-- Always (re)create function (idempotent and simpler than conditional dynamic SQL)
CREATE OR REPLACE FUNCTION feature_revision_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
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
$$;

-- Attach triggers if absent
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='feature_revisions_insert') THEN
    CREATE TRIGGER feature_revisions_insert AFTER INSERT ON features FOR EACH ROW EXECUTE FUNCTION feature_revision_trigger();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='feature_revisions_update') THEN
    CREATE TRIGGER feature_revisions_update AFTER UPDATE ON features FOR EACH ROW EXECUTE FUNCTION feature_revision_trigger();
  END IF;
END$$;
