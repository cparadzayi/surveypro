-- Verify surveyor profiles have schema_name
SELECT 
  id,
  name,
  user_id,
  schema_name,
  surveyor_type,
  license_number
FROM surveyor_profiles
ORDER BY id;

-- Check if schemas exist
SELECT schema_name 
FROM information_schema.schemata 
WHERE schema_name LIKE 'surveyor_%'
ORDER BY schema_name;
