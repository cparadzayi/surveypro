-- Migration 053: Automatic Area Calculation via Database Triggers
-- Purpose: Eliminate data redundancy by auto-computing area from geometry
-- See: 053.README.md for full documentation

BEGIN;

-- ============================================================================
-- 1. CREATE TRIGGER FUNCTION FOR AUTOMATIC AREA CALCULATION
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_calculate_parcel_metrics()
RETURNS TRIGGER AS $$
BEGIN
  -- Only calculate if geometry exists and is valid
  IF NEW.geom IS NOT NULL AND ST_IsValid(NEW.geom) THEN
    
    -- Calculate area in square meters
    -- Geometry should be in EPSG:22291 (Cape / Lo31) for accurate area calculation
    NEW.area_m2 := ST_Area(NEW.geom);
    
    -- Convert to hectares
    NEW.area_ha := NEW.area_m2 / 10000.0;
    
    -- Calculate perimeter in meters
    NEW.perimeter_m := ST_Perimeter(NEW.geom);
    
    -- Calculate centroid coordinates
    NEW.centroid_y := ST_Y(ST_Centroid(NEW.geom));
    NEW.centroid_x := ST_X(ST_Centroid(NEW.geom));
    
    -- Calculate closure error from metadata if available
    -- This is the traverse closure error from the survey calculations
    IF NEW.metadata IS NOT NULL AND 
       NEW.metadata ? 'residuals' AND 
       NEW.metadata->'residuals' ? 'closureError' THEN
      NEW.closure_error_m := (NEW.metadata->'residuals'->>'closureError')::NUMERIC;
    END IF;
    
    -- Calculate closure ratio (perimeter / closure_error)
    -- Only if closure error is available and non-zero
    IF NEW.closure_error_m IS NOT NULL AND NEW.closure_error_m > 0 THEN
      NEW.closure_ratio := NEW.perimeter_m / NEW.closure_error_m;
    ELSE
      NEW.closure_ratio := NULL;
    END IF;
    
    -- Mark that area has been calculated
    NEW.area_calculated := TRUE;
    
    -- Log calculation for debugging (optional - comment out in production)
    RAISE DEBUG 'Auto-calculated metrics for parcel %: area=% m², perimeter=% m', 
      NEW.stand, ROUND(NEW.area_m2::NUMERIC, 2), ROUND(NEW.perimeter_m::NUMERIC, 2);
    
  ELSE
    -- If geometry is NULL or invalid, clear calculated fields
    NEW.area_m2 := NULL;
    NEW.area_ha := NULL;
    NEW.perimeter_m := NULL;
    NEW.centroid_y := NULL;
    NEW.centroid_x := NULL;
    NEW.closure_error_m := NULL;
    NEW.closure_ratio := NULL;
    NEW.area_calculated := FALSE;
    
    IF NEW.geom IS NOT NULL AND NOT ST_IsValid(NEW.geom) THEN
      RAISE WARNING 'Invalid geometry for parcel %. Area not calculated.', NEW.stand;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION auto_calculate_parcel_metrics() IS
  'Automatically calculates area, perimeter, centroid, and closure metrics from geometry. '
  'Triggered on INSERT or UPDATE of land_parcels.geom column.';

-- ============================================================================
-- 2. CREATE TRIGGER
-- ============================================================================

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS land_parcel_auto_calculate ON land_parcels;

-- Create trigger that fires BEFORE INSERT or UPDATE of geometry
CREATE TRIGGER land_parcel_auto_calculate
  BEFORE INSERT OR UPDATE OF geom ON land_parcels
  FOR EACH ROW
  EXECUTE FUNCTION auto_calculate_parcel_metrics();

COMMENT ON TRIGGER land_parcel_auto_calculate ON land_parcels IS
  'Automatically calculates area and related metrics whenever geometry is inserted or updated. '
  'Ensures area values are always in sync with geometry data.';

-- ============================================================================
-- 3. BACKFILL EXISTING PARCELS
-- ============================================================================

-- Recalculate all existing parcels to ensure consistency
-- This triggers the auto_calculate_parcel_metrics function for each row
DO $$
DECLARE
  parcel_count INT;
  updated_count INT;
BEGIN
  -- Count total parcels
  SELECT COUNT(*) INTO parcel_count FROM land_parcels WHERE geom IS NOT NULL;
  
  RAISE NOTICE '[INFO] Recalculating metrics for % existing parcels...', parcel_count;
  
  -- Update all parcels (this triggers the auto-calculation)
  -- We use a dummy update to trigger the BEFORE UPDATE trigger
  UPDATE land_parcels 
  SET geom = geom  -- This triggers the trigger without changing data
  WHERE geom IS NOT NULL;
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  
  RAISE NOTICE '[SUCCESS] Recalculated metrics for % parcels', updated_count;
END $$;

-- ============================================================================
-- 4. VERIFY RESULTS
-- ============================================================================

DO $$
DECLARE
  total_parcels INT;
  calculated_parcels INT;
  avg_area_ha NUMERIC;
  total_area_ha NUMERIC;
BEGIN
  -- Get statistics
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE area_calculated = TRUE),
    ROUND(AVG(area_ha)::NUMERIC, 4),
    ROUND(SUM(area_ha)::NUMERIC, 4)
  INTO total_parcels, calculated_parcels, avg_area_ha, total_area_ha
  FROM land_parcels
  WHERE geom IS NOT NULL;
  
  RAISE NOTICE '';
  RAISE NOTICE '===========================================================';
  RAISE NOTICE '[SUCCESS] Migration 053 Complete: Automatic Area Calculation';
  RAISE NOTICE '===========================================================';
  RAISE NOTICE 'Total Parcels: %', total_parcels;
  RAISE NOTICE 'Calculated Parcels: %', calculated_parcels;
  RAISE NOTICE 'Average Area: % ha', avg_area_ha;
  RAISE NOTICE 'Total Area: % ha', total_area_ha;
  RAISE NOTICE '';
  RAISE NOTICE 'Features:';
  RAISE NOTICE '  [OK] Automatic area calculation from geometry';
  RAISE NOTICE '  [OK] Trigger fires on INSERT/UPDATE of geom column';
  RAISE NOTICE '  [OK] No manual /calculate-areas endpoint needed';
  RAISE NOTICE '  [OK] Single source of truth (geometry)';
  RAISE NOTICE '===========================================================';
END $$;

COMMIT;

-- ============================================================================
-- USAGE EXAMPLES
-- ============================================================================

-- Example 1: Insert new parcel - area auto-calculates
-- INSERT INTO land_parcels (project_id, stand, geom)
-- VALUES (1, 'AUTO-001', ST_GeomFromText('POLYGON((0 0, 100 0, 100 100, 0 100, 0 0))', 22291));

-- Example 2: Update geometry - area recalculates automatically
-- UPDATE land_parcels 
-- SET geom = ST_GeomFromText('POLYGON((0 0, 50 0, 50 50, 0 50, 0 0))', 22291)
-- WHERE stand = 'AUTO-001';

-- Example 3: Check calculated values
-- SELECT stand, area_m2, area_ha, perimeter_m, area_calculated 
-- FROM land_parcels 
-- WHERE stand = 'AUTO-001';
