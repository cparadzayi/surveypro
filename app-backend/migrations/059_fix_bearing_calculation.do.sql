-- Migration 059: Fix bearing calculation to properly convert to south-oriented bearings
-- The issue: ST_Azimuth returns radians measured clockwise from north (0° = North)
-- Zimbabwe standard: 0° = South, measured clockwise
-- Correct conversion: South-oriented = (North-oriented + 180) % 360
-- But we need to ensure the calculation matches the backend's calculateEdgesFromGeometry

DROP FUNCTION IF EXISTS generate_parcel_metadata(INTEGER);

-- Function to generate traverse metadata from parcel geometry (schema-agnostic)
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
  tolerance NUMERIC := 0.5; -- 0.5 meter tolerance for matching
  metadata JSONB;
BEGIN
  -- Get parcel geometry and info (uses current search_path)
  SELECT geom, stand, project_id INTO parcel_geom, parcel_stand, project_id_val
  FROM land_parcels
  WHERE id = parcel_id;
  
  IF parcel_geom IS NULL THEN
    RAISE EXCEPTION 'Parcel % not found', parcel_id;
  END IF;
  
  -- Extract vertices from polygon exterior ring
  SELECT ARRAY(
    SELECT ST_PointN(ST_ExteriorRing(parcel_geom), generate_series(1, ST_NPoints(ST_ExteriorRing(parcel_geom))))
  ) INTO vertices;
  
  vertex_count := array_length(vertices, 1) - 1; -- Exclude duplicate closing point
  
  -- Loop through vertices to calculate edges and match points
  FOR i IN 1..vertex_count LOOP
    current_point := vertices[i];
    next_point := vertices[(i % vertex_count) + 1];
    
    -- Extract Y (Westing) and X (Southing) coordinates
    point_y := ST_Y(current_point);
    point_x := ST_X(current_point);
    
    -- Try to match vertex to coordinate_points within tolerance (uses current search_path)
    SELECT name, ST_Y(geom) as y, ST_X(geom) as x INTO matched_point
    FROM coordinate_points
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
      point_id := chr(64 + i); -- 65=A, 66=B, etc.
    END IF;
    
    -- Calculate distance to next point
    distance := ST_Distance(current_point, next_point);
    
    -- Calculate dy and dx (coordinate differences)
    -- Cape Lo: Y = Westing (increases west), X = Southing (increases south)
    dy := ST_Y(next_point) - point_y;
    dx := ST_X(next_point) - point_x;
    
    -- Calculate bearing using the SAME formula as backend's calculateEdgesFromGeometry
    -- This matches pdfkitGeoPDF.js lines 1040-1073
    -- bearing = atan2(dy, dx) converted to degrees, then adjusted for south orientation
    bearing := ATAN2(dy, dx) * (180.0 / PI());
    
    -- Convert to south-oriented (0° = South, clockwise)
    -- This matches the backend formula: bearing = 90 - bearing
    bearing := 90.0 - bearing;
    
    -- Normalize to 0-360 range
    IF bearing < 0.0 THEN
      bearing := bearing + 360.0;
    END IF;
    IF bearing >= 360.0 THEN
      bearing := bearing - 360.0;
    END IF;
    
    -- Store from/to coordinates for direction verification
    from_y := point_y;
    from_x := point_x;
    to_y := ST_Y(next_point);
    to_x := ST_X(next_point);
    
    -- Add edge to edges array with from/to coordinates
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
    
    -- Add point to points array
    points := points || jsonb_build_object(
      'id', point_id,
      'y', ROUND(point_y::NUMERIC, 2),
      'x', ROUND(point_x::NUMERIC, 2)
    );
  END LOOP;
  
  -- Build complete metadata structure
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

-- Function to update all parcels with missing metadata (schema-agnostic)
CREATE OR REPLACE FUNCTION update_parcels_with_missing_metadata(p_project_id INTEGER DEFAULT NULL)
RETURNS TABLE(parcel_id INTEGER, parcel_stand VARCHAR, updated BOOLEAN, error_message TEXT) AS $$
DECLARE
  parcel_record RECORD;
  generated_metadata JSONB;
BEGIN
  FOR parcel_record IN 
    SELECT lp.id, lp.stand, lp.metadata
    FROM land_parcels lp
    WHERE (p_project_id IS NULL OR lp.project_id = p_project_id)
      AND (
        lp.metadata IS NULL 
        OR NOT (lp.metadata ? 'residuals')
        OR NOT (lp.metadata->'residuals' ? 'edges')
        OR jsonb_array_length(COALESCE(lp.metadata->'residuals'->'edges', '[]'::jsonb)) = 0
      )
  LOOP
    BEGIN
      -- Generate metadata from geometry
      generated_metadata := generate_parcel_metadata(parcel_record.id);
      
      -- Update parcel with generated metadata
      UPDATE land_parcels
      SET metadata = COALESCE(metadata, '{}'::jsonb) || generated_metadata
      WHERE id = parcel_record.id;
      
      parcel_id := parcel_record.id;
      parcel_stand := parcel_record.stand;
      updated := TRUE;
      error_message := NULL;
      RETURN NEXT;
      
    EXCEPTION WHEN OTHERS THEN
      parcel_id := parcel_record.id;
      parcel_stand := parcel_record.stand;
      updated := FALSE;
      error_message := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_parcel_metadata(INTEGER) IS 
'Generates traverse metadata (edges with south-oriented bearings using atan2(dy,dx) formula, points) from parcel geometry. Schema-agnostic - uses current search_path. Matches backend calculateEdgesFromGeometry formula.';

COMMENT ON FUNCTION update_parcels_with_missing_metadata(INTEGER) IS 
'Updates all parcels with missing metadata by generating from geometry. Schema-agnostic - uses current search_path.';
