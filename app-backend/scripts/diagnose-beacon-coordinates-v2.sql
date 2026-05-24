-- Diagnostic script v2 - Check actual schema being used

-- Find which schema contains coordinate_points
SELECT 
  'Schema Check' as info,
  schemaname,
  tablename
FROM pg_tables 
WHERE tablename = 'coordinate_points';

-- Check current coordinate points (try public schema first)
SELECT 
  'Current Points (Public Schema)' as source,
  name as point_name,
  ST_X(geom) as first_ordinate_y,
  ST_Y(geom) as second_ordinate_x,
  ST_AsText(geom) as geometry_wkt
FROM public.coordinate_points
WHERE project_id = 1
ORDER BY name
LIMIT 5;

-- Check the comparison with public schema
SELECT 
  'Comparison Results' as source,
  h.point_name,
  h.y_coordinate AS prev_y,
  h.x_coordinate AS prev_x,
  ST_X(cp.geom) AS curr_y,
  ST_Y(cp.geom) AS curr_x,
  (h.y_coordinate - ST_X(cp.geom)) AS dy,
  (h.x_coordinate - ST_Y(cp.geom)) AS dx,
  SQRT(POWER(h.y_coordinate - ST_X(cp.geom), 2) + POWER(h.x_coordinate - ST_Y(cp.geom), 2)) AS distance_m
FROM historical_survey_points h
INNER JOIN public.coordinate_points cp ON 
  cp.project_id = h.project_id AND 
  cp.name = h.point_name
WHERE h.project_id = 1
ORDER BY h.point_name
LIMIT 5;
