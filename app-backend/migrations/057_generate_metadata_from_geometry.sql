-- Migration 057: Generate metadata from QGIS-digitized parcels
-- This allows users to digitize in QGIS and automatically generate the required metadata

-- Function to generate traverse metadata from parcel geometry
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
  edges JSONB := '[]'::JSONB;
  points JSONB := '[]'::JSONB;
  coord_points RECORD;
  matched_point RECORD;
  point_id TEXT;
  point_y NUMERIC;
  point_x NUMERIC;
  tolerance NUMERIC := 0.5; -- 0.5 meter tolerance for matching
  metadata JSONB;
BEGIN
  -- Get parcel geometry and info
  SELECT geom, stand, project_id INTO parcel_geom, parcel_stand, project_id_val
  FROM surveyor_surveyor_kuda.land_parcels
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
      point_id := chr(64 + i); -- 65=A, 66=B, etc.
    END IF;
    
    -- Calculate distance to next point
    distance := ST_Distance(current_point, next_point);
    
    -- Calculate bearing (azimuth) from current to next point
    -- ST_Azimuth returns radians from north, we need degrees from south (Zimbabwe convention)
    -- Convert: radians to degrees, then adjust for south-oriented system
    bearing := degrees(ST_Azimuth(current_point, next_point));
    
    -- Adjust bearing: ST_Azimuth gives north-oriented (0° = North)
    -- Zimbabwe uses south-oriented (0° = South), so add 180° and normalize
    bearing := bearing + 180.0;
    IF bearing >= 360.0 THEN
      bearing := bearing - 360.0;
    END IF;
    
    -- Calculate dy and dx (coordinate differences)
    dy := ST_Y(next_point) - point_y;
    dx := ST_X(next_point) - point_x;
    
    -- Add edge to edges array
    edges := edges || jsonb_build_object(
      'distance', ROUND(distance::NUMERIC, 3),
      'bearing', ROUND(bearing::NUMERIC, 3),
      'dy', ROUND(dy::NUMERIC, 3),
      'dx', ROUND(dx::NUMERIC, 3)
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

-- Function to update all parcels with missing metadata
CREATE OR REPLACE FUNCTION update_parcels_with_missing_metadata(p_project_id INTEGER DEFAULT NULL)
RETURNS TABLE(parcel_id INTEGER, parcel_stand VARCHAR, updated BOOLEAN, error_message TEXT) AS $$
DECLARE
  parcel_record RECORD;
  generated_metadata JSONB;
BEGIN
  FOR parcel_record IN 
    SELECT lp.id, lp.stand, lp.metadata
    FROM surveyor_surveyor_kuda.land_parcels lp
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
      UPDATE surveyor_surveyor_kuda.land_parcels
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

-- Trigger to auto-generate metadata when parcel is inserted/updated
CREATE OR REPLACE FUNCTION trigger_generate_parcel_metadata()
RETURNS TRIGGER AS $$
BEGIN
  -- Only generate if metadata is missing or incomplete
  IF NEW.metadata IS NULL 
     OR NOT (NEW.metadata ? 'residuals')
     OR NOT (NEW.metadata->'residuals' ? 'edges')
     OR jsonb_array_length(COALESCE(NEW.metadata->'residuals'->'edges', '[]'::jsonb)) = 0
  THEN
    -- Generate metadata from geometry
    NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) || generate_parcel_metadata(NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: We'll add the trigger in a separate step to avoid issues with NEW.id on INSERT
-- For now, users can call update_parcels_with_missing_metadata() manually

COMMENT ON FUNCTION generate_parcel_metadata(INTEGER) IS 
'Generates traverse metadata (edges, points) from parcel geometry. Matches vertices to coordinate_points within 0.5m tolerance.';

COMMENT ON FUNCTION update_parcels_with_missing_metadata(INTEGER) IS 
'Updates all parcels with missing metadata by generating from geometry. Optionally filter by project_id.';
