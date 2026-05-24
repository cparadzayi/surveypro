-- Migration 079: Add missing columns to survey_projects
-- Purpose: Add designation, instruments, and datum fields
-- Date: 2025-12-29

-- Add missing columns to all surveyor schemas
DO $$
DECLARE
  schema_rec RECORD;
BEGIN
  -- Loop through all surveyor schemas
  FOR schema_rec IN 
    SELECT schema_name 
    FROM surveyor_profiles 
    WHERE schema_name IS NOT NULL
  LOOP
    -- Add designation column if it doesn't exist
    EXECUTE format('
      ALTER TABLE %I.survey_projects 
      ADD COLUMN IF NOT EXISTS designation TEXT
    ', schema_rec.schema_name);
    
    -- Add instruments column if it doesn't exist
    EXECUTE format('
      ALTER TABLE %I.survey_projects 
      ADD COLUMN IF NOT EXISTS instruments VARCHAR(255)
    ', schema_rec.schema_name);
    
    -- Add datum column if it doesn't exist
    EXECUTE format('
      ALTER TABLE %I.survey_projects 
      ADD COLUMN IF NOT EXISTS datum VARCHAR(50)
    ', schema_rec.schema_name);
    
    -- Add workflow_state column if it doesn't exist
    EXECUTE format('
      ALTER TABLE %I.survey_projects 
      ADD COLUMN IF NOT EXISTS workflow_state JSONB DEFAULT ''{"completed_steps": [], "current_step": "project-setup", "step_data": {}, "generated_documents": {}, "can_finalize": false}''::jsonb
    ', schema_rec.schema_name);
    
    RAISE NOTICE 'Added missing columns to schema: %', schema_rec.schema_name;
  END LOOP;
END $$;

-- Update the create_surveyor_schema function to include all fields in new schemas
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
      township VARCHAR(255),
      designation TEXT,
      survey_date DATE,
      district VARCHAR(100),
      central_meridian VARCHAR(10),
      instruments VARCHAR(255),
      datum VARCHAR(50),
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
      area_m2 NUMERIC(12, 2),
      area_ha NUMERIC(12, 4),
      perimeter_m NUMERIC(12, 2),
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

COMMENT ON FUNCTION create_surveyor_schema IS 'Creates a complete surveyor schema with all necessary tables and permissions (updated with all project fields)';
