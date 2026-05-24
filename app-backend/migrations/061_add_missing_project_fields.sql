-- Migration 061: Add missing fields to survey_projects table
--
-- PROBLEM: Project setup data (datum, instruments, designation, township) is not persisting
-- CAUSE: These columns don't exist in the survey_projects table schema
-- SOLUTION: Add these columns to all surveyor schemas

BEGIN;

-- ============================================================================
-- ADD MISSING COLUMNS TO PUBLIC SCHEMA (if it exists there)
-- ============================================================================

-- Check if survey_projects exists in public schema (legacy)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'survey_projects') THEN
    -- Add datum column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'survey_projects' AND column_name = 'datum') THEN
      ALTER TABLE public.survey_projects ADD COLUMN datum VARCHAR(50) DEFAULT 'hartebeesthoek94';
      RAISE NOTICE 'Added datum column to public.survey_projects';
    END IF;
    
    -- Add instruments column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'survey_projects' AND column_name = 'instruments') THEN
      ALTER TABLE public.survey_projects ADD COLUMN instruments TEXT;
      RAISE NOTICE 'Added instruments column to public.survey_projects';
    END IF;
    
    -- Add designation column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'survey_projects' AND column_name = 'designation') THEN
      ALTER TABLE public.survey_projects ADD COLUMN designation TEXT;
      RAISE NOTICE 'Added designation column to public.survey_projects';
    END IF;
    
    -- Add township column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'survey_projects' AND column_name = 'township') THEN
      ALTER TABLE public.survey_projects ADD COLUMN township VARCHAR(100);
      RAISE NOTICE 'Added township column to public.survey_projects';
    END IF;
  END IF;
END $$;

-- ============================================================================
-- ADD MISSING COLUMNS TO ALL SURVEYOR SCHEMAS
-- ============================================================================

DO $$
DECLARE
  schema_rec RECORD;
  column_exists BOOLEAN;
BEGIN
  -- Loop through all surveyor schemas (schemas starting with 'surveyor_')
  FOR schema_rec IN 
    SELECT schema_name 
    FROM information_schema.schemata 
    WHERE schema_name LIKE 'surveyor_%'
  LOOP
    RAISE NOTICE 'Processing schema: %', schema_rec.schema_name;
    
    -- Check if survey_projects table exists in this schema
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = schema_rec.schema_name 
      AND table_name = 'survey_projects'
    ) THEN
      
      -- Add datum column
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = schema_rec.schema_name 
        AND table_name = 'survey_projects' 
        AND column_name = 'datum'
      ) INTO column_exists;
      
      IF NOT column_exists THEN
        EXECUTE format('ALTER TABLE %I.survey_projects ADD COLUMN datum VARCHAR(50) DEFAULT ''hartebeesthoek94''', schema_rec.schema_name);
        RAISE NOTICE '  [OK] Added datum column to %.survey_projects', schema_rec.schema_name;
      ELSE
        RAISE NOTICE '  [SKIP] datum column already exists in %.survey_projects', schema_rec.schema_name;
      END IF;
      
      -- Add instruments column
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = schema_rec.schema_name 
        AND table_name = 'survey_projects' 
        AND column_name = 'instruments'
      ) INTO column_exists;
      
      IF NOT column_exists THEN
        EXECUTE format('ALTER TABLE %I.survey_projects ADD COLUMN instruments TEXT', schema_rec.schema_name);
        RAISE NOTICE '  [OK] Added instruments column to %.survey_projects', schema_rec.schema_name;
      ELSE
        RAISE NOTICE '  [SKIP] instruments column already exists in %.survey_projects', schema_rec.schema_name;
      END IF;
      
      -- Add designation column
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = schema_rec.schema_name 
        AND table_name = 'survey_projects' 
        AND column_name = 'designation'
      ) INTO column_exists;
      
      IF NOT column_exists THEN
        EXECUTE format('ALTER TABLE %I.survey_projects ADD COLUMN designation TEXT', schema_rec.schema_name);
        RAISE NOTICE '  [OK] Added designation column to %.survey_projects', schema_rec.schema_name;
      ELSE
        RAISE NOTICE '  [SKIP] designation column already exists in %.survey_projects', schema_rec.schema_name;
      END IF;
      
      -- Add township column
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = schema_rec.schema_name 
        AND table_name = 'survey_projects' 
        AND column_name = 'township'
      ) INTO column_exists;
      
      IF NOT column_exists THEN
        EXECUTE format('ALTER TABLE %I.survey_projects ADD COLUMN township VARCHAR(100)', schema_rec.schema_name);
        RAISE NOTICE '  [OK] Added township column to %.survey_projects', schema_rec.schema_name;
      ELSE
        RAISE NOTICE '  [SKIP] township column already exists in %.survey_projects', schema_rec.schema_name;
      END IF;
      
    ELSE
      RAISE NOTICE '  [WARN] survey_projects table does not exist in %', schema_rec.schema_name;
    END IF;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 061 complete!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Added columns to survey_projects:';
  RAISE NOTICE '  - datum (VARCHAR(50), default: hartebeesthoek94)';
  RAISE NOTICE '  - instruments (TEXT)';
  RAISE NOTICE '  - designation (TEXT)';
  RAISE NOTICE '  - township (VARCHAR(100))';
  RAISE NOTICE '';
END $$;

COMMIT;
