-- Fix project linkage: Link old projects to new surveyor_profiles based on license_number
-- This should be run if projects aren't showing up for existing users

BEGIN;

-- Update all projects that have a surveyor_id but no surveyor_profile_id
-- Match by license_number between old surveyors and new surveyor_profiles
UPDATE survey_projects sp
SET surveyor_profile_id = (
  SELECT p.id 
  FROM surveyor_profiles p
  JOIN surveyors s ON s.license_number = p.license_number
  WHERE s.id = sp.surveyor_id
  LIMIT 1
)
WHERE sp.surveyor_profile_id IS NULL 
  AND sp.surveyor_id IS NOT NULL;

-- Show how many projects were fixed
SELECT 
  'Projects linked:' as status,
  COUNT(*) as count
FROM survey_projects 
WHERE surveyor_profile_id IS NOT NULL;

-- Show projects by surveyor
SELECT 
  p.name as surveyor_name,
  p.license_number,
  COUNT(sp.id) as project_count
FROM surveyor_profiles p
LEFT JOIN survey_projects sp ON sp.surveyor_profile_id = p.id
GROUP BY p.id, p.name, p.license_number
ORDER BY p.name;

COMMIT;
