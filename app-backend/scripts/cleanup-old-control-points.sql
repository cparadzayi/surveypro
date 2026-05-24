-- ============================================================================
-- Cleanup Script: Remove Old control_points Table
-- ============================================================================
-- Purpose: Drop the old control_points table now that zim_control_points is in use
-- Date: December 5, 2025
-- ============================================================================

\echo ''
\echo '========================================='
\echo 'Checking for old control_points table...'
\echo '========================================='
\echo ''

-- Check if old table exists
SELECT 
  tablename,
  CASE 
    WHEN tablename = 'control_points' THEN '⚠️  OLD TABLE FOUND - Will be dropped'
    WHEN tablename = 'zim_control_points' THEN '✅ NEW TABLE - Will be kept'
  END as status
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename LIKE '%control_points%'
  AND tablename NOT LIKE 'project_control_points'
ORDER BY tablename;

\echo ''
\echo '========================================='
\echo 'Dropping old table...'
\echo '========================================='
\echo ''

-- Drop the old table if it exists
DROP TABLE IF EXISTS public.control_points CASCADE;

\echo '✅ Old control_points table dropped (if it existed)'
\echo ''

-- Verify only zim_control_points remains
\echo ''
\echo '========================================='
\echo 'Verification: Remaining Tables'
\echo '========================================='
\echo ''

SELECT 
  tablename,
  '✅ Active' as status
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename LIKE '%control_points%'
ORDER BY tablename;

\echo ''
\echo '========================================='
\echo 'Record count in zim_control_points:'
\echo '========================================='
\echo ''

SELECT COUNT(*) as total_records FROM public.zim_control_points;

\echo ''
\echo '✅ Cleanup complete!'
\echo ''
