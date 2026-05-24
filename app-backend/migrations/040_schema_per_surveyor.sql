-- Migration 040: Implement Schema-Per-Surveyor Multi-Tenancy
-- Purpose: Isolate surveyor data into individual PostgreSQL schemas
-- Status: DESIGN PHASE - DO NOT RUN YET

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
      y NUMERIC(12, 3),
      x NUMERIC(12, 3),
      z NUMERIC(10, 3),
      description TEXT,
      fp VARCHAR(1),
      status VARCHAR(50),
      point_type VARCHAR(50),
      date_surveyed DATE,
      geom GEOMETRY(Point, 22291),
      metadata JSONB,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
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
      area_m2 NUMERIC(12, 2),
      area_ha NUMERIC(12, 4),
      closure_error NUMERIC(10, 3),
      geom GEOMETRY(Polygon, 22291),
      metadata JSONB,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )', v_schema_name, v_schema_name);
  
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_land_parcels_project ON %I.land_parcels(project_id)', v_schema_name);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_land_parcels_stand ON %I.land_parcels(stand)', v_schema_name);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_land_parcels_geom ON %I.land_parcels USING GIST(geom)', v_schema_name);
  
  -- =========================================
  -- Create field_book_entries table
  -- =========================================
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.field_book_entries (
      id SERIAL PRIMARY KEY,
      project_id INTEGER REFERENCES %I.survey_projects(id) ON DELETE CASCADE,
      page_number VARCHAR(10),
      entry_number INTEGER,
      station VARCHAR(50),
      target VARCHAR(50),
      horizontal_angle VARCHAR(20),
      vertical_angle VARCHAR(20),
      slope_distance NUMERIC(10, 3),
      horizontal_distance NUMERIC(10, 3),
      remarks TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )', v_schema_name, v_schema_name);
  
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_field_book_project ON %I.field_book_entries(project_id)', v_schema_name);
  
  -- =========================================
  -- Create calculations table
  -- =========================================
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.calculations (
      id SERIAL PRIMARY KEY,
      project_id INTEGER REFERENCES %I.survey_projects(id) ON DELETE CASCADE,
      calculation_type VARCHAR(100),
      input_data JSONB,
      output_data JSONB,
      status VARCHAR(50) DEFAULT ''completed'',
      created_at TIMESTAMP DEFAULT NOW()
    )', v_schema_name, v_schema_name);
  
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_calculations_project ON %I.calculations(project_id)', v_schema_name);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_calculations_type ON %I.calculations(calculation_type)', v_schema_name);
  
  -- =========================================
  -- Create documents table
  -- =========================================
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.documents (
      id SERIAL PRIMARY KEY,
      project_id INTEGER REFERENCES %I.survey_projects(id) ON DELETE CASCADE,
      document_type VARCHAR(100),
      title VARCHAR(255),
      file_path TEXT,
      file_size INTEGER,
      mime_type VARCHAR(100),
      metadata JSONB,
      created_at TIMESTAMP DEFAULT NOW()
    )', v_schema_name, v_schema_name);
  
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_documents_project ON %I.documents(project_id)', v_schema_name);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_documents_type ON %I.documents(document_type)', v_schema_name);
  
  -- =========================================
  -- Grant permissions to application role (if exists)
  -- =========================================
  -- Only grant if surveypro_app role exists (for compatibility)
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'surveypro_app') THEN
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO surveypro_app', v_schema_name);
    EXECUTE format('GRANT ALL ON ALL TABLES IN SCHEMA %I TO surveypro_app', v_schema_name);
    EXECUTE format('GRANT ALL ON ALL SEQUENCES IN SCHEMA %I TO surveypro_app', v_schema_name);
    
    -- Set default privileges for future tables
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT ALL ON TABLES TO surveypro_app', v_schema_name);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT ALL ON SEQUENCES TO surveypro_app', v_schema_name);
    
    RAISE NOTICE 'Granted permissions to surveypro_app role';
  ELSE
    RAISE NOTICE 'Role surveypro_app does not exist, skipping permission grants (schema owner has full access)';
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
  v_project_count INTEGER;
