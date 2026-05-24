-- Fix v_beacon_comparison view - coordinate_points uses geom column, not y/x
-- Extract Y (Westing) and X (Southing) from geometry

CREATE OR REPLACE VIEW v_beacon_comparison AS
SELECT 
  h.id AS historical_id,
  h.project_id,
  h.point_name AS historical_point_name,
  h.y_coordinate AS historical_y,
  h.x_coordinate AS historical_x,
  h.sr_number,
  h.description AS historical_description,
  h.survey_date AS historical_survey_date,
  h.coordinate_system AS historical_coord_system,
  h.measurement_unit AS historical_meas_unit,
  cp.id AS current_point_id,
  cp.name AS current_point_name,
  -- Extract Y (Westing) from geometry - ST_Y for Cape Lo coordinate system
  ST_Y(cp.geom) AS current_y,
  -- Extract X (Southing) from geometry - ST_X for Cape Lo coordinate system  
  ST_X(cp.geom) AS current_x,
  cp.description AS current_description,
  -- Calculate coordinate differences (dy, dx residuals)
  CASE WHEN cp.id IS NOT NULL THEN 
    h.y_coordinate - ST_Y(cp.geom)
  END AS y_difference,
  CASE WHEN cp.id IS NOT NULL THEN 
    h.x_coordinate - ST_X(cp.geom)
  END AS x_difference,
  -- Calculate linear distance between points
  CASE WHEN cp.id IS NOT NULL THEN 
    SQRT(POWER(h.y_coordinate - ST_Y(cp.geom), 2) + POWER(h.x_coordinate - ST_X(cp.geom), 2))
  END AS linear_distance,
  -- SI 727 tolerance check (0.05m for urban, 0.10m for rural)
  CASE 
    WHEN cp.id IS NULL THEN 'NOT_MATCHED'
    WHEN SQRT(POWER(h.y_coordinate - ST_Y(cp.geom), 2) + POWER(h.x_coordinate - ST_X(cp.geom), 2)) <= 0.05 THEN 'WITHIN_URBAN_TOLERANCE'
    WHEN SQRT(POWER(h.y_coordinate - ST_Y(cp.geom), 2) + POWER(h.x_coordinate - ST_X(cp.geom), 2)) <= 0.10 THEN 'WITHIN_RURAL_TOLERANCE'
    ELSE 'EXCEEDS_TOLERANCE'
  END AS tolerance_status
FROM historical_survey_points h
LEFT JOIN coordinate_points cp ON 
  cp.project_id = h.project_id AND 
  (
    cp.name = h.point_name OR
    cp.name ILIKE h.point_name || '%' OR
    h.point_name ILIKE cp.name || '%'
  );

COMMENT ON VIEW v_beacon_comparison IS 
  'Compares historical survey points with current coordinate points for SI 727 beacon assessment. Uses ST_Y/ST_X to extract coordinates from geometry.';
