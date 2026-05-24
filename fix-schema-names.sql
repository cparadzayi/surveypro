-- Fix schema_name for surveypro_db database
-- Run with: psql -U postgres -d surveypro_db -f fix-schema-names.sql

-- Step 1: Check current state
SELECT 
  sp.id,
  sp.name,
  sp.user_id,
  u.email,
  sp.schema_name,
  sp.surveyor_type
FROM surveyor_profiles sp
LEFT JOIN users u ON sp.user_id = u.id
ORDER BY sp.id;

-- Step 2: Generate and set schema_name for profiles that don't have one
-- This assumes usernames follow the email pattern
UPDATE surveyor_profiles sp
SET schema_name = 'surveyor_' || LOWER(REGEXP_REPLACE(SPLIT_PART(u.email, '@', 1), '[^a-z0-9]', '_', 'g'))
FROM users u
WHERE sp.user_id = u.id
  AND (sp.schema_name IS NULL OR sp.schema_name = '')
RETURNING sp.id, sp.name, sp.schema_name;

-- Step 3: Verify all profiles now have schema_name
SELECT 
  id,
  name,
  schema_name,
  CASE 
    WHEN schema_name IS NULL OR schema_name = '' THEN '❌ MISSING'
    ELSE '✅ OK'
  END as status
FROM surveyor_profiles
ORDER BY id;

-- Step 4: Create schemas for surveyors (if they don't exist)
-- You'll need to run this for each surveyor individually:
-- SELECT create_surveyor_schema('surveyor_kuziva_paradzayi');
-- 
-- Or run for all at once:
DO $$
DECLARE
  profile RECORD;
BEGIN
  FOR profile IN 
    SELECT schema_name 
    FROM surveyor_profiles 
    WHERE schema_name IS NOT NULL 
      AND schema_name != ''
  LOOP
    -- Check if schema exists
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.schemata 
      WHERE schema_name = profile.schema_name
    ) THEN
      -- Create schema
      RAISE NOTICE 'Creating schema: %', profile.schema_name;
      PERFORM create_surveyor_schema(profile.schema_name);
    ELSE
      RAISE NOTICE 'Schema already exists: %', profile.schema_name;
    END IF;
  END LOOP;
END $$;

-- Step 5: Verify schemas were created
SELECT 
  sp.id,
  sp.name,
  sp.schema_name,
  CASE 
    WHEN s.schema_name IS NOT NULL THEN '✅ Schema exists'
    ELSE '❌ Schema missing'
  END as schema_status
FROM surveyor_profiles sp
LEFT JOIN information_schema.schemata s ON s.schema_name = sp.schema_name
WHERE sp.schema_name IS NOT NULL
ORDER BY sp.id;
