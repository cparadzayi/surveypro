-- ============================================================================
-- Migration 070: Allow Subdivision Within Outside Figure Parcels
-- ============================================================================
-- Purpose: Modify overlap detection to allow new parcels to be digitized
--          within "Outside Figure" parcels for subdivision purposes.
-- 
-- Changes:
--   1. Update check_parcel_overlap() function to skip overlap check when
--      the existing parcel is an "Outside Figure" parcel
--   2. Recreate trigger on land_parcels table
-- ============================================================================

-- ============================================================================
-- 1. UPDATE OVERLAP CHECK FUNCTION
-- ============================================================================

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
  IF overlap_count > 0 AND NOT is_outside_figure THEN
    RAISE EXCEPTION 
      'Parcel "%" overlaps with existing parcel "%" by %.2f m². Please adjust boundaries.',
      NEW.stand, COALESCE(overlapping_designation, overlapping_stand), overlap_area
      USING HINT = 'Check your parcel boundaries in QGIS to avoid overlaps';
  END IF;
  
  -- If overlap is with Outside Figure, allow it (subdivision use case)
  IF overlap_count > 0 AND is_outside_figure THEN
    RAISE NOTICE 'Allowing parcel "%" to be created within Outside Figure parcel (subdivision)', NEW.stand;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_parcel_overlap() IS
  'Prevents parcel overlaps except when subdividing within Outside Figure parcels';

-- ============================================================================
-- 2. RECREATE TRIGGER (ensure it uses updated function)
-- ============================================================================

DROP TRIGGER IF EXISTS prevent_parcel_overlap ON land_parcels;

CREATE TRIGGER prevent_parcel_overlap
  BEFORE INSERT OR UPDATE OF geom ON land_parcels
  FOR EACH ROW
  EXECUTE FUNCTION check_parcel_overlap();

COMMENT ON TRIGGER prevent_parcel_overlap ON land_parcels IS
  'Prevents inserting or updating parcels that overlap (>1m²) except for Outside Figure subdivisions';

-- ============================================================================
-- 3. UPDATE FUNCTION FOR SURVEYOR SCHEMAS (if multi-tenancy is enabled)
-- ============================================================================

DO $$
DECLARE
  schema_rec RECORD;
BEGIN
  -- Check if surveyor schemas exist
  FOR schema_rec IN 
    SELECT schema_name 
    FROM information_schema.schemata 
    WHERE schema_name LIKE 'surveyor_%'
  LOOP
    -- Recreate trigger for each surveyor schema
    EXECUTE format('DROP TRIGGER IF EXISTS prevent_parcel_overlap ON %I.land_parcels', schema_rec.schema_name);
    EXECUTE format('CREATE TRIGGER prevent_parcel_overlap BEFORE INSERT OR UPDATE OF geom ON %I.land_parcels FOR EACH ROW EXECUTE FUNCTION check_parcel_overlap()', schema_rec.schema_name);
    
    RAISE NOTICE '✅ Updated overlap trigger for schema: %', schema_rec.schema_name;
  END LOOP;
END $$;

-- ============================================================================
-- 4. SUMMARY
-- ============================================================================

DO $$ BEGIN
  RAISE NOTICE '✅ Migration 070 complete: Outside Figure subdivision enabled';
  RAISE NOTICE '   - Updated check_parcel_overlap() function';
  RAISE NOTICE '   - Recreated prevent_parcel_overlap trigger';
  RAISE NOTICE '   - Parcels can now be digitized within Outside Figure boundaries';
END $$;
