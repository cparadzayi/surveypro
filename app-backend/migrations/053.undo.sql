-- Migration 053 Rollback: Remove Automatic Area Calculation Trigger
-- This removes the trigger and function, but keeps the calculated data

BEGIN;

-- ============================================================================
-- 1. DROP TRIGGER
-- ============================================================================

DROP TRIGGER IF EXISTS land_parcel_auto_calculate ON land_parcels;

DO $$ BEGIN
  RAISE NOTICE '[SUCCESS] Removed automatic area calculation trigger';
END $$;

-- ============================================================================
-- 2. DROP FUNCTION
-- ============================================================================

DROP FUNCTION IF EXISTS auto_calculate_parcel_metrics();

DO $$ BEGIN
  RAISE NOTICE '[SUCCESS] Removed auto_calculate_parcel_metrics function';
END $$;

-- ============================================================================
-- 3. SUMMARY
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '===========================================================';
  RAISE NOTICE '[SUCCESS] Migration 053 Rolled Back';
  RAISE NOTICE '===========================================================';
  RAISE NOTICE 'Removed:';
  RAISE NOTICE '  [OK] Trigger: land_parcel_auto_calculate';
  RAISE NOTICE '  [OK] Function: auto_calculate_parcel_metrics()';
  RAISE NOTICE '';
  RAISE NOTICE 'Note: Existing calculated area values are preserved.';
  RAISE NOTICE 'You will need to manually call /calculate-areas endpoint';
  RAISE NOTICE 'after geometry updates.';
  RAISE NOTICE '===========================================================';
END $$;

COMMIT;
