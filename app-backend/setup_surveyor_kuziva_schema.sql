-- Setup tables for surveyor Kuziva Paradzayi in existing schema
-- Schema surveyor_kuziva_paradzayi already exists

-- 1. Check existing tables
DO $$ 
BEGIN
    RAISE NOTICE 'Checking existing tables in surveyor_kuziva_paradzayi schema...';
END $$;

-- 2. Create coordinate_points table if missing
CREATE TABLE IF NOT EXISTS surveyor_kuziva_paradzayi.coordinate_points (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    geom GEOMETRY(Point, 22291), -- Cape Lo 31 SRID
    y DOUBLE PRECISION GENERATED ALWAYS AS (ST_Y(geom)) STORED,
    x DOUBLE PRECISION GENERATED ALWAYS AS (ST_X(geom)) STORED,
    elevation DOUBLE PRECISION,
    description TEXT,
    survey_date TIMESTAMP,
    surveyor VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, name)
);

-- 3. Create indexes for coordinate_points
CREATE INDEX IF NOT EXISTS idx_coordinate_points_project 
    ON surveyor_kuziva_paradzayi.coordinate_points(project_id);
CREATE INDEX IF NOT EXISTS idx_coordinate_points_geom 
    ON surveyor_kuziva_paradzayi.coordinate_points USING GIST(geom);

-- 4. Create project_csv_imports table if missing
CREATE TABLE IF NOT EXISTS surveyor_kuziva_paradzayi.project_csv_imports (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL,
    csv_hash VARCHAR(64) NOT NULL,
    point_count INTEGER NOT NULL,
    filename VARCHAR(255),
    imported_by INTEGER,
    coordinate_system VARCHAR(50),
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, csv_hash)
);

-- 5. Create indexes for csv_imports
CREATE INDEX IF NOT EXISTS idx_project_csv_imports_project 
    ON surveyor_kuziva_paradzayi.project_csv_imports(project_id);
CREATE INDEX IF NOT EXISTS idx_project_csv_imports_hash 
    ON surveyor_kuziva_paradzayi.project_csv_imports(csv_hash);

-- 6. Update surveyor_profiles to set schema_name (force update)
UPDATE surveyor_profiles 
SET schema_name = 'surveyor_kuziva_paradzayi'
WHERE name = 'Kuziva Paradzayi';

-- 7. Verify setup
SELECT 
    '✅ Schema exists' as status,
    nspname as name
FROM pg_namespace 
WHERE nspname = 'surveyor_kuziva_paradzayi'
UNION ALL
SELECT 
    '✅ Tables in schema' as status,
    string_agg(tablename, ', ') as name
FROM pg_tables 
WHERE schemaname = 'surveyor_kuziva_paradzayi'
UNION ALL
SELECT
    '✅ Surveyor profile' as status,
    COALESCE(schema_name, 'NOT SET') as name
FROM surveyor_profiles
WHERE name = 'Kuziva Paradzayi';
