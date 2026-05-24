-- Migration 024: Land Parcels - Remove Duplicates and Add Constraints
-- Purpose: Clean up duplicate parcels and prevent future duplicates
-- - Remove duplicate parcels (same stand within project)
-- - Add unique constraint on (project_id, stand)
-- - Add spatial index to detect polygon overlaps
-- - Add trigger to prevent overlapping polygons

BEGIN;

-- ============================================================================
-- 1. BACKUP EXISTING DATA
-- ============================================================================

-- Create backup table
CREATE TABLE IF NOT EXISTS land_parcels_backup_024 AS 
SELECT * FROM land_parcels;

COMMENT ON TABLE land_parcels_backup_024 IS 
  'Backup of land_parcels before duplicate cleanup (Migration 024)';

-- ============================================================================
-- 2. IDENTIFY AND LOG DUPLICATES
-- ============================================================================

-- Create temp table to track duplicates
CREATE TEMP TABLE duplicate_parcels AS
SELECT 
  project_id,
  stand,
  COUNT(*) as duplicate_count,
  ARRAY_AGG(id ORDER BY created_at DESC) as parcel_ids,
  -- Keep the most recently created parcel
  (ARRAY_AGG(id ORDER BY created_at DESC))[1] as id_to_keep
FROM land_parcels
GROUP BY project_id, stand
HAVING COUNT(*) > 1;

-- Log duplicates for reference
DO $$
DECLARE
  dup_record RECORD;
  total_duplicates INT;
BEGIN
  SELECT COUNT(*) INTO total_duplicates FROM duplicate_parcels;
  
  IF total_duplicates > 0 THEN
    RAISE NOTICE '🔍 Found % duplicate stand numbers across projects', total_duplicates;
    
    FOR dup_record IN 
      SELECT * FROM duplicate_parcels ORDER BY project_id, stand
    LOOP
      RAISE NOTICE '  → Project %, Stand %: % parcels (keeping ID: %, deleting: %)',
        dup_record.project_id,
        dup_record.stand,
        dup_record.duplicate_count,
        dup_record.id_to_keep,
        ARRAY_TO_STRING(dup_record.parcel_ids[2:], ', ');
    END LOOP;
  ELSE
    RAISE NOTICE '✅ No duplicate stand numbers found';
  END IF;
END $$;

-- ============================================================================
-- 3. DELETE DUPLICATE PARCELS (Keep Most Recent)
-- ============================================================================

-- Delete all except the most recent parcel for each (project_id, stand)
DELETE FROM land_parcels
WHERE id IN (
  SELECT UNNEST(parcel_ids[2:])  -- All IDs except the first (most recent)
  FROM duplicate_parcels
);

-- Log deletion count
DO $$
DECLARE
  deleted_count INT;
BEGIN
  SELECT SUM(duplicate_count - 1) INTO deleted_count FROM duplicate_parcels;
  IF deleted_count > 0 THEN
    RAISE NOTICE '🗑️  Deleted % duplicate parcels', deleted_count;
  END IF;
END $$;

-- ============================================================================
-- 4. ADD UNIQUE CONSTRAINT
-- ============================================================================

-- Add unique constraint to prevent duplicate stand numbers within a project
ALTER TABLE land_parcels
  ADD CONSTRAINT unique_project_stand
  UNIQUE (project_id, stand);

COMMENT ON CONSTRAINT unique_project_stand ON land_parcels IS
  'Ensures each stand number is unique within a project';

DO $$ BEGIN
  RAISE NOTICE '✅ Added unique constraint on (project_id, stand)';
END $$;

-- ============================================================================
-- 5. CREATE SPATIAL OVERLAP DETECTION FUNCTION
-- ============================================================================

-- Function to check if a polygon overlaps with existing parcels
CREATE OR REPLACE FUNCTION check_parcel_overlap()
RETURNS TRIGGER AS $$
DECLARE
  overlap_count INT;
  overlapping_stand VARCHAR;
  overlap_area NUMERIC;
