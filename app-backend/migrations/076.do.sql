-- Migration 076: Update Outside Figure Parcel Metadata with Beacon Names
-- Purpose: Re-compute area and consistency data for Outside Figure parcels to include beacon names
-- Rationale: Backend area computation now preserves beacon id/name in edge data (compute.js update)
--            This migration updates existing Outside Figure parcels to have proper beacon names
--            in metadata.residuals.edges for correct PDF rendering

BEGIN;

-- ============================================================================
-- 1. CREATE FUNCTION TO RE-COMPUTE OUTSIDE FIGURE METADATA WITH BEACON NAMES
-- ============================================================================

CREATE OR REPLACE FUNCTION update_outside_figure_metadata()
RETURNS TABLE(
  parcel_id INTEGER,
  stand VARCHAR(50),
  edges_updated INTEGER,
  status TEXT
) AS $$
DECLARE
  parcel_rec RECORD;
  point_rec RECORD;
  edges_array JSONB := '[]'::JSONB;
  edge_obj JSONB;
  edge_count INTEGER := 0;
  to_point_id TEXT;
  to_point_name TEXT;
  to_point_y NUMERIC;
  to_point_x NUMERIC;
  distance NUMERIC;
  bearing_deg NUMERIC;
  dy NUMERIC;
  dx NUMERIC;
BEGIN
  RAISE NOTICE '🔄 Updating Outside Figure parcels with beacon names...';
  RAISE NOTICE '';
  
  -- Loop through all Outside Figure parcels
  FOR parcel_rec IN 
    SELECT 
      lp.id,
      lp.stand,
      lp.geom,
      lp.metadata
    FROM land_parcels lp
    WHERE lp.stand ILIKE '%outside figure%'
       OR lp.designation ILIKE '%outside figure%'
       OR (lp.metadata->>'isOutsideFigure')::BOOLEAN = TRUE
  LOOP
    RAISE NOTICE '📐 Processing parcel: % (ID: %)', parcel_rec.stand, parcel_rec.id;
    
    -- Check if parcel has cape_lo_points in metadata
    IF parcel_rec.metadata IS NULL OR parcel_rec.metadata->'cape_lo_points' IS NULL THEN
      RAISE NOTICE '   ⚠️  No cape_lo_points in metadata - skipping';
      
      RETURN QUERY SELECT 
        parcel_rec.id,
        parcel_rec.stand,
        0,
        'SKIPPED: No cape_lo_points in metadata'::TEXT;
      CONTINUE;
    END IF;
    
    -- Extract points from metadata
    edges_array := '[]'::JSONB;
    edge_count := 0;
    
    -- Build edges array with beacon names from cape_lo_points
    FOR point_rec IN 
      SELECT 
        idx,
        value->>'id' AS point_id,
        value->>'name' AS point_name,
        (value->>'y')::NUMERIC AS y,
        (value->>'x')::NUMERIC AS x
      FROM jsonb_array_elements(parcel_rec.metadata->'cape_lo_points') WITH ORDINALITY AS t(value, idx)
    LOOP
      -- Get next point (wrap around for last edge)
      SELECT 
        value->>'id',
        value->>'name',
        (value->>'y')::NUMERIC,
        (value->>'x')::NUMERIC
      INTO to_point_id, to_point_name, to_point_y, to_point_x
      FROM jsonb_array_elements(parcel_rec.metadata->'cape_lo_points') WITH ORDINALITY AS t(value, idx)
      WHERE idx = (point_rec.idx % jsonb_array_length(parcel_rec.metadata->'cape_lo_points')) + 1;
      
      -- Calculate distance and bearing
      dy := to_point_y - point_rec.y;
      dx := to_point_x - point_rec.x;
      distance := sqrt(dy * dy + dx * dx);
      
      -- Calculate bearing (south-based azimuth)
      bearing_deg := degrees(atan2(dx, dy));
      IF bearing_deg < 0 THEN
        bearing_deg := bearing_deg + 360;
      END IF;
      
      -- Build edge object with beacon names
      edge_obj := jsonb_build_object(
        'index', edge_count + 1,
        'from', jsonb_build_object(
          'id', COALESCE(point_rec.point_id, point_rec.point_name),
          'name', COALESCE(point_rec.point_name, point_rec.point_id),
          'y', point_rec.y,
          'x', point_rec.x
        ),
        'to', jsonb_build_object(
          'id', COALESCE(to_point_id, to_point_name),
          'name', COALESCE(to_point_name, to_point_id),
          'y', to_point_y,
          'x', to_point_x
        ),
        'distance', round(distance::NUMERIC, 2),
        'distanceRounded', round(distance::NUMERIC, 2),
        'bearingDeg', round(bearing_deg::NUMERIC, 2),
        'bearingRoundedDeg', round(bearing_deg::NUMERIC, 2),
        'dy', 0,  -- Residuals would need full traverse computation
        'dx', 0
      );
      
      edges_array := edges_array || edge_obj;
      edge_count := edge_count + 1;
    END LOOP;
    
    -- Update parcel metadata with new edges array
    UPDATE land_parcels
    SET metadata = jsonb_set(
      COALESCE(metadata, '{}'::JSONB),
      '{residuals,edges}',
      edges_array
    )
    WHERE id = parcel_rec.id;
    
    RAISE NOTICE '   ✅ Updated % edges with beacon names', edge_count;
    
    RETURN QUERY SELECT 
      parcel_rec.id,
      parcel_rec.stand,
      edge_count,
      'SUCCESS'::TEXT;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '✅ Migration complete!';
  
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 2. EXECUTE THE UPDATE FUNCTION FOR ALL SURVEYOR SCHEMAS
-- ============================================================================

