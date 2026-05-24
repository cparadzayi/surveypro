-- Check what columns exist in surveyor schema survey_projects table
SET search_path = surveyor_kuziva_paradzayi, public;

-- Show table structure
\d survey_projects

-- Or use this query:
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'surveyor_kuziva_paradzayi'
  AND table_name = 'survey_projects'
ORDER BY ordinal_position;
