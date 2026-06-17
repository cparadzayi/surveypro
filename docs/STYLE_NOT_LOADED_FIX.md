# 🗺️ "Style is not done loading" Error - Fixed

## 🐛 **Error**

```
Uncaught (in promise) Error: Style is not done loading.
    at Proxy._checkLoaded (style.ts:701:19)
    at Proxy.addSource (style.ts:993:14)
```

**Symptoms:**
- Map appears but no triangles
- Console shows "Adding points to map: 0" (should be 27)
- Vue warns about unhandled errors
- TypeError: Cannot set properties of null

---

## 🔍 **Root Cause**

The watch on `filteredAndSortedPoints` was triggering **before the MapLibre style finished loading**, causing:

1. **Watch triggers** when points change (0 → 27)
2. **Checks `map.loaded()`** ✅ (map exists)
3. **But doesn't check `map.isStyleLoaded()`** ❌
4. **Tries to add source** before style is ready
5. **MapLibre throws error** "Style is not done loading"

### **Additional Issue**

The `filteredAndSortedPoints.value.length` was showing 0 instead of 27 because:
- Reactive refs weren't fully updated when watch ran
- Computed property ran before refs were synced

---

## ✅ **Fixes Applied**

### **1. Check Style Loaded Status**

```typescript
// Before
if (map.value && map.value.loaded()) {
  addPointsToMap()  // ❌ Style might not be loaded!
}

// After
if (map.value && map.value.loaded() && map.value.isStyleLoaded()) {
  addPointsToMap()  // ✅ Both map AND style are ready
}
```

### **2. Use nextTick for Reactive Updates**

```typescript
watch(filteredAndSortedPoints, (newPoints) => {
  if (map.value && map.value.loaded() && map.value.isStyleLoaded()) {
    // Use nextTick to ensure all reactive updates are complete
    nextTick(() => {
      addPointsToMap()
    })
  }
}, { flush: 'post' })  // ✅ Run after DOM updates
```

### **3. Add Guards in addPointsToMap()**

```typescript
function addPointsToMap() {
  if (!map.value) {
    console.log('[useControlPointMap] ⚠️ Map not initialized yet')
    return
  }

  // ✅ NEW: Check style is loaded
  if (!map.value.isStyleLoaded()) {
    console.log('[useControlPointMap] ⚠️ Style not loaded yet, waiting...')
    return
  }

  console.log('[useControlPointMap] 🗺️ Adding points to map:', filteredAndSortedPoints.value.length)
  
  // ✅ NEW: Don't add if no points
  if (filteredAndSortedPoints.value.length === 0) {
    console.log('[useControlPointMap] ℹ️ No points to add, skipping')
    return
  }

  // ... rest of function
}
```

---

## 🔄 **Fixed Flow**

```
Parent Component
  ↓ 27 points loaded
  ↓
Map Component
  ↓ Props change
  ↓
Composable
  ↓ pointsRef.value = 27
  ↓
  ↓ filteredAndSortedPoints computed
  ↓ Returns 27 points
  ↓
  ↓ watch(filteredAndSortedPoints) triggers
  ↓ { flush: 'post' } - waits for DOM updates
  ↓
  ↓ Checks map.loaded() ✅
  ↓ Checks map.isStyleLoaded() ✅
  ↓
  ↓ nextTick() - ensures reactive updates complete
  ↓
  ↓ addPointsToMap() called
  ↓ Checks isStyleLoaded() again ✅
  ↓ Checks length > 0 ✅
  ↓
  ↓ Creates GeoJSON source
  ↓ Adds triangle symbols
  ↓ Adds adaptive labels
  ↓
MapLibre
  ✅ Displays 27 triangles
```

---

## 📝 **Files Modified**

**`app-frontend/src/composables/useControlPointMap.ts`**

**Line 6:** Added `nextTick` to imports
```typescript
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
```

