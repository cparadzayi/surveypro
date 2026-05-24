-- Diagnostic query to check Outside Figure Data parcel

-- First, let's see the table structure
\d land_parcels

-- 1. Find ALL parcels (to see what exists)
SELECT 
  id,
  project_id,
  stand,
  designation,
  ST_Area(geom) as calculated_area,
  metadata->>'isOutsideFigure' as is_outside_figure_flag,
  jsonb_array_length(COALESCE(metadata->'residuals'->'edges', '[]'::jsonb)) as edge_count,
  jsonb_array_length(COALESCE(metadata->'cape_lo_points', '[]'::jsonb)) as point_count,
  metadata->'residuals'->'edges' IS NOT NULL as has_edges,
  metadata->'cape_lo_points' IS NOT NULL as has_points
FROM land_parcels
ORDER BY id DESC
LIMIT 10;

-- 2. Find parcels with "Outside Figure" in designation or stand
SELECT 
  id,
  project_id,
  stand,
  designation,
  metadata->>'isOutsideFigure' as is_outside_figure_flag,
  jsonb_array_length(COALESCE(metadata->'residuals'->'edges', '[]'::jsonb)) as edge_count,
  jsonb_array_length(COALESCE(metadata->'cape_lo_points', '[]'::jsonb)) as point_count,
  metadata->'residuals'->'edges' IS NOT NULL as has_edges,
  metadata->'cape_lo_points' IS NOT NULL as has_points
FROM land_parcels
WHERE 
  LOWER(COALESCE(designation, '')) LIKE '%outside figure%' 
  OR LOWER(COALESCE(stand, '')) LIKE '%outside figure%'
  OR (metadata->>'isOutsideFigure')::boolean = true
ORDER BY id DESC;

-- 2. Show detailed metadata for Outside Figure parcel
SELECT 
  id,
  stand,
  designation,
  jsonb_pretty(metadata->'residuals'->'edges') as edges_data,
  jsonb_pretty(metadata->'cape_lo_points') as points_data
FROM land_parcels
WHERE 
  LOWER(designation) LIKE '%outside figure%' 
  OR LOWER(stand) LIKE '%outside figure%'
LIMIT 1;

-- 3. Check if metadata structure is correct
SELECT 
  id,
  stand,
  metadata ? 'residuals' as has_residuals_key,
  metadata->'residuals' ? 'edges' as has_edges_key,
  metadata ? 'cape_lo_points' as has_cape_lo_points_key,
  jsonb_typeof(metadata->'residuals'->'edges') as edges_type,
  jsonb_typeof(metadata->'cape_lo_points') as points_type
FROM land_parcels
WHERE 
  LOWER(designation) LIKE '%outside figure%' 
  OR LOWER(stand) LIKE '%outside figure%';
