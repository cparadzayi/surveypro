-- Verification Script for Coordinate System Fix
-- Run this after migration 060 to verify SRID transformation

\echo '================================================'
\echo 'COORDINATE SYSTEM VERIFICATION'
\echo '================================================'
\echo ''

-- 1. Check PostGIS version
\echo '1. PostGIS Version:'
SELECT PostGIS_Version();
\echo ''

-- 2. Verify SRID 2053 exists in spatial_ref_sys
\echo '2. Verify EPSG:2053 exists:'
SELECT 
  srid, 
  auth_name, 
  auth_srid, 
  srtext 
FROM spatial_ref_sys 
WHERE srid = 2053;
\echo ''

-- 3. Check coordinate_points SRID
\echo '3. Coordinate Points SRID:'
SELECT 
  'coordinate_points' as table_name,
  COUNT(*) as total_points,
  COUNT(DISTINCT ST_SRID(geom)) as unique_srids,
  STRING_AGG(DISTINCT ST_SRID(geom)::text, ', ') as srids_found
FROM coordinate_points;
\echo ''

-- 4. Check land_parcels SRID
\echo '4. Land Parcels SRID:'
SELECT 
  'land_parcels' as table_name,
  COUNT(*) as total_parcels,
  COUNT(DISTINCT ST_SRID(geom)) as unique_srids,
  STRING_AGG(DISTINCT ST_SRID(geom)::text, ', ') as srids_found
FROM land_parcels;
\echo ''

-- 5. Sample coordinate comparison (if backup exists)
\echo '5. Sample Coordinate Comparison (Before vs After):'
DO $$
DECLARE
  backup_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_name = 'coordinate_points_backup_060'
  ) INTO backup_exists;
  
  IF backup_exists THEN
    RAISE NOTICE 'Backup table found - showing first 5 points:';
    RAISE NOTICE 'Format: Point | Old SRID | Old Y,X | New SRID | New Y,X';
    RAISE NOTICE '--------------------------------------------------------';
  ELSE
    RAISE NOTICE 'No backup table found (migration may not have run yet)';
  END IF;
END $$;

SELECT 
  cp.name as point,
  ST_SRID(backup.geom) as old_srid,
  ROUND(ST_Y(backup.geom)::numeric, 3) as old_y,
  ROUND(ST_X(backup.geom)::numeric, 3) as old_x,
  ST_SRID(cp.geom) as new_srid,
  ROUND(ST_Y(cp.geom)::numeric, 3) as new_y,
  ROUND(ST_X(cp.geom)::numeric, 3) as new_x
FROM coordinate_points cp
JOIN coordinate_points_backup_060 backup ON cp.id = backup.id
LIMIT 5;
\echo ''

-- 6. Verify geometry validity
\echo '6. Geometry Validity Check:'
SELECT 
  'coordinate_points' as table_name,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE ST_IsValid(geom)) as valid,
  COUNT(*) FILTER (WHERE NOT ST_IsValid(geom)) as invalid
FROM coordinate_points
UNION ALL
SELECT 
  'land_parcels' as table_name,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE ST_IsValid(geom)) as valid,
  COUNT(*) FILTER (WHERE NOT ST_IsValid(geom)) as invalid
FROM land_parcels;
\echo ''

-- 7. Check coordinate ranges (should be within Zimbabwe bounds)
\echo '7. Coordinate Ranges (Zimbabwe bounds check):'
SELECT 
  'coordinate_points' as table_name,
  ROUND(MIN(ST_Y(geom))::numeric, 2) as min_y,
  ROUND(MAX(ST_Y(geom))::numeric, 2) as max_y,
  ROUND(MIN(ST_X(geom))::numeric, 2) as min_x,
  ROUND(MAX(ST_X(geom))::numeric, 2) as max_x,
  CASE 
    WHEN MIN(ST_Y(geom)) BETWEEN -200000 AND 200000 
     AND MAX(ST_Y(geom)) BETWEEN -200000 AND 200000
     AND MIN(ST_X(geom)) BETWEEN 0 AND 3000000
     AND MAX(ST_X(geom)) BETWEEN 0 AND 3000000
    THEN '✅ VALID'
    ELSE '❌ OUT OF RANGE'
  END as status