BEGIN
  -- Check for overlaps with other parcels in the same project
  -- Allow small overlaps (< 1m²) due to digitization precision
  SELECT COUNT(*), 
         MAX(stand),
         MAX(ST_Area(ST_Intersection(geom, NEW.geom)))
  INTO overlap_count, overlapping_stand, overlap_area
  FROM land_parcels
  WHERE project_id = NEW.project_id
    AND id != COALESCE(NEW.id, -1)  -- Exclude self on UPDATE
    AND ST_Overlaps(geom, NEW.geom)
    AND ST_Area(ST_Intersection(geom, NEW.geom)) > 1.0;  -- > 1m² overlap
  
  IF overlap_count > 0 THEN
    RAISE EXCEPTION 
      'Parcel "%" overlaps with existing parcel "%" by %.2f m². Please adjust boundaries.',
      NEW.stand, overlapping_stand, overlap_area
      USING HINT = 'Check your parcel boundaries in QGIS to avoid overlaps';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. CREATE OVERLAP PREVENTION TRIGGER
-- ============================================================================

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS prevent_parcel_overlap ON land_parcels;

-- Create trigger for INSERT and UPDATE
CREATE TRIGGER prevent_parcel_overlap
  BEFORE INSERT OR UPDATE OF geom ON land_parcels
  FOR EACH ROW
  EXECUTE FUNCTION check_parcel_overlap();

COMMENT ON TRIGGER prevent_parcel_overlap ON land_parcels IS
  'Prevents inserting or updating parcels that overlap with existing parcels (>1m² overlap)';

DO $$ BEGIN
  RAISE NOTICE '✅ Created spatial overlap prevention trigger';
END $$;

-- ============================================================================
-- 7. VERIFY SPATIAL INDEX EXISTS
-- ============================================================================

-- Ensure spatial index exists for efficient overlap detection
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'land_parcels' 
    AND indexname = 'land_parcels_geom_idx'
  ) THEN
    CREATE INDEX land_parcels_geom_idx ON land_parcels USING GIST(geom);
    RAISE NOTICE '✅ Created spatial index on geom column';
  ELSE
    RAISE NOTICE '✅ Spatial index already exists';
  END IF;
END $$;

-- ============================================================================
-- 8. SUMMARY
-- ============================================================================

DO $$
DECLARE
  total_parcels INT;
  projects_with_parcels INT;
BEGIN
  SELECT COUNT(*), COUNT(DISTINCT project_id) 
  INTO total_parcels, projects_with_parcels 
  FROM land_parcels;
  
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE '✅ Migration 024 Complete: Land Parcels Cleanup';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE 'Total Parcels: %', total_parcels;
  RAISE NOTICE 'Projects with Parcels: %', projects_with_parcels;
  RAISE NOTICE '';
  RAISE NOTICE 'Protections Added:';
  RAISE NOTICE '  ✅ Unique constraint: No duplicate stand numbers per project';
  RAISE NOTICE '  ✅ Spatial trigger: Prevents polygon overlaps (>1m²)';
  RAISE NOTICE '  ✅ Backup table: land_parcels_backup_024';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
END $$;

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES (Run these to verify)
-- ============================================================================

-- Check for any remaining duplicates (should be 0)
-- SELECT project_id, stand, COUNT(*) as count
-- FROM land_parcels
-- GROUP BY project_id, stand
-- HAVING COUNT(*) > 1;

-- Check for overlapping parcels (should be 0 with >1m² overlap)
-- SELECT 
--   a.stand as parcel_a,
--   b.stand as parcel_b,
--   ST_Area(ST_Intersection(a.geom, b.geom)) as overlap_area_m2
-- FROM land_parcels a
-- JOIN land_parcels b ON a.project_id = b.project_id AND a.id < b.id
-- WHERE ST_Overlaps(a.geom, b.geom)
--   AND ST_Area(ST_Intersection(a.geom, b.geom)) > 1.0;

-- View backup data
-- SELECT * FROM land_parcels_backup_024 LIMIT 10;
