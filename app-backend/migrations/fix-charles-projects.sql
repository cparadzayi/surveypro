-- Fix Charles Paradzayi's projects to link to his surveyor profile
-- This script links existing projects from the old surveyor_id to the new surveyor_profile_id

-- First, let's see what we have
SELECT 
  'OLD SURVEYORS TABLE:' as info,
  s.id as old_surveyor_id,
  s.name,
  s.license_number,
  s.email
FROM surveyors s
WHERE s.name LIKE '%Charles%' OR s.name LIKE '%Paradzayi%';

SELECT 
  'NEW SURVEYOR PROFILES TABLE:' as info,
  p.id as profile_id,
  p.name,
  p.license_number,
  u.email,
  u.id as user_id
FROM surveyor_profiles p
JOIN users u ON u.id = p.user_id
WHERE p.name LIKE '%Charles%' OR p.name LIKE '%Paradzayi%' OR u.email LIKE '%paradzayi%';

SELECT 
  'SURVEY PROJECTS (OLD):' as info,
  sp.id,
  sp.name,
  sp.surveyor_id as old_surveyor_id,
  sp.surveyor_profile_id as new_profile_id,
  s.name as old_surveyor_name
FROM survey_projects sp
LEFT JOIN surveyors s ON s.id = sp.surveyor_id
WHERE sp.surveyor_id IS NOT NULL;

-- Now fix the linkage for Charles
-- This finds Charles in surveyor_profiles and links his old projects to his new profile
UPDATE survey_projects sp
SET surveyor_profile_id = (
  SELECT p.id 
  FROM surveyor_profiles p
  JOIN users u ON u.id = p.user_id
  WHERE p.license_number = '293' -- Charles's license
  LIMIT 1
)
WHERE surveyor_profile_id IS NULL 
  AND surveyor_id IN (
    SELECT id FROM surveyors WHERE license_number = '293'
  );

-- Verify the fix
SELECT 
  'FIXED PROJECTS:' as info,
  sp.id,
  sp.name,
  sp.surveyor_profile_id,
  p.name as surveyor_name,
  p.license_number
FROM survey_projects sp
JOIN surveyor_profiles p ON p.id = sp.surveyor_profile_id
WHERE p.license_number = '293';
