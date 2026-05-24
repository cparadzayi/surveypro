-- Apply Complete SI 727 Banker's Rounding with Distance-Based Bearing Precision
-- Matches backend zim-geo.js exactly: <6000m=10", ≥6000m=1"

-- STEP 1: Drop existing trigger and functions
DROP TRIGGER IF EXISTS auto_generate_metadata ON surveyor_surveyor_kuda.land_parcels CASCADE;
DROP FUNCTION IF EXISTS generate_parcel_metadata_trigger() CASCADE;
DROP FUNCTION IF EXISTS bankers_round(NUMERIC, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS round_bearing_south(NUMERIC, INTEGER) CASCADE;

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
  
  -- If exactly halfway (0.5), round to even
  IF ABS(r - 0.5) < 0.000000000001 THEN
    IF MOD(f::INTEGER, 2) = 0 THEN
      RETURN f / factor;
    ELSE
      RETURN (f + 1) / factor;
    END IF;
  END IF;
  
  RETURN ROUND(n) / factor;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- STEP 3: Create bearing rounding function (matches roundBearingSouth from zim-geo.js)
CREATE OR REPLACE FUNCTION round_bearing_south(bearing_deg NUMERIC, resolution_seconds INTEGER)
RETURNS NUMERIC AS $$
DECLARE
  normalized_bearing NUMERIC;
  degrees INTEGER;
  minutes INTEGER;
  seconds NUMERIC;
  total_seconds NUMERIC;
  rounded_seconds NUMERIC;
  result_deg INTEGER;
  result_min INTEGER;
  result_sec NUMERIC;
  final_bearing NUMERIC;
BEGIN
  -- Normalize bearing to 0-360 range
  normalized_bearing := bearing_deg;
  WHILE normalized_bearing < 0 LOOP
    normalized_bearing := normalized_bearing + 360;
  END LOOP;
  WHILE normalized_bearing >= 360 LOOP
    normalized_bearing := normalized_bearing - 360;
  END LOOP;
  
  -- Convert to DMS
  degrees := FLOOR(normalized_bearing);
  minutes := FLOOR((normalized_bearing - degrees) * 60);
  seconds := ((normalized_bearing - degrees) * 60 - minutes) * 60;
  
  -- Convert to total seconds
  total_seconds := degrees * 3600 + minutes * 60 + seconds;
  
  -- Round to resolution using banker's rounding
  rounded_seconds := bankers_round(total_seconds / resolution_seconds, 0) * resolution_seconds;
  
  -- Convert back to DMS
  result_deg := FLOOR(rounded_seconds / 3600);
  result_min := FLOOR((rounded_seconds - result_deg * 3600) / 60);
  result_sec := rounded_seconds - result_deg * 3600 - result_min * 60;
  
  -- Convert back to decimal degrees
  final_bearing := result_deg + result_min / 60.0 + result_sec / 3600.0;
  
  -- Normalize result
  WHILE final_bearing < 0 LOOP
    final_bearing := final_bearing + 360;
  END LOOP;
  WHILE final_bearing >= 360 LOOP
    final_bearing := final_bearing - 360;
  END LOOP;
  
  RETURN final_bearing;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- STEP 4: Create trigger function with complete SI 727 rounding
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
  bearing_rounded NUMERIC;
  dy NUMERIC;
  dx NUMERIC;
  seconds_resolution INTEGER;
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
    
    -- Calculate raw values
    dy := ST_Y(next_point) - ST_Y(current_point);
    dx := ST_X(next_point) - ST_X(current_point);
    distance := SQRT(dy * dy + dx * dx);
    
    -- South-oriented bearing (0° = South, clockwise)
    bearing := ATAN2(dy, dx) * (180.0 / PI());
    bearing := 90.0 - bearing;
    IF bearing < 0.0 THEN bearing := bearing + 360.0; END IF;
    IF bearing >= 360.0 THEN bearing := bearing - 360.0; END IF;
    
    -- SI 727: Apply distance-based bearing rounding with banker's rounding
    -- < 6000m: Round to nearest 10 seconds
    -- ≥ 6000m: Round to nearest 1 second
    IF distance < 6000 THEN
      seconds_resolution := 10;
    ELSE
      seconds_resolution := 1;
    END IF;
    
    bearing_rounded := round_bearing_south(bearing, seconds_resolution);
    
    -- Apply banker's rounding to distance (0.01m precision)
    edges := edges || jsonb_build_object(
      'distance', bankers_round(distance, 2),
      'bearingDeg', bearing_rounded,
      'bearing', bearing_rounded,
      'secondsResolution', seconds_resolution,
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

-- STEP 5: Create trigger
CREATE TRIGGER auto_generate_metadata
BEFORE INSERT OR UPDATE OF geom ON surveyor_surveyor_kuda.land_parcels
FOR EACH ROW EXECUTE FUNCTION generate_parcel_metadata_trigger();

-- STEP 6: Update existing parcels
UPDATE surveyor_surveyor_kuda.land_parcels 
SET geom = geom 
WHERE project_id = 5;

-- STEP 7: Verify SI 727 rounding applied
SELECT 
  stand,
  (metadata->'residuals'->'edges'->0->>'distance')::numeric as distance,
  (metadata->'residuals'->'edges'->0->>'bearingDeg')::numeric as bearing_rounded,
  (metadata->'residuals'->'edges'->0->>'secondsResolution')::integer as seconds_res,
  CASE 
    WHEN (metadata->'residuals'->'edges'->0->>'distance')::numeric < 6000 
    THEN '10" resolution'
    ELSE '1" resolution'
  END as expected_resolution
FROM surveyor_surveyor_kuda.land_parcels 
WHERE project_id = 5 AND stand IN ('2474', '2475', '2476')
ORDER BY stand;

-- Expected: 
-- Distances < 6000m: bearing rounded to nearest 10" using banker's rounding
-- Distances ≥ 6000m: bearing rounded to nearest 1" using banker's rounding
-- Distance: banker's rounded to 2dp
