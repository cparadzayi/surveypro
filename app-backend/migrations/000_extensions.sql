-- =====================================================
-- EXTENSIONS: PostGIS and UUID
-- =====================================================
-- This should be the first migration to run
-- Creates required PostgreSQL extensions

-- Enable PostGIS for spatial data
CREATE EXTENSION IF NOT EXISTS postgis;

-- Enable UUID generation functions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Verify extensions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
    RAISE EXCEPTION 'PostGIS extension not installed';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp') THEN
    RAISE EXCEPTION 'uuid-ossp extension not installed';
  END IF;
  
  RAISE NOTICE '✓ Extensions installed successfully: postgis, uuid-ossp';
END $$;
