-- Migration 057: Remove land_parcels_qgis View
-- Purpose: Simplify QGIS integration by using land_parcels table directly
-- Rationale: Modern QGIS (3.x+) handles GENERATED ALWAYS columns correctly
--            Views add complexity and maintenance burden, especially with schema-per-surveyor
--            Direct table access preserves metadata.vertices for shared beacon tracking

BEGIN;

-- ============================================================================
-- 1. DROP VIEWS FROM ALL SURVEYOR SCHEMAS
-- ============================================================================

DO $$
DECLARE
  schema_rec RECORD;
  view_exists BOOLEAN;
BEGIN
  RAISE NOTICE '🗑️  Removing land_parcels_qgis views from all surveyor schemas...';
  RAISE NOTICE '📋 Reason: Modern QGIS handles generated columns directly';
  RAISE NOTICE '';
  
  -- Loop through all surveyor schemas
  FOR schema_rec IN 
    SELECT schema_name 
    FROM surveyor_profiles 
    WHERE schema_name IS NOT NULL
    ORDER BY schema_name
  LOOP
    -- Check if view exists
    EXECUTE format('
      SELECT EXISTS (
        SELECT 1 FROM information_schema.views 
        WHERE table_schema = %L 
        AND table_name = ''land_parcels_qgis''
      )
    ', schema_rec.schema_name) INTO view_exists;
    
    IF view_exists THEN
      RAISE NOTICE '📂 Dropping view in schema: %', schema_rec.schema_name;
      
      -- Drop the view (CASCADE removes associated rules)
      EXECUTE format('DROP VIEW IF EXISTS %I.land_parcels_qgis CASCADE', schema_rec.schema_name);
      
      RAISE NOTICE '   ✅ View dropped successfully';
    ELSE
      RAISE NOTICE '📂 Schema %: View does not exist (skipping)', schema_rec.schema_name;
    END IF;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '🎉 Migration complete! All land_parcels_qgis views removed';
  
END $$;

-- ============================================================================
-- 2. DROP VIEW CREATION FUNCTION
-- ============================================================================

DROP FUNCTION IF EXISTS create_land_parcels_qgis_view(TEXT);

-- ============================================================================
-- 3. UPDATE COMMENTS FOR CLARITY
-- ============================================================================

COMMENT ON TABLE land_parcels IS
  'Land parcels with auto-calculated metrics. Use this table directly in QGIS.
  
  QGIS Setup:
  1. Add PostGIS layer: land_parcels (not land_parcels_qgis)
  2. Digitize polygons with stand designation
  3. Optionally add vertex labels in metadata JSONB:
     metadata = {"vertices": [{"id":"1463A","y":...,"x":...}, ...]}
  4. Save - area_m2, area_ha, perimeter_m auto-calculate via trigger
  
  Generated Columns (read-only):
  - area_m2: Area in square meters
  - area_ha: Area in hectares
  - perimeter_m: Perimeter in meters
  - centroid_y, centroid_x: Centroid coordinates
  
  QGIS 3.x+ automatically ignores generated columns during INSERT/UPDATE.';

-- ============================================================================
-- 4. FINAL SUMMARY
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '✅ Dropped create_land_parcels_qgis_view() function';
  RAISE NOTICE '';
  RAISE NOTICE '📝 Updated QGIS Workflow:';
  RAISE NOTICE '';
  RAISE NOTICE '   1. Connect QGIS to PostgreSQL database';
  RAISE NOTICE '   2. Add layer: land_parcels (use table directly)';
  RAISE NOTICE '   3. Digitize polygons with stand designation';
  RAISE NOTICE '   4. Label vertices with actual beacon IDs (e.g., 1463A, 1462A)';
  RAISE NOTICE '   5. Save - areas auto-calculate!';
  RAISE NOTICE '';
  RAISE NOTICE '💡 Benefits:';
  RAISE NOTICE '   ✅ Simpler: One table, not two layers';
  RAISE NOTICE '   ✅ Faster: No view overhead';
  RAISE NOTICE '   ✅ Reliable: Direct table access';
  RAISE NOTICE '   ✅ Metadata preserved: vertices array maintained';
  RAISE NOTICE '';
END $$;

COMMIT;
