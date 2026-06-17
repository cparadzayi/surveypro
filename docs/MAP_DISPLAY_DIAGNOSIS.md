# 🔍 MAP DISPLAY DIAGNOSIS & FIX

## 🎯 Problem: Points Not Visible on Map

You can't see the survey points on the map in Calculations Part 2, preventing you from selecting them for area computations.

---

## 📋 DIAGNOSTIC STEPS (Run in Browser Console - F12)

### **Step 1: Check if coordinate data exists**
```javascript
// Open browser console (F12) on Calculations Part 2 page
console.log('Coordinate points:', coordinatePoints?.value || 'Not available')
console.log('Number of points:', coordinatePoints?.value?.length || 0)
console.log('First point:', coordinatePoints?.value?.[0])
```

**Expected Result:**
```
Coordinate points: Array(10)
Number of points: 10
First point: {id: 'ST1', y: 96649.178, x: 2247915, status: 'P'}
```

**If you see 0 points or undefined:**
- ❌ Workflow data not loaded
- **Fix:** Go back to Calculations Part 1 and ensure adjustments are completed

---

### **Step 2: Check if map is initialized**
```javascript
console.log('Map object:', map)
console.log('Map center:', map?.getCenter())
console.log('Map zoom:', map?.getZoom())
console.log('Map bounds:', map?.getBounds())
```

**Expected Result:**
```
Map object: Map {_container: div#map-container, ...}
Map center: LatLng(-96900, -2248000) 
Map zoom: 14
Map bounds: LatLngBounds(...)
```

**If map is null:**
- ❌ Map not initialized
- **Fix:** Check console for errors during map creation

---

### **Step 3: Check if markers were created**
```javascript
console.log('Point markers:', pointMarkers)
console.log('Number of markers:', pointMarkers?.length || 0)
console.log('Selected points layer:', selectedPointsLayer)
console.log('Layer has markers:', selectedPointsLayer?._layers)
```

**Expected Result:**
```
Point markers: Array(20)  // 10 points + 10 labels = 20 markers
Number of markers: 20
Selected points layer: LayerGroup {...}
Layer has markers: {123: Marker, 124: Marker, ...}
```

**If markers array is empty:**
- ❌ plotPoints() failed or wasn't called
- **Fix:** Check coordinate transformation

---

### **Step 4: Check coordinate transformation**
```javascript
// Get first point
const testPoint = coordinatePoints?.value?.[0]
console.log('Test point:', testPoint)

// Transform it
const testTransform = coordinateTransform.transformForLeaflet([testPoint])
console.log('Transformed:', testTransform)
console.log('Expected format: [[X, Y]]')
```

**Expected Result:**
```
Test point: {id: 'ST1', y: 96649.178, x: 2247915}
Transformed: [[2247915, 96649.178]]
Expected format: [[X, Y]]
```

**If transformation returns empty array:**
- ❌ CRS not set or transformation error
- **Fix:** Check SRID detection

---

### **Step 5: Check layer visibility**
```javascript
// Check if layers are on map
console.log('Layers on map:')
map?.eachLayer((layer) => {
  console.log('  -', layer.constructor.name)
})

// Check if markers are visible
selectedPointsLayer?.eachLayer((marker) => {
  console.log('Marker:', marker.getLatLng(), 'visible:', marker._icon !== undefined)
})
```

**Expected Result:**
```
Layers on map:
  - TileLayer (or GridLayer)
  - LayerGroup (backgroundPointsLayer)
  - LayerGroup (selectedPointsLayer)
  - LayerGroup (polygonsLayer)
Marker: LatLng(2247915, 96649.178) visible: true
```

---

### **Step 6: Manual zoom to point**
```javascript
// Try to manually zoom to ST1
zoomToPoint('ST1')
```

**Expected Result:**
- Map should animate to ST1 location
- Console shows transformation details
- Point should become visible if it exists

**If nothing happens:**
- Check console for error messages from zoomToPoint()

---

## 🔧 COMMON ISSUES & FIXES

### **Issue 1: Markers created but not visible (off-screen)**

**Symptoms:**
- `pointMarkers.length > 0` ✅
- But you can't see any points on the map
- Map shows gray background only

**Root Cause:**
- Map is centered at wrong location (e.g., [0, 0])
- Or zoom level is too far out

**Fix:**
```javascript
// In console, force zoom to first point
const firstPoint = coordinatePoints.value[0]
const transformed = coordinateTransform.transformForLeaflet([firstPoint])
map.flyTo(transformed[0], 15)
```

---

### **Issue 2: Coordinate transformation returning empty array**

**Symptoms:**
- `coordinatePoints.value.length > 0` ✅
- `latlngs.length === 0` ❌
- Console shows: "❌ Transform returned empty array"

**Root Cause:**
- CRS not initialized properly
- SRID detection failed

**Fix:** Check SRID
```javascript
console.log('Current SRID:', currentSrid.value)
console.log('CRS:', coordinateTransform.getCRS())

// Manually set projection
coordinateTransform.setProjection(22291, coordinatePoints.value)
console.log('CRS after manual set:', coordinateTransform.getCRS())

// Retry map initialization
initializeMap()
```

---

### **Issue 3: Map container not sized properly**

**Symptoms:**
- Map div has height: 0px
- Map appears as thin line or not at all

**Fix:**
```javascript
// Check container size
const container = document.querySelector('#map-container')
console.log('Container size:', {
  width: container.offsetWidth,
  height: container.offsetHeight,
  display: getComputedStyle(container).display
})

// Force container height
container.style.height = '600px'
map.invalidateSize()
```

---

### **Issue 4: Markers behind other elements (z-index)**

