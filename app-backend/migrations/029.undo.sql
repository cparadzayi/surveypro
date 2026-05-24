-- ============================================================================
-- Migration 029 Rollback: Undo Parcel Architecture Unification
-- ============================================================================
-- Purpose: Rollback changes from migration 029
-- Date: 2025-11-27
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Drop backward compatibility view
-- ============================================================================

DROP VIEW IF EXISTS area_parcels;

-- ============================================================================
-- STEP 2: Restore parcels table (if backup exists)
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'parcels_deprecated_backup_029') THEN
    ALTER TABLE parcels_deprecated_backup_029 RENAME TO parcels;
    RAISE NOTICE 'Restored parcels table from backup';
  END IF;
END $$;

-- ============================================================================
-- STEP 3: Drop trigger and function
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_update_land_parcels_updated_at ON land_parcels;
DROP FUNCTION IF EXISTS update_land_parcels_updated_at();

-- ============================================================================
-- STEP 4: Drop indexes
-- ============================================================================

DROP INDEX IF EXISTS idx_land_parcels_status;
DROP INDEX IF EXISTS idx_land_parcels_designation;
DROP INDEX IF EXISTS idx_land_parcels_metadata;
DROP INDEX IF EXISTS idx_land_parcels_digitized_by;
DROP INDEX IF EXISTS idx_land_parcels_updated_at;

-- ============================================================================
-- STEP 5: Remove new columns from land_parcels
-- ============================================================================

ALTER TABLE land_parcels
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS digitized_by,
  DROP COLUMN IF EXISTS finalized_at,
  DROP COLUMN IF EXISTS metadata,
  DROP COLUMN IF EXISTS designation,
  DROP COLUMN IF EXISTS updated_at;

-- ============================================================================
-- STEP 6: Verification
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 029 Rollback Complete!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Removed columns from land_parcels:';
  RAISE NOTICE '  - status';
  RAISE NOTICE '  - digitized_by';
  RAISE NOTICE '  - finalized_at';
  RAISE NOTICE '  - metadata';
  RAISE NOTICE '  - designation';
  RAISE NOTICE '  - updated_at';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Dropped indexes: 5';
  RAISE NOTICE 'Dropped triggers: 1';
  RAISE NOTICE 'Dropped views: 1';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Restored parcels table (if backup existed)';
  RAISE NOTICE '========================================';
END $$;

COMMIT;
