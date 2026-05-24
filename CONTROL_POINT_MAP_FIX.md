# Control Point Map Display Fix

## Problem

Control points were not displaying on the MapLibre map in the Control Point Selection step, even though the console showed they were being added.

## Root Cause

The control points from the database had Cape Gauss coordinates (`y`, `x`) but were missing WGS84 coordinates (`lat_wgs84`, `lng_wgs84`). MapLibre **requires WGS84 coordinates** (latitude/longitude) to display points correctly.

The map composable was falling back to using raw Gauss coordinates when WGS84 was missing:
```typescript
// ❌ BEFORE: Incorrect fallback
coordinates: [point.lng_wgs84 || point.x, point.lat_wgs84 || point.y]
```

This caused points to be placed at incorrect locations (Gauss coordinates interpreted as WGS84).

## Solution

### 1. Transform Coordinates on Load
**File:** `ControlPointSelectionView.vue`

When loading control points from the API, automatically transform Gauss coordinates to WGS84 if WGS84 coordinates are missing:

```typescript
// ✅ AFTER: Transform Gauss to WGS84
if ((!lat_wgs84 || !lng_wgs84) && gaussY !== null && gaussX !== null && loZone) {
  try {
    const transformed = capeLoToWGS84({ id: point.id, y: gaussY, x: gaussX }, loZone)
    lat_wgs84 = transformed.lat
    lng_wgs84 = transformed.lng
  } catch (error) {
    console.error(`Failed to transform point ${point.id}:`, error)
  }
}
```

### 2. Validate WGS84 Coordinates
**File:** `useControlPointMap.ts`

Updated all map functions to:
- **Filter out** points without WGS84 coordinates
- **Only use** WGS84 coordinates (no fallback to Gauss)
- **Log warnings** when points are missing coordinates

```typescript
// ✅ Filter points with valid WGS84 coordinates
.filter((point) => {
  const hasWGS84 = point.lng_wgs84 != null && point.lat_wgs84 != null
  if (!hasWGS84) {
    console.warn(`Point ${point.id} missing WGS84 coordinates, skipping`)
  }
  return hasWGS84
})
.map((point) => ({
  type: 'Feature' as const,
  geometry: {
    type: 'Point' as const,
    coordinates: [point.lng_wgs84!, point.lat_wgs84!] as [number, number]
  },
  // ...
}))
```

### 3. Updated Functions
- `addPointsToMap()` - Only adds points with WGS84 coordinates
- `updateMarkers()` - Filters out points without WGS84
- `fitBounds()` - Only includes WGS84 points in bounds calculation
- `zoomToPoint()` - Checks for WGS84 before zooming
- `pointsWithDistance()` - Warns if distance can't be calculated

## Files Modified

1. **`app-frontend/src/views/modules/cadastral-standard/ControlPointSelectionView.vue`**
   - Lines 480-509: Transform Gauss → WGS84 on load
   - Lines 511-534: Enhanced debug logging

2. **`app-frontend/src/composables/useControlPointMap.ts`**
   - Lines 66-85: Fixed `pointsWithDistance` to validate WGS84
   - Lines 317-350: Fixed `addPointsToMap` to filter and validate
   - Lines 482-506: Fixed `updateMarkers` to use WGS84 only
   - Lines 518-547: Fixed `fitBounds` and `zoomToPoint` to validate WGS84

## Testing

### Console Output to Look For

✅ **Successful Transformation:**
```
[ControlPointSelection] 🔄 Transformed point 4908 to WGS84: [-20.123456, 30.123456]
[ControlPointSelection] 📊 WGS84 Coverage: 27/27 points have WGS84 coordinates
[ControlPointSelection] 🌍 Point location check: ✅ In Zimbabwe
[useControlPointMap] 📍 Created 27 valid GeoJSON features
```

❌ **Missing Coordinates Warning:**
```
[useControlPointMap] ⚠️ Point 1234 (BP001) missing WGS84 coordinates, skipping
  Gauss coords: { y: 12345.67, x: 2234567.89 }
  WGS84 coords: { lng: null, lat: null }
```

### Visual Verification

1. **Control points should appear** on the map as black triangles ▲
2. **Selected points should be red** ▲
3. **Points should be in Zimbabwe** (25-33°E, 15-23°S)
4. **Clicking points** should show popup with coordinates
5. **Zoom level** should fit all visible points

## Coordinate System Reference

- **Cape Gauss (Lo 25/27/29/31/33)**: EPSG:22285-22293
  - Y = Westing (meters, positive west)
  - X = Southing (meters, positive south)
  - Used for survey calculations and distance measurements

- **WGS84**: EPSG:4326
  - Longitude (degrees, -180 to +180)
  - Latitude (degrees, -90 to +90)
  - **Required for MapLibre display**

## Transform Function

Uses `capeLoToWGS84()` from `coordinateTransform.ts`:

```typescript
import { capeLoToWGS84 } from '@/utils/coordinateTransform'

// Transform single point
const wgs84 = capeLoToWGS84(
  { id: 1, y: 18862.52, x: 2268555.01 },  // Gauss coordinates
  31  // Lo zone (central meridian)
)
// Result: { lat: -20.319876, lng: 30.067123 }
```

## Related Issues

- Similar issue was previously solved for the MapLibre Playground
- Same transformation logic used throughout the application
- Database may eventually have `lat_wgs84` and `lng_wgs84` pre-populated

## Future Improvements

1. **Database migration** to pre-populate WGS84 coordinates for all control points
2. **Performance**: Cache transformations instead of computing on every load
3. **Error handling**: Better user feedback if transformation fails
4. **Validation**: Check if transformed coordinates are within Zimbabwe bounds
