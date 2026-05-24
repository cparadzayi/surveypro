-- Migration 063 UNDO: Revert land parcel geometry coordinate swap
-- 
-- This reverses the X/Y ordinate swap applied in 063.do.sql

-- Step 1: Create a function to swap X and Y ordinates back
CREATE OR REPLACE FUNCTION swap_xy_ordinates(geom geometry)
RETURNS geometry AS $$
DECLARE
  geom_type text;
  srid int;
BEGIN
  geom_type := ST_GeometryType(geom);
  srid := ST_SRID(geom);
  
  IF geom_type = 'ST_Polygon' THEN
    RETURN ST_SetSRID(
      ST_GeomFromText(
        'POLYGON((' || 
        array_to_string(
          ARRAY(
            SELECT ST_Y(pt) || ' ' || ST_X(pt)
            FROM ST_DumpPoints(geom) AS pt
          ),
          ','
        ) || 
        '))'
      ),
      srid
    );
  ELSE
    RETURN geom;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Step 2: Swap coordinates back to original order
UPDATE land_parcels
SET geom = swap_xy_ordinates(geom)
WHERE geom IS NOT NULL;

-- Step 3: Drop the function
DROP FUNCTION IF EXISTS swap_xy_ordinates(geometry);

-- Step 4: Remove the comment
COMMENT ON TABLE land_parcels IS 'Land parcels with polygon geometries';
