-- Quick check for control points tables

SELECT 
  tablename,
  CASE 
    WHEN tablename = 'control_points' THEN '❌ OLD TABLE (needs rename)'
    WHEN tablename = 'zim_control_points' THEN '✅ NEW TABLE (correct)'
    ELSE ''
  END as status
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename LIKE '%control_points%'
ORDER BY tablename;

-- Count records if tables exist
SELECT 'control_points' as table_name, COUNT(*) as count 
FROM control_points 
WHERE EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'control_points')
UNION ALL
SELECT 'zim_control_points' as table_name, COUNT(*) as count 
FROM zim_control_points 
WHERE EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'zim_control_points');
