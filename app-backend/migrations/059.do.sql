-- Migration 059: Automatic metadata generation trigger for QGIS-digitized parcels
-- This enables seamless workflow: QGIS digitize → save → edges auto-calculated → available in UI/PDF

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS auto_generate_metadata ON land_parcels CASCADE;
DROP FUNCTION IF EXISTS generate_parcel_metadata_trigger() CASCADE;

-- Create trigger function that wraps the existing generate_parcel_metadata function
CREATE OR REPLACE FUNCTION generate_parcel_metadata_trigger()
RETURNS TRIGGER AS $$
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
  -- Only process if geometry exists
  IF NEW.geom IS NULL THEN
    RETURN NEW;
  END IF;

  parcel_geom := NEW.geom;
  parcel_stand := NEW.stand;
  project_id_val := NEW.project_id;
  
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
    IF project_id_val IS NOT NULL THEN
      SELECT name, ST_Y(geom) as y, ST_X(geom) as x INTO matched_point
      FROM coordinate_points
      WHERE project_id = project_id_val
        AND ST_DWithin(geom, current_point, tolerance)
      ORDER BY ST_Distance(geom, current_point)
      LIMIT 1;
    END IF;
    
    -- Use matched point name or generate sequential name
    IF matched_point.name IS NOT NULL THEN
      point_id := matched_point.name;
      point_y := matched_point.y;
      point_x := matched_point.x;
    ELSE
      -- Generate sequential name: A, B, C, D...
      point_id := chr(64 + i); -- 65=A, 66=B, etc.
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
  
  -- Merge with existing metadata
  NEW.metadata := COALESCE(NEW.metadata, '{}'::JSONB) || metadata;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on INSERT and UPDATE of geometry
CREATE TRIGGER auto_generate_metadata
BEFORE INSERT OR UPDATE OF geom ON land_parcels
FOR EACH ROW EXECUTE FUNCTION generate_parcel_metadata_trigger();

COMMENT ON FUNCTION generate_parcel_metadata_trigger() IS 
'Automatically generates edge metadata (south-oriented bearings, distances, from/to coordinates) when parcels are inserted or updated from QGIS. Enables seamless workflow with single source of truth for edge data used in UI and PDF generation.';

COMMENT ON TRIGGER auto_generate_metadata ON land_parcels IS
'Automatically calculates and stores edge metadata whenever parcel geometry is created or modified.';