BEGIN
  v_schema_name := generate_schema_name(p_username);
  
  -- Safety check: require exact schema name as confirmation
  IF p_confirm != v_schema_name THEN
    RAISE EXCEPTION 'Confirmation does not match schema name. Expected: %, Got: %', v_schema_name, p_confirm;
  END IF;
  
  -- Check how many projects will be deleted
  EXECUTE format('SELECT COUNT(*) FROM %I.survey_projects', v_schema_name) INTO v_project_count;
  
  RAISE NOTICE 'Dropping schema % with % projects', v_schema_name, v_project_count;
  
  -- Drop schema with CASCADE (removes all objects)
  EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', v_schema_name);
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION drop_surveyor_schema IS 'Safely drops a surveyor schema with confirmation (CASCADE removes all data!)';


-- Function to get surveyor schema statistics
CREATE OR REPLACE FUNCTION get_surveyor_schema_stats(p_username VARCHAR)
RETURNS TABLE(
  schema_name VARCHAR,
  table_name VARCHAR,
  row_count BIGINT,
  total_size TEXT
) AS $$
DECLARE
  v_schema_name VARCHAR;
BEGIN
  v_schema_name := generate_schema_name(p_username);
  
  RETURN QUERY
  SELECT 
    v_schema_name::VARCHAR,
    t.tablename::VARCHAR,
    (SELECT COUNT(*) FROM (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = v_schema_name AND table_name = t.tablename
      LIMIT 1
    ) x)::BIGINT,
    pg_size_pretty(pg_total_relation_size(v_schema_name || '.' || t.tablename))
  FROM pg_tables t
  WHERE t.schemaname = v_schema_name
  ORDER BY pg_total_relation_size(v_schema_name || '.' || t.tablename) DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_surveyor_schema_stats IS 'Returns statistics for a surveyor schema (tables, row counts, sizes)';


-- Function to migrate existing surveyor data to their schema
CREATE OR REPLACE FUNCTION migrate_surveyor_to_schema(p_surveyor_id INTEGER)
RETURNS VARCHAR AS $$
DECLARE
  v_username VARCHAR;
  v_schema_name VARCHAR;
  v_project_count INTEGER;
