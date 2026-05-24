-- Test what the backend is actually returning
SELECT 
  name,
  ST_Y(geom) as y_from_geom,
  ST_X(geom) as x_from_geom,
  ST_AsText(geom) as geom_wkt
FROM surveyor_surveyor_kuda.coordinate_points
WHERE name IN ('1465A', '1466A', '1465C')
ORDER BY name;

-- Expected for 1465A:
-- y_from_geom = 2247765.354 (northing)
-- x_from_geom = 97593.773 (easting)
-- geom_wkt = POINT(2247765.354 97593.773)
--            POINT(Y X) in PostGIS convention
