-- Migration 060: Automatic metadata generation for QGIS-digitized parcels

-- Drop existing triggers/functions if they exist
DROP TRIGGER IF EXISTS auto_generate_parcel_metadata ON land_parcels CASCADE;
DROP FUNCTION IF EXISTS generate_parcel_metadata() CASCADE;

-- Create schema-agnostic metadata function
CREATE OR REPLACE FUNCTION generate_parcel_metadata()
RETURNS TRIGGER AS $$
DECLARE
  edges JSONB;
  points JSONB;
  vertex_count INTEGER;
  vertices GEOMETRY[];
  i INTEGER;
  current_point GEOMETRY;
  next_point GEOMETRY;
  distance NUMERIC;
  bearing NUMERIC;
  dy NUMERIC;
  dx NUMERIC;
  from_coord JSONB;
  to_coord JSONB;
BEGIN
  -- Extract vertices from polygon exterior ring
  SELECT ARRAY(
    SELECT ST_PointN(ST_ExteriorRing(NEW.geom), generate_series(1, ST_NPoints(ST_ExteriorRing(NEW.geom))))
  ) INTO vertices;
  
  vertex_count := array_length(vertices, 1) - 1; -- Exclude duplicate closing point
  edges := '[]'::JSONB;
  points := '[]'::JSONB;
  
  -- Process each edge
  FOR i IN 1..vertex_count LOOP
    current_point := vertices[i];
    next_point := vertices[(i % vertex_count) + 1];
    
    -- Calculate edge properties
    distance := ST_Distance(current_point, next_point);
    dy := ST_Y(next_point) - ST_Y(current_point);
    dx := ST_X(next_point) - ST_X(current_point);
    
    -- South-oriented bearing (0°=South, clockwise)
    bearing := ATAN2(dy, dx) * (180.0 / PI());
    bearing := 90.0 - bearing;
    IF bearing < 0.0 THEN bearing := bearing + 360.0; END IF;
    
    -- Build edge data
    from_coord := jsonb_build_object('y', ST_Y(current_point), 'x', ST_X(current_point));
    to_coord := jsonb_build_object('y', ST_Y(next_point), 'x', ST_X(next_point));
    
    edges := edges || jsonb_build_object(
      'distance', ROUND(distance::NUMERIC, 3),
      'bearingDeg', ROUND(bearing::NUMERIC, 6),
      'bearing', ROUND(bearing::NUMERIC, 6),
      'dy', ROUND(dy::NUMERIC, 3),
      'dx', ROUND(dx::NUMERIC, 3),
      'from', from_coord,
      'to', to_coord
    );
    
    -- Build points data
    points := points || jsonb_build_object(
      'id', CHR(64 + i), -- A, B, C...
      'y', ROUND(ST_Y(current_point)::NUMERIC, 3),
      'x', ROUND(ST_X(current_point)::NUMERIC, 3)
    );
  END LOOP;
  
  -- Store complete metadata
  NEW.metadata := COALESCE(NEW.metadata, '{}'::JSONB) || jsonb_build_object(
    'residuals', jsonb_build_object('edges', edges),
    'cape_lo_points', points,
    'points_count', vertex_count,
    'generated_from_geometry', true,
    'generated_at', NOW()
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic metadata generation
CREATE TRIGGER auto_generate_parcel_metadata
BEFORE INSERT OR UPDATE OF geom ON land_parcels
FOR EACH ROW EXECUTE FUNCTION generate_parcel_metadata();

-- Update existing parcels
UPDATE land_parcels SET geom = geom WHERE metadata IS NULL;

COMMENT ON FUNCTION generate_parcel_metadata() IS 
'Automatically generates edge metadata (bearings, distances) when parcels are inserted/updated from QGIS';