BEGIN
  -- Get surveyor email (used as identifier)
  SELECT u.email INTO v_username
  FROM surveyor_profiles s
  JOIN users u ON s.user_id = u.id
  WHERE s.id = p_surveyor_id;
  
  IF v_username IS NULL THEN
    RAISE EXCEPTION 'Surveyor with id % not found', p_surveyor_id;
  END IF;
  
  -- Create schema
  v_schema_name := create_surveyor_schema(v_username);
  
  -- Migrate survey_projects
  EXECUTE format('
    INSERT INTO %I.survey_projects 
      (id, name, client_name, survey_type, survey_date, district, central_meridian, 
       working_directory, status, metadata, created_at, updated_at)
    SELECT id, name, client_name, survey_type, survey_date, district, central_meridian,
           working_directory, status, metadata, created_at, updated_at
    FROM public.survey_projects
    WHERE surveyor_profile_id = %s
  ', v_schema_name, p_surveyor_id);
  
  GET DIAGNOSTICS v_project_count = ROW_COUNT;
  RAISE NOTICE 'Migrated % projects to %', v_project_count, v_schema_name;
  
  -- Migrate coordinate_points (based on project_id)
  EXECUTE format('
    INSERT INTO %I.coordinate_points 
      (id, project_id, name, y, x, z, description, fp, status, point_type, 
       date_surveyed, geom, metadata, created_at, updated_at)
    SELECT cp.id, cp.project_id, cp.name, cp.y, cp.x, cp.z, cp.description, 
           cp.fp, cp.status, cp.point_type, cp.date_surveyed, cp.geom, 
           cp.metadata, cp.created_at, cp.updated_at
    FROM public.coordinate_points cp
    WHERE cp.project_id IN (
      SELECT id FROM public.survey_projects WHERE surveyor_profile_id = %s
    )
  ', v_schema_name, p_surveyor_id);
  
  -- Migrate land_parcels
  EXECUTE format('
    INSERT INTO %I.land_parcels 
      (id, project_id, stand, designation, owner, title_deed, survey_date, 
       surveyor, notes, area_m2, area_ha, closure_error, geom, metadata, created_at, updated_at)
    SELECT lp.id, lp.project_id, lp.stand, lp.designation, lp.owner, lp.title_deed,
           lp.survey_date, lp.surveyor, lp.notes, lp.area_m2, lp.area_ha, 
           lp.closure_error, lp.geom, lp.metadata, lp.created_at, lp.updated_at
    FROM public.land_parcels lp
    WHERE lp.project_id IN (
      SELECT id FROM public.survey_projects WHERE surveyor_profile_id = %s
    )
  ', v_schema_name, p_surveyor_id);
  
  -- Update surveyor record with schema name
  UPDATE surveyor_profiles SET schema_name = v_schema_name WHERE id = p_surveyor_id;
  
  RETURN v_schema_name;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION migrate_surveyor_to_schema IS 'Migrates existing surveyor data from public schema to their own schema';


-- =====================================================
-- PART 3: ADMIN VIEWS FOR MONITORING
-- =====================================================

-- Create admin schema if it doesn't exist
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


-- =====================================================
-- PART 4: TESTING & VERIFICATION
-- =====================================================

-- Test function: Create test surveyor and schema
CREATE OR REPLACE FUNCTION test_create_surveyor_schema()
RETURNS VOID AS $$
DECLARE
  v_schema_name VARCHAR;
BEGIN
  -- Create test schema
  v_schema_name := create_surveyor_schema('test_user_123');
  
  -- Verify schema exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.schemata WHERE schema_name = v_schema_name
  ) THEN
    RAISE EXCEPTION 'Test failed: Schema % was not created', v_schema_name;
  END IF;
  
  -- Verify tables exist
  IF (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = v_schema_name) < 6 THEN
    RAISE EXCEPTION 'Test failed: Not all tables created in schema %', v_schema_name;
  END IF;
  
  -- Cleanup
  PERFORM drop_surveyor_schema('test_user_123', v_schema_name);
  
  RAISE NOTICE 'Test passed: Schema creation and deletion work correctly';
END;
$$ LANGUAGE plpgsql;


-- =====================================================
-- PART 5: MIGRATION INSTRUCTIONS
-- =====================================================

/*

STEP-BY-STEP MIGRATION GUIDE
============================

⚠️ DO NOT RUN THIS MIGRATION YET - It requires backend code updates first!

Prerequisites:
1. Backup database: pg_dump surveypro_v1 > backup_before_schema_migration.sql
2. Update backend code (see MULTI_TENANCY_DESIGN.md)
3. Test on development environment first

Migration Steps:

Step 1: Run this migration
---------------------------
cd app-backend
node scripts/run-sql.js 040_schema_per_surveyor.sql


Step 2: Test schema creation
-----------------------------
SELECT test_create_surveyor_schema();

Expected: "Test passed: Schema creation and deletion work correctly"


Step 3: Create schemas for existing surveyors
----------------------------------------------
-- List surveyors to migrate
SELECT id, user_id, name FROM surveyor_profiles ORDER BY id;

-- Migrate each surveyor (replace X with surveyor_id)
SELECT migrate_surveyor_to_schema(X);

-- Verify migration
SELECT * FROM admin.surveyor_schemas;
SELECT * FROM admin.schema_storage;


Step 4: Update backend and deploy
----------------------------------
1. Deploy backend with schema-aware code
2. Test with each migrated surveyor
3. Verify QGIS connectivity

⚠️ IMPORTANT: QGIS Integration Notes
------------------------------------
- DO NOT use project-specific views (e.g., land_parcels_project_66)
- USE base tables: land_parcels, coordinate_points
- Apply filter in QGIS: "project_id" = X
- Why: Base tables are more reliable for editing in QGIS
- Schema isolation already provides surveyor-level separation
- See SCHEMA_QGIS_INTEGRATION.md for detailed workflow


Step 5: Verify data integrity
------------------------------
-- For each surveyor, verify row counts match
SELECT u.email, s.schema_name,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = s.schema_name) AS new_tables
FROM surveyor_profiles s
JOIN users u ON s.user_id = u.id
WHERE s.schema_name IS NOT NULL;


Step 6: Clean up old data (AFTER VERIFICATION)
-----------------------------------------------
-- ⚠️ DANGER ZONE - Only run after thorough verification!
-- DELETE FROM public.survey_projects WHERE surveyor_profile_id IN (SELECT id FROM surveyor_profiles WHERE schema_name IS NOT NULL);
-- DELETE FROM public.coordinate_points WHERE project_id IN (...);
-- DELETE FROM public.land_parcels WHERE project_id IN (...);

*/

-- =====================================================
-- Migration complete!
-- =====================================================

COMMENT ON SCHEMA public IS 'Shared data across all surveyors (users, districts, control points)';
