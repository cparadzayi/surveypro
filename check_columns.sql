-- Check column names in zim_control_points table

SELECT column_name, data_type 
FROM information_schema.columns
WHERE table_name = 'zim_control_points'
ORDER BY ordinal_position;
