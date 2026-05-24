-- Test if project can be created in surveyor schema
SET search_path = surveyor_kuziva_paradzayi, public;

-- Check current projects
SELECT id, name, survey_type, district, created_at 
FROM survey_projects 
ORDER BY created_at DESC 
LIMIT 5;

-- Test INSERT (this is what the backend is doing)
INSERT INTO survey_projects 
  (name, project_id, client_name, district, survey_type, survey_date, instruments, designation, working_directory, central_meridian)
VALUES 
  ('Test Project', NULL, NULL, 'Shabani', 'subdivision', '2025-12-09', NULL, NULL, NULL, NULL)
RETURNING *;

-- Clean up test
DELETE FROM survey_projects WHERE name = 'Test Project';