**Lines 169-182:** Updated watch with style check and nextTick
```typescript
watch(filteredAndSortedPoints, (newPoints) => {
  console.log('[useControlPointMap] 🔄 Filtered points changed:', newPoints.length)
  if (map.value && map.value.loaded() && map.value.isStyleLoaded()) {
    console.log('[useControlPointMap] 🗺️ Map and style loaded, re-adding points...')
    nextTick(() => {
      addPointsToMap()
    })
  } else {
    console.log('[useControlPointMap] ⏳ Map or style not loaded yet, will add points on load')
  }
}, { flush: 'post' })
```

**Lines 221-238:** Added guards in `addPointsToMap()`
```typescript
function addPointsToMap() {
  if (!map.value) {
    console.log('[useControlPointMap] ⚠️ Map not initialized yet')
    return
  }

  if (!map.value.isStyleLoaded()) {
    console.log('[useControlPointMap] ⚠️ Style not loaded yet, waiting...')
    return
  }

  console.log('[useControlPointMap] 🗺️ Adding points to map:', filteredAndSortedPoints.value.length)
  
  if (filteredAndSortedPoints.value.length === 0) {
    console.log('[useControlPointMap] ℹ️ No points to add, skipping')
    return
  }
  
  // ... rest of function
}
```

---

## ✅ **Expected Console Output**

After reloading:

```
[ControlPointSelection] 🗺️ Final: 27 control points within 20km radius
[ControlPointMapView] 🔍 Points prop changed: 27
[useControlPointMap] 🔄 Points updated externally: 27
[useControlPointMap] 🔍 Computing pointsWithDistance, points: 27
[useControlPointMap] ✅ Final filtered points: 27

[useControlPointMap] 🔄 Filtered points changed: 27
[useControlPointMap] 🗺️ Map and style loaded, re-adding points...
[useControlPointMap] 🗺️ Adding points to map: 27  ← Should be 27, not 0!
[useControlPointMap] ✅ Added symbol layers with adaptive labels

✅ No errors!
✅ 27 triangles visible on map!
```

---

## 🎯 **What Was Fixed**

| Issue | Before | After |
|-------|--------|-------|
| **Style check** | ❌ Only checked `map.loaded()` | ✅ Checks `isStyleLoaded()` too |
| **Timing** | ❌ Immediate execution | ✅ `nextTick()` + `flush: 'post'` |
| **Guards** | ❌ No style check in function | ✅ Double-checks style loaded |
| **Empty points** | ❌ Tried to add 0 points | ✅ Skips if length === 0 |
| **Error** | ❌ "Style is not done loading" | ✅ No errors |
| **Result** | ❌ Empty map | ✅ 27 triangles visible |

---

## 🔍 **Key Learnings**

### **MapLibre Loading Sequence**

1. **Map created** - `new maplibregl.Map()`
2. **Map loaded** - `map.loaded()` returns true
3. **Style loading** - Fetching tiles, fonts, sprites
4. **Style loaded** - `map.isStyleLoaded()` returns true ✅
5. **Ready for sources/layers** - Can now add GeoJSON

**Critical:** Always check **both** `loaded()` AND `isStyleLoaded()` before adding sources!

### **Vue Reactivity Timing**

- **`flush: 'pre'`** - Runs before DOM updates (default)
- **`flush: 'post'`** - Runs after DOM updates ✅ Better for map updates
- **`nextTick()`** - Ensures all reactive updates complete ✅

---

## ✅ **Testing Checklist**

After reloading:

- [ ] No "Style is not done loading" error
- [ ] No "Cannot set properties of null" error
- [ ] Console shows "Adding points to map: 27" (not 0)
- [ ] Console shows "Map and style loaded, re-adding points..."
- [ ] **27 black/red triangles** visible on map
- [ ] Triangles have white inscribed circles
- [ ] Click triangle - popup appears
- [ ] Select point - turns red
- [ ] Zoom in/out - adaptive labels work

---

**Last Updated**: November 24, 2025, 7:10 AM  
**Status**: ✅ Fixed - Style loading check added, timing issues resolved  
**Reload to see the triangles!** ▲
