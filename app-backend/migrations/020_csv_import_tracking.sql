-- Migration: CSV Import Tracking and Smart Merge Support
-- Description: Adds tables to track CSV imports, point history, and enable smart merge functionality

-- Table: project_csv_imports
-- Tracks each CSV import for a project with metadata and hash for duplicate detection
CREATE TABLE IF NOT EXISTS project_csv_imports (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES survey_projects(id) ON DELETE CASCADE,
  import_date TIMESTAMP DEFAULT NOW(),
  csv_hash VARCHAR(64) NOT NULL, -- SHA256 hash of CSV content
  point_count INTEGER NOT NULL,
  filename VARCHAR(255),
  imported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  coordinate_system VARCHAR(50), -- e.g., "Lo31", "WGS84"
  metadata JSONB DEFAULT '{}', -- Additional import metadata
  has_generated_documents BOOLEAN DEFAULT FALSE, -- Field Book, Calculations, etc.
  has_land_parcels BOOLEAN DEFAULT FALSE, -- Whether parcels have been digitized
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for fast project lookup
CREATE INDEX idx_project_csv_imports_project_id ON project_csv_imports(project_id);

-- Unique constraint to prevent duplicate imports (same CSV content)
CREATE UNIQUE INDEX idx_project_csv_imports_unique ON project_csv_imports(project_id, csv_hash);

-- Table: coordinate_point_history
-- Tracks the lineage and changes to coordinate points across imports
CREATE TABLE IF NOT EXISTS coordinate_point_history (
  id SERIAL PRIMARY KEY,
  point_id INTEGER REFERENCES coordinate_points(id) ON DELETE CASCADE,
  import_id INTEGER NOT NULL REFERENCES project_csv_imports(id) ON DELETE CASCADE,
  previous_point_id INTEGER REFERENCES coordinate_points(id) ON DELETE SET NULL,
  action VARCHAR(20) NOT NULL, -- 'created', 'updated', 'matched', 'removed', 'replaced'
  point_name VARCHAR(50), -- Store point name for history
  coordinates JSONB, -- Store Y, X coordinates: {"y": 123.456, "x": 789.012}
  metadata JSONB DEFAULT '{}', -- Additional action metadata
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for history queries
CREATE INDEX idx_coordinate_point_history_point_id ON coordinate_point_history(point_id);
CREATE INDEX idx_coordinate_point_history_import_id ON coordinate_point_history(import_id);
CREATE INDEX idx_coordinate_point_history_action ON coordinate_point_history(action);

-- Add import_id to coordinate_points table
-- Links each point to the import that created/updated it
ALTER TABLE coordinate_points 
ADD COLUMN IF NOT EXISTS import_id INTEGER REFERENCES project_csv_imports(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_coordinate_points_import_id ON coordinate_points(import_id);

-- Add import_id to land_parcels table
-- Tracks which CSV import version the parcel is based on
ALTER TABLE land_parcels
ADD COLUMN IF NOT EXISTS import_id INTEGER REFERENCES project_csv_imports(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_land_parcels_import_id ON land_parcels(import_id);

-- Add parcel_status to land_parcels for tracking merge status
ALTER TABLE land_parcels
ADD COLUMN IF NOT EXISTS parcel_status VARCHAR(20) DEFAULT 'active'; -- 'active', 'orphaned', 'partial', 'pending_review'

-- Function: Update project_csv_imports.has_land_parcels automatically
CREATE OR REPLACE FUNCTION update_import_has_parcels()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE project_csv_imports 
    SET has_land_parcels = TRUE 
    WHERE id = NEW.import_id;
  ELSIF TG_OP = 'DELETE' THEN
    -- Check if any parcels remain for this import
    UPDATE project_csv_imports 
    SET has_land_parcels = EXISTS(
      SELECT 1 FROM land_parcels WHERE import_id = OLD.import_id
    )
    WHERE id = OLD.import_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update has_land_parcels flag
CREATE TRIGGER trigger_update_import_has_parcels
AFTER INSERT OR DELETE ON land_parcels
FOR EACH ROW
EXECUTE FUNCTION update_import_has_parcels();

-- Function: Update project_csv_imports.updated_at timestamp
CREATE OR REPLACE FUNCTION update_csv_import_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update updated_at on project_csv_imports
CREATE TRIGGER trigger_update_csv_import_timestamp
BEFORE UPDATE ON project_csv_imports
FOR EACH ROW
EXECUTE FUNCTION update_csv_import_timestamp();

-- View: Import summary with parcel counts
CREATE OR REPLACE VIEW v_import_summary AS
SELECT 
  i.id,
  i.project_id,
  i.import_date,
  i.point_count,
  i.filename,
  i.has_generated_documents,
  i.has_land_parcels,
  COUNT(DISTINCT p.id) AS parcel_count,
  COUNT(DISTINCT cp.id) AS active_point_count,
  u.username AS imported_by_username
FROM project_csv_imports i
LEFT JOIN land_parcels p ON p.import_id = i.id AND p.parcel_status = 'active'
LEFT JOIN coordinate_points cp ON cp.import_id = i.id
LEFT JOIN users u ON u.id = i.imported_by
GROUP BY i.id, i.project_id, i.import_date, i.point_count, i.filename, 
         i.has_generated_documents, i.has_land_parcels, u.username;

-- Grant permissions (adjust as needed for your auth setup)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON project_csv_imports TO surveypro_user;
-- GRANT SELECT, INSERT ON coordinate_point_history TO surveypro_user;
-- GRANT SELECT ON v_import_summary TO surveypro_user;

-- Add comments for documentation
COMMENT ON TABLE project_csv_imports IS 'Tracks CSV imports for projects to enable smart re-import and merge functionality';
COMMENT ON TABLE coordinate_point_history IS 'Maintains history of coordinate point changes across imports for audit trail';
COMMENT ON COLUMN project_csv_imports.csv_hash IS 'SHA256 hash of CSV content to detect duplicate imports';
COMMENT ON COLUMN project_csv_imports.has_generated_documents IS 'TRUE if Field Book, Calculations, etc. have been generated from this import';
COMMENT ON COLUMN project_csv_imports.has_land_parcels IS 'TRUE if land parcels have been digitized based on this import';
COMMENT ON COLUMN land_parcels.parcel_status IS 'Status: active, orphaned (no matching points), partial (some points missing), pending_review';
