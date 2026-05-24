-- Migration 040: Implement Schema-Per-Surveyor Multi-Tenancy
-- Purpose: Isolate surveyor data into individual PostgreSQL schemas
-- Status: READY TO RUN

-- =====================================================
-- PART 1: ADD SCHEMA TRACKING TO SURVEYOR_PROFILES TABLE
-- =====================================================

-- Add schema_name column to track each surveyor's schema
ALTER TABLE surveyor_profiles ADD COLUMN IF NOT EXISTS schema_name VARCHAR(63);
CREATE INDEX IF NOT EXISTS idx_surveyor_profiles_schema_name ON surveyor_profiles(schema_name);

COMMENT ON COLUMN surveyor_profiles.schema_name IS 'PostgreSQL schema name for this surveyor (e.g., surveyor_john_doe)';


-- =====================================================
-- PART 2: SCHEMA MANAGEMENT FUNCTIONS
-- =====================================================

-- Function to generate schema name from username
CREATE OR REPLACE FUNCTION generate_schema_name(p_username VARCHAR)
RETURNS VARCHAR AS $$
BEGIN
  RETURN 'surveyor_' || lower(regexp_replace(p_username, '[^a-zA-Z0-9]', '_', 'g'));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION generate_schema_name IS 'Generates a valid PostgreSQL schema name from username';


-- Function to create a complete surveyor schema with all tables
CREATE OR REPLACE FUNCTION create_surveyor_schema(p_username VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
  v_schema_name VARCHAR;
BEGIN
  -- Generate schema name
  v_schema_name := generate_schema_name(p_username);
  
  -- Create schema
  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', v_schema_name);
  
  -- =========================================
  -- Create survey_projects table
  -- =========================================
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.survey_projects (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      client_name VARCHAR(255),
      survey_type VARCHAR(100),
      survey_date DATE,
      district VARCHAR(100),
      central_meridian VARCHAR(10),
      working_directory TEXT,
      status VARCHAR(50) DEFAULT ''active'',
      metadata JSONB,
      workflow_state JSONB DEFAULT ''{"completed_steps": [], "current_step": "project-setup", "step_data": {}, "generated_documents": {}, "can_finalize": false}''::jsonb,
      last_used TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )', v_schema_name);
  
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_projects_name ON %I.survey_projects(name)', v_schema_name);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_projects_date ON %I.survey_projects(survey_date)', v_schema_name);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_projects_status ON %I.survey_projects(status)', v_schema_name);
  
  -- =========================================
  -- Create coordinate_points table
  -- =========================================
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.coordinate_points (
      id SERIAL PRIMARY KEY,
      project_id INTEGER REFERENCES %I.survey_projects(id) ON DELETE CASCADE,
      name VARCHAR(50) NOT NULL,
      geom GEOMETRY(Point, 22291),
      elevation NUMERIC(10, 3),
      description TEXT,
      survey_date DATE,
      surveyor VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(project_id, name)
    )', v_schema_name, v_schema_name);
  
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_coord_points_project ON %I.coordinate_points(project_id)', v_schema_name);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_coord_points_name ON %I.coordinate_points(name)', v_schema_name);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_coord_points_geom ON %I.coordinate_points USING GIST(geom)', v_schema_name);
  
  -- =========================================
  -- Create land_parcels table
  -- =========================================
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.land_parcels (
      id SERIAL PRIMARY KEY,
      project_id INTEGER REFERENCES %I.survey_projects(id) ON DELETE CASCADE,
      stand VARCHAR(50),
      designation VARCHAR(255),
      owner VARCHAR(255),
      title_deed VARCHAR(100),
      survey_date DATE,
      surveyor VARCHAR(255),
      notes TEXT,
      centroid_y NUMERIC(12, 3),
      centroid_x NUMERIC(12, 3),
      closure_error_m NUMERIC(10, 3),
      closure_ratio VARCHAR(20),
      area_m2 NUMERIC(12, 2) GENERATED ALWAYS AS (ST_Area(geom)) STORED,
      area_ha NUMERIC(12, 4) GENERATED ALWAYS AS (ST_Area(geom) / 10000) STORED,
      perimeter_m NUMERIC(12, 2) GENERATED ALWAYS AS (ST_Perimeter(geom)) STORED,
      area_calculated BOOLEAN DEFAULT FALSE,
      calculation_data JSONB,
      status VARCHAR(50) DEFAULT ''draft'',
      digitized_by INTEGER,
      finalized_at TIMESTAMP,
      geom GEOMETRY(Polygon, 22291),
      metadata JSONB,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      CONSTRAINT unique_project_stand UNIQUE(project_id, stand)
    )', v_schema_name, v_schema_name);
  
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_land_parcels_project ON %I.land_parcels(project_id)', v_schema_name);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_land_parcels_stand ON %I.land_parcels(stand)', v_schema_name);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_land_parcels_status ON %I.land_parcels(status)', v_schema_name);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_land_parcels_geom ON %I.land_parcels USING GIST(geom)', v_schema_name);
  
  -- =========================================
  -- Create project_control_points table
  -- =========================================
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.project_control_points (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES %I.survey_projects(id) ON DELETE CASCADE,
      control_point_id INTEGER NOT NULL REFERENCES public.zim_control_points(id) ON DELETE CASCADE,
      point_order INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(project_id, control_point_id)
    )', v_schema_name, v_schema_name);
  
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_project_control_points_project ON %I.project_control_points(project_id)', v_schema_name);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_project_control_points_control_point ON %I.project_control_points(control_point_id)', v_schema_name);
  
  EXECUTE format('COMMENT ON TABLE %I.project_control_points IS ''Control points used to connect survey project to national trig system''', v_schema_name);
  EXECUTE format('COMMENT ON COLUMN %I.project_control_points.point_order IS ''Display order in coordinate list (1, 2, 3...)''', v_schema_name);
  
  -- Grant permissions to application role (if exists)
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'surveypro_app') THEN
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO surveypro_app', v_schema_name);
    EXECUTE format('GRANT ALL ON ALL TABLES IN SCHEMA %I TO surveypro_app', v_schema_name);
    EXECUTE format('GRANT ALL ON ALL SEQUENCES IN SCHEMA %I TO surveypro_app', v_schema_name);
    
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT ALL ON TABLES TO surveypro_app', v_schema_name);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT ALL ON SEQUENCES TO surveypro_app', v_schema_name);
  END IF;
  
  RAISE NOTICE 'Created schema: % with all tables', v_schema_name;
  RETURN v_schema_name;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_surveyor_schema IS 'Creates a complete surveyor schema with all necessary tables and permissions';


