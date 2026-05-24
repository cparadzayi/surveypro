-- Apply Consistent Banker's Rounding (matches backend zim-geo.js)
-- Ensures database metadata matches PDF generation exactly

-- STEP 1: Drop existing trigger and functions
DROP TRIGGER IF EXISTS auto_generate_metadata ON surveyor_surveyor_kuda.land_parcels CASCADE;
DROP FUNCTION IF EXISTS generate_parcel_metadata_trigger() CASCADE;
DROP FUNCTION IF EXISTS bankers_round(NUMERIC, INTEGER) CASCADE;

-- STEP 2: Create banker's rounding function (matches zim-geo.js)
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
  
  -- If exactly halfway (0.5), round to even (matches JavaScript implementation)
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

-- STEP 3: Create trigger function with consistent rounding
-- Matches backend edgeMetricsYX() function from zim-geo.js
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
    
    -- Calculate raw values (full precision)
    dy := ST_Y(next_point) - ST_Y(current_point);
    dx := ST_X(next_point) - ST_X(current_point);
    distance := SQRT(dy * dy + dx * dx);
    
    -- South-oriented bearing (matches bearingSouthBetween)
    bearing := ATAN2(dy, dx) * (180.0 / PI());
    bearing := 90.0 - bearing;
    IF bearing < 0.0 THEN bearing := bearing + 360.0; END IF;
    IF bearing >= 360.0 THEN bearing := bearing - 360.0; END IF;
    
    -- Apply banker's rounding (matches edgeMetricsYX from zim-geo.js)
    -- Distance: 2 decimal places (0.01m precision)
    -- dy/dx: Store full precision, round at display time
    -- Bearing: Store full precision, round at display time based on distance
    edges := edges || jsonb_build_object(
      'distance', bankers_round(distance, 2),
      'bearingDeg', bearing,
      'bearing', bearing,
      'dy', dy,
      'dx', dx,
      'from', jsonb_build_object(
        'y', ST_Y(current_point),
        'x', ST_X(current_point)
      ),
      'to', jsonb_build_object(
        'y', ST_Y(next_point),
        'x', ST_X(next_point)
      )
    );
    
    point_id := chr(64 + i);
    points := points || jsonb_build_object(
      'id', point_id,
      'y', ST_Y(current_point),
      'x', ST_X(current_point)
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

-- STEP 5: Update existing parcels
UPDATE surveyor_surveyor_kuda.land_parcels 
SET geom = geom 
WHERE project_id = 5;

-- STEP 6: Verify consistency with backend logic
SELECT 
  stand,
  (metadata->'residuals'->'edges'->0->>'distance')::numeric as distance_rounded,
  (metadata->'residuals'->'edges'->0->>'bearingDeg')::numeric as bearing_full_precision,
  (metadata->'residuals'->'edges'->0->>'dy')::numeric as dy_full_precision,
  (metadata->'residuals'->'edges'->0->>'dx')::numeric as dx_full_precision
FROM surveyor_surveyor_kuda.land_parcels 
WHERE project_id = 5 AND stand = '2474';

-- Expected:
-- distance: banker's rounded to 2dp (0.01m)
-- bearing: full precision (rounded at display time: <6000m=10", ≥6000m=1")
-- dy/dx: full precision (rounded at display time: 2dp for residuals)
