-- Verify surveyor_kuziva_paradzayi schema setup
-- Run this to check if everything is configured correctly

-- 1. Check if schema exists
SELECT 
    'Schema Check' as test,
    CASE WHEN EXISTS (
        SELECT 1 FROM pg_namespace WHERE nspname = 'surveyor_kuziva_paradzayi'
    ) THEN '✅ EXISTS' ELSE '❌ MISSING' END as result;

-- 2. Check tables in schema
SELECT 
    'Tables in Schema' as test,
    string_agg(tablename, ', ') as result
FROM pg_tables 
WHERE schemaname = 'surveyor_kuziva_paradzayi';

-- 3. Check surveyor profile
SELECT 
    'Surveyor Profile' as test,
    CONCAT('ID: ', id, ', Name: ', name, ', Schema: ', COALESCE(schema_name, 'NULL')) as result
FROM surveyor_profiles
WHERE name = 'Kuziva Paradzayi';

-- 4. Check coordinate_points table structure
SELECT 
    'coordinate_points columns' as test,
    string_agg(column_name || ' (' || data_type || ')', ', ') as result
FROM information_schema.columns
WHERE table_schema = 'surveyor_kuziva_paradzayi'
AND table_name = 'coordinate_points';

-- 5. Test insert into coordinate_points (will rollback)
BEGIN;
INSERT INTO surveyor_kuziva_paradzayi.coordinate_points 
    (project_id, name, geom, elevation, description)
VALUES 
    (6, 'TEST_POINT', ST_SetSRID(ST_MakePoint(2247571.92, 96892.2), 22291), 100.0, 'Test point');
SELECT 'Test Insert' as test, '✅ SUCCESS' as result;
ROLLBACK;
