# Control Points & Trig Beacons Inset Map Enhancement

## Overview
Enhanced the MapLibre inset map to display both **control points** and **trig beacons** with proper symbols and labels, plus comprehensive console logging for survey centroid and selected control points.

## Features Implemented

### 1. Console Logging

#### Survey Centroid
Calculates and logs the centroid of all survey pegs (excluding control points):

```
========== SURVEY CENTROID ==========
Calculated from 542 survey pegs
Latitude:  -20.320000°
Longitude: 30.070000°
WGS84: [-20.320000, 30.070000]
=====================================
```

#### Selected Control Points
Lists all selected control points with their coordinates:

```
========== SELECTED CONTROL POINTS ==========
Total: 8 control points
1. Manyanga - [Y: -20.123456, X: 30.234567]
2. Munaka - [Y: -20.234567, X: 30.345678]
3. 2836B - [Y: -20.345678, X: 30.456789]
...
=============================================
```

### 2. Inset Map Enhancement

#### Updated Title
- **Before:** "Trig Beacons (Regional View)"
- **After:** "Control Points & Trig Beacons"

#### Combined Display
- Shows **both** trig beacons AND control points
- Trig beacons: Black triangles (🔺)
- Control points: Blue triangles (🔺 with blue hue filter)
- Both have labels with their names/IDs

#### Visual Differentiation
- **Trig Beacons:**
  - Symbol: Black triangle (cadastral standard)
  - Label: Red text on white background
  - Font size: 10px
  
- **Control Points:**
  - Symbol: Blue triangle (hue-rotated)
  - Label: Blue text on white background with blue border
  - Font size: 11px (slightly larger)

## Implementation Details

### File Modified
**`MapLibreAreaView.vue`**

### Changes Made

#### 1. Survey Centroid Logging (Lines 532-549)
```typescript
// Calculate and log survey centroid
if (allWgs84Points.length > 0) {
  const surveyPegsOnly = allWgs84Points.filter((p: any) => 
    p.id && !p.id.toString().toUpperCase().startsWith('CP')
  );
  
  if (surveyPegsOnly.length > 0) {
    const centroidLat = surveyPegsOnly.reduce((sum: number, p: any) => sum + p.lat, 0) / surveyPegsOnly.length;
    const centroidLng = surveyPegsOnly.reduce((sum: number, p: any) => sum + p.lng, 0) / surveyPegsOnly.length;
    
    console.log('\n========== SURVEY CENTROID ==========');
    console.log(`Calculated from ${surveyPegsOnly.length} survey pegs`);
    console.log(`Latitude:  ${centroidLat.toFixed(6)}°`);
    console.log(`Longitude: ${centroidLng.toFixed(6)}°`);
    console.log(`WGS84: [${centroidLat.toFixed(6)}, ${centroidLng.toFixed(6)}]`);
    console.log('=====================================\n');
  }
}
```

#### 2. Control Points Logging (Lines 393-399)
```typescript
// Log selected control points with details
console.log('\n========== SELECTED CONTROL POINTS ==========');
console.log(`Total: ${controlPoints.value.length} control points`);
controlPoints.value.forEach((cp: any, index: number) => {
  console.log(`${index + 1}. ${cp.monu_num || cp.name || 'Unnamed'} - [Y: ${cp.y?.toFixed(6)}, X: ${cp.x?.toFixed(6)}]`);
});
console.log('=============================================\n');
```

#### 3. Inset Map Initialization (Lines 869-1119)

**Combine Points:**
```typescript
// Combine trig beacons and control points for inset map
const combinedPoints = [...trigBeacons.value];

// Add control points to inset map
if (controlPoints.value.length > 0) {
  const controlPointsForMap = controlPoints.value.map((cp: any) => ({
    id: `CP-${cp.monu_num || cp.name || cp.id}`,
    y: cp.y_gauss || cp.yGauss || cp.y_coordinate || cp.y || cp.Y || cp.northing,
    x: cp.x_gauss || cp.xGauss || cp.x_coordinate || cp.x || cp.X || cp.easting,
    status: 'CP',
    description: cp.monu_num || cp.name || `CP${cp.id}`
  }));
  combinedPoints.push(...controlPointsForMap);
}
```

**Transform All Points:**
```typescript
const loZone = workflowState?.projectInfo?.centralMeridian || 31;
const allWgs84 = capeLoArrayToWGS84(combinedPoints as CapeLoPoint[], loZone);
const bounds = calculateWGS84Bounds(allWgs84);
```

**GeoJSON with Type Flag:**
```typescript
const allPointsGeojson: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: allWgs84.map((point: any) => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [point.lng, point.lat]
    },
    properties: {
      id: point.id,
      description: point.description || (point.id.startsWith('CP-') ? 'Control Point' : 'Trig Beacon'),
      isControlPoint: point.id && point.id.toString().startsWith('CP-'),
      shortId: point.id.length > 6 ? point.id.substring(0, 6) : point.id
    }
  }))
};
```

## Console Output Example

