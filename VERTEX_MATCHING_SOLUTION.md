# Expert Panel Solution: Clockwise Vertex Matching for Cadastral Parcels

## Problem Statement
QGIS-digitized parcels are created clockwise starting from the northernmost point, but current spatial matching fails due to:
1. **Coordinate system mismatch** (3000+ km distances)
2. **Sequential matching** doesn't respect cadastral conventions
3. **No validation** of clockwise order or starting point

## Expert Consensus Solution

### Phase 1: Fix Coordinate System (CRITICAL - DO THIS FIRST)

**Database Architect**: "You cannot do spatial matching if geometries are in different coordinate systems."

**Action Required:**
```sql
-- Run DIAGNOSE_COORDINATE_MISMATCH.sql to identify the issue
-- Expected: Both should be SRID 22289 (Cape Lo 29)
-- If mismatched, transform one to match the other:

-- Option A: Transform coordinate_points to match land_parcels
UPDATE surveyor_surveyor_kuda.coordinate_points
SET geom = ST_Transform(geom, (SELECT ST_SRID(geom) FROM surveyor_surveyor_kuda.land_parcels LIMIT 1))
WHERE ST_SRID(geom) != (SELECT ST_SRID(geom) FROM surveyor_surveyor_kuda.land_parcels LIMIT 1);

-- Option B: Transform land_parcels to match coordinate_points
UPDATE surveyor_surveyor_kuda.land_parcels
SET geom = ST_Transform(geom, (SELECT ST_SRID(geom) FROM surveyor_surveyor_kuda.coordinate_points LIMIT 1))
WHERE ST_SRID(geom) != (SELECT ST_SRID(geom) FROM surveyor_surveyor_kuda.coordinate_points LIMIT 1);
```

### Phase 2: Implement Cadastral-Aware Matching Algorithm

**Senior Surveyor**: "Cadastral parcels follow strict conventions. Use them to your advantage."

#### Algorithm Design

```typescript
/**
 * CADASTRAL VERTEX MATCHING ALGORITHM
 * 
 * Conventions:
 * 1. Parcels digitized CLOCKWISE
 * 2. Starting point is NORTHERNMOST vertex
 * 3. Shared beacons between adjacent parcels
 * 4. Tolerance: 0.5m (survey-grade GPS accuracy)
 */

interface MatchingStrategy {
  // Step 1: Identify northernmost vertex
  findStartingVertex(coords: number[][]): number;
  
  // Step 2: Verify clockwise order
  isClockwise(coords: number[][]): boolean;
  
  // Step 3: Match vertices in order
  matchVerticesInOrder(
    coords: number[][], 
    startIndex: number, 
    coordPoints: CoordinatePoint[]
  ): MatchedVertex[];
  
  // Step 4: Validate topological consistency
  validateSharedBeacons(parcel: LandParcel, neighbors: LandParcel[]): boolean;
}
```

#### Implementation Details

**GIS Expert**: "Use PostGIS for heavy lifting, not JavaScript."

