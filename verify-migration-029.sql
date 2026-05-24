-- ============================================================================
-- Verification Script for Migration 029
-- ============================================================================

-- 1. Check new columns exist in land_parcels
SELECT 
  column_name, 
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'land_parcels'
AND column_name IN ('status', 'metadata', 'designation', 'digitized_by', 'finalized_at', 'updated_at')
ORDER BY column_name;

-- 2. Check data in land_parcels
SELECT 
  COUNT(*) as total_parcels,
  COUNT(*) FILTER (WHERE status = 'draft') as draft_count,
  COUNT(*) FILTER (WHERE status = 'finalized') as finalized_count,
  COUNT(*) FILTER (WHERE status = 'approved') as approved_count,
  COUNT(*) FILTER (WHERE designation IS NOT NULL) as has_designation,
  COUNT(*) FILTER (WHERE metadata IS NOT NULL) as has_metadata
FROM land_parcels;

-- 3. Check if parcels table was renamed
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
AND table_name LIKE '%parcel%'
ORDER BY table_name;

-- 4. Check if area_parcels view exists
SELECT 
  table_name,
  table_type
FROM information_schema.tables 
WHERE table_name = 'area_parcels';

-- 5. Sample data from land_parcels
SELECT 
  id,
  project_id,
  stand,
  designation,
  ROUND(area_m2::numeric, 2) as area_m2,
  ROUND(area_ha::numeric, 4) as area_ha,
  status,
  created_at
FROM land_parcels
ORDER BY id
LIMIT 10;

-- 6. Check indexes created
SELECT 
  indexname,
  indexdef
FROM pg_indexes 
WHERE tablename = 'land_parcels'
AND indexname LIKE '%status%' 
   OR indexname LIKE '%designation%'
   OR indexname LIKE '%metadata%'
ORDER BY indexname;

-- 7. Check trigger exists
SELECT 
  trigger_name,
  event_manipulation,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'land_parcels'
AND trigger_name = 'trigger_update_land_parcels_updated_at';
