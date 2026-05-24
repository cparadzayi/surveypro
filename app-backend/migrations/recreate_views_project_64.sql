-- Drop and recreate views for project 64

-- Drop existing views
SELECT drop_project_views(64);

-- Create new views with primary key fix
SELECT create_project_views(64);

-- Verify views were created
SELECT * FROM list_project_views() WHERE project_id = 64;
