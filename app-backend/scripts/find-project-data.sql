-- Find which schema contains data for project 1

-- Check surveyor_surveyor_charles
SELECT 
  'surveyor_surveyor_charles' as schema_name,
  COUNT(*) as point_count
FROM surveyor_surveyor_charles.coordinate_points
WHERE project_id = 1;

-- Check surveyor_surveyor_kuda
SELECT 
  'surveyor_surveyor_kuda' as schema_name,
  COUNT(*) as point_count
FROM surveyor_surveyor_kuda.coordinate_points
WHERE project_id = 1;

-- If found, show actual coordinates from the correct schema
-- Try surveyor_surveyor_charles first
DO $$
DECLARE
  point_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO point_count
  FROM surveyor_surveyor_charles.coordinate_points
  WHERE project_id = 1;
  
  IF point_count > 0 THEN
    RAISE NOTICE 'Found % points in surveyor_surveyor_charles schema', point_count;
  END IF;
END $$;

-- Show coordinates from surveyor_surveyor_charles
SELECT 
  'Current Points (surveyor_surveyor_charles)' as source,
  name as point_name,
  ST_X(geom) as first_ordinate_y,
  ST_Y(geom) as second_ordinate_x
FROM surveyor_surveyor_charles.coordinate_points
WHERE project_id = 1
ORDER BY name
LIMIT 5;

-- Show comparison using surveyor_surveyor_charles
SELECT 
  'Comparison (surveyor_surveyor_charles)' as source,
  h.point_name,
  h.y_coordinate AS prev_y,
  h.x_coordinate AS prev_x,
  ST_X(cp.geom) AS curr_y,
  ST_Y(cp.geom) AS curr_x,
  (h.y_coordinate - ST_X(cp.geom)) AS dy,
  (h.x_coordinate - ST_Y(cp.geom)) AS dx,
  SQRT(POWER(h.y_coordinate - ST_X(cp.geom), 2) + POWER(h.x_coordinate - ST_Y(cp.geom), 2)) AS distance_m
FROM historical_survey_points h
INNER JOIN surveyor_surveyor_charles.coordinate_points cp ON 
  cp.project_id = h.project_id AND 
  cp.name = h.point_name
WHERE h.project_id = 1
ORDER BY h.point_name
LIMIT 5;
