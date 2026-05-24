-- Check the actual structure of the projects table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'projects'
ORDER BY ordinal_position;

-- Also check if the table exists at all
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_name = 'projects'
);

-- List all tables to see what we have
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
