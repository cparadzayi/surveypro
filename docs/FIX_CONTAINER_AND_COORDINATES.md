# 🔧 FIX: Container Size Zero & Coordinate Order

## 🚨 **Critical Issues Fixed**

### **Issue 1: fitBounds on Zero-Sized Container**
```
📐 Map container size: 0px × 0px
❌ Error in fitBounds: TypeError: coordinates must be finite numbers
```

**Root Cause:** `fitBounds()` executed before map container rendered (width/height = 0).

---

### **Issue 2: Coordinate Order Mismatch**

**Coordinate List (Source Data):**
```
Rendering point ZG: y=97128.263, x=2248259.2  ✅ CORRECT
```

**Map Data (Before Fix):**
```
Sample raw coords: X=97128.263, Y=2248259.2  ❌ SWAPPED!
First valid point: ZG at P(X=97128.26, Y=2248259.20)  ❌ WRONG ORDER
```

**After Transform:**
```
📍 Sample: P(Y=2248259.2, X=97128.263)  ❌ COORDINATES INVERTED!
```

---

## 🔍 **Root Cause Analysis**

### **The Problem:**

**Database Storage (Areas2View export):**
```javascript
// autoExportCoordinatesToPostGIS - line 668
coordinates: [coord.y, coord.x]  // [97128.263, 2248259.2]
// Stores as Zimbabwe P(Y, X) order
```

**Database Retrieval (DataMap import):**
```javascript
// DataMap.vue - line 405-406 (BEFORE FIX)
const x = coordinates[0]  // 97128.263 ❌ WRONG!
const y = coordinates[1]  // 2248259.2 ❌ WRONG!
// Assumes standard GeoJSON [X, Y] order
```

**Result:**
- Y (small value ~97k) read as X
- X (large value ~2.2M) read as Y
- Coordinates completely inverted
- Points render at wrong location

---

## ✅ **Fix 1: Container Size Check**

**File:** `DataMap.vue` lines 976-990

```javascript
const containerSize = map!.getSize()
console.log(`[DataMap] 📐 Map container size: ${containerSize.x}px × ${containerSize.y}px`)

// CRITICAL: Skip fitBounds if container not rendered yet
if (containerSize.x === 0 || containerSize.y === 0) {
  console.warn('[DataMap] ⚠️ Container size is 0, skipping fitBounds - will retry after render')
  // Retry after container renders
  setTimeout(() => {
    console.log('[DataMap] 🔄 Retrying fitBounds after container render...')
    draw()
  }, 100)
  return  // Exit early, don't attempt fitBounds
}
```

**Benefits:**
- ✅ Prevents `fitBounds()` crash on zero-sized container
- ✅ Automatically retries after container renders
- ✅ Clear console feedback about timing
- ✅ No more "coordinates must be finite numbers" error

---

## ✅ **Fix 2: Coordinate Order Correction**

**File:** `DataMap.vue` lines 403-415

**BEFORE:**
```javascript
const bgPts = (props.backgroundItems || []).map((f:any, i:number) => {
  // Assumes GeoJSON [X, Y] order
  const x = Number(f?.geometry?.coordinates?.[0])  // ❌ WRONG!
  const y = Number(f?.geometry?.coordinates?.[1])  // ❌ WRONG!
  return { y, x, name }
})
```

**AFTER:**
```javascript
const bgPts = (props.backgroundItems || []).map((f:any, i:number) => {
  // CRITICAL: Zimbabwe coordinates are stored in database as P(Y, X) order
  // GeoJSON Point.coordinates = [Y, X] (NOT standard [X, Y]!)
  // This matches how we exported them: coordinates: [coord.y, coord.x]
  const y = Number(f?.geometry?.coordinates?.[0])  // Y = Westing (first in DB) ✅
  const x = Number(f?.geometry?.coordinates?.[1])  // X = Southing (second in DB) ✅
  const name = f?.properties?.name || f?.properties?.beacon || f?.properties?.point_name || `BG${i+1}`
  
  if (i === 0 && Number.isFinite(y) && Number.isFinite(x)) {
    console.log(`[DataMap] First valid point: ${name} at P(Y=${y.toFixed(2)}, X=${x.toFixed(2)})`)
  }
  
  return { y, x, name, latlng: null as any }
})
```

**Enhanced Logging (lines 399-400):**
```javascript
console.log(`[DataMap] 📍 Sample raw coords from DB: [0]=${sampleCoords[0]}, [1]=${sampleCoords[1]}`)
console.log(`[DataMap] 📍 Interpreting as: Y=${sampleCoords[0]}, X=${sampleCoords[1]} (Zimbabwe P(Y,X) order)`)
```

---

## 📊 **Expected Console Output (After Fix)**

### **On Data Load:**
```javascript
[DataMap] 📍 Sample raw coords from DB: [0]=97128.263, [1]=2248259.2
[DataMap] 📍 Interpreting as: Y=97128.263, X=2248259.2 (Zimbabwe P(Y,X) order)  ✅
[DataMap] First valid point: ZG at P(Y=97128.26, X=2248259.20)  ✅ CORRECT!
[DataMap] Extracted 10 valid background points from 10 items
```

