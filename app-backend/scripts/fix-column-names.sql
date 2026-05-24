-- ============================================================================
-- Fix Column Names in zim_control_points Table
-- ============================================================================
-- Purpose: Rename columns to match the expected schema (add underscores)
-- Date: December 5, 2025
-- ============================================================================

\echo ''
\echo '========================================='
\echo 'Fixing column names in zim_control_points'
\echo '========================================='
\echo ''

-- Rename columns to match expected schema
-- Based on actual table structure from \d zim_control_points

-- Monument identification (monunum -> monu_num, monunm -> monu_name)
ALTER TABLE public.zim_control_points RENAME COLUMN monunum TO monu_num;
ALTER TABLE public.zim_control_points RENAME COLUMN monunm TO monu_name;

-- Height fields (remove underscores from these)
ALTER TABLE public.zim_control_points RENAME COLUMN pedhgt TO ped_hgt;
ALTER TABLE public.zim_control_points RENAME COLUMN pillhgt TO pill_hgt;
ALTER TABLE public.zim_control_points RENAME COLUMN topsignal TO top_signal;
ALTER TABLE public.zim_control_points RENAME COLUMN botsignal TO bot_signal;

-- Administrative fields
ALTER TABLE public.zim_control_points RENAME COLUMN degsqr TO deg_sqr;
ALTER TABLE public.zim_control_points RENAME COLUMN lon_wgs84 TO lng_wgs84;

\echo ''
\echo '✅ Column names fixed!'
\echo ''
\echo 'Verifying new column names...'
\echo ''

-- Verify the columns
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'zim_control_points' 
ORDER BY ordinal_position;

\echo ''
\echo '✅ Done!'
\echo ''
