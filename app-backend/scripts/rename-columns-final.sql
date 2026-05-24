-- ============================================================================
-- Rename Columns in zim_control_points to Match Backend Code
-- ============================================================================
-- This script renames columns to match what the backend expects
-- ============================================================================

\echo ''
\echo '========================================='
\echo 'Renaming columns in zim_control_points'
\echo '========================================='
\echo ''

-- Rename all columns to match backend expectations
ALTER TABLE public.zim_control_points RENAME COLUMN monunum TO monu_num;
ALTER TABLE public.zim_control_points RENAME COLUMN monunm TO monu_name;
ALTER TABLE public.zim_control_points RENAME COLUMN pedhgt TO ped_hgt;
ALTER TABLE public.zim_control_points RENAME COLUMN pillhgt TO pill_hgt;
ALTER TABLE public.zim_control_points RENAME COLUMN topsignal TO top_signal;
ALTER TABLE public.zim_control_points RENAME COLUMN botsignal TO bot_signal;
ALTER TABLE public.zim_control_points RENAME COLUMN degsqr TO deg_sqr;
ALTER TABLE public.zim_control_points RENAME COLUMN lon_wgs84 TO lng_wgs84;

\echo ''
\echo '✅ Columns renamed!'
\echo ''
\echo 'Verifying column names...'
\echo ''

-- Show renamed columns
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'zim_control_points' 
  AND column_name IN ('monu_num', 'monu_name', 'ped_hgt', 'pill_hgt', 'top_signal', 'bot_signal', 'deg_sqr', 'lng_wgs84')
ORDER BY column_name;

\echo ''
\echo '✅ Done!'
\echo ''