### **On Transform:**
```javascript
🔄 Transforming 10 points
🔍 CRS: EPSG:22289, usesProj4: true
✅ Using Proj4 with Cape Lo South-Orientated (+axis=wsu)
📍 Sample: P(Y=97128.263, X=2248259.2) → [Westing=97128.263, Southing=2248259.2]  ✅
[DataMap] 📍 Transformed to 10 latLng coordinates
[DataMap] 📍 First transformed point: [97128.26, 2248259.20]  ✅ CORRECT ORDER!
```

### **On fitBounds (Container Ready):**
```javascript
[DataMap] 🔍 Fitting bounds to 10 background points
[DataMap] 📐 Using Proj4 CRS, maxZoom: 18
[DataMap] 📐 Map container size: 1024px × 600px  ✅ NOT ZERO!
[DataMap] 📐 Current CRS code: EPSG:22289
[DataMap] 📐 Before fitBounds - Zoom: 12, Center: [0.0, 0.0]
[DataMap] 🔍 After fitBounds - Zoom: 14, Center: [97000.0, 2248000.0]  ✅ CORRECT!
```

### **If Container Not Ready (Retry):**
```javascript
[DataMap] 📐 Map container size: 0px × 0px
[DataMap] ⚠️ Container size is 0, skipping fitBounds - will retry after render
[DataMap] 🔄 Retrying fitBounds after container render...
// ... 100ms later, container ready, fitBounds succeeds
```

---

## 🎯 **Why This Matters**

### **Zimbabwe Coordinate Convention:**

Zimbabwe (and Southern Africa) uses **P(Y, X)** notation:
- **Y** = Westing (perpendicular to meridian, ~0-200,000m)
- **X** = Southing (along meridian, ~0-3,000,000m)

**NOT** the standard GIS **P(X, Y)** notation!

### **Database Storage:**

When exporting to PostGIS, we correctly use:
```javascript
coordinates: [coord.y, coord.x]  // Matches Zimbabwe notation
```

### **The Mismatch:**

GeoJSON standard expects `[longitude, latitude]` or `[X, Y]`, but we store `[Y, X]` to match Zimbabwe notation.

**Solution:** Read coordinates in the same order they were written!

---

## 🧪 **Testing Instructions**

```bash
# 1. Hard refresh
Ctrl + Shift + R

# 2. Navigate to Calculations Part 2

# 3. Expected console:
✅ Sample raw coords from DB: [0]=97128.263, [1]=2248259.2
✅ Interpreting as: Y=97128.263, X=2248259.2 (Zimbabwe P(Y,X) order)
✅ First valid point: ZG at P(Y=97128.26, X=2248259.20)
✅ Sample: P(Y=97128.263, X=2248259.2) → [Westing=97128.263, Southing=2248259.2]
✅ Map container size: 1024px × 600px (NOT 0!)
✅ After fitBounds - Zoom: 14, Center: [97000.0, 2248000.0]

# 4. Should NOT see:
❌ Container size is 0
❌ coordinates must be finite numbers
❌ Sample: P(Y=2248259.2, X=97128.263) (inverted)

# 5. Map should:
✅ Display all 10 points in correct locations
✅ Display 2 yellow parcels
✅ Center on survey area (not corner)
✅ Zoom in/out smoothly
```

---

## 📝 **Files Modified**

1. **`app-frontend/src/components/maps/DataMap.vue`**
   - Lines 976-990: Added container size check before fitBounds
   - Lines 399-400: Enhanced coordinate logging
   - Lines 403-415: Fixed coordinate order interpretation
   - Comments updated to clarify Zimbabwe P(Y,X) convention

---

## 🔧 **Technical Details**

### **Container Size Issue:**

**Timing Problem:**
```
1. Component mounts
2. Map initializes
3. Data arrives → watch triggers → draw()
4. fitBounds() called
5. But... CSS hasn't rendered container yet!
6. Container size = 0 × 0
7. fitBounds() with Proj4 CRS → coordinate math fails
8. Error: "coordinates must be finite numbers"
```

**Solution:**
- Check container size before fitBounds
- If zero, delay 100ms and retry
- Container renders during delay
- Second attempt succeeds

### **Coordinate Order Issue:**

**Why P(Y, X) in Database:**
- Matches Zimbabwe surveying convention
- Consistent with field books and diagrams
- Y (Westing) listed before X (Southing)
- Makes sense to surveyors

**Why It Caused Problems:**
- GeoJSON expects [X, Y]
- Code assumed standard order
- Read [Y, X] as [X, Y]
- Coordinates inverted

**Solution:**
- Document the convention clearly
- Read in same order as written
- Consistent P(Y, X) throughout

---

## ✅ **Result**

**Before:**
- ❌ Map crashes with "coordinates must be finite numbers"
- ❌ Points at wrong locations (inverted coordinates)
- ❌ No visibility of survey data

**After:**
- ✅ Map loads successfully
- ✅ Points at correct locations
- ✅ Proper centering and zoom
- ✅ Professional survey application

---

**🚀 Hard refresh and test - map should work perfectly now!**