DO $$
DECLARE
  schema_rec RECORD;
  result_rec RECORD;
BEGIN
  RAISE NOTICE '🔄 Processing all surveyor schemas...';
  RAISE NOTICE '';
  
  -- Loop through all surveyor schemas
  FOR schema_rec IN 
    SELECT schema_name 
    FROM surveyor_profiles 
    WHERE schema_name IS NOT NULL
    ORDER BY schema_name
  LOOP
    RAISE NOTICE '📂 Checking schema: %', schema_rec.schema_name;
    
    -- Set search path to current schema
    EXECUTE format('SET search_path TO %I, public', schema_rec.schema_name);
    
    -- Execute the update function
    FOR result_rec IN SELECT * FROM update_outside_figure_metadata()
    LOOP
      RAISE NOTICE '   Parcel ID: %, Stand: %, Edges: %, Status: %', 
        result_rec.parcel_id, 
        result_rec.stand, 
        result_rec.edges_updated,
        result_rec.status;
    END LOOP;
    
    RAISE NOTICE '';
  END LOOP;
  
  -- Reset search path
  SET search_path TO public;
  
  RAISE NOTICE '✅ All schemas processed';
END $$;

-- ============================================================================
-- 3. DROP THE TEMPORARY FUNCTION
-- ============================================================================

DROP FUNCTION update_outside_figure_metadata();

-- ============================================================================
-- 4. FINAL SUMMARY
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '✅ Outside Figure parcels updated with beacon names';
  RAISE NOTICE '';
  RAISE NOTICE '📝 Changes:';
  RAISE NOTICE '   - metadata.residuals.edges now includes beacon id/name';
  RAISE NOTICE '   - PDF will show correct beacon order (M8, 2836B, etc.)';
  RAISE NOTICE '   - Frontend extracts beacon names from edge.from.id/edge.to.id';
  RAISE NOTICE '';
  RAISE NOTICE '💡 Next steps:';
  RAISE NOTICE '   1. Refresh Survey Plan Map view';
  RAISE NOTICE '   2. Generate GeoPDF';
  RAISE NOTICE '   3. Verify Outside Figure Data table shows M8 first';
  RAISE NOTICE '';
END $$;

COMMIT;