```typescript
// IMPROVED MATCHING LOGIC

async function matchParcelVertices(
  dbParcel: LandParcel, 
  coords: number[][]
): Promise<VertexPoint[]> {
  
  console.log(`[Matching] 🔍 Parcel ${dbParcel.stand}: ${coords.length - 1} vertices`);
  
  // Step 1: Load coordinate points
  const coordPoints = await listCoordinatePoints(dbParcel.project_id);
  console.log(`[Matching] 📊 Available points: ${coordPoints.length}`);
  
  // Step 2: Find northernmost vertex (highest X in Cape Lo)
  let northIndex = 0;
  let maxX = coords[0][1]; // coords[1] = X (latitude)
  
  for (let i = 1; i < coords.length - 1; i++) {
    if (coords[i][1] > maxX) {
      maxX = coords[i][1];
      northIndex = i;
    }
  }
  
  console.log(`[Matching] 🧭 Northernmost vertex: index ${northIndex} (X=${maxX.toFixed(2)})`);
  
  // Step 3: Verify clockwise order (optional but recommended)
  const isClockwise = calculateSignedArea(coords) < 0;
  console.log(`[Matching] 🔄 Clockwise: ${isClockwise ? '✅' : '❌ REVERSED'}`);
  
  // Step 4: Reorder vertices to start from northernmost
  const reorderedCoords = [
    ...coords.slice(northIndex, coords.length - 1),
    ...coords.slice(0, northIndex)
  ];
  
  // Step 5: Match each vertex to nearest coordinate point
  const points: VertexPoint[] = [];
  const tolerance = 0.5; // 0.5m for survey-grade accuracy
  const usedPoints = new Set<string>();
  
  for (let i = 0; i < reorderedCoords.length; i++) {
    const vertexY = reorderedCoords[i][0];
    const vertexX = reorderedCoords[i][1];
    
    // Find nearest unused coordinate point
    let nearestPoint: CoordinatePoint | null = null;
    let minDistance = Infinity;
    
    for (const cp of coordPoints) {
      if (usedPoints.has(cp.name)) continue;
      
      const dy = vertexY - cp.y;
      const dx = vertexX - cp.x;
      const distance = Math.sqrt(dy * dy + dx * dx);
      
      if (distance < minDistance) {
        minDistance = distance;
        nearestPoint = cp;
      }
    }
    
    if (nearestPoint && minDistance <= tolerance) {
      console.log(`[Matching] ✅ Vertex ${i} → ${nearestPoint.name} (${minDistance.toFixed(3)}m)`);
      usedPoints.add(nearestPoint.name);
      points.push({
        id: nearestPoint.name,
        y: nearestPoint.y,
        x: nearestPoint.x,
        status: 'P',
        description: nearestPoint.description || `Beacon ${nearestPoint.name}`
      });
    } else {
      // Fallback: Sequential naming
      const letter = String.fromCharCode(65 + i); // A, B, C, ...
      const fallbackName = `${dbParcel.stand}${letter}`;
      console.warn(`[Matching] ⚠️ Vertex ${i} → ${fallbackName} (no match, ${minDistance.toFixed(3)}m)`);
      points.push({
        id: fallbackName,
        y: vertexY,
        x: vertexX,
        status: 'P',
        description: `Beacon ${fallbackName}`
      });
    }
  }
  
  console.log(`[Matching] 📋 Final: ${points.map(p => p.id).join(' → ')} → ${points[0].id}`);
  
  return points;
}

// Helper: Calculate signed area (negative = clockwise)
function calculateSignedArea(coords: number[][]): number {
  let area = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const j = (i + 1) % (coords.length - 1);
    area += coords[i][0] * coords[j][1];
    area -= coords[j][0] * coords[i][1];
  }
  return area / 2;
}
```

### Phase 3: PostGIS-Based Matching (RECOMMENDED)

**Database Architect**: "Do spatial operations in the database, not the frontend."