FROM coordinate_points
UNION ALL
SELECT 
  'land_parcels' as table_name,
  ROUND(MIN(ST_Y(ST_Centroid(geom)))::numeric, 2) as min_y,
  ROUND(MAX(ST_Y(ST_Centroid(geom)))::numeric, 2) as max_y,
  ROUND(MIN(ST_X(ST_Centroid(geom)))::numeric, 2) as min_x,
  ROUND(MAX(ST_X(ST_Centroid(geom)))::numeric, 2) as max_x,
  CASE 
    WHEN MIN(ST_Y(ST_Centroid(geom))) BETWEEN -200000 AND 200000 
     AND MAX(ST_Y(ST_Centroid(geom))) BETWEEN -200000 AND 200000
     AND MIN(ST_X(ST_Centroid(geom))) BETWEEN 0 AND 3000000
     AND MAX(ST_X(ST_Centroid(geom))) BETWEEN 0 AND 3000000
    THEN '✅ VALID'
    ELSE '❌ OUT OF RANGE'
  END as status
FROM land_parcels
WHERE ST_NumGeometries(geom) > 0;
\echo ''

-- 8. Transform sample point to WGS84 (for Google Maps verification)
\echo '8. Sample Point Transformation to WGS84 (Google Maps):'
SELECT 
  name as point,
  ST_SRID(geom) as srid,
  ROUND(ST_Y(geom)::numeric, 3) as y_lo31,
  ROUND(ST_X(geom)::numeric, 3) as x_lo31,
  ROUND(ST_Y(ST_Transform(geom, 4326))::numeric, 6) as latitude_wgs84,
  ROUND(ST_X(ST_Transform(geom, 4326))::numeric, 6) as longitude_wgs84,
  'https://www.google.com/maps?q=' || 
    ST_Y(ST_Transform(geom, 4326))::text || ',' || 
    ST_X(ST_Transform(geom, 4326))::text as google_maps_link
FROM coordinate_points
LIMIT 3;
\echo ''

-- 9. Check spatial indexes
\echo '9. Spatial Indexes:'
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE indexname IN ('coordinate_points_geom_idx', 'land_parcels_geom_idx')
ORDER BY tablename;
\echo ''

-- 10. Summary
\echo '================================================'
\echo 'VERIFICATION SUMMARY'
\echo '================================================'
DO $$
DECLARE
  coord_srid INTEGER;
  parcel_srid INTEGER;
  coord_count INTEGER;
  parcel_count INTEGER;
  all_valid BOOLEAN := TRUE;
BEGIN
  -- Get SRIDs
  SELECT DISTINCT ST_SRID(geom) INTO coord_srid FROM coordinate_points LIMIT 1;
  SELECT DISTINCT ST_SRID(geom) INTO parcel_srid FROM land_parcels LIMIT 1;
  
  -- Get counts
  SELECT COUNT(*) INTO coord_count FROM coordinate_points;
  SELECT COUNT(*) INTO parcel_count FROM land_parcels;
  
  RAISE NOTICE '';
  RAISE NOTICE '📊 Data Summary:';
  RAISE NOTICE '   - Coordinate Points: % records (SRID: %)', coord_count, coord_srid;
  RAISE NOTICE '   - Land Parcels: % records (SRID: %)', parcel_count, parcel_srid;
  RAISE NOTICE '';
  
  -- Validation
  IF coord_srid = 2053 THEN
    RAISE NOTICE '✅ Coordinate points SRID is correct (2053)';
  ELSE
    RAISE NOTICE '❌ Coordinate points SRID is WRONG (expected 2053, got %)', coord_srid;
    all_valid := FALSE;
  END IF;
  
  IF parcel_srid = 2053 THEN
    RAISE NOTICE '✅ Land parcels SRID is correct (2053)';
  ELSE
    RAISE NOTICE '❌ Land parcels SRID is WRONG (expected 2053, got %)', parcel_srid;
    all_valid := FALSE;
  END IF;
  
  RAISE NOTICE '';
  
  IF all_valid THEN
    RAISE NOTICE '🎉 ALL CHECKS PASSED!';
    RAISE NOTICE '';
    RAISE NOTICE '📋 Next Steps:';
    RAISE NOTICE '   1. Test in QGIS 3.44';
    RAISE NOTICE '   2. Add Google Satellite layer';
    RAISE NOTICE '   3. Verify points overlay correctly';
    RAISE NOTICE '   4. Verify north is UP (no rotation needed)';
    RAISE NOTICE '   5. After verification, drop backup tables:';
    RAISE NOTICE '      DROP TABLE coordinate_points_backup_060;';
    RAISE NOTICE '      DROP TABLE land_parcels_backup_060;';
  ELSE
    RAISE NOTICE '⚠️  VERIFICATION FAILED - Check errors above';
  END IF;
  
  RAISE NOTICE '';
END $$;

\echo '================================================'
