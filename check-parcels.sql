-- ============================================
-- QGIS Parcel Diagnostic Script
-- Run this in pgAdmin or psql to check your parcels
-- ============================================

-- 1. Check current database
SELECT current_database() as connected_database;

-- 2. Check if tables exist
SELECT 
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
AND table_name IN ('land_parcels', 'area_parcels')
ORDER BY table_name;

-- 3. Check land_parcels (QGIS table)
SELECT 
  'land_parcels' as table_name,
  COUNT(*) as total_parcels,
  COUNT(DISTINCT project_id) as unique_projects,
  MIN(created_at) as oldest_parcel,
  MAX(created_at) as newest_parcel
FROM land_parcels;

-- 4. Check area_parcels (Cadastral workflow table)
SELECT 
  'area_parcels' as table_name,
  COUNT(*) as total_parcels,
  COUNT(DISTINCT project_id) as unique_projects,
  MIN(created_at) as oldest_parcel,
  MAX(created_at) as newest_parcel
FROM area_parcels;

-- 5. List all parcels in land_parcels (QGIS)
SELECT 
  id,
  project_id,
  stand as designation,
  ROUND(area_m2::numeric, 2) as area_m2,
  ROUND(perimeter_m::numeric, 2) as perimeter_m,
  ROUND(closure_error_m::numeric, 3) as closure_error_m,
  created_at
FROM land_parcels
ORDER BY project_id, stand
LIMIT 50;

-- 6. List all parcels in area_parcels (Cadastral)
SELECT 
  id,
  project_id,
  designation,
  ROUND(area_sqm::numeric, 2) as area_sqm,
  ROUND(perimeter_m::numeric, 2) as perimeter_m,
  ROUND(closure_error::numeric, 3) as closure_error,
  status,
  created_at
FROM area_parcels
ORDER BY project_id, designation
LIMIT 50;

-- 7. Check for specific project (REPLACE 62 with your project_id)
SELECT 
  'land_parcels' as source,
  COUNT(*) as parcel_count,
  ARRAY_AGG(stand ORDER BY stand) as designations
FROM land_parcels
WHERE project_id = 62
UNION ALL
SELECT 
  'area_parcels' as source,
  COUNT(*) as parcel_count,
  ARRAY_AGG(designation ORDER BY designation) as designations
FROM area_parcels
WHERE project_id = 62;

-- 8. Check coordinate_points (should have 298 points)
SELECT 
  project_id,
  COUNT(*) as point_count,
  MIN(created_at) as oldest_point,
  MAX(created_at) as newest_point
FROM coordinate_points
GROUP BY project_id
ORDER BY project_id;

-- 9. Sample parcel geometry (check if valid)
SELECT 
  id,
  stand,
  ST_IsValid(geom) as is_valid_geometry,
  ST_GeometryType(geom) as geometry_type,
  ST_SRID(geom) as srid,
  ST_NPoints(geom) as num_points
FROM land_parcels
LIMIT 5;

-- 10. Check for NULL project_ids (parcels without project association)
SELECT 
  COUNT(*) as parcels_without_project
FROM land_parcels
WHERE project_id IS NULL;