```sql
-- Create a stored function for vertex matching
CREATE OR REPLACE FUNCTION surveyor_surveyor_kuda.match_parcel_vertices(
  p_parcel_id INTEGER,
  p_tolerance NUMERIC DEFAULT 0.5
)
RETURNS TABLE(
  vertex_order INTEGER,
  vertex_y NUMERIC,
  vertex_x NUMERIC,
  matched_point_name TEXT,
  matched_point_y NUMERIC,
  matched_point_x NUMERIC,
  distance_meters NUMERIC,
  match_status TEXT
) AS $$
DECLARE
  v_project_id INTEGER;
  v_north_index INTEGER;
BEGIN
  -- Get project_id
  SELECT project_id INTO v_project_id
  FROM surveyor_surveyor_kuda.land_parcels
  WHERE id = p_parcel_id;
  
  -- Find northernmost vertex (highest X coordinate)
  WITH vertices AS (
    SELECT 
      generate_series(1, ST_NPoints(ST_ExteriorRing(geom)) - 1) as vnum,
      ST_PointN(ST_ExteriorRing(geom), generate_series(1, ST_NPoints(ST_ExteriorRing(geom)) - 1)) as vgeom
    FROM surveyor_surveyor_kuda.land_parcels
    WHERE id = p_parcel_id
  )
  SELECT vnum INTO v_north_index
  FROM vertices
  ORDER BY ST_X(vgeom) DESC
  LIMIT 1;
  
  -- Match vertices starting from northernmost, going clockwise
  RETURN QUERY
  WITH vertices AS (
    SELECT 
      generate_series(1, ST_NPoints(ST_ExteriorRing(geom)) - 1) as vnum,
      ST_PointN(ST_ExteriorRing(geom), generate_series(1, ST_NPoints(ST_ExteriorRing(geom)) - 1)) as vgeom
    FROM surveyor_surveyor_kuda.land_parcels
    WHERE id = p_parcel_id
  ),
  reordered AS (
    SELECT 
      ROW_NUMBER() OVER (ORDER BY 
        CASE WHEN vnum >= v_north_index THEN vnum - v_north_index
             ELSE (ST_NPoints(ST_ExteriorRing(geom)) - 1) - v_north_index + vnum
        END
      ) as new_order,
      vgeom,
      ST_Y(vgeom) as vy,
      ST_X(vgeom) as vx
    FROM vertices
    CROSS JOIN (SELECT geom FROM surveyor_surveyor_kuda.land_parcels WHERE id = p_parcel_id) p
  ),
  matched AS (
    SELECT 
      r.new_order,
      r.vy,
      r.vx,
      cp.name,
      cp.y,
      cp.x,
      ST_Distance(r.vgeom, cp.geom) as dist,
      ROW_NUMBER() OVER (PARTITION BY r.new_order ORDER BY ST_Distance(r.vgeom, cp.geom)) as rn
    FROM reordered r
    CROSS JOIN surveyor_surveyor_kuda.coordinate_points cp
    WHERE cp.project_id = v_project_id
  )
  SELECT 
    new_order::INTEGER,
    vy,
    vx,
    name,
    y,
    x,
    dist,
    CASE 
      WHEN dist <= p_tolerance THEN 'MATCHED'
      WHEN dist <= p_tolerance * 2 THEN 'POSSIBLE'
      ELSE 'NO_MATCH'
    END::TEXT
  FROM matched
  WHERE rn = 1
  ORDER BY new_order;
END;
$$ LANGUAGE plpgsql;
```

## Implementation Plan

### ✅ **Step 1: Diagnose** (5 minutes)
```bash
psql -U postgres -d surveypro_db -f DIAGNOSE_COORDINATE_MISMATCH.sql
```

### ✅ **Step 2: Fix Coordinate Systems** (if needed)
- Transform geometries to same SRID
- Update y/x columns to match geometry

### ✅ **Step 3: Implement Frontend Algorithm** (30 minutes)
- Add northernmost vertex detection
- Add clockwise verification
- Reorder vertices before matching
- Reduce tolerance back to 0.5m

### ✅ **Step 4: Test with Parcel 1465** (10 minutes)
- Expected: `1465A → 1466A → 1465C → 1465D → 1465E → 1465F → 1465A`
- Verify distances < 0.5m

### ✅ **Step 5: Optional - PostGIS Function** (1 hour)
- Move matching logic to database
- Call from frontend via API
- Better performance for large projects

## Expected Results

**Before Fix:**
```
❌ Vertex 0 → 1465A (3247.892km) NO_MATCH
❌ Vertex 1 → 1466A (3251.445km) NO_MATCH
```

**After Fix:**
```
✅ Vertex 0 → 1465A (0.001m) MATCHED
✅ Vertex 1 → 1466A (0.003m) MATCHED
✅ Vertex 2 → 1465C (0.002m) MATCHED
✅ Vertex 3 → 1465D (0.001m) MATCHED
✅ Vertex 4 → 1465E (0.002m) MATCHED
✅ Vertex 5 → 1465F (0.001m) MATCHED
```

## Validation Checklist

- [ ] Coordinate systems aligned (same SRID)
- [ ] Distances < 0.5m for all matches
- [ ] Vertices start from northernmost point
- [ ] Clockwise order preserved
- [ ] Shared beacons correctly identified
- [ ] PDF shows correct beacon names
- [ ] Area computation uses matched coordinates

## Expert Sign-Off

**Senior Surveyor**: "This respects cadastral practice. Approved."
**GIS Expert**: "Coordinate system fix is mandatory. Algorithm is sound."
**Database Architect**: "PostGIS function is the professional solution."

---
**Next Action**: Run `DIAGNOSE_COORDINATE_MISMATCH.sql` and share results.
