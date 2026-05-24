-- Fix migration 078 issue
-- Mark 078.do.sql as applied (it has errors, will be fixed by 078_fix_view.sql)

INSERT INTO migrations (name, applied_at) 
VALUES ('078.do.sql', NOW()) 
ON CONFLICT (name) DO NOTHING;

-- Now you can run: npm run migrate
-- This will apply 078_fix_view.sql and 079_add_status_to_coordinate_points.sql
