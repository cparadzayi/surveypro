-- Migration 024 UNDO: Remove duplicate prevention constraints
-- This will restore the original state before duplicate cleanup

BEGIN;

-- ============================================================================
-- 1. REMOVE TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS prevent_parcel_overlap ON land_parcels;
RAISE NOTICE '🔙 Removed overlap prevention trigger';

-- ============================================================================
-- 2. REMOVE FUNCTION
-- ============================================================================

DROP FUNCTION IF EXISTS check_parcel_overlap();
RAISE NOTICE '🔙 Removed overlap check function';

-- ============================================================================
-- 3. REMOVE UNIQUE CONSTRAINT
-- ============================================================================

ALTER TABLE land_parcels
  DROP CONSTRAINT IF EXISTS unique_project_stand;
RAISE NOTICE '🔙 Removed unique constraint on (project_id, stand)';

-- ============================================================================
-- 4. OPTIONALLY RESTORE BACKUP DATA
-- ============================================================================

-- NOTE: This does NOT automatically restore deleted duplicates
-- To restore, manually run:
-- INSERT INTO land_parcels SELECT * FROM land_parcels_backup_024
-- WHERE id NOT IN (SELECT id FROM land_parcels);

RAISE NOTICE '';
RAISE NOTICE 'ℹ️  Backup table "land_parcels_backup_024" still exists';
RAISE NOTICE 'ℹ️  To restore deleted duplicates, manually run:';
RAISE NOTICE '   INSERT INTO land_parcels SELECT * FROM land_parcels_backup_024';
RAISE NOTICE '   WHERE id NOT IN (SELECT id FROM land_parcels);';
RAISE NOTICE '';

-- ============================================================================
-- 5. SUMMARY
-- ============================================================================

RAISE NOTICE '═══════════════════════════════════════════════════════';
RAISE NOTICE '🔙 Migration 024 Rolled Back';
RAISE NOTICE '═══════════════════════════════════════════════════════';
RAISE NOTICE 'Removed:';
RAISE NOTICE '  • Unique constraint on (project_id, stand)';
RAISE NOTICE '  • Spatial overlap prevention trigger';
RAISE NOTICE '  • Overlap check function';
RAISE NOTICE '';
RAISE NOTICE '⚠️  Duplicates NOT automatically restored';
RAISE NOTICE '    Use backup table if needed: land_parcels_backup_024';
RAISE NOTICE '═══════════════════════════════════════════════════════';

COMMIT;
