-- Drop triggers
DROP TRIGGER IF EXISTS update_survey_point_geom ON survey_points;
DROP TRIGGER IF EXISTS update_cad_entities_updated_at ON cad_entities;
DROP TRIGGER IF EXISTS update_survey_points_updated_at ON survey_points;
DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
DROP TRIGGER IF EXISTS update_users_updated_at ON users;

-- Drop functions
DROP FUNCTION IF EXISTS update_survey_point_geometry();
DROP FUNCTION IF EXISTS find_central_meridian(DOUBLE PRECISION);
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Drop indexes
DROP INDEX IF EXISTS idx_project_members_user;
DROP INDEX IF EXISTS idx_project_members_project;
DROP INDEX IF EXISTS idx_projects_owner;
DROP INDEX IF EXISTS idx_computations_project;
DROP INDEX IF EXISTS idx_cad_entities_project;
DROP INDEX IF EXISTS idx_survey_points_project;
DROP INDEX IF EXISTS idx_cad_entities_geometry;
DROP INDEX IF EXISTS idx_survey_points_geometry;

-- Drop tables in reverse order
DROP TABLE IF EXISTS project_members;
DROP TABLE IF EXISTS computations;
DROP TABLE IF EXISTS cad_entities;
DROP TABLE IF EXISTS survey_points;
DROP TABLE IF EXISTS projects;
DROP TABLE IF EXISTS users;

-- Drop PostGIS extension
DROP EXTENSION IF EXISTS postgis;
