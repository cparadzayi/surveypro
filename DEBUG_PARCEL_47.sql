-- Debug script to investigate parcel 47 issue

-- Step 1: Check if parcel 47 exists
SELECT 
  id,
  project_id,
  stand,
  designation,
  area_m2,
  ST_GeometryType(geom) as geom_type,
  ST_NPoints(geom) as vertex_count,
  ST_IsValid(geom) as is_valid_geom,
  metadata IS NOT NULL as has_metadata,
  jsonb_pretty(metadata) as metadata_preview
FROM land_parcels
WHERE id = 47;

-- Step 2: Check all Outside Figure parcels in project 5
SELECT 
  id,
  project_id,
  stand,
  designation,
  area_m2,
  ST_GeometryType(geom) as geom_type,
  ST_NPoints(geom) as vertex_count,
  ST_IsValid(geom) as is_valid_geom,
  metadata->'residuals'->'edges' IS NOT NULL as has_edges
FROM land_parcels
WHERE project_id = 5
  AND (stand ILIKE '%outside figure%' OR designation ILIKE '%outside figure%')
ORDER BY id;

-- Step 3: Test the function directly with explicit parcel ID
-- Replace 47 with the actual ID from Step 2 if different
SELECT generate_parcel_metadata(47);

-- Step 4: If the above fails, try this alternative approach
-- Generate metadata manually without using the function
DO $$
DECLARE
  parcel_record RECORD;
  parcel_geom GEOMETRY;
  vertices GEOMETRY[];
  vertex_count INTEGER;
BEGIN
  -- Get the parcel
  SELECT id, stand, geom, project_id INTO parcel_record
  FROM land_parcels
  WHERE project_id = 5
    AND (stand ILIKE '%outside figure%' OR designation ILIKE '%outside figure%')
  LIMIT 1;
  
  IF parcel_record.id IS NULL THEN
    RAISE NOTICE '❌ No Outside Figure parcel found';
    RETURN;
  END IF;
  
  RAISE NOTICE '✅ Found parcel: ID=%, Stand=%, Project=%', 
    parcel_record.id, parcel_record.stand, parcel_record.project_id;
  
  -- Check geometry
  IF parcel_record.geom IS NULL THEN
    RAISE NOTICE '❌ Parcel has NULL geometry';
    RETURN;
  END IF;
  
  -- Extract vertices
  SELECT ARRAY(
    SELECT ST_PointN(ST_ExteriorRing(parcel_record.geom), generate_series(1, ST_NPoints(ST_ExteriorRing(parcel_record.geom))))
  ) INTO vertices;
  
  vertex_count := array_length(vertices, 1) - 1;
  
  RAISE NOTICE '✅ Geometry valid: % vertices', vertex_count;
  RAISE NOTICE '✅ Geometry type: %', ST_GeometryType(parcel_record.geom);
  
END $$;
