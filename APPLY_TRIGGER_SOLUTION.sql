-- Step-by-step SQL to apply the automatic metadata generation trigger
-- Run this in your PostgreSQL client (pgAdmin, DBeaver, etc.)

-- STEP 1: Drop existing trigger and function if they exist
DROP TRIGGER IF EXISTS auto_generate_metadata ON land_parcels CASCADE;
DROP FUNCTION IF EXISTS generate_parcel_metadata_trigger() CASCADE;

-- STEP 2: Create the trigger function (copy from migration 059.do.sql)
-- This function automatically calculates edges when geometry is saved
CREATE OR REPLACE FUNCTION generate_parcel_metadata_trigger()
RETURNS TRIGGER AS $$
DECLARE
  parcel_geom GEOMETRY;
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
  point_id TEXT;
  metadata JSONB;
BEGIN
  -- Only process if geometry exists
  IF NEW.geom IS NULL THEN
    RETURN NEW;
  END IF;

  parcel_geom := NEW.geom;
  
  -- Extract vertices from polygon exterior ring
  SELECT ARRAY(
    SELECT ST_PointN(ST_ExteriorRing(parcel_geom), generate_series(1, ST_NPoints(ST_ExteriorRing(parcel_geom))))
  ) INTO vertices;
  
  vertex_count := array_length(vertices, 1) - 1;
  
  -- Calculate edges between vertices
  FOR i IN 1..vertex_count LOOP
    current_point := vertices[i];
    next_point := vertices[(i % vertex_count) + 1];
    
    distance := ST_Distance(current_point, next_point);
    
    -- Calculate south-oriented bearing (0° = South, clockwise)
    dy := ST_Y(next_point) - ST_Y(current_point);
    dx := ST_X(next_point) - ST_X(current_point);
    bearing := ATAN2(dy, dx) * (180.0 / PI());
    bearing := 90.0 - bearing;
    
    -- Normalize to 0-360 range
    IF bearing < 0.0 THEN bearing := bearing + 360.0; END IF;
    IF bearing >= 360.0 THEN bearing := bearing - 360.0; END IF;
    
    -- Build edge data
    edges := edges || jsonb_build_object(
      'distance', ROUND(distance::NUMERIC, 3),
      'bearingDeg', ROUND(bearing::NUMERIC, 6),
      'bearing', ROUND(bearing::NUMERIC, 6),
      'dy', ROUND(dy::NUMERIC, 3),
      'dx', ROUND(dx::NUMERIC, 3),
      'from', jsonb_build_object(
        'y', ROUND(ST_Y(current_point)::NUMERIC, 6),
        'x', ROUND(ST_X(current_point)::NUMERIC, 6)
      ),
      'to', jsonb_build_object(
        'y', ROUND(ST_Y(next_point)::NUMERIC, 6),
        'x', ROUND(ST_X(next_point)::NUMERIC, 6)
      )
    );
    
    -- Build points data
    point_id := chr(64 + i); -- A, B, C, D...
    points := points || jsonb_build_object(
      'id', point_id,
      'y', ROUND(ST_Y(current_point)::NUMERIC, 2),
      'x', ROUND(ST_X(current_point)::NUMERIC, 2)
    );
  END LOOP;
  
  -- Build complete metadata
  metadata := jsonb_build_object(
    'cape_lo_points', points,
    'residuals', jsonb_build_object('edges', edges),
    'points_count', vertex_count,
    'generated_from_geometry', true,
    'generated_at', NOW()
  );
  
  -- Merge with existing metadata
  NEW.metadata := COALESCE(NEW.metadata, '{}'::JSONB) || metadata;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- STEP 3: Create the trigger
CREATE TRIGGER auto_generate_metadata
BEFORE INSERT OR UPDATE OF geom ON land_parcels
FOR EACH ROW EXECUTE FUNCTION generate_parcel_metadata_trigger();

-- STEP 4: Test with existing parcels (optional - updates all parcels in project 5)
-- UPDATE land_parcels SET geom = geom WHERE project_id = 5;

-- STEP 5: Verify the trigger works
SELECT 
  id,
  stand,
  (metadata->'residuals'->'edges'->0->>'bearingDeg')::numeric as first_bearing,
  (metadata->'residuals'->'edges'->0->>'distance')::numeric as first_distance
FROM land_parcels 
WHERE project_id = 5 
  AND stand = '2474'
LIMIT 1;

-- Expected result: first_bearing should be around 300 (not 120 or null)
