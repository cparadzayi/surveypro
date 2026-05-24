-- Fix Outside Figure Metadata for Project 5
-- This script generates the required traverse metadata (edges, points) from the geometry

-- Step 1: Check current state
SELECT 
  id,
  stand,
  designation,
  area_m2,
  ST_NPoints(geom) as vertex_count,
  jsonb_array_length(COALESCE(metadata->'residuals'->'edges', '[]'::jsonb)) as edge_count,
  metadata->'residuals'->'edges' IS NOT NULL as has_edges
FROM land_parcels
WHERE project_id = 5
  AND (stand ILIKE '%outside figure%' OR designation ILIKE '%outside figure%')
ORDER BY id;

-- Step 2: Generate metadata for Outside Figure parcel
-- This will populate metadata.residuals.edges and metadata.cape_lo_points
DO $$
DECLARE
  parcel_record RECORD;
  generated_metadata JSONB;
BEGIN
  -- Find the Outside Figure parcel for project 5
  SELECT id, stand INTO parcel_record
  FROM land_parcels
  WHERE project_id = 5
    AND (stand ILIKE '%outside figure%' OR designation ILIKE '%outside figure%')
  LIMIT 1;
  
  IF parcel_record.id IS NULL THEN
    RAISE NOTICE '❌ No Outside Figure parcel found for project 5';
    RETURN;
  END IF;
  
  RAISE NOTICE '🔍 Found Outside Figure parcel: ID %, Stand: %', parcel_record.id, parcel_record.stand;
  
  -- Generate metadata from geometry
  RAISE NOTICE '⚙️ Generating metadata from geometry...';
  generated_metadata := generate_parcel_metadata(parcel_record.id);
  
  -- Update parcel with generated metadata
  UPDATE land_parcels
  SET metadata = COALESCE(metadata, '{}'::jsonb) || generated_metadata
  WHERE id = parcel_record.id;
  
  RAISE NOTICE '✅ Generated metadata for parcel %', parcel_record.id;
  RAISE NOTICE '📊 Edge count: %', jsonb_array_length(generated_metadata->'residuals'->'edges');
  RAISE NOTICE '📊 Point count: %', jsonb_array_length(generated_metadata->'cape_lo_points');
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '❌ Error: %', SQLERRM;
    RAISE;
END $$;

-- Step 3: Verify the fix
SELECT 
  id,
  stand,
  designation,
  area_m2,
  ST_NPoints(geom) as vertex_count,
  jsonb_array_length(COALESCE(metadata->'residuals'->'edges', '[]'::jsonb)) as edge_count,
  jsonb_array_length(COALESCE(metadata->'cape_lo_points', '[]'::jsonb)) as point_count,
  metadata->'residuals'->'edges' IS NOT NULL as has_edges
FROM land_parcels
WHERE project_id = 5
  AND (stand ILIKE '%outside figure%' OR designation ILIKE '%outside figure%')
ORDER BY id;

-- Step 4: Show sample edge data
SELECT 
  id,
  stand,
  jsonb_pretty(metadata->'residuals'->'edges'->0) as first_edge,
  jsonb_pretty(metadata->'cape_lo_points'->0) as first_point
FROM land_parcels
WHERE project_id = 5
  AND (stand ILIKE '%outside figure%' OR designation ILIKE '%outside figure%')
ORDER BY id;
