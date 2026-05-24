-- Delete all parcels except Outside Figure
-- This script will keep only the Outside Figure parcel and delete all others
-- 
-- NOTE: This script works with your surveyor schema system
-- The queries will use the search_path set by your database connection
-- (e.g., surveyor_surveyor_kuda, public)
--
-- IMPORTANT: Make sure you're connected with the correct surveyor credentials
-- so the search_path is set to your schema

-- Step 1: Check what will be deleted (DRY RUN - just view)
SELECT 
  id,
  project_id,
  stand,
  designation,
  area_m2
FROM land_parcels
WHERE project_id = 5
  AND NOT (
    LOWER(COALESCE(stand, '')) LIKE '%outside figure%' 
    OR LOWER(COALESCE(designation, '')) LIKE '%outside figure%'
  )
ORDER BY id;

-- Step 2: Count parcels to be deleted
SELECT 
  COUNT(*) as parcels_to_delete,
  (SELECT COUNT(*) FROM land_parcels WHERE project_id = 5) as total_parcels,
  (SELECT COUNT(*) FROM land_parcels WHERE project_id = 5 
   AND (LOWER(COALESCE(stand, '')) LIKE '%outside figure%' 
        OR LOWER(COALESCE(designation, '')) LIKE '%outside figure%')) as outside_figure_count
FROM land_parcels
WHERE project_id = 5
  AND NOT (
    LOWER(COALESCE(stand, '')) LIKE '%outside figure%' 
    OR LOWER(COALESCE(designation, '')) LIKE '%outside figure%'
  );

-- Step 3: DELETE all parcels except Outside Figure
-- UNCOMMENT THE FOLLOWING LINES TO EXECUTE THE DELETION
/*
DELETE FROM land_parcels
WHERE project_id = 5
  AND NOT (
    LOWER(COALESCE(stand, '')) LIKE '%outside figure%' 
    OR LOWER(COALESCE(designation, '')) LIKE '%outside figure%'
  );
*/

-- Step 4: Verify deletion (run after uncommenting Step 3)
SELECT 
  id,
  project_id,
  stand,
  designation,
  area_m2
FROM land_parcels
WHERE project_id = 5
ORDER BY id;

-- Expected result: Only the Outside Figure parcel should remain
