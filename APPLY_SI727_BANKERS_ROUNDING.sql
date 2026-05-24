-- Apply SI 727 Banker's Rounding to Trigger Function
-- Run this in your PostgreSQL client for surveyor_kuda schema

-- STEP 1: Drop existing trigger and functions
DROP TRIGGER IF EXISTS auto_generate_metadata ON surveyor_surveyor_kuda.land_parcels CASCADE;
DROP FUNCTION IF EXISTS generate_parcel_metadata_trigger() CASCADE;
DROP FUNCTION IF EXISTS bankers_round(NUMERIC, INTEGER) CASCADE;

-- STEP 2: Create banker's rounding function (SI 727 compliant)
CREATE OR REPLACE FUNCTION bankers_round(value NUMERIC, decimals INTEGER DEFAULT 0)
RETURNS NUMERIC AS $$
DECLARE
  factor NUMERIC;
  n NUMERIC;
  f NUMERIC;
  r NUMERIC;
BEGIN
  factor := POWER(10, decimals);
  n := value * factor;
  f := FLOOR(n);
  r := n - f;
  
  -- If exactly halfway (0.5), round to even
  IF ABS(r - 0.5) < 0.000000000001 THEN
    IF MOD(f::INTEGER, 2) = 0 THEN
      RETURN f / factor;
    ELSE
      RETURN (f + 1) / factor;
    END IF;
  END IF;
  
  -- Otherwise use standard rounding
  RETURN ROUND(n) / factor;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- STEP 3: Create trigger function with banker's rounding
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
  IF NEW.geom IS NULL THEN
    RETURN NEW;
  END IF;

  parcel_geom := NEW.geom;
  
  SELECT ARRAY(
    SELECT ST_PointN(ST_ExteriorRing(parcel_geom), generate_series(1, ST_NPoints(ST_ExteriorRing(parcel_geom))))
  ) INTO vertices;
  
  vertex_count := array_length(vertices, 1) - 1;
  
  FOR i IN 1..vertex_count LOOP
    current_point := vertices[i];
    next_point := vertices[(i % vertex_count) + 1];
    
    distance := ST_Distance(current_point, next_point);
    dy := ST_Y(next_point) - ST_Y(current_point);
    dx := ST_X(next_point) - ST_X(current_point);
    
    -- South-oriented bearing
    bearing := ATAN2(dy, dx) * (180.0 / PI());
    bearing := 90.0 - bearing;
    IF bearing < 0.0 THEN bearing := bearing + 360.0; END IF;
    IF bearing >= 360.0 THEN bearing := bearing - 360.0; END IF;
    
    -- SI 727 Banker's Rounding:
    -- Distance: 2 decimal places (0.01m)
    -- dy/dx: 3 decimal places
    -- Bearing: full precision (rounded at display time per distance)
    edges := edges || jsonb_build_object(
      'distance', bankers_round(distance, 2),
      'bearingDeg', bearing,
      'bearing', bearing,
      'dy', bankers_round(dy, 3),
      'dx', bankers_round(dx, 3),
      'from', jsonb_build_object(
        'y', bankers_round(ST_Y(current_point), 3),
        'x', bankers_round(ST_X(current_point), 3)
      ),
      'to', jsonb_build_object(
        'y', bankers_round(ST_Y(next_point), 3),
        'x', bankers_round(ST_X(next_point), 3)
      )
    );
    
    point_id := chr(64 + i);
    points := points || jsonb_build_object(
      'id', point_id,
      'y', bankers_round(ST_Y(current_point), 2),
      'x', bankers_round(ST_X(current_point), 2)
    );
  END LOOP;
  
  metadata := jsonb_build_object(
    'cape_lo_points', points,
    'residuals', jsonb_build_object('edges', edges),
    'points_count', vertex_count,
    'generated_from_geometry', true,
    'generated_at', NOW()
  );
  
  NEW.metadata := COALESCE(NEW.metadata, '{}'::JSONB) || metadata;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- STEP 4: Create trigger
CREATE TRIGGER auto_generate_metadata
BEFORE INSERT OR UPDATE OF geom ON surveyor_surveyor_kuda.land_parcels
FOR EACH ROW EXECUTE FUNCTION generate_parcel_metadata_trigger();

-- STEP 5: Update existing parcels to apply banker's rounding
UPDATE surveyor_surveyor_kuda.land_parcels 
SET geom = geom 
WHERE project_id = 5;

-- STEP 6: Verify banker's rounding applied
SELECT 
  stand,
  (metadata->'residuals'->'edges'->0->>'distance')::numeric as first_distance,
  (metadata->'residuals'->'edges'->0->>'bearingDeg')::numeric as first_bearing,
  (metadata->'residuals'->'edges'->0->'dy')::numeric as first_dy,
  (metadata->'residuals'->'edges'->0->'dx')::numeric as first_dx
FROM surveyor_surveyor_kuda.land_parcels 
WHERE project_id = 5 AND stand = '2474';

-- Expected: Distance with 2dp, dy/dx with 3dp, bearing full precision
