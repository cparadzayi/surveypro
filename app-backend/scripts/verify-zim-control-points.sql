-- ============================================================================
-- Verification Script for zim_control_points Table
-- ============================================================================
-- Purpose: Verify new zim_control_points table and update foreign key constraints
-- Date: December 5, 2025
-- ============================================================================

\echo ''
\echo '========================================='
\echo 'Checking zim_control_points table...'
\echo '========================================='
\echo ''

-- 1. Check if table exists
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'zim_control_points'
    ) THEN '✅ zim_control_points table EXISTS'
    ELSE '❌ zim_control_points table DOES NOT EXIST'
  END as status;

\echo ''
\echo 'Table Structure:'
\echo ''

-- 2. Show table structure
SELECT 
  column_name,
  data_type,
  character_maximum_length,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'zim_control_points'
ORDER BY ordinal_position;

\echo ''
\echo 'Indexes:'
\echo ''

-- 3. Show indexes
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'zim_control_points'
ORDER BY indexname;

\echo ''
\echo 'Record Counts by Type:'
\echo ''

-- 4. Count records by type
SELECT 
  type,
  COUNT(*) as count
FROM public.zim_control_points
GROUP BY type
ORDER BY 
  CASE type 
    WHEN 'PRIM' THEN 1 
    WHEN 'SEC' THEN 2 
    WHEN 'TERT' THEN 3 
    WHEN 'QUART' THEN 4 
    WHEN 'TSM' THEN 5 
    ELSE 6 
  END;

\echo ''
\echo 'Record Counts by Lo Zone:'
\echo ''

-- 5. Count records by Lo zone
SELECT 
  gauss_lo,
  COUNT(*) as count,
  COUNT(lat_wgs84) as with_wgs84,
  ROUND(100.0 * COUNT(lat_wgs84) / COUNT(*), 2) as wgs84_coverage_percent
FROM public.zim_control_points
WHERE gauss_lo IS NOT NULL
GROUP BY gauss_lo
ORDER BY gauss_lo;

\echo ''
\echo 'Sample Records (Lo 31):'
\echo ''

-- 6. Show sample records for Lo 31
SELECT 
  id,
  monu_num,
  monu_name,
  type,
  ROUND(y_gauss::numeric, 2) as y_gauss,
  ROUND(x_gauss::numeric, 2) as x_gauss,
  ROUND(lat_wgs84::numeric, 6) as lat_wgs84,
  ROUND(lng_wgs84::numeric, 6) as lng_wgs84,
  area_nm
FROM public.zim_control_points
WHERE gauss_lo = 31
LIMIT 5;

\echo ''
\echo '========================================='
\echo 'Checking Foreign Key Constraints...'
\echo '========================================='
\echo ''

-- 7. Show current foreign key constraints on project_control_points
SELECT 
  conname as constraint_name,
  conrelid::regclass as table_name,
  confrelid::regclass as references_table,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'project_control_points'::regclass
  AND contype = 'f';

\echo ''
\echo '========================================='
\echo 'Update Foreign Key Constraint (if needed)'
\echo '========================================='
\echo ''
\echo 'Run the following commands to update the foreign key:'
\echo ''
\echo 'BEGIN;'
\echo ''
\echo '-- Drop old constraint (if exists)'
\echo 'ALTER TABLE project_control_points'
\echo '  DROP CONSTRAINT IF EXISTS project_control_points_control_point_id_fkey;'
\echo ''
\echo '-- Add new constraint pointing to zim_control_points'
\echo 'ALTER TABLE project_control_points'
\echo '  ADD CONSTRAINT project_control_points_control_point_id_fkey'
\echo '  FOREIGN KEY (control_point_id)'
\echo '  REFERENCES public.zim_control_points(id)'
\echo '  ON DELETE CASCADE;'
\echo ''
\echo 'COMMIT;'
\echo ''

-- Uncomment below to automatically update the constraint:
-- BEGIN;
-- 
-- ALTER TABLE project_control_points 
--   DROP CONSTRAINT IF EXISTS project_control_points_control_point_id_fkey;
-- 
-- ALTER TABLE project_control_points
--   ADD CONSTRAINT project_control_points_control_point_id_fkey
--   FOREIGN KEY (control_point_id) 
--   REFERENCES public.zim_control_points(id) 
--   ON DELETE CASCADE;
-- 
-- COMMIT;
-- 
-- \echo '✅ Foreign key constraint updated successfully!'
