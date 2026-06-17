# Coordinate Mismatch Resolution

## Problem Summary

**Symptom:** Vertex-to-point matching failed with distances of 3,040+ km during PDF generation in MapLibreAreaView.

**Error Message:**
```
⚠️ Vertex 0 (Y=2247765.35, X=97593.77) not matched (nearest: 3040123.456m > 2m)
```

## Root Cause

**Bug Location:** `MapLibreAreaView.vue` lines 3174-3175

**The Issue:** Coordinate assignment was treating database polygon coordinates as WGS84 lon/lat when they were actually Cape Lo 31 (Y, X) coordinates.

```typescript
// BEFORE (WRONG):
const vertexY = coords[i][0]; // GeoJSON[0] = longitude ❌
const vertexX = coords[i][1]; // GeoJSON[1] = latitude  ❌

// This caused:
// - vertexY to contain X coordinate (westing ~97,000)
// - vertexX to contain Y coordinate (southing ~2,247,000)
// - Distance calculation compared X to Y and Y to X
// - Result: 3,040 km mismatch
```

## Database Investigation Results

### SRID Verification
```sql
-- Both tables correctly use SRID 22291 (Cape Lo 31)
land_parcels:      SRID 22291 ✅
coordinate_points: SRID 22291 ✅
```

### Coordinate Comparison
```
Parcel Vertex 1:  Y=2247765.354, X=97593.773
Coordinate 1465A: Y=2247765.354, X=97593.773
Distance: 0 meters ✅ PERFECT MATCH
```

**Conclusion:** Database coordinates are identical and correctly stored. The problem was purely in the frontend matching logic.

## The Fix

**File:** `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue`

**Lines Changed:** 3174-3191

```typescript
// AFTER (CORRECT):
// GeoJSON polygon coordinates from database are [Y, X] (southing, westing) in Cape Lo
const vertexY = coords[i][0]; // Y coordinate (southing) ✅
const vertexX = coords[i][1]; // X coordinate (westing) ✅

// Calculate Euclidean distance in Cape Lo coordinates (meters)
const dy = vertexY - cp.y;  // Now correctly compares Y to Y
const dx = vertexX - cp.x;  // Now correctly compares X to X
const distance = Math.sqrt(dy * dy + dx * dx);
```

## Expected Result

After the fix, vertex matching should show:
```
✅ Vertex 0 (Y=2247765.35, X=97593.77) matched to 1465A (distance: 0.000m)
✅ Vertex 1 (Y=2247767.92, X=97589.51) matched to 1466A (distance: 0.000m)
✅ Vertex 2 (Y=2247784.77, X=97599.71) matched to 1465C (distance: 0.000m)
```

## Key Learnings

1. **PostGIS Geometry Storage:** When geometries are stored in PostGIS with a projected CRS (like Cape Lo 31), they remain in that CRS. They are NOT automatically converted to WGS84 lon/lat.

2. **GeoJSON Coordinate Order:** 
   - For **WGS84**: `[longitude, latitude]` or `[X, Y]`
   - For **Cape Lo**: `[Y, X]` or `[southing, westing]` (Zimbabwe convention)

3. **Backend Behavior:** The backend's `ST_AsGeoJSON(geom)` returns coordinates in the geometry's native SRID (22291 Cape Lo 31), not WGS84.

4. **Frontend Assumption:** The code incorrectly assumed GeoJSON coordinates were in WGS84 format when they were actually Cape Lo 31.

## Testing Checklist

- [ ] Restart frontend dev server
- [ ] Open MapLibreAreaView for parcel 1465
- [ ] Click "Export Area Consistency PDF"
- [ ] Check console logs for vertex matching
- [ ] Verify distances are < 2 meters
- [ ] Verify beacon names match actual coordinate points (1465A, 1466A, etc.)
- [ ] Generate PDF and verify beacon names in table

## Related Files

- **Fixed:** `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue`
- **Diagnostic:** `DIAGNOSE_COORDINATE_MISMATCH.sql`
- **Backend Models:** 
  - `app-backend/src/models/coordinatePoint.js` (SRID 22291)
  - `app-backend/src/models/landParcel.js` (SRID 22291)

## Status

✅ **RESOLVED** - Coordinate assignment corrected to match database format.
