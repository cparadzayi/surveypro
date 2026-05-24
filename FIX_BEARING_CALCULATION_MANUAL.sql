-- Manual fix for bearing calculation
-- Run this directly in your database to fix the generate_parcel_metadata function

-- Drop and recreate the function with correct bearing calculation
DROP FUNCTION IF EXISTS generate_parcel_metadata(INTEGER);

CREATE OR REPLACE FUNCTION generate_parcel_metadata(parcel_id INTEGER)
RETURNS JSONB AS $$
DECLARE
  parcel_geom GEOMETRY;
  parcel_stand VARCHAR;
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
  from_y NUMERIC;
  from_x NUMERIC;
  to_y NUMERIC;
  to_x NUMERIC;
  edges JSONB := '[]'::JSONB;
  points JSONB := '[]'::JSONB;
  matched_point RECORD;
  point_id TEXT;
  point_y NUMERIC;
  point_x NUMERIC;
  tolerance NUMERIC := 0.5;
  metadata JSONB;
BEGIN
  SELECT geom, stand, project_id INTO parcel_geom, parcel_stand, project_id_val
  FROM land_parcels
  WHERE id = parcel_id;
  
  IF parcel_geom IS NULL THEN
    RAISE EXCEPTION 'Parcel % not found', parcel_id;
  END IF;
  
  SELECT ARRAY(
    SELECT ST_PointN(ST_ExteriorRing(parcel_geom), generate_series(1, ST_NPoints(ST_ExteriorRing(parcel_geom))))
  ) INTO vertices;
  
  vertex_count := array_length(vertices, 1) - 1;
  
  FOR i IN 1..vertex_count LOOP
    current_point := vertices[i];
    next_point := vertices[(i % vertex_count) + 1];
    
    point_y := ST_Y(current_point);
    point_x := ST_X(current_point);
    
    SELECT name, ST_Y(geom) as y, ST_X(geom) as x INTO matched_point
    FROM coordinate_points
    WHERE project_id = project_id_val
      AND ST_DWithin(geom, current_point, tolerance)
    ORDER BY ST_Distance(geom, current_point)
    LIMIT 1;
    
    IF matched_point.name IS NOT NULL THEN
      point_id := matched_point.name;
      point_y := matched_point.y;
      point_x := matched_point.x;
    ELSE
      point_id := chr(64 + i);
    END IF;
    
    distance := ST_Distance(current_point, next_point);
    
    -- CORRECT BEARING CALCULATION - matches backend pdfkitGeoPDF.js
    dy := ST_Y(next_point) - point_y;
    dx := ST_X(next_point) - point_x;
    
    -- Use atan2(dy, dx) formula, then convert to south-oriented
    bearing := ATAN2(dy, dx) * (180.0 / PI());
    bearing := 90.0 - bearing;
    
    -- Normalize to 0-360 range
    IF bearing < 0.0 THEN
      bearing := bearing + 360.0;
    END IF;
    IF bearing >= 360.0 THEN
      bearing := bearing - 360.0;
    END IF;
    
    from_y := point_y;
    from_x := point_x;
    to_y := ST_Y(next_point);
    to_x := ST_X(next_point);
    
    edges := edges || jsonb_build_object(
      'distance', ROUND(distance::NUMERIC, 3),
      'bearingDeg', ROUND(bearing::NUMERIC, 6),
      'bearing', ROUND(bearing::NUMERIC, 6),
      'dy', ROUND(dy::NUMERIC, 3),
      'dx', ROUND(dx::NUMERIC, 3),
      'from', jsonb_build_object(
        'y', ROUND(from_y::NUMERIC, 6),
        'x', ROUND(from_x::NUMERIC, 6)
      ),
      'to', jsonb_build_object(
        'y', ROUND(to_y::NUMERIC, 6),
        'x', ROUND(to_x::NUMERIC, 6)
      )
    );
    
    points := points || jsonb_build_object(
      'id', point_id,
      'y', ROUND(point_y::NUMERIC, 2),
      'x', ROUND(point_x::NUMERIC, 2)
    );
  END LOOP;
  
  metadata := jsonb_build_object(
    'cape_lo_points', points,
    'residuals', jsonb_build_object(
      'edges', edges
    ),
    'points_count', vertex_count,
    'generated_from_geometry', true,
    'generated_at', NOW()
  );
  
  RETURN metadata;
END;
$$ LANGUAGE plpgsql;

-- Now clear and regenerate metadata for project 5
UPDATE land_parcels SET metadata = NULL WHERE project_id = 5;

-- Regenerate metadata for all parcels
DO $$
DECLARE
  parcel_record RECORD;
  generated_metadata JSONB;
BEGIN
  FOR parcel_record IN 
    SELECT id, stand FROM land_parcels WHERE project_id = 5
  LOOP
    generated_metadata := generate_parcel_metadata(parcel_record.id);
    UPDATE land_parcels
    SET metadata = generated_metadata
    WHERE id = parcel_record.id;
    RAISE NOTICE 'Updated parcel %: %', parcel_record.id, parcel_record.stand;
  END LOOP;
END $$;

-- Verify the results
SELECT 
  stand,
  (metadata->'residuals'->'edges'->0->>'bearingDeg')::numeric as first_bearing,
  metadata->'residuals'->'edges'->0->>'distance' as first_distance
FROM land_parcels
WHERE project_id = 5
  AND stand IN ('2474', '2475', '2476')
ORDER BY stand;
