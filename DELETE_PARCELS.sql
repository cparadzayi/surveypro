-- Delete all parcels that were digitized with the OLD coordinate order
-- These parcels have coordinates stored as [Y, X] instead of correct [X, Y]
-- After running this, re-digitize parcels with the FIXED frontend code

-- Check what will be deleted (run this first to verify)
SELECT id, stand, designation, 
       ST_X(ST_Centroid(geom)) as centroid_first_ordinate,
       ST_Y(ST_Centroid(geom)) as centroid_second_ordinate
FROM land_parcels 
ORDER BY stand;

-- If the above shows centroid_first_ordinate ~97k and centroid_second_ordinate ~2.2M,
-- then coordinates are SWAPPED and need to be deleted.

-- Uncomment the line below to DELETE all parcels:
-- DELETE FROM land_parcels;

-- After deletion:
-- 1. Restart frontend: npm run dev (in app-frontend folder)
-- 2. Re-digitize parcels in MapLibreAreaView or QGIS
-- 3. Verify Y column shows ~97k, X column shows ~2.2M
