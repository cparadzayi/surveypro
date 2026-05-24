# GeoJSON Coordinate Order - Permanent Fix

## Problem

GeoJSON uses `[X, Y]` coordinate order (longitude, latitude), but Cape Lo coordinate convention uses `{y: Westing, x: Southing}`. This mismatch was causing two critical issues:

1. **Vertex names not displaying** in Area & Consistency output (showing generic names like `Outside_Figure_P1` instead of actual beacon names like `2836B`)
2. **Y and X coordinates swapped** in Area & Consistency tables, leading to incorrect edge directions

## Root Cause

When extracting coordinates from GeoJSON geometry stored in PostGIS:

```typescript
// WRONG (old code)
const coords = geometry.coordinates[0];
y: coords[i][1], // GeoJSON [1] = Y (Southing ~2247k)
x: coords[i][0], // GeoJSON [0] = X (Westing ~97k)
```

This was **backwards** because:
- GeoJSON stores: `[X, Y]` where X=Westing (~97k), Y=Southing (~2247k)
- Cape Lo expects: `{y: Westing, x: Southing}`
- The code was assigning GeoJSON[1] to Cape Lo `y`, which swapped the values

## Permanent Solution

Created utility functions in `coordinateTransform.ts`:

### 1. `geoJsonToCapeLoPoint()`

Converts GeoJSON coordinates to Cape Lo point format:

```typescript
export function geoJsonToCapeLoPoint(
  geoJsonCoords: [number, number],
  id?: string
): { y: number; x: number; id?: string } {
  return {
    y: geoJsonCoords[0],  // GeoJSON [0] = X (Westing) → Cape Lo y
    x: geoJsonCoords[1],  // GeoJSON [1] = Y (Southing) → Cape Lo x
    ...(id && { id })
  };
}
```

### 2. `capeLoPointToGeoJson()`

Inverse conversion (Cape Lo → GeoJSON):

```typescript
export function capeLoPointToGeoJson(
  capeLoPoint: { y: number; x: number }
): [number, number] {
  return [
    capeLoPoint.y,  // Cape Lo y (Westing) → GeoJSON [0]
    capeLoPoint.x   // Cape Lo x (Southing) → GeoJSON [1]
  ];
}
```

## Coordinate System Reference

### Cape Lo 31 (Zimbabwe)
- **Y coordinate** = Westing (~97,000 meters for Zvishavane)
- **X coordinate** = Southing (~2,247,000 meters for Zvishavane)
- **Convention**: P(Y, X) where Y comes first

### GeoJSON Format
- **Array format**: `[longitude, latitude]` or `[X, Y]`
- **coords[0]** = X coordinate (Westing in Cape Lo)
- **coords[1]** = Y coordinate (Southing in Cape Lo)

### Mapping Table

| Source | Cape Lo Property | Value Example | Description |
|--------|-----------------|---------------|-------------|
| GeoJSON[0] | `y` | ~97,000 | Westing (X in GeoJSON) |
| GeoJSON[1] | `x` | ~2,247,000 | Southing (Y in GeoJSON) |

## Files Modified

### 1. `coordinateTransform.ts`
Added permanent utility functions with comprehensive documentation.

### 2. `MapLibreAreaView.vue`
Fixed two locations where GeoJSON coordinates are extracted:

**Line ~3553** (vertex labels from metadata):
```typescript
// OLD (WRONG)
y: coords[i][1], // Swapped!
x: coords[i][0], // Swapped!

// NEW (CORRECT)
const capeLoPoint = geoJsonToCapeLoPoint(coords[i], vertex.id);
y: capeLoPoint.y, // Correctly mapped: Westing
x: capeLoPoint.x, // Correctly mapped: Southing
```

**Line ~3593** (spatial matching to coordinate points):
```typescript
// OLD (WRONG)
const vertexY = coords[i][1]; // Swapped!
const vertexX = coords[i][0]; // Swapped!

// NEW (CORRECT)
const capeLoPoint = geoJsonToCapeLoPoint(coords[i]);
const vertexY = capeLoPoint.y; // Westing (~97k)
const vertexX = capeLoPoint.x; // Southing (~2247k)
```

### 3. `SurveyPlanMapView.vue`
Imported the utility functions for future use (currently uses pre-computed edge data from metadata).

## Impact

### Before Fix
```
Area and Consistency Output:
┌─────────────────────┬────────────────┬────────────────┐
│ Beacon Name         │ Y              │ X              │
├─────────────────────┼────────────────┼────────────────┤
│ Outside_Figure_P1   │ +2247514.30    │ +96857.81      │ ❌ WRONG
│ Outside_Figure_P2   │ +2247752.93    │ +96457.39      │ ❌ WRONG
```

- Generic names (no match to coordinate points)
- Y shows Southing (~2247k) - WRONG
- X shows Westing (~97k) - WRONG
- Edge directions calculated incorrectly

### After Fix
```
Area and Consistency Output:
┌─────────────────────┬────────────────┬────────────────┐
│ Beacon Name         │ Y              │ X              │
├─────────────────────┼────────────────┼────────────────┤
│ 2836B               │ +96857.81      │ +2247514.30    │ ✅ CORRECT
│ 2836A               │ +96457.39      │ +2247752.93    │ ✅ CORRECT
```

- Actual beacon names (spatial matching works)
- Y shows Westing (~97k) - CORRECT
- X shows Southing (~2247k) - CORRECT
- Edge directions calculated correctly

## Testing

To verify the fix works:

1. **Digitize a parcel in QGIS** with vertices that match coordinate points
2. **Export to database** via PostGIS
3. **Generate Area & Consistency PDF** in MapLibreAreaView
4. **Check output**:
   - ✅ Beacon names should match actual coordinate point names
   - ✅ Y values should be ~97,000 (Westing)
   - ✅ X values should be ~2,247,000 (Southing)
   - ✅ Edge directions should be correct

## Future Usage

**Always use these utilities** when converting between GeoJSON and Cape Lo:

```typescript
import { geoJsonToCapeLoPoint, capeLoPointToGeoJson } from '@/utils/coordinateTransform';

// Reading from PostGIS/GeoJSON
const geometry = parcel.geom; // GeoJSON from database
const coords = geometry.coordinates[0];
const capeLoPoint = geoJsonToCapeLoPoint(coords[0]); // ✅ CORRECT

// Writing to PostGIS/GeoJSON
const capeLoPoint = { y: 96857.81, x: 2247514.30 };
const geoJsonCoords = capeLoPointToGeoJson(capeLoPoint); // [96857.81, 2247514.30]
```

## Related Issues

This fix also resolves:
- Coordinate transformation warnings in map display
- Incorrect spatial matching between vertices and coordinate points
- Edge direction calculation errors in traverse analysis
- Closure error computation issues

## Documentation

- **Utility Functions**: `app-frontend/src/utils/coordinateTransform.ts`
- **Usage Examples**: `MapLibreAreaView.vue` lines 3553 and 3593
- **Coordinate System Guide**: See `MAPLIBRE_PLAYGROUND_GUIDE.md`
