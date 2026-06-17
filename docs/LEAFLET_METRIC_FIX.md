# Leaflet.js Metric Coordinate System Fix

## Problem Statement

The current implementation uses `L.CRS.Simple` with inverted coordinates (`[-Y, -X]`) which causes:
- Confusing coordinate transformations
- Arbitrary zoom levels (zoom 0 makes everything invisible)
- No metric-based scale
- Poor user experience for cadastral surveying

## Expert-Recommended Solutions

### Solution 1: Proj4Leaflet (BEST FOR PRODUCTION)

Install dependencies:
```bash
npm install proj4leaflet proj4
```

Implementation:
```typescript
import * as L from 'leaflet'
import 'proj4leaflet'

// Define Cape Lo29 (EPSG:22289) with proper parameters
const crsLo29 = new L.Proj.CRS('EPSG:22289',
  '+proj=tmerc +lat_0=0 +lon_0=29 +k=1 +x_0=0 +y_0=0 +axis=wsu +ellps=clrk80 +towgs84=-136,-108,-292,0,0,0,0 +units=m +no_defs',
  {
    // Define zoom levels with metric meaning
    // At zoom 10, 1 pixel = ~10 meters
    // At zoom 15, 1 pixel = ~0.3 meters (ideal for parcel editing)
    resolutions: [
      8192,   // zoom 0
      4096,   // zoom 1
      2048,   // zoom 2
      1024,   // zoom 3
      512,    // zoom 4
      256,    // zoom 5
      128,    // zoom 6
      64,     // zoom 7
      32,     // zoom 8
      16,     // zoom 9
      8,      // zoom 10
      4,      // zoom 11
      2,      // zoom 12
      1,      // zoom 13
      0.5,    // zoom 14
      0.25    // zoom 15
    ],
    origin: [0, 0],
    bounds: L.bounds(
      [-4000000, -4000000],
      [4000000, 4000000]
    )
  }
)

// Create map
map = L.map(mapEl, { 
  crs: crsLo29,
  center: [2248259, 97128],  // Y, X in meters (NO INVERSION!)
  zoom: 12,  // Good default for parcel viewing
  minZoom: 8,
  maxZoom: 18
})

// Add metric scale
L.control.scale({ 
  imperial: false, 
  metric: true,
  maxWidth: 200
}).addTo(map)
```

**Coordinate transformation becomes simple:**
```typescript
// FROM DATABASE: Y=2248259, X=97128
const point = L.latLng([2248259, 97128])  // Direct, no inversion!

// TO DATABASE:
const coords = marker.getLatLng()
const y = coords.lat  // Y coordinate
const x = coords.lng  // X coordinate
```

### Solution 2: Enhanced L.CRS.Simple (QUICK FIX)

Keep current setup but fix transformation:

```typescript
// Calculate scale based on typical parcel size
const TYPICAL_PARCEL_SIZE = 1000 // meters
const PIXELS_AT_GOOD_ZOOM = 200  // pixels on screen

const MetricSimple = L.extend({}, L.CRS.Simple, {
  // 1:1 transformation (no scaling at zoom 0)
  transformation: new L.Transformation(1, 0, -1, 0),
  
  // Scale function: higher zoom = more detail
  scale: function(zoom) {
    return Math.pow(2, zoom)
  },
  
  // Zoom from scale
  zoom: function(scale) {
    return Math.log(scale) / Math.LN2
  },
  
  // Distance in meters
  distance: function(latlng1, latlng2) {
    const dx = latlng2.lng - latlng1.lng
    const dy = latlng2.lat - latlng1.lat
    return Math.sqrt(dx * dx + dy * dy)
  }
})

map = L.map(mapEl, {
  crs: MetricSimple,
  center: [-2248259, -97128],  // Keep current inversion
  zoom: 0,
  minZoom: -5,
  maxZoom: 5
})

// CRITICAL: Calculate optimal zoom based on data extent
function calculateOptimalZoom(bounds, mapSize) {
  const TYPICAL_MARKER_SIZE = 50 // pixels
  const boundsWidth = bounds.getEast() - bounds.getWest()
  const boundsHeight = bounds.getNorth() - bounds.getSouth()
  
  const maxDimension = Math.max(boundsWidth, boundsHeight)
  const minDimension = Math.min(mapSize.x, mapSize.y)
  
  // Calculate zoom where bounds fit in viewport with some padding
  const zoom = Math.log2(minDimension / maxDimension) - 1
  return Math.max(-5, Math.min(5, Math.round(zoom)))
}

// Use after fitBounds
const bounds = L.latLngBounds(allPoints)
map.fitBounds(bounds)
const optimalZoom = calculateOptimalZoom(bounds, map.getSize())
map.setZoom(optimalZoom)
```

