-- Check detailed project information

-- Show all fields for your projects
SELECT 
  id,
  name,
  project_id,
  client_name,
  district,
  survey_type,
  survey_date,
  instruments,
  designation,
  working_directory,
  central_meridian,
  status,
  created_at
FROM survey_projects
WHERE surveyor_profile_id = 8
ORDER BY created_at DESC;

-- Check control points for these projects
SELECT 
  sp.id as project_id,
  sp.name as project_name,
  COUNT(pcp.control_point_id) as control_point_count,
  STRING_AGG(cp.monu_num, ', ') as control_points
FROM survey_projects sp
LEFT JOIN project_control_points pcp ON sp.id = pcp.project_id
LEFT JOIN control_points cp ON pcp.control_point_id = cp.id
WHERE sp.surveyor_profile_id = 8
GROUP BY sp.id, sp.name
ORDER BY sp.created_at DESC;