### When Map Loads
```
[MapLibre] 🔄 Starting coordinate transformation...
[MapLibre] 📊 Points to transform: 550
[MapLibre] 🎯 Using Lo 31 for transformation
[MapLibre] ✅ Transformation complete: 550 WGS84 points

========== SURVEY CENTROID ==========
Calculated from 542 survey pegs
Latitude:  -20.320000°
Longitude: 30.070000°
WGS84: [-20.320000, 30.070000]
=====================================

[MapLibre] ✅ Fetched 8 control points: ["Manyanga", "Munaka", "2836B", ...]

========== SELECTED CONTROL POINTS ==========
Total: 8 control points
1. Manyanga - [Y: -20.123456, X: 30.234567]
2. Munaka - [Y: -20.234567, X: 30.345678]
3. 2836B - [Y: -20.345678, X: 30.456789]
4. 2837A - [Y: -20.456789, X: 30.567890]
5. Zvishavane - [Y: -20.567890, X: 30.678901]
6. Shabani - [Y: -20.678901, X: 30.789012]
7. Maligreen - [Y: -20.789012, X: 30.890123]
8. 2838C - [Y: -20.890123, X: 30.901234]
=============================================

[MapLibre Inset] 🗺️ Initializing control points & trig beacon inset map...
[MapLibre Inset] 📍 12 trig beacons
[MapLibre Inset] 🔺 8 control points
[MapLibre Inset] 📊 20 total points
[MapLibre Inset] ✅ Inset map loaded
[MapLibre Inset] 🏷️ Creating GeoJSON with point names: [...]
[MapLibre Inset] ✅ Displayed 12 trig beacons and 8 control points
```

## Visual Appearance

### Inset Map Display

```
┌─────────────────────────────────────┐
│ 🔺 Control Points & Trig Beacons  ✕ │
├─────────────────────────────────────┤
│                                     │
│    🔺 Manyanga (blue)              │
│        🔺 2836B (black)            │
│                                     │
│  🔺 Munaka (blue)                  │
│           🔺 2837A (black)         │
│                                     │
│    🔺 Zvishavane (blue)            │
│                                     │
│         🔺 2838C (black)           │
│                                     │
└─────────────────────────────────────┘
```

### Symbol Styling

**Trig Beacons (Black):**
- Triangle: Solid black fill
- White inscribed circle
- Label: Red text (#991b1b)
- Background: White with slight transparency
- No border

**Control Points (Blue):**
- Triangle: Black with blue hue filter (240° rotation)
- Appears blue/purple
- Label: Dark blue text (#1e3a8a)
- Background: White with high transparency
- Blue border (1px solid #3b82f6)
- Slightly larger (11px vs 10px)

## User Benefits

### For Surveyors
- ✅ **Visual Context** - See control points and trig beacons together
- ✅ **Regional View** - Understand spatial relationship
- ✅ **Quick Reference** - Identify nearby control points
- ✅ **Quality Check** - Verify control point selection

### For Debugging
- ✅ **Survey Centroid** - Verify survey location
- ✅ **Control Point List** - Confirm selection
- ✅ **Coordinate Verification** - Check Y/X values
- ✅ **Transformation Tracking** - Monitor Lo zone usage

## Technical Notes

### Coordinate Systems
- **Input:** Cape Lo (Gauss-Conformal) - Y (northing), X (easting)
- **Display:** WGS84 - Latitude, Longitude
- **Transformation:** Uses `capeLoArrayToWGS84()` with project's Lo zone

### Point Identification
- **Survey Pegs:** Regular point IDs (e.g., "1", "2", "A", "B")
- **Control Points:** Prefixed with "CP-" (e.g., "CP-Manyanga", "CP-2836B")
- **Filtering:** Survey centroid excludes points starting with "CP"

### Map Bounds
- Calculated from **all points** (trig beacons + control points)
- Ensures both types are visible
- 30px padding for better visibility
- Max zoom: 10 (regional scale)

## Testing Procedure

### Test Case 1: Survey with Control Points
1. Select project with control points configured
2. Navigate to Area Computation view
3. Open browser console (F12)
4. **Expected:**
   - Survey centroid logged
   - Control points list logged
   - Inset map shows both types
   - Blue triangles for control points
   - Black triangles for trig beacons

### Test Case 2: Survey without Control Points
1. Select project without control points
2. Navigate to Area Computation view
3. **Expected:**
   - Survey centroid logged
   - "Total: 0 control points" logged
   - Inset map shows only trig beacons
   - All triangles are black

### Test Case 3: Different Lo Zones
1. Test with Lo 25, 27, 29, 31, 33
2. Import CSV for each zone
3. **Expected:**
   - Correct centroid for each zone
   - Control points fetched for correct zone
   - Inset map displays correctly

## Future Enhancements

### Possible Improvements
1. **Color Coding** - Different colors for different control point types
2. **Clustering** - Group nearby points at low zoom levels
3. **Popup Details** - Show full info on click
4. **Distance Rings** - Show 5km, 10km, 20km radius from centroid
5. **Export** - Save inset map as image
6. **Legend** - Add legend explaining symbols

### Advanced Features
1. **3D View** - Elevation data for control points
2. **Time Series** - Show historical control point positions
3. **Accuracy Circles** - Display control point accuracy
4. **Network Lines** - Show triangulation network

## Summary

**Feature:** Enhanced inset map with control points and comprehensive logging
**Display:** Blue triangles for control points, black for trig beacons
**Logging:** Survey centroid and control point list in console
**Benefits:** Better spatial context and debugging capabilities
**Impact:** Improved user understanding of control point selection

**Status:** ✅ Implemented and ready for use
