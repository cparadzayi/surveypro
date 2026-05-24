# Map Orientation Fix - North-Up Display

## Problem
The Leaflet map was displaying land parcels upside-down relative to ground orientation because Zimbabwe uses a **south-oriented coordinate system**.

## Zimbabwe Coordinate System

### Convention:
- **Y-axis**: Westing (positive = West)
- **X-axis**: Southing (positive = South)
- **Bearing 0°**: Points South (not North like standard maps)

### Example Coordinates:
```
Point A: Y = 96271.08, X = 2247869.92
- Y increases going West
- X increases going South
```

## Solution: Coordinate Transformation

### Transformation Applied:
To display the map with **North at the top** (standard map orientation), we negate both coordinates:

```typescript
// Original south-oriented coordinates
const originalY = point.y;  // Westing
const originalX = point.x;  // Southing

// Transform to north-up display
const displayCoords = [-point.x, -point.y];
// Now: -X points North, -Y points East
```

### Mathematical Explanation:

**Original System (South-oriented):**
```
        West (+Y)
           ↑
           |
East ←-----+----→ West
           |
           ↓
       South (+X)
```

**Transformed System (North-up):**
```
       North (-X)
           ↑
           |
West ←-----+----→ East (-Y)
           |
           ↓
        South
```

By negating both coordinates:
- `-X` now points North (opposite of South)
- `-Y` now points East (opposite of West)

## Implementation

### 1. Point Plotting
```typescript
coordinatePoints.value.forEach((point, index) => {
  // Transform coordinates for north-up display
  const latLng: [number, number] = [-point.x, -point.y];
  
  // Create marker at transformed position
  const marker = L.circleMarker(latLng, { ... });
});
```

### 2. Bounds Calculation
```typescript
// Apply same transformation to bounds
const bounds = L.latLngBounds(
  coordinatePoints.value.map(p => [-p.x, -p.y])
);
```

### 3. Visual Compass
Added a compass rose indicator showing:
- **N** at top (North)
- **S** at bottom (South)
- **W** on left (West)
- **E** on right (East)

## Why This Works

### Before Transformation:
- Map showed South at top (because +X = South)
- Parcels appeared upside-down
- Inconsistent with ground reality

### After Transformation:
- Map shows North at top (standard orientation)
- Parcels match ground orientation
- Bearings align with visual display

## Bearing Consistency

The bearings in the PDF are still calculated correctly in the south-oriented system:
- **0°** = South
- **90°** = West
- **180°** = North
- **270°** = East

The visual display transformation doesn't affect the bearing calculations - it only affects how points are plotted on the map.

## Alternative Approaches Considered

### 1. CSS Rotation (Not Recommended)
```css
.leaflet-container {
  transform: rotate(180deg);
}
```
**Issues:**
- Rotates everything including labels
- Labels would be upside-down
- Zoom controls would be inverted
- Poor user experience

### 2. Leaflet CRS Transformation (Complex)
```typescript
L.CRS.Custom = L.extend({}, L.CRS.Simple, {
  transformation: new L.Transformation(-1, 0, -1, 0)
});
```
**Issues:**
- More complex implementation
- Harder to debug
- Same result as coordinate negation

### 3. Coordinate Negation (Chosen) ✅
```typescript
const latLng = [-point.x, -point.y];
```
**Benefits:**
- Simple and clear
- Easy to understand
- Easy to debug
- Maintains label orientation
- No CSS hacks

## Verification

### Check Orientation:
1. **Look at compass** - North should be at top
2. **Compare with survey plans** - parcels should match
3. **Check bearings** - visual direction should match bearing values

### Example Verification:
If a boundary line has bearing **0°** (South):
- Should point **downward** on the map
- Should point from top point to bottom point

If a boundary line has bearing **90°** (West):
- Should point **left** on the map
- Should point from right point to left point

## Code Locations

### Files Modified:
1. **CalculationsPart2View.vue**
   - Line ~354: Point plotting transformation
   - Line ~272: Bounds calculation transformation
   - Line ~58: Compass rose UI

### Key Functions:
```typescript
// Plot points with transformation
function plotPoints() {
  coordinatePoints.value.forEach((point) => {
    const latLng = [-point.x, -point.y];
    L.circleMarker(latLng, { ... }).addTo(map);
  });
}

// Calculate bounds with transformation
const bounds = L.latLngBounds(
  coordinatePoints.value.map(p => [-p.x, -p.y])
);
```

## Benefits

1. **Intuitive Display**: North at top matches standard maps
2. **Ground Consistency**: Parcels match real-world orientation
3. **User Friendly**: Familiar map orientation
4. **Simple Implementation**: Clear coordinate transformation
5. **Maintainable**: Easy to understand and modify

## Notes

- Original coordinates remain unchanged in data
- Transformation only affects visual display
- PDF reports still use original south-oriented coordinates
- Bearing calculations remain in south-oriented system
- No impact on area calculations or accuracy

## Testing Checklist

- [x] Points display with North at top
- [x] Compass shows correct orientation
- [x] Parcels match ground reality
- [x] Labels are right-side up
- [x] Zoom controls work normally
- [x] Bearings match visual directions
- [x] Area calculations unchanged
- [x] PDF generation unaffected
