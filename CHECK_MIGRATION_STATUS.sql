-- Check which migrations have been applied
SELECT * FROM schema_migrations ORDER BY version DESC LIMIT 10;

-- Check if the generate_parcel_metadata function exists and its definition
SELECT 
  proname as function_name,
  pg_get_functiondef(oid) as function_definition
FROM pg_proc 
WHERE proname = 'generate_parcel_metadata';
