-- Find which schema contains coordinate_points table
SELECT 
  schemaname,
  tablename,
  COUNT(*) as row_count
FROM pg_tables 
WHERE tablename = 'coordinate_points'
GROUP BY schemaname, tablename;

-- Also check surveyor_profiles to see what schemas exist
SELECT 
  id,
  username,
  schema_name,
  surveyor_type
FROM surveyor_profiles
ORDER BY id;
