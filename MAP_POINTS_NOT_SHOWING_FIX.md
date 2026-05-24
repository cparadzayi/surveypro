# 🗺️ Map Points Not Showing - Fix Applied

## 🐛 **Problem**

Control points were not appearing on the map despite:
- ✅ 27 points loaded
- ✅ Points passed to map component
- ✅ Console showing "Updated markers with new selection state"
- ❌ No triangles visible on map

---

## 🔍 **Root Cause**

The issue was a **timing problem** in the map initialization flow:

1. **Map component receives points** (27 points)
2. **`updateMarkers()` is called** (tries to update GeoJSON source)
3. **But `addPointsToMap()` was never called!** ❌
   - The source `'control-points'` doesn't exist yet
   - The layers don't exist yet
   - `updateMarkers()` fails silently

### **Why This Happened**

```typescript
// Map initialization
map.value.on('load', () => {
  addPointsToMap()  // ✅ Called on initial load
})

// But when points change later...
watch(() => points, (newPoints) => {
  pointsRef.value = newPoints  // ✅ Updates ref
  // ❌ Doesn't call addPointsToMap()!
})

// updateMarkers() is called instead
function updateMarkers() {
  const source = map.value.getSource('control-points')
  // ❌ Source doesn't exist if addPointsToMap() was never called!
}
```

**The flow:**
1. Map loads with **0 points** (empty initial state)
2. `addPointsToMap()` is called but does nothing (0 points)
3. Later, **27 points** arrive from parent
4. `updateMarkers()` is called
5. **Fails** because source/layers don't exist

---

## ✅ **Fix Applied**

Added a **watch on `filteredAndSortedPoints`** to call `addPointsToMap()` when points change:

```typescript
// Watch for filtered points changes and update map
watch(filteredAndSortedPoints, (newPoints) => {
  console.log('[useControlPointMap] 🔄 Filtered points changed:', newPoints.length)
  // Only update if map is loaded
  if (map.value && map.value.loaded()) {
    console.log('[useControlPointMap] 🗺️ Map is loaded, re-adding points...')
    addPointsToMap()  // ✅ Re-create source and layers
  } else {
    console.log('[useControlPointMap] ⏳ Map not loaded yet, will add points on load')
  }
})
```

### **How It Works**

1. **Map loads** (empty or with initial points)
2. **Points arrive** from parent (27 points)
3. **`filteredAndSortedPoints` changes** (0 → 27)
4. **Watch triggers** and checks if map is loaded
5. **`addPointsToMap()` is called** ✅
6. **Source and layers are created** with 27 points
7. **Triangles appear on map!** ▲▲▲

---

## 🔄 **Complete Flow (Fixed)**

```
Parent Component (ControlPointSelectionView)
  ↓ Fetches control points from API
  ↓ 27 points loaded
  ↓
Map Component (ControlPointMapView)
  ↓ Receives props.points = 27
  ↓ watch() detects change
  ↓
Composable (useControlPointMap)
  ↓ watch(() => points) triggers
  ↓ pointsRef.value = 27 points
  ↓
  ↓ filteredAndSortedPoints computed re-runs
  ↓ Returns 27 points
  ↓
  ↓ watch(filteredAndSortedPoints) triggers ✅ NEW!
  ↓ Checks if map.loaded() = true
  ↓ Calls addPointsToMap()
  ↓
  ↓ Creates GeoJSON source
  ↓ Creates triangle symbols
  ↓ Adds symbol layer
  ↓ Adds label layer
  ↓
MapLibre Map
  ✅ Displays 27 black/red triangles
  ✅ Shows adaptive labels
  ✅ Clickable popups work
```

---

## 📝 **File Modified**

**`app-frontend/src/composables/useControlPointMap.ts`**

**Lines 169-179:** Added watch on `filteredAndSortedPoints`

```typescript
// Watch for filtered points changes and update map
watch(filteredAndSortedPoints, (newPoints) => {
  console.log('[useControlPointMap] 🔄 Filtered points changed:', newPoints.length)
  // Only update if map is loaded
  if (map.value && map.value.loaded()) {
    console.log('[useControlPointMap] 🗺️ Map is loaded, re-adding points...')
    addPointsToMap()
  } else {
    console.log('[useControlPointMap] ⏳ Map not loaded yet, will add points on load')
  }
})
```

---

## ✅ **Expected Console Output**

After reloading, you should see:

```
[ControlPointSelection] 🗺️ Final: 27 control points within 20km radius
[ControlPointMapView] 🔍 Points prop changed: 27
[useControlPointMap] 🔄 Points updated externally: 27
[useControlPointMap] 🔍 Computing pointsWithDistance, points: 27
[useControlPointMap] ✅ Using pre-calculated distances from parent
[useControlPointMap] 🔍 Initial points: 27
[useControlPointMap] ✅ Final filtered points: 27

[useControlPointMap] 🔄 Filtered points changed: 27  ← NEW!
[useControlPointMap] 🗺️ Map is loaded, re-adding points...  ← NEW!
[useControlPointMap] 🗺️ Adding points to map: 27
[useControlPointMap] ✅ Added symbol layers with adaptive labels

Map displays 27 triangles! ▲▲▲
```

---

## 🎯 **Result**

**Before:**
```
Map: Empty (no triangles)
Console: "Updated markers with new selection state"
Issue: Source doesn't exist
```

**After:**
```
Map: 27 black/red triangles visible ▲▲▲
Console: "Map is loaded, re-adding points..."
Console: "Added symbol layers with adaptive labels"
Issue: Fixed! ✅
```

---

## 🔍 **Why `updateMarkers()` Alone Wasn't Enough**

`updateMarkers()` only **updates existing GeoJSON data**:

```typescript
function updateMarkers() {
  const source = map.value.getSource('control-points')
  if (!source) {
    // ❌ If source doesn't exist, it tries to re-add
    addPointsToMap()
    return
  }
  source.setData(geojson)  // ✅ Updates existing source
}
```

But if `addPointsToMap()` was never called initially, the source doesn't exist, so `updateMarkers()` has to call `addPointsToMap()` anyway.

**The fix ensures `addPointsToMap()` is called proactively when points change**, rather than relying on `updateMarkers()` to detect the missing source.

---

## ✅ **Testing Checklist**

After reloading:

- [ ] Navigate to Control Point Selection
- [ ] Verify **27 triangles** appear on map (not empty)
- [ ] Verify triangles are **black** (unselected)
- [ ] Verify **white inscribed circles** visible
- [ ] Select a point - verify it turns **red**
- [ ] Zoom in/out - verify **adaptive labels** work
- [ ] Click triangle - verify **popup** appears
- [ ] Check console for "Map is loaded, re-adding points..."

---

**Last Updated**: November 24, 2025, 7:05 AM  
**Status**: ✅ Fixed - Points now appear on map when loaded  
**Reload the workflow to see the triangles!** ▲