**Symptoms:**
- Markers created ✅
- But hidden behind map tiles or other elements

**Fix:**
```javascript
// Bring selected points layer to front
selectedPointsLayer?.bringToFront()

// Check z-index
const markerPane = map.getPane('markerPane')
console.log('Marker pane z-index:', getComputedStyle(markerPane).zIndex)
```

---

## 🚀 AUTOMATED FIX SCRIPT

Run this in browser console to attempt automatic diagnosis and fix:

```javascript
(async function diagnoseAndFix() {
  console.log('🔍 Starting Map Display Diagnosis...\n')
  
  // 1. Check data
  console.log('1️⃣ Checking coordinate data...')
  if (!coordinatePoints || !coordinatePoints.value || coordinatePoints.value.length === 0) {
    console.error('❌ No coordinate points! Go back to Calculations Part 1.')
    return
  }
  console.log(`✅ Found ${coordinatePoints.value.length} points`)
  console.log('   First point:', coordinatePoints.value[0])
  
  // 2. Check map
  console.log('\n2️⃣ Checking map object...')
  if (!map) {
    console.error('❌ Map not initialized!')
    console.log('   Attempting to initialize...')
    initializeMap()
    await new Promise(r => setTimeout(r, 1000))
  }
  if (!map) {
    console.error('❌ Map initialization failed!')
    return
  }
  console.log('✅ Map exists')
  console.log('   Center:', map.getCenter())
  console.log('   Zoom:', map.getZoom())
  
  // 3. Check markers
  console.log('\n3️⃣ Checking markers...')
  if (!pointMarkers || pointMarkers.length === 0) {
    console.error('❌ No markers created!')
    console.log('   Attempting to plot points...')
    plotPoints()
    await new Promise(r => setTimeout(r, 500))
  }
  console.log(`✅ ${pointMarkers.length / 2} markers created`)
  
  // 4. Check visibility
  console.log('\n4️⃣ Checking marker visibility...')
  let visibleCount = 0
  selectedPointsLayer?.eachLayer((marker) => {
    if (marker._icon) visibleCount++
  })
  console.log(`✅ ${visibleCount} markers have DOM elements`)
  
  // 5. Check if markers are in viewport
  console.log('\n5️⃣ Checking if markers are in viewport...')
  const bounds = map.getBounds()
  let inViewportCount = 0
  coordinatePoints.value.forEach((pt, i) => {
    const latlng = convertToLatLngs([pt])[0]
    if (latlng && bounds.contains(latlng)) {
      inViewportCount++
    }
  })
  console.log(`✅ ${inViewportCount} markers are in current viewport`)
  
  if (inViewportCount === 0) {
    console.warn('⚠️ No markers in viewport! Attempting to fit bounds...')
    const allLatLngs = convertToLatLngs(coordinatePoints.value)
    if (allLatLngs.length > 0) {
      const newBounds = L.latLngBounds(allLatLngs)
      map.fitBounds(newBounds, { padding: [50, 50], maxZoom: 16, minZoom: 14 })
      console.log('✅ Fitted map to show all points')
    }
  }
  
  // 6. Try zooming to first point
  console.log('\n6️⃣ Zooming to first point...')
  const firstPoint = coordinatePoints.value[0]
  console.log(`   Zooming to ${firstPoint.id}...`)
  zoomToPoint(firstPoint.id)
  
  console.log('\n✅ Diagnosis complete! Check if points are now visible.')
  console.log('   If still not visible, check browser console for errors.')
})()
```

---

## 📊 WHAT TO REPORT

If points are still not visible after running diagnostics, copy and share:

1. **Coordinate Data:**
   ```javascript
   console.log(JSON.stringify(coordinatePoints.value.slice(0, 3), null, 2))
   ```

2. **Map State:**
   ```javascript
   console.log({
     center: map?.getCenter(),
     zoom: map?.getZoom(),
     bounds: map?.getBounds(),
     crs: map?.options?.crs?.code
   })
   ```

3. **Markers:**
   ```javascript
   console.log({
     markerCount: pointMarkers?.length,
     layerCount: Object.keys(selectedPointsLayer?._layers || {}).length
   })
   ```

4. **Console Errors:**
   - Screenshot any red error messages in console

---

## 🎯 EXPECTED WORKING STATE

When everything works correctly, you should see:

```
[CalculationsPart2] 🎯 initializeMap() called!
[CalculationsPart2] Initializing map with 10 points
[CalculationsPart2] ✅ Using Proj4Leaflet CRS: EPSG:22291
[CalculationsPart2] 📍 Calculated initial center from 10 points: [-96900, -2248000]
[CalculationsPart2] Map created successfully with Proj4Leaflet
[CalculationsPart2] 🎯 Plotting 10 points
[CalculationsPart2] First point: ST1
  Original coords: Y: 96649.178 X: 2247915
  Display coords: LatLng(2247915, 96649.178)
[CalculationsPart2] ✓ First marker created: ST1 (placed)
[CalculationsPart2] ✓ Total markers created: 10 points
[CalculationsPart2] 📊 Final Map State:
  Center: LatLng(-96900, -2248000)
  Zoom: 14
  Bounds: LatLngBounds(...)
  Points displayed: 10
  Point 1 (ST1): P(Y=96649.178, X=2247915) → Display[[2247915, 96649.178]]
```

And on the map:
- ✅ 10 white circles with black borders (survey point markers)
- ✅ Labels showing point IDs (ST1, P2, ZD, etc.)
- ✅ Blue background grid
- ✅ Scale bar in bottom left
- ✅ Points clickable (cursor changes to pointer on hover)

---

**Next Step:** Run the diagnostic script and report results! 🚀
