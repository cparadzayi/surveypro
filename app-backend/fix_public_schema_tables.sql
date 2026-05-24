-- Fix: Ensure coordinate_points and project_csv_imports tables exist in public schema
-- This is a temporary fix until schema-per-surveyor migration is completed

-- Check if coordinate_points exists in public schema
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename = 'coordinate_points'
    ) THEN
        RAISE NOTICE 'Creating coordinate_points table in public schema...';
        
        CREATE TABLE public.coordinate_points (
            id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL REFERENCES survey_projects(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            geom GEOMETRY(Point, 4326),
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
        
        CREATE INDEX idx_coordinate_points_project ON public.coordinate_points(project_id);
        CREATE INDEX idx_coordinate_points_geom ON public.coordinate_points USING GIST(geom);
        
        RAISE NOTICE '✅ coordinate_points table created in public schema';
    ELSE
        RAISE NOTICE '✅ coordinate_points table already exists in public schema';
    END IF;
END $$;

-- Check if project_csv_imports exists in public schema
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename = 'project_csv_imports'
    ) THEN
        RAISE NOTICE 'Creating project_csv_imports table in public schema...';
        
        CREATE TABLE public.project_csv_imports (
            id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL REFERENCES survey_projects(id) ON DELETE CASCADE,
            csv_hash VARCHAR(64) NOT NULL,
            point_count INTEGER NOT NULL,
            filename VARCHAR(255),
            imported_by INTEGER REFERENCES users(id),
            coordinate_system VARCHAR(50),
            metadata JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(project_id, csv_hash)
        );
        
        CREATE INDEX idx_project_csv_imports_project ON public.project_csv_imports(project_id);
        CREATE INDEX idx_project_csv_imports_hash ON public.project_csv_imports(csv_hash);
        
        RAISE NOTICE '✅ project_csv_imports table created in public schema';
    ELSE
        RAISE NOTICE '✅ project_csv_imports table already exists in public schema';
    END IF;
END $$;

-- Verify tables exist
SELECT 
    schemaname, 
    tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('coordinate_points', 'project_csv_imports')
ORDER BY tablename;
