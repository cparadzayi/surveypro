-- Migration 056: Add Vertex Labeling Support for Shared Beacons
-- Purpose: Store actual beacon identifiers (e.g., 1463A, 1462A) for cadastral parcels
-- Allows proper representation of shared beacons between adjacent parcels

BEGIN;

-- ============================================================================
-- 1. ADD COMMENT TO METADATA COLUMN DOCUMENTING VERTEX STRUCTURE
-- ============================================================================

COMMENT ON COLUMN land_parcels.metadata IS
  'JSONB metadata for land parcel. Expected structure:
  {
    "vertices": [
      {"id": "1463A", "y": 18862.52, "x": 2268555.01, "order": 1},
      {"id": "1462A", "y": 18875.14, "x": 2268541.39, "order": 2},
      ...
    ],
    "cape_lo_points": [...],  // Legacy: auto-generated points
    "residuals": {
      "sumDy": 0.001,
      "sumDx": -0.002,
      "closureError": 0.0022,
      "edges": [...]
    }
  }
  
  vertices: Array of actual beacon identifiers with coordinates (for QGIS parcels)
  cape_lo_points: Array of points for UI-digitized parcels
  residuals: Traverse closure data from area computation';

-- ============================================================================
-- 2. CREATE HELPER FUNCTION TO EXTRACT VERTICES FROM GEOMETRY
-- ============================================================================

CREATE OR REPLACE FUNCTION extract_vertices_from_geometry(
  geom_input GEOMETRY,
  stand_prefix TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  vertices JSONB := '[]'::JSONB;
  point_geom GEOMETRY;
  point_count INTEGER;
  i INTEGER;
  vertex_id TEXT;
  vertex_obj JSONB;
BEGIN
  -- Only process valid polygon geometries
  IF geom_input IS NULL OR NOT ST_IsValid(geom_input) OR ST_GeometryType(geom_input) != 'ST_Polygon' THEN
    RETURN vertices;
  END IF;
  
  -- Get exterior ring
  point_geom := ST_ExteriorRing(geom_input);
  point_count := ST_NPoints(point_geom) - 1; -- Exclude duplicate closing point
  
  -- Extract each vertex
  FOR i IN 1..point_count LOOP
    -- Generate default vertex ID if stand_prefix provided
    IF stand_prefix IS NOT NULL THEN
      vertex_id := stand_prefix || chr(64 + i); -- A, B, C, D, ...
    ELSE
      vertex_id := 'V' || i::TEXT;
    END IF;
    
    -- Create vertex object
    vertex_obj := jsonb_build_object(
      'id', vertex_id,
      'y', ST_Y(ST_PointN(point_geom, i)),
      'x', ST_X(ST_PointN(point_geom, i)),
      'order', i
    );
    
    -- Append to vertices array
    vertices := vertices || vertex_obj;
  END LOOP;
  
  RETURN vertices;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION extract_vertices_from_geometry(GEOMETRY, TEXT) IS
  'Extracts vertices from polygon geometry and returns as JSONB array. '
  'If stand_prefix provided, generates IDs like "1463A", "1463B", etc. '
  'Otherwise uses generic "V1", "V2", etc.';

-- ============================================================================
-- 3. CREATE FUNCTION TO UPDATE METADATA WITH VERTICES
-- ============================================================================

CREATE OR REPLACE FUNCTION update_parcel_vertices(
  parcel_id INTEGER,
  vertex_labels TEXT[] DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  parcel_geom GEOMETRY;
  parcel_stand TEXT;
  vertices JSONB;
  current_metadata JSONB;
BEGIN
  -- Get parcel geometry and stand
  SELECT geom, stand INTO parcel_geom, parcel_stand
  FROM land_parcels
  WHERE id = parcel_id;
  
  IF parcel_geom IS NULL THEN
    RAISE EXCEPTION 'Parcel % not found or has no geometry', parcel_id;
  END IF;
  
  -- Extract vertices
  IF vertex_labels IS NOT NULL THEN
    -- Use provided labels
    vertices := '[]'::JSONB;
    FOR i IN 1..array_length(vertex_labels, 1) LOOP
      vertices := vertices || jsonb_build_object(
        'id', vertex_labels[i],
        'y', ST_Y(ST_PointN(ST_ExteriorRing(parcel_geom), i)),
        'x', ST_X(ST_PointN(ST_ExteriorRing(parcel_geom), i)),
        'order', i
      );
    END LOOP;
  ELSE
    -- Auto-generate from geometry
    vertices := extract_vertices_from_geometry(parcel_geom, parcel_stand);
  END IF;
  
  -- Update metadata
  UPDATE land_parcels
  SET metadata = COALESCE(metadata, '{}'::JSONB) || jsonb_build_object('vertices', vertices)
  WHERE id = parcel_id;
  
  RAISE NOTICE 'Updated vertices for parcel % (stand %): % vertices', parcel_id, parcel_stand, jsonb_array_length(vertices);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_parcel_vertices(INTEGER, TEXT[]) IS
  'Updates the vertices array in parcel metadata. '
  'If vertex_labels provided, uses those IDs. Otherwise auto-generates from stand + letters.';

-- ============================================================================
-- 4. EXAMPLE USAGE
-- ============================================================================

-- Example 1: Auto-generate vertices for parcel 1463
-- SELECT update_parcel_vertices(1463);
-- Result: metadata.vertices = [{"id":"1463A",...}, {"id":"1463B",...}, ...]

-- Example 2: Set custom vertex labels for parcel 1463 (shared beacons)
-- SELECT update_parcel_vertices(1463, ARRAY['1463A', '1462A', '1463C', '1464C']);
-- Result: metadata.vertices = [{"id":"1463A",...}, {"id":"1462A",...}, ...]

-- Example 3: Query parcels with vertices
-- SELECT stand, metadata->'vertices' as vertices FROM land_parcels WHERE metadata ? 'vertices';

COMMIT;
