-- ============================================================================
-- Migration 029: Unify Parcel Architecture
-- ============================================================================
-- Purpose: Consolidate land_parcels and parcels tables into single source of truth
-- Date: 2025-11-27
-- Author: System
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Enhance land_parcels table with modern features
-- ============================================================================

-- Add status column for workflow tracking
ALTER TABLE land_parcels
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft' 
    CHECK (status IN ('draft', 'finalized', 'approved'));

-- Add user tracking
ALTER TABLE land_parcels
  ADD COLUMN IF NOT EXISTS digitized_by INTEGER REFERENCES users(id);

-- Add finalization timestamp
ALTER TABLE land_parcels
  ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMP;

-- Add metadata for flexible data storage
ALTER TABLE land_parcels
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Add designation as alias for stand (modern naming)
ALTER TABLE land_parcels
  ADD COLUMN IF NOT EXISTS designation VARCHAR(100);

-- Add updated_at if not exists
ALTER TABLE land_parcels
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- ============================================================================
-- STEP 2: Populate designation from stand (backward compatibility)
-- ============================================================================

UPDATE land_parcels 
SET designation = stand 
WHERE designation IS NULL;

-- ============================================================================
-- STEP 3: Create indexes for performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_land_parcels_status 
  ON land_parcels(status);

CREATE INDEX IF NOT EXISTS idx_land_parcels_designation 
  ON land_parcels(designation);

CREATE INDEX IF NOT EXISTS idx_land_parcels_metadata 
  ON land_parcels USING GIN(metadata);

CREATE INDEX IF NOT EXISTS idx_land_parcels_digitized_by 
  ON land_parcels(digitized_by);

CREATE INDEX IF NOT EXISTS idx_land_parcels_updated_at 
  ON land_parcels(updated_at);

-- ============================================================================
-- STEP 4: Add trigger for updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_land_parcels_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_land_parcels_updated_at ON land_parcels;

CREATE TRIGGER trigger_update_land_parcels_updated_at
  BEFORE UPDATE ON land_parcels
  FOR EACH ROW
  EXECUTE FUNCTION update_land_parcels_updated_at();

-- ============================================================================
-- STEP 5: Migrate data from parcels table (if exists)
-- ============================================================================

DO $$
DECLARE
  migrated_count INTEGER := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'parcels') THEN
    
    -- Temporarily disable overlap prevention trigger during migration
    ALTER TABLE land_parcels DISABLE TRIGGER prevent_parcel_overlap;
    
    -- Migrate parcels to land_parcels with CRS transformation
    -- Note: area_m2, area_ha, perimeter_m are GENERATED columns, so we don't insert them
    INSERT INTO land_parcels (
      project_id,
      stand,
      designation,
      geom,
      closure_error_m,
      status,
      digitized_by,
      finalized_at,
      metadata,
      created_at,
      updated_at
    )
    SELECT 
      project_id,
      designation as stand,
      designation,
      ST_Transform(geometry, 22291) as geom, -- Transform WGS84 → Cape Lo 31
      closure_error as closure_error_m,
      status,
      digitized_by,
      finalized_at,
      metadata,
      created_at,
      updated_at
    FROM parcels
    WHERE NOT EXISTS (
      SELECT 1 FROM land_parcels lp
      WHERE lp.project_id = parcels.project_id
      AND lp.stand = parcels.designation
    );
    
    GET DIAGNOSTICS migrated_count = ROW_COUNT;
    
    -- Re-enable overlap prevention trigger
    ALTER TABLE land_parcels ENABLE TRIGGER prevent_parcel_overlap;
    
    RAISE NOTICE 'Migrated % parcels from parcels table', migrated_count;
    
  ELSE
    RAISE NOTICE 'parcels table does not exist, skipping migration';
  END IF;
END $$;

-- ============================================================================
-- STEP 6: Add comments for documentation
-- ============================================================================

COMMENT ON COLUMN land_parcels.status IS 
  'Parcel status: draft (auto-saved), finalized (user confirmed), approved (surveyor approved)';

COMMENT ON COLUMN land_parcels.digitized_by IS 
  'User ID who digitized this parcel';

COMMENT ON COLUMN land_parcels.finalized_at IS 
  'Timestamp when parcel was finalized';

COMMENT ON COLUMN land_parcels.metadata IS 
  'Additional metadata: colors, labels, user notes, Cape Lo points, etc.';

COMMENT ON COLUMN land_parcels.designation IS 
  'Parcel designation/stand number (modern naming, alias for stand)';

COMMENT ON COLUMN land_parcels.updated_at IS 
  'Timestamp of last update (auto-updated by trigger)';

-- ============================================================================
-- STEP 7: Rename parcels table to deprecated backup (if exists)
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'parcels') THEN
    ALTER TABLE parcels RENAME TO parcels_deprecated_backup_029;
    RAISE NOTICE 'Renamed parcels table to parcels_deprecated_backup_029';
  END IF;
END $$;

-- ============================================================================
-- STEP 8: Create view for backward compatibility
-- ============================================================================

CREATE OR REPLACE VIEW area_parcels AS
SELECT 
  id,
  project_id,
  designation,
  geom as geometry,
  area_m2 as area_sqm,
  perimeter_m,
  CASE 
    WHEN perimeter_m > 0 AND closure_error_m > 0 
    THEN '1:' || ROUND(perimeter_m / closure_error_m)::text
    ELSE 'N/A'
  END as closure_ratio,
  closure_error_m as closure_error,
  status,
  created_at as digitized_at,
  digitized_by,
  finalized_at,
  metadata,
  created_at,
  updated_at
FROM land_parcels;

COMMENT ON VIEW area_parcels IS 
  'Backward compatibility view - maps land_parcels to old area_parcels schema';

-- ============================================================================
-- STEP 9: Verification
-- ============================================================================

DO $$
DECLARE
  total_parcels INTEGER;
  draft_count INTEGER;
  finalized_count INTEGER;
  approved_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_parcels FROM land_parcels;
  SELECT COUNT(*) INTO draft_count FROM land_parcels WHERE status = 'draft';
  SELECT COUNT(*) INTO finalized_count FROM land_parcels WHERE status = 'finalized';
  SELECT COUNT(*) INTO approved_count FROM land_parcels WHERE status = 'approved';
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 029 Complete!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Total parcels: %', total_parcels;
  RAISE NOTICE '  - Draft: %', draft_count;
  RAISE NOTICE '  - Finalized: %', finalized_count;
  RAISE NOTICE '  - Approved: %', approved_count;
  RAISE NOTICE '========================================';
  RAISE NOTICE 'New columns added:';
  RAISE NOTICE '  - status (draft/finalized/approved)';
  RAISE NOTICE '  - digitized_by (user tracking)';
  RAISE NOTICE '  - finalized_at (timestamp)';
  RAISE NOTICE '  - metadata (JSONB)';
  RAISE NOTICE '  - designation (modern naming)';
  RAISE NOTICE '  - updated_at (auto-updated)';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Indexes created: 5';
  RAISE NOTICE 'Triggers created: 1';
  RAISE NOTICE 'Views created: 1 (area_parcels)';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Single source of truth: land_parcels ✅';
  RAISE NOTICE '========================================';
END $$;

COMMIT;
