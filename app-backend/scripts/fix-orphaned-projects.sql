-- Fix orphaned survey projects
-- This script assigns orphaned projects to the first available surveyor profile

BEGIN;

-- Show current state
SELECT 
  'BEFORE FIX' as status,
  COUNT(*) as orphaned_projects
FROM survey_projects sp
LEFT JOIN surveyor_profiles p ON sp.surveyor_profile_id = p.id
WHERE p.id IS NULL;

-- Get the first surveyor profile (usually Charles Makonese)
DO $$
DECLARE
  first_profile_id INTEGER;
  orphaned_count INTEGER;
BEGIN
  -- Get first surveyor profile
  SELECT id INTO first_profile_id 
  FROM surveyor_profiles 
  ORDER BY created_at ASC 
  LIMIT 1;
  
  IF first_profile_id IS NULL THEN
    RAISE EXCEPTION 'No surveyor profiles found! Please create a surveyor profile first.';
  END IF;
  
  RAISE NOTICE 'Using surveyor profile ID: %', first_profile_id;
  
  -- Count orphaned projects
  SELECT COUNT(*) INTO orphaned_count
  FROM survey_projects sp
  LEFT JOIN surveyor_profiles p ON sp.surveyor_profile_id = p.id
  WHERE p.id IS NULL;
  
  RAISE NOTICE 'Found % orphaned projects', orphaned_count;
  
  -- Fix orphaned projects
  UPDATE survey_projects
  SET surveyor_profile_id = first_profile_id
  WHERE surveyor_profile_id IS NULL 
     OR surveyor_profile_id NOT IN (SELECT id FROM surveyor_profiles);
  
  RAISE NOTICE 'Fixed % orphaned projects', orphaned_count;
END $$;

-- Show final state
SELECT 
  'AFTER FIX' as status,
  COUNT(*) as orphaned_projects
FROM survey_projects sp
LEFT JOIN surveyor_profiles p ON sp.surveyor_profile_id = p.id
WHERE p.id IS NULL;

-- Show all projects with their surveyors
SELECT 
  sp.id,
  sp.name as project_name,
  sp.surveyor_profile_id,
  p.name as surveyor_name,
  sp.status,
  sp.created_at
FROM survey_projects sp
LEFT JOIN surveyor_profiles p ON sp.surveyor_profile_id = p.id
ORDER BY sp.created_at DESC;

COMMIT;

-- Summary
SELECT 
  COUNT(*) as total_projects,
  COUNT(CASE WHEN sp.status = 'active' THEN 1 END) as active_projects,
  COUNT(CASE WHEN sp.status = 'archived' THEN 1 END) as archived_projects,
  COUNT(DISTINCT sp.surveyor_profile_id) as unique_surveyors
FROM survey_projects sp;
