-- Migration 077: Fix Project 5 Outside Figure Cape Lo Points with Actual Beacon Names
-- Purpose: Update parcel 47 (project 5) cape_lo_points to use actual beacon names from coordinate_points
-- Rationale: Parcel was created with generic letters (A, B, C) instead of actual beacon names (M8, 2836B, etc.)
--            This migration spatially matches vertices to coordinate_points and updates the beacon IDs

BEGIN;

-- ============================================================================
-- 1. UPDATE PARCEL 47 CAPE_LO_POINTS WITH ACTUAL BEACON NAMES
-- ============================================================================

DO $$
DECLARE
  parcel_rec RECORD;
  point_rec RECORD;
  coord_rec RECORD;
  updated_points JSONB := '[]'::JSONB;
  point_obj JSONB;
  match_count INTEGER := 0;
  no_match_count INTEGER := 0;
  tolerance NUMERIC := 0.5; -- 0.5 meter tolerance for spatial matching
BEGIN
  RAISE NOTICE '🔄 Fixing Outside Figure parcel 47 (project 5) with actual beacon names...';
  RAISE NOTICE '';
  
  -- Get parcel 47 from surveyor_surveyor_kuda schema
  SELECT id, stand, project_id, metadata
  INTO parcel_rec
  FROM surveyor_surveyor_kuda.land_parcels
  WHERE id = 47 AND project_id = 5;
  
  IF NOT FOUND THEN
    RAISE NOTICE '⚠️  Parcel 47 not found in surveyor_surveyor_kuda schema';
    RETURN;
  END IF;
  
  RAISE NOTICE '📐 Processing parcel: % (ID: %, Project: %)', parcel_rec.stand, parcel_rec.id, parcel_rec.project_id;
  
  -- Check if cape_lo_points exists
  IF parcel_rec.metadata IS NULL OR parcel_rec.metadata->'cape_lo_points' IS NULL THEN
    RAISE NOTICE '⚠️  No cape_lo_points in metadata';
    RETURN;
  END IF;
  
  RAISE NOTICE '📍 Original cape_lo_points count: %', jsonb_array_length(parcel_rec.metadata->'cape_lo_points');
  
  -- Loop through each point in cape_lo_points
  FOR point_rec IN 
    SELECT 
      idx,
      value->>'id' AS point_id,
      (value->>'y')::NUMERIC AS y,
      (value->>'x')::NUMERIC AS x
    FROM jsonb_array_elements(parcel_rec.metadata->'cape_lo_points') WITH ORDINALITY AS t(value, idx)
  LOOP
    -- Find nearest coordinate point within tolerance
    -- Use PostGIS functions to extract coordinates from geom
    SELECT 
      name,
      ST_Y(geom) AS y,
      ST_X(geom) AS x,
      sqrt(power((ST_Y(geom) - point_rec.y), 2) + power((ST_X(geom) - point_rec.x), 2)) AS distance
    INTO coord_rec
    FROM surveyor_surveyor_kuda.coordinate_points cp
    WHERE cp.project_id = 5
    ORDER BY sqrt(power((ST_Y(geom) - point_rec.y), 2) + power((ST_X(geom) - point_rec.x), 2))
    LIMIT 1;
    
    IF FOUND AND coord_rec.distance <= tolerance THEN
      -- Match found - use actual beacon name
      point_obj := jsonb_build_object(
        'id', coord_rec.name,
        'name', coord_rec.name,
        'y', coord_rec.y,
        'x', coord_rec.x
      );
      match_count := match_count + 1;
      RAISE NOTICE '  ✅ Point % matched to % (distance: %m)', point_rec.point_id, coord_rec.name, round(coord_rec.distance::NUMERIC, 3);
    ELSE
      -- No match - keep original (but this shouldn't happen)
      point_obj := jsonb_build_object(
        'id', point_rec.point_id,
        'name', point_rec.point_id,
        'y', point_rec.y,
        'x', point_rec.x
      );
      no_match_count := no_match_count + 1;
      RAISE NOTICE '  ⚠️  Point % - no match found within %m tolerance', point_rec.point_id, tolerance;
    END IF;
    
    updated_points := updated_points || point_obj;
  END LOOP;
  
  -- Update parcel metadata with corrected cape_lo_points
  UPDATE surveyor_surveyor_kuda.land_parcels
  SET metadata = jsonb_set(
    metadata,
    '{cape_lo_points}',
    updated_points
  )
  WHERE id = 47;
  
  RAISE NOTICE '';
  RAISE NOTICE '✅ Updated parcel 47 cape_lo_points:';
  RAISE NOTICE '   Matched: % points', match_count;
  RAISE NOTICE '   No match: % points', no_match_count;
  RAISE NOTICE '   Total: % points', match_count + no_match_count;
  RAISE NOTICE '';
  RAISE NOTICE '💡 Next step: Re-run migration 076 to update edges with new beacon names';
  
END $$;

COMMIT;
