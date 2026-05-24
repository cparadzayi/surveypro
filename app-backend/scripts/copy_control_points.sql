-- =====================================================
-- Copy control_points from surveypro_v1 to surveypro_db
-- =====================================================
-- This script copies the Zimbabwe national control points
-- Run with: psql -U postgres -d surveypro_db -f copy_control_points.sql

\echo '📋 Copying control_points from surveypro_v1...'

-- Enable dblink extension if not already enabled
CREATE EXTENSION IF NOT EXISTS dblink;

-- Copy all control points
INSERT INTO control_points (
  id, name, point_number, y, x, z, description, 
  survey_date, surveyor, accuracy_class, network_type, 
  monument_type, district_id, is_national, metadata, 
  created_at, updated_at, geom
)
SELECT 
  id, name, point_number, y, x, z, description, 
  survey_date, surveyor, accuracy_class, network_type, 
  monument_type, district_id, is_national, metadata, 
  created_at, updated_at, geom
FROM dblink(
  'dbname=surveypro_v1 user=postgres password=YOUR_PASSWORD',
  'SELECT 
    id, name, point_number, y, x, z, description, 
    survey_date, surveyor, accuracy_class, network_type, 
    monument_type, district_id, is_national, metadata, 
    created_at, updated_at, geom
  FROM control_points'
) AS t(
  id INTEGER,
  name VARCHAR(100),
  point_number VARCHAR(50),
  y NUMERIC(15, 6),
  x NUMERIC(15, 6),
  z NUMERIC(10, 3),
  description TEXT,
  survey_date DATE,
  surveyor VARCHAR(255),
  accuracy_class VARCHAR(10),
  network_type VARCHAR(50),
  monument_type VARCHAR(100),
  district_id INTEGER,
  is_national BOOLEAN,
  metadata JSONB,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  geom GEOMETRY
)
ON CONFLICT (name) DO UPDATE SET
  y = EXCLUDED.y,
  x = EXCLUDED.x,
  z = EXCLUDED.z,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

-- Update sequence
SELECT setval('control_points_id_seq', (SELECT COALESCE(MAX(id), 1) FROM control_points));

-- Report
SELECT 
  COUNT(*) as total_points,
  COUNT(CASE WHEN is_national = true THEN 1 END) as national_points,
  COUNT(CASE WHEN is_national = false OR is_national IS NULL THEN 1 END) as other_points
FROM control_points;

\echo '✅ Control points copied successfully!'
