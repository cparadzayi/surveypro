# Coordinate Swap Issue - Root Cause Analysis & Fix

## Problem Summary
Area & consistency computations were producing wrong output, and beacon names couldn't be matched to vertices due to swapped Y/X coordinate values.

## Root Cause

### Cape Lo Coordinate System Convention
In Zimbabwe's Cape Lo (Gauss-Conformal) system:
- **Y = Southing** (larger value, ~2,247,780)
- **X = Westing** (smaller value, ~97,581)

### PostGIS Storage
PostGIS `ST_MakePoint(a, b)` creates a point where:
- First parameter (a) = X coordinate (longitude-like)
- Second parameter (b) = Y coordinate (latitude-like)

### GeoJSON Format
GeoJSON coordinates are always `[longitude, latitude]` or `[X, Y]`:
```json
{
  "type": "Point",
  "coordinates": [97581, 2247780]  // [X, Y] = [Westing, Southing]
}
```

### The Bug
In `MapLibreAreaView.vue`, when extracting coordinates from GeoJSON geometry returned from database:

**WRONG CODE (lines 3554-3555, 3592-3593, 3652-3653):**
```typescript
y: coords[i][0],  // WRONG: coords[0] is X, not Y
x: coords[i][1],  // WRONG: coords[1] is Y, not X
```

This caused:
1. **Wrong coordinates passed to area computation** → incorrect area calculations
2. **Wrong coordinates used for beacon matching** → distances in thousands of meters instead of <2m
3. **No beacon name matches** → fallback to sequential naming (1470A, 1470B, etc.)

## Fix Applied

### Frontend: MapLibreAreaView.vue
Fixed coordinate extraction from GeoJSON in 3 locations:

**CORRECT CODE:**
```typescript
y: coords[i][1],  // GeoJSON [1] = Y (Southing ~2.2M)
x: coords[i][0],  // GeoJSON [0] = X (Westing ~97k)
```

**Locations fixed:**
1. Line 3554-3555: Metadata vertex extraction
2. Line 3592-3593: Spatial proximity matching
3. Line 3652-3653: Fallback sequential naming

### Backend: No Changes Needed
The backend was already correct:
- `ST_MakePoint(x, y)` stores correctly
- `ST_X(geom)` and `ST_Y(geom)` extract correctly
- Area computation expects `{y, x}` and processes correctly

## Verification

After fix, you should see:
1. ✅ Correct area calculations (e.g., 118 m² instead of wrong values)
2. ✅ Beacon matching succeeds (distances <2m instead of >1000m)
3. ✅ Actual beacon names in PDF (e.g., 1470_P1, 1470_P2 instead of 1470A, 1470B)
4. ✅ Correct consistency/closure error values

## Console Verification

Look for these log messages:
```
[MapLibre] ✅ Vertex 0 matched to 1470_P1 (distance: 0.001m)
[MapLibre] ✅ Vertex 1 matched to 1470_P2 (distance: 0.003m)
```

Instead of:
```
[MapLibre] ⚠️ Vertex 0 not matched (nearest: 1234.567m > 2.0m)
```

## Files Modified
- `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue` (lines 3554-3555, 3592-3593, 3652-3653)

## Status
✅ **FIXED** - Coordinates now correctly interpreted from GeoJSON geometry
