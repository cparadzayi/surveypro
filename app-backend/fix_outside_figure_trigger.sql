-- Quick fix: Update the overlap trigger to allow subdivision inside Outside Figure
-- Run with: psql -U postgres -d surveypro -f fix_outside_figure_trigger.sql

CREATE OR REPLACE FUNCTION check_parcel_overlap()
RETURNS TRIGGER AS $$
DECLARE
  overlap_count INT;
  overlapping_stand VARCHAR;
  overlapping_designation VARCHAR;
  overlap_area NUMERIC;
  is_outside_figure BOOLEAN;
BEGIN
  -- Check for overlaps with other parcels in the same project
  -- EXCEPTION: Allow subdivision within "Outside Figure" parcels
  -- Allow small overlaps (< 1m²) due to digitization precision
  SELECT COUNT(*), 
         MAX(stand),
         MAX(designation),
         MAX(ST_Area(ST_Intersection(geom, NEW.geom))),
         -- Check if the overlapping parcel is an "Outside Figure" parcel
         BOOL_OR(LOWER(COALESCE(designation, stand, '')) LIKE '%outside figure%')
  INTO overlap_count, overlapping_stand, overlapping_designation, overlap_area, is_outside_figure
  FROM land_parcels
  WHERE project_id = NEW.project_id
    AND id != COALESCE(NEW.id, -1)  -- Exclude self on UPDATE
    AND ST_Overlaps(geom, NEW.geom)
    AND ST_Area(ST_Intersection(geom, NEW.geom)) > 1.0;  -- > 1m² overlap
  
  -- If overlap detected and it's NOT with an Outside Figure parcel, reject
  IF overlap_count > 0 AND NOT COALESCE(is_outside_figure, FALSE) THEN
    RAISE EXCEPTION 
      'Parcel "%" overlaps with existing parcel "%" by %.2f m². Please adjust boundaries.',
      NEW.stand, COALESCE(overlapping_designation, overlapping_stand), overlap_area
      USING HINT = 'Check your parcel boundaries in QGIS to avoid overlaps';
  END IF;
  
  -- If overlap is with Outside Figure, allow it (subdivision use case)
  IF overlap_count > 0 AND COALESCE(is_outside_figure, FALSE) THEN
    RAISE NOTICE 'Allowing parcel "%" to be created within Outside Figure parcel (subdivision)', NEW.stand;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger
DROP TRIGGER IF EXISTS prevent_parcel_overlap ON land_parcels;
CREATE TRIGGER prevent_parcel_overlap
  BEFORE INSERT OR UPDATE OF geom ON land_parcels
  FOR EACH ROW
  EXECUTE FUNCTION check_parcel_overlap();

SELECT 'Trigger updated - Outside Figure subdivision now allowed' as result;
