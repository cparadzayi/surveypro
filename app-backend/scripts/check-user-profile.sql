-- Check which user and profile you're logged in as

-- 1. Show all users and their profiles
SELECT 
  u.id as user_id,
  u.email,
  u.user_type,
  sp.id as profile_id,
  sp.name as profile_name,
  sp.surveyor_type,
  sp.license_number
FROM users u
LEFT JOIN surveyor_profiles sp ON u.id = sp.user_id
ORDER BY u.created_at DESC;

-- 2. Show projects for each profile
SELECT 
  sp.id as profile_id,
  sp.name as surveyor_name,
  COUNT(proj.id) as project_count,
  STRING_AGG(proj.name, ', ') as project_names
FROM surveyor_profiles sp
LEFT JOIN survey_projects proj ON sp.id = proj.surveyor_profile_id AND proj.status = 'active'
GROUP BY sp.id, sp.name
ORDER BY sp.id;

-- 3. Check if there are multiple profiles with same name
SELECT 
  name,
  COUNT(*) as count,
  STRING_AGG(id::text, ', ') as profile_ids
FROM surveyor_profiles
GROUP BY name
HAVING COUNT(*) > 1;