-- Function to safely drop a surveyor schema
CREATE OR REPLACE FUNCTION drop_surveyor_schema(p_username VARCHAR, p_confirm VARCHAR)
RETURNS BOOLEAN AS $$
DECLARE
  v_schema_name VARCHAR;
BEGIN
  v_schema_name := generate_schema_name(p_username);
  
  IF p_confirm != v_schema_name THEN
    RAISE EXCEPTION 'Confirmation does not match schema name. Expected: %, Got: %', v_schema_name, p_confirm;
  END IF;
  
  EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', v_schema_name);
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION drop_surveyor_schema IS 'Safely drops a surveyor schema with confirmation (CASCADE removes all data!)';


-- =====================================================
-- PART 3: ADMIN VIEWS FOR MONITORING
-- =====================================================

CREATE SCHEMA IF NOT EXISTS admin;
COMMENT ON SCHEMA admin IS 'Administrative views and monitoring tools';

-- View: All surveyor schemas
CREATE OR REPLACE VIEW admin.surveyor_schemas AS
SELECT 
  s.id AS surveyor_id,
  u.email,
  s.name AS full_name,
  s.schema_name,
  (SELECT COUNT(*) FROM information_schema.tables 
   WHERE table_schema = s.schema_name) AS table_count,
  s.created_at AS surveyor_created_at
FROM surveyor_profiles s
JOIN users u ON s.user_id = u.id
WHERE s.schema_name IS NOT NULL
ORDER BY s.created_at DESC;

COMMENT ON VIEW admin.surveyor_schemas IS 'Lists all surveyor schemas with basic stats';


-- View: Schema storage usage
CREATE OR REPLACE VIEW admin.schema_storage AS
SELECT 
  schemaname AS schema_name,
  COUNT(*) AS table_count,
  SUM(pg_total_relation_size(schemaname||'.'||tablename)) AS total_bytes,
  pg_size_pretty(SUM(pg_total_relation_size(schemaname||'.'||tablename))) AS total_size
FROM pg_tables
WHERE schemaname LIKE 'surveyor_%'
GROUP BY schemaname
ORDER BY total_bytes DESC;

COMMENT ON VIEW admin.schema_storage IS 'Shows storage usage per surveyor schema';

COMMENT ON SCHEMA public IS 'Shared data across all surveyors (users, districts, control points)';
