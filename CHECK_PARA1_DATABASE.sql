-- Check if Para1 project has survey_type in the database

-- Query 1: Check the Para1 project data
SELECT 
    id,
    name,
    survey_type,
    district,
    survey_date,
    designation,
    working_directory,
    central_meridian,
    surveyor_profile_id,
    status,
    created_at
FROM survey_projects
WHERE name = 'Para1';

-- Query 2: Check all projects for the surveyor
SELECT 
    id,
    name,
    survey_type,
    district,
    surveyor_profile_id
FROM survey_projects
WHERE surveyor_profile_id = (
    SELECT surveyor_profile_id 
    FROM survey_projects 
    WHERE name = 'Para1' 
    LIMIT 1
)
AND status = 'active'
ORDER BY created_at DESC;

-- Query 3: Check the table schema to confirm survey_type column exists
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'survey_projects'
AND column_name = 'survey_type';

-- Query 4: Update Para1 to have survey_type if it's NULL
-- (Uncomment to execute)
-- UPDATE survey_projects
-- SET survey_type = 'subdivision'
-- WHERE name = 'Para1'
-- AND survey_type IS NULL;
