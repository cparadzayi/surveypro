-- Clear AI-Generated Parcels
-- This script deletes parcels created by the AI detection system
-- AI parcels are identified by the "PARCEL-XXX" naming pattern

BEGIN;

-- Show count before deletion
SELECT 
  COUNT(*) as total_ai_parcels,
  COUNT(DISTINCT project_id) as affected_projects
FROM land_parcels
WHERE stand LIKE 'PARCEL-%';

-- Delete AI-generated parcels
DELETE FROM land_parcels
WHERE stand LIKE 'PARCEL-%';

-- Show summary
SELECT 
  'AI parcels deleted successfully' as status,
  COUNT(*) as remaining_parcels
FROM land_parcels;

COMMIT;
