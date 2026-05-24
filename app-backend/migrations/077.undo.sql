-- Migration 077 UNDO: Revert parcel 47 cape_lo_points to original generic letters

BEGIN;

-- This migration cannot be easily undone as we don't have the original data
-- If you need to revert, you would need to restore from a backup
-- or manually re-digitize the parcel

RAISE NOTICE '⚠️  Migration 077 cannot be automatically undone';
RAISE NOTICE 'Original cape_lo_points data with generic letters (A, B, C) has been replaced';
RAISE NOTICE 'To revert: Restore from backup or re-digitize the Outside Figure parcel';

COMMIT;
