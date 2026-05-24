-- Migration 063: Fix land parcel geometries after coordinate_points backend fix
-- 
-- Problem: Parcels were digitized before we fixed coordinatePoint.js to return
-- ST_X as y, ST_Y as x. The parcel geometries have coordinates in the old order.
--
-- Solution: Swap X and Y ordinates in all parcel geometries to match the new
-- coordinate_points format (Cape Lo convention: y=Westing, x=Southing)

-- Step 1: Create a function to swap X and Y ordinates in a geometry
CREATE OR REPLACE FUNCTION swap_xy_ordinates(geom geometry)
RETURNS geometry AS $$
DECLARE
  geom_type text;
  srid int;
BEGIN
  -- Get geometry type and SRID
  geom_type := ST_GeometryType(geom);
  srid := ST_SRID(geom);
  
  -- Only process Polygon geometries
  IF geom_type = 'ST_Polygon' THEN
    -- Extract coordinates, swap X and Y, rebuild geometry
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
    -- Return unchanged for non-polygon geometries
    RETURN geom;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Step 2: Update all land parcels to swap their coordinates
UPDATE land_parcels
SET geom = swap_xy_ordinates(geom)
WHERE geom IS NOT NULL;

-- Step 3: Log the migration
DO $$
DECLARE
  parcel_count int;
BEGIN
  SELECT COUNT(*) INTO parcel_count FROM land_parcels WHERE geom IS NOT NULL;
  RAISE NOTICE 'Migration 063: Swapped X/Y ordinates in % parcel geometries', parcel_count;
END $$;

-- Step 4: Drop the temporary function (no longer needed)
DROP FUNCTION IF EXISTS swap_xy_ordinates(geometry);

COMMENT ON TABLE land_parcels IS 'Land parcels with geometries in Cape Lo convention (y=Westing, x=Southing) - updated by migration 063';