### Solution 3: Dynamic Marker Sizing Based on Extent

Better marker sizing algorithm:

```typescript
function getMarkerRadius(zoom: number, dataExtent: number, isBackground: boolean): number {
  // Base size in METERS (not pixels)
  const baseMeters = dataExtent * 0.01 // 1% of data extent
  
  // Convert to pixels based on current zoom
  const scale = map.getZoomScale(zoom, 0)
  const pixels = baseMeters * scale
  
  // Clamp to reasonable pixel range
  const minPixels = isBackground ? 4 : 8
  const maxPixels = isBackground ? 20 : 40
  
  return Math.max(minPixels, Math.min(maxPixels, pixels))
}

// Calculate data extent once
const allYs = points.map(p => p.y)
const allXs = points.map(p => p.x)
const extentY = Math.max(...allYs) - Math.min(...allYs)
const extentX = Math.max(...allXs) - Math.min(...allXs)
const dataExtent = Math.max(extentY, extentX)

// Use when creating markers
const radius = getMarkerRadius(currentZoom, dataExtent, true)
```

## Recommended Implementation Plan

### Phase 1: Quick Fix (1 hour)
1. ✅ Fix zoom calculation in `fitBounds`
2. ✅ Use dynamic zoom based on data extent
3. ✅ Ensure minimum zoom of 10 for visibility

### Phase 2: Proper CRS (2-3 hours)
1. Install `proj4leaflet`
2. Define EPSG:22289 with correct parameters
3. Remove coordinate inversion (`[-Y, -X]` → `[Y, X]`)
4. Test with existing data
5. Update all coordinate transformations

### Phase 3: Enhanced UX (1-2 hours)
1. Add metric scale bar
2. Show coordinates in metric format
3. Add zoom-to-extent button
4. Improve marker clustering for dense areas

## Key Benefits

**With Proj4Leaflet:**
- ✅ Native metric coordinates (no mental gymnastics)
- ✅ Accurate distance measurements
- ✅ Proper scale bar in meters/kilometers
- ✅ Standard EPSG:22289 compatibility
- ✅ Easy integration with GIS tools

**With Enhanced L.CRS.Simple:**
- ✅ Quick fix (no new dependencies)
- ✅ Better zoom management
- ✅ Improved marker visibility
- ✅ Keep existing coordinate logic

## Testing Checklist

- [ ] Points render at all zoom levels
- [ ] Markers are visible and clickable
- [ ] Polygons render correctly
- [ ] Labels are readable
- [ ] Scale bar shows correct distances
- [ ] Zoom in/out works smoothly
- [ ] fitBounds centers correctly
- [ ] Performance with 500+ points is acceptable

## References

- [Proj4Leaflet Documentation](https://github.com/kartena/Proj4Leaflet)
- [Leaflet CRS Documentation](https://leafletjs.com/reference.html#crs)
- [Working with Projected Coordinates in Leaflet](https://gis.stackexchange.com/questions/tagged/leaflet+projection)
- [Cape Lo Projection Parameters](https://epsg.io/22289)
