# 🔧 FIX: Map Centering at (0,0) Instead of Data Points

## 🐛 **Problem**
Map initializes at `[0, 0]` and doesn't center on the actual survey points at coordinates like Y=96649.178, X=2247915.

---

## 🔍 **Root Cause**

### **Timing Issue:**
```javascript
// SEQUENCE:
1. onMounted() executes
2. Map created with center: [0, 0], zoom: 12
3. draw() called immediately
4. props.backgroundItems is EMPTY (data not loaded yet)
5. fitBounds() never called
6. Map stays at [0, 0] ❌

// Later:
7. Data arrives from parent component
8. watch() triggers draw()
9. fitBounds() should execute NOW ✅
```

---

## ✅ **Solution Applied**

### **Fix 1: Only Draw When Data Exists**
```javascript
// In onMounted:
setTimeout(() => {
  if (containerSize.x === 0 || containerSize.y === 0) {
    // Wait for container...
  } else {
    console.log('[DataMap] ✅ Container ready')
    
    // CRITICAL: Check if data exists before drawing
    const hasData = (props.backgroundItems?.length || 0) > 0 || (props.items?.length || 0) > 0
    
    if (hasData) {
      console.log('[DataMap] 📍 Data available, drawing immediately...')
      draw()  // Will fitBounds with actual data
    } else {
      console.log('[DataMap] ⏳ No data yet, waiting for props to populate')
      // Watch will trigger draw() when data arrives
    }
  }
}, 200)
```

**Key Changes:**
1. ✅ Check if `backgroundItems` or `items` has data
2. ✅ Only call `draw()` if data exists
3. ✅ Otherwise, wait for `watch()` to trigger when data loads
4. ✅ Prevents fitBounds on empty array

### **Fix 2: Enhanced Debugging**
```javascript
// Added extensive logging:
console.log(`[DataMap] 📦 backgroundItems count: ${props.backgroundItems?.length || 0}`)
console.log(`[DataMap] 📍 Sample raw coords: X=${sampleCoords[0]}, Y=${sampleCoords[1]}`)
console.log(`[DataMap] First valid point: ${name} at P(X=${x}, Y=${y})`)
console.log(`[DataMap] 📍 Transformed to ${bgLatLngs.length} latLng coordinates`)
console.log(`[DataMap] 📍 First transformed point: [${bgLatLngs[0][0]}, ${bgLatLngs[0][1]}]`)
```

**Benefits:**
- ✅ Track when data arrives
- ✅ See raw coordinate values
- ✅ Verify transformation output
- ✅ Confirm fitBounds execution

---

## 🧪 **Expected Console Output**

### **On Initial Load (No Data Yet):**
```
[DataMap] Initializing map with proper CRS...
[DataMap] ✅ Detected SRID 22291 - Using Proj4 CRS from start
[DataMap] Map initialized with EPSG:22291
[DataMap] 📏 Container: 1024px × 768px
[DataMap] 📦 backgroundItems count: 0  ← NO DATA
[DataMap] ✅ Container ready
[DataMap] ⏳ No data yet, waiting for props to populate (watch will trigger draw)
```

### **When Data Arrives (Watch Triggers):**
```
[DataMap] Processing 10 background items
[DataMap] Sample background item: { type: 'Feature', ... }
[DataMap] 📍 Sample raw coords: X=96649.178, Y=2247915  ← YOUR DATA!
[DataMap] First valid point: ST1 at P(X=96649.18, Y=2247915.00)
[DataMap] Extracted 10 valid background points from 10 items
🔄 Transforming 10 points
🔍 CRS: EPSG:22291, usesProj4: true
✅ Using Proj4 with Zimbabwe P(Y,X) convention
[DataMap] 📍 Transformed to 10 latLng coordinates
[DataMap] 📍 First transformed point: [96649.18, 2247915.00]  ← LEAFLET COORDS
[DataMap] 🔍 Fitting bounds to 10 background points
[DataMap] 📐 Using Proj4 CRS, maxZoom: 18
[DataMap] 🔍 After fitBounds - Zoom: 14, Center: [96800.0, 2248000.0]  ← CENTERED!
```

---

## 📊 **Verification Steps**

### **Step 1: Hard Refresh**
```bash
Ctrl + Shift + R
```

### **Step 2: Open Console (F12)**

### **Step 3: Navigate to Calculations Part 2**

### **Step 4: Watch Console Output**

**Expected Flow:**
1. ✅ Map initialized (might show "No data yet")
2. ✅ Data arrives
3. ✅ Watch triggers
4. ✅ See "Sample raw coords: X=96649.178, Y=2247915"
5. ✅ See "First transformed point: [96649.18, 2247915.00]"
6. ✅ See "After fitBounds - Center: [96800, 2248000]"
7. ✅ Map centers on your points!

---

## 🔍 **Diagnostic Commands**

### **Check Map Center:**
```javascript
// In browser console:
map.getCenter()  // Should be near [96800, 2248000], NOT [0, 0]
```

### **Check Map Bounds:**
```javascript
map.getBounds().toBBoxString()  // Should include your coordinate range
```

### **Check Zoom Level:**
```javascript
map.getZoom()  // Should be 12-18, NOT 0
```

---

## 🚨 **If Map Still Centers at (0,0)**

### **Possible Causes:**

1. **Data Not Arriving:**
   ```
   Console shows: "📦 backgroundItems count: 0"
   Solution: Check parent component passing props
   ```

2. **Transformation Failing:**
   ```
   Console shows: "❌ Transform returned empty array"
   Solution: Check SRID detection and CRS initialization
   ```

3. **fitBounds Not Executing:**
   ```
   Console shows data but no "Fitting bounds" message
   Solution: Check draw() function execution
   ```

4. **Bounds Invalid:**
   ```
   Console shows: "Valid: false"
   Solution: Check coordinate values are finite numbers
   ```

---

## 📝 **Files Modified**

**File:** `app-frontend/src/components/maps/DataMap.vue`

**Changes:**
1. **Lines 1091-1101:** Added data check before calling draw()
2. **Lines 397-400:** Added raw coordinate logging
3. **Lines 419-422:** Added transformed coordinate logging

---

## ✅ **Success Criteria**

**Map Correctly Centered If:**
- ✅ Console shows actual coordinate values (not 0)
- ✅ Console shows "After fitBounds - Center: [X, Y]" with real values
- ✅ Map displays survey points in center
- ✅ Zoom level appropriate (12-18)
- ✅ Can see all points without scrolling

---

## 🎯 **Test Now**

1. **Hard refresh:** `Ctrl + Shift + R`
2. **Open console:** `F12`
3. **Navigate to:** Calculations Part 2
4. **Watch console:** Look for coordinate values
5. **Verify map:** Should center on Y=96649, X=2247915 region

**Expected:** Map centered on survey points, NOT at (0,0)! ✅
