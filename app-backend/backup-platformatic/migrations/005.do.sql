-- 005.do.sql - 3NF normalization (Option A)
-- Goal: eliminate redundant project_id from features and layer_id/project_id from feature_revisions,
-- add bbox length check, adjust revision trigger.
-- Idempotent & safe: checks presence before altering/dropping.

BEGIN;

-- 1. Ensure bbox length check constraint on features
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name='features' AND constraint_name='features_bbox_len_chk'
  ) THEN
    ALTER TABLE features
      ADD CONSTRAINT features_bbox_len_chk CHECK (bbox IS NULL OR array_length(bbox,1)=4);
  END IF;
END$$;

-- 2. Ensure bbox length check on feature_revisions (will remain after slim schema)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name='feature_revisions' AND constraint_name='feature_revisions_bbox_len_chk'
  ) THEN
    ALTER TABLE feature_revisions
      ADD CONSTRAINT feature_revisions_bbox_len_chk CHECK (bbox IS NULL OR array_length(bbox,1)=4);
  END IF;
END$$;

-- 3. Validate data integrity before dropping redundant columns
-- features.project_id must match feature_layers.project_id
DO $$
DECLARE
  mismatch_count INTEGER;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name='features' AND column_name='project_id'
  ) THEN
    SELECT COUNT(*) INTO mismatch_count FROM features f
      JOIN feature_layers l ON l.id = f.layer_id
      WHERE f.project_id <> l.project_id;
    IF mismatch_count > 0 THEN
      RAISE EXCEPTION 'Normalization aborted: % feature rows have mismatched project_id', mismatch_count;
    END IF;
  END IF;
END$$;

-- 4. Drop redundant project_id from features
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name='features' AND column_name='project_id'
  ) THEN
    ALTER TABLE features DROP COLUMN project_id;
  END IF;
END$$;

-- 5. Slim feature_revisions: only keep feature_id, rev, snapshot columns
-- Drop layer_id, project_id if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name='feature_revisions' AND column_name='layer_id'
  ) THEN
    ALTER TABLE feature_revisions DROP COLUMN layer_id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name='feature_revisions' AND column_name='project_id'
  ) THEN
    ALTER TABLE feature_revisions DROP COLUMN project_id;
  END IF;
END$$;

-- 6. Recreate revision trigger function without layer/project references
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
  INSERT INTO feature_revisions(feature_id, rev, geometry, properties, bbox)
  VALUES (NEW.id, next_rev, NEW.geometry, NEW.properties, NEW.bbox);
  RETURN NEW;
END;
$$;

-- 7. Ensure triggers exist (re-attached to updated function)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='feature_revisions_insert') THEN
    CREATE TRIGGER feature_revisions_insert AFTER INSERT ON features FOR EACH ROW EXECUTE FUNCTION feature_revision_trigger();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='feature_revisions_update') THEN
    CREATE TRIGGER feature_revisions_update AFTER UPDATE ON features FOR EACH ROW EXECUTE FUNCTION feature_revision_trigger();
  END IF;
END$$;

-- 8. Drop obsolete indexes referencing removed columns
DO $$
DECLARE
  idx RECORD;
BEGIN
  FOR idx IN (
    SELECT indexname FROM pg_indexes WHERE tablename='features' AND indexname IN ('idx_features_project')
  ) LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', idx.indexname);
  END LOOP;
END$$;

COMMIT;

-- Rollback guidance (manual):
-- ALTER TABLE features ADD COLUMN project_id INTEGER REFERENCES projects(id);
-- ALTER TABLE feature_revisions ADD COLUMN layer_id INTEGER REFERENCES feature_layers(id);
-- ALTER TABLE feature_revisions ADD COLUMN project_id INTEGER REFERENCES projects(id);
