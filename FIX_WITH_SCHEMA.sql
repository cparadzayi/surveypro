-- Fix Outside Figure Metadata with explicit schema
-- Use this if your database has a schema prefix like surveyor_surveyor_kuda

-- Step 1: Verify the parcel exists and check its current state
SELECT 
  id,
  project_id,
  stand,
  designation,
  area_m2,
  ST_NPoints(geom) as vertex_count,
  jsonb_array_length(COALESCE(metadata->'residuals'->'edges', '[]'::jsonb)) as edge_count,
  metadata->'residuals'->'edges' IS NOT NULL as has_edges
FROM surveyor_surveyor_kuda.land_parcels
WHERE project_id = 5
  AND (stand ILIKE '%outside figure%' OR designation ILIKE '%outside figure%')
ORDER BY id;

-- Step 2: Manual metadata generation (bypassing the function if it has schema issues)
DO $$
DECLARE
  parcel_record RECORD;
  parcel_geom GEOMETRY;
  project_id_val INTEGER;
  vertices GEOMETRY[];
  vertex_count INTEGER;
  i INTEGER;
  current_point GEOMETRY;
  next_point GEOMETRY;
  distance NUMERIC;
  bearing NUMERIC;
  dy NUMERIC;
  dx NUMERIC;
  edges JSONB := '[]'::JSONB;
  points JSONB := '[]'::JSONB;
  matched_point RECORD;
  point_id TEXT;
  point_y NUMERIC;
  point_x NUMERIC;
  tolerance NUMERIC := 0.5;
  metadata JSONB;
BEGIN
  -- Get the Outside Figure parcel
  SELECT id, stand, geom, project_id 
  INTO parcel_record
  FROM surveyor_surveyor_kuda.land_parcels
  WHERE project_id = 5
    AND (stand ILIKE '%outside figure%' OR designation ILIKE '%outside figure%')
  LIMIT 1;
  
  IF parcel_record.id IS NULL THEN
    RAISE NOTICE '❌ No Outside Figure parcel found for project 5';
    RETURN;
  END IF;
  
  RAISE NOTICE '🔍 Found Outside Figure parcel: ID=%, Stand=%', parcel_record.id, parcel_record.stand;
  
  parcel_geom := parcel_record.geom;
  project_id_val := parcel_record.project_id;
  
  IF parcel_geom IS NULL THEN
    RAISE NOTICE '❌ Parcel has NULL geometry';
    RETURN;
  END IF;
  
  -- Extract vertices from polygon exterior ring
  SELECT ARRAY(
    SELECT ST_PointN(ST_ExteriorRing(parcel_geom), generate_series(1, ST_NPoints(ST_ExteriorRing(parcel_geom))))
  ) INTO vertices;
  
  vertex_count := array_length(vertices, 1) - 1; -- Exclude duplicate closing point
  
  RAISE NOTICE '📐 Processing % vertices...', vertex_count;
  
  -- Loop through vertices to calculate edges and match points
  FOR i IN 1..vertex_count LOOP
    current_point := vertices[i];
    next_point := vertices[(i % vertex_count) + 1];
    
    -- Extract Y (Northing) and X (Easting) coordinates
    point_y := ST_Y(current_point);
    point_x := ST_X(current_point);
    
    -- Try to match vertex to coordinate_points within tolerance
    SELECT name, ST_Y(geom) as y, ST_X(geom) as x INTO matched_point
    FROM surveyor_surveyor_kuda.coordinate_points
    WHERE project_id = project_id_val
      AND ST_DWithin(geom, current_point, tolerance)
    ORDER BY ST_Distance(geom, current_point)
    LIMIT 1;
    
    -- Use matched point name or generate sequential name
    IF matched_point.name IS NOT NULL THEN
      point_id := matched_point.name;
      point_y := matched_point.y;
      point_x := matched_point.x;
    ELSE
      -- Generate sequential name: A, B, C, D...
      IF i <= 26 THEN
        point_id := chr(64 + i); -- A-Z
      ELSE
        point_id := chr(64 + ((i-1) % 26) + 1) || ((i-1) / 26)::TEXT; -- A1, B1, etc.
      END IF;
    END IF;
    
    -- Calculate distance to next point
    distance := ST_Distance(current_point, next_point);
    
    -- Calculate bearing (azimuth) from current to next point
    bearing := degrees(ST_Azimuth(current_point, next_point));
    
    -- Calculate coordinate differences
    dy := ST_Y(next_point) - ST_Y(current_point);
    dx := ST_X(next_point) - ST_X(current_point);
    
    -- Add edge to array
    edges := edges || jsonb_build_object(
      'distance', round(distance::numeric, 3),
      'bearing', round(bearing::numeric, 6),
      'dY', round(dy::numeric, 3),
      'dX', round(dx::numeric, 3)
    );
    
    -- Add point to array
    points := points || jsonb_build_object(
      'id', point_id,
      'name', point_id,
      'y', round(point_y::numeric, 3),
      'x', round(point_x::numeric, 3)
    );
  END LOOP;
  
  -- Build metadata structure
  metadata := jsonb_build_object(
    'residuals', jsonb_build_object(
      'edges', edges
    ),
    'cape_lo_points', points
  );
  
  -- Update parcel with generated metadata
  UPDATE surveyor_surveyor_kuda.land_parcels
  SET metadata = COALESCE(metadata, '{}'::jsonb) || metadata
  WHERE id = parcel_record.id;
  
  RAISE NOTICE '✅ Generated metadata for parcel %', parcel_record.id;
  RAISE NOTICE '📊 Edge count: %', jsonb_array_length(edges);
  RAISE NOTICE '📊 Point count: %', jsonb_array_length(points);
  
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
FROM surveyor_surveyor_kuda.land_parcels
WHERE project_id = 5
  AND (stand ILIKE '%outside figure%' OR designation ILIKE '%outside figure%')
ORDER BY id;

-- Step 4: Show first edge and point as sample
SELECT 
  id,
  stand,
  jsonb_pretty(metadata->'residuals'->'edges'->0) as first_edge,
  jsonb_pretty(metadata->'cape_lo_points'->0) as first_point
FROM surveyor_surveyor_kuda.land_parcels
WHERE project_id = 5
  AND (stand ILIKE '%outside figure%' OR designation ILIKE '%outside figure%')
ORDER BY id;
