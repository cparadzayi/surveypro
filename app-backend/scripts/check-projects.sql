-- Check survey projects and their relationships

-- 1. Check if there are any projects
SELECT COUNT(*) as total_projects FROM survey_projects;

-- 2. Check projects with surveyor details
SELECT 
  sp.id, 
  sp.name, 
  sp.surveyor_profile_id, 
  sp.status,
  sp.created_at,
  p.name as surveyor_name,
  p.user_id
FROM survey_projects sp 
LEFT JOIN surveyor_profiles p ON sp.surveyor_profile_id = p.id 
ORDER BY sp.created_at DESC 
LIMIT 10;

-- 3. Check surveyor profiles
SELECT 
  id,
  name,
  user_id,
  surveyor_type,
  license_number
FROM surveyor_profiles
ORDER BY created_at DESC;

-- 4. Check users
SELECT 
  id,
  email,
  user_type,
  created_at
FROM users
ORDER BY created_at DESC;

-- 5. Check for orphaned projects (projects without valid surveyor_profile_id)
SELECT 
  sp.id,
  sp.name,
  sp.surveyor_profile_id,
  CASE 
    WHEN p.id IS NULL THEN 'ORPHANED - No matching surveyor profile'
    ELSE 'OK'
  END as status
FROM survey_projects sp
LEFT JOIN surveyor_profiles p ON sp.surveyor_profile_id = p.id
WHERE p.id IS NULL;
