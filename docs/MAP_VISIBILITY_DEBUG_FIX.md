# 🗺️ Map Visibility Issue - Debug Fix

## 🐛 **Problem**

Map showing **0 visible points** despite having 27 total points:
```
Selected: 27
Visible: 0    ← Issue!
Total: 27
```

---

## 🔍 **Root Cause**

The `useControlPointMap` composable was **recalculating distances** for points that already had distances calculated by the parent component. This could cause issues if:

1. Points already have `distance` property from parent
2. Composable tries to recalculate using `point.y` and `point.x`
3. Calculation might fail or produce different results
4. Filtering/sorting might not work correctly

---

## ✅ **Fix Applied**

### **1. Smart Distance Handling**

Updated `pointsWithDistance` computed property to check if distances already exist:

```typescript
const pointsWithDistance = computed(() => {
  // If points already have distance calculated (from parent), use them as-is
  if (points.length > 0 && points[0].distance !== undefined) {
    return points
  }
  
  // Otherwise, calculate distance if we have a survey center
  if (!surveyCenter) return points

  return points.map((point) => ({
    ...point,
    distance: calculateDistance(
      surveyCenter.lat,
      surveyCenter.lng,
      point.y,
      point.x
    )
  }))
})
```

**Why this works:**
- ✅ Respects parent's filtering (points within radius)
- ✅ Avoids duplicate distance calculations
- ✅ Preserves all point properties
- ✅ Fallback to calculation if needed

---

### **2. Debug Logging**

Added comprehensive logging to track the filtering process:

```typescript
const filteredAndSortedPoints = computed(() => {
  let filtered = pointsWithDistance.value
  
  console.log('[useControlPointMap] 🔍 Initial points:', filtered.length)
  if (filtered.length > 0) {
    console.log('[useControlPointMap] 📍 Sample point:', {
      id: filtered[0].id,
      monu_num: filtered[0].monu_num,
      y: filtered[0].y,
      x: filtered[0].x,
      distance: filtered[0].distance
    })
  }

  // Search filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    console.log('[useControlPointMap] 🔍 Applying search filter:', query)
    filtered = filtered.filter(...)
    console.log('[useControlPointMap] 🔍 After search filter:', filtered.length)
  }

  // Favorites filter
  if (showFavoritesOnly.value) {
    console.log('[useControlPointMap] ⭐ Applying favorites filter')
    filtered = filtered.filter(...)
    console.log('[useControlPointMap] ⭐ After favorites filter:', filtered.length)
  }

  // Sort...
  
  console.log('[useControlPointMap] ✅ Final filtered points:', sorted.length)
  return sorted
})
```

**Logging in `addPointsToMap`:**

```typescript
function addPointsToMap() {
  if (!map.value) {
    console.log('[useControlPointMap] ⚠️ Map not initialized yet')
    return
  }

  console.log('[useControlPointMap] 🗺️ Adding points to map:', filteredAndSortedPoints.value.length)
  
  // Clear existing markers...
  // Add markers...
}
```

---

## 🔧 **How to Diagnose**

After reloading, check the browser console for:

### **Expected Console Output:**

```
[useControlPointMap] 🔍 Initial points: 27
[useControlPointMap] 📍 Sample point: {
  id: 12345,
  monu_num: "CP001",
  y: -20.123456,
  x: 30.123456,
  distance: 5.2
}
[useControlPointMap] ✅ Final filtered points: 27
[useControlPointMap] 🗺️ Adding points to map: 27
```

### **If Still 0 Points:**

Check for these issues:

1. **Search filter active?**
   ```
   [useControlPointMap] 🔍 Applying search filter: "xyz"
   [useControlPointMap] 🔍 After search filter: 0
   ```
   **Fix:** Clear the search box

2. **Favorites filter active?**
   ```
   [useControlPointMap] ⭐ Applying favorites filter
   [useControlPointMap] ⭐ After favorites filter: 0
   ```
   **Fix:** Click "⭐ Favorites" button to toggle off

3. **Points missing properties?**
   ```
   [useControlPointMap] 📍 Sample point: {
     id: 12345,
     monu_num: undefined,  ← Issue!
     y: undefined,         ← Issue!
     x: undefined          ← Issue!
   }
   ```
   **Fix:** Check parent component's `controlPointsForMap` mapping

4. **Map not initialized?**
   ```
   [useControlPointMap] ⚠️ Map not initialized yet
   ```
   **Fix:** Wait for map to load, or check `initMap()` call

---

## 📊 **Data Flow**

### **Correct Flow:**

```
Parent (ControlPointSelectionView)
  ↓
  controlPointsForMap computed property
  ↓ Filters by search radius (20km)
  ↓ Calculates distance for each point
  ↓ Maps to { ...point, y, x, distance, description }
  ↓
  Passes 27 points to ControlPointMapView
  ↓
  useControlPointMap composable
  ↓ Detects points already have distance
  ↓ Uses points as-is (no recalculation)
  ↓
  filteredAndSortedPoints
  ↓ Applies search filter (if any)
  ↓ Applies favorites filter (if any)
  ↓ Sorts by distance/name/code
  ↓
  addPointsToMap()
  ↓ Creates 27 MapLibre markers
  ↓
  Map displays 27 points ✅
```

---

## 🎯 **Expected Result**

After reloading:

**UI shows:**
```
Selected: 27
Visible: 27   ← Fixed!
Total: 27
```

**Console shows:**
```
[useControlPointMap] 🔍 Initial points: 27
[useControlPointMap] 📍 Sample point: { id: ..., monu_num: "...", y: -20.xx, x: 30.xx, distance: 5.x }
[useControlPointMap] ✅ Final filtered points: 27
[useControlPointMap] 🗺️ Adding points to map: 27
```

**Map displays:**
- ✅ 27 control point markers (📍 or 🔺)
- ✅ Survey center marker (📍)
- ✅ Popups on click
- ✅ Zoom/pan controls work

---

## 🔍 **Troubleshooting Steps**

If still showing 0 visible:

1. **Open browser console** (F12)
2. **Look for the debug logs** starting with `[useControlPointMap]`
3. **Check each step:**
   - Initial points count
   - Sample point properties
   - Filter applications
   - Final count
4. **Identify where points disappear:**
   - If initial = 0 → Parent not passing points
   - If after search = 0 → Clear search box
   - If after favorites = 0 → Toggle favorites off
   - If final = 27 but not on map → Map initialization issue

---

## 📝 **Files Modified**

**`app-frontend/src/composables/useControlPointMap.ts`**

1. **Smart distance handling:**
   - Check if `points[0].distance` exists
   - Use points as-is if distance already calculated
   - Avoid duplicate calculations

2. **Debug logging:**
   - Log initial points count
   - Log sample point properties
   - Log each filter application
   - Log final count
   - Log map rendering

---

## ✅ **Success Criteria**

- ✅ Console shows 27 initial points
- ✅ Console shows 27 final points
- ✅ Console shows "Adding points to map: 27"
- ✅ UI shows "Visible: 27"
- ✅ Map displays 27 markers
- ✅ Markers are clickable with popups
- ✅ Selected points show as 🔺 (27 of them)

---

**Reload the page and check the console to diagnose the issue!** 🔍

**Last Updated**: November 23, 2025, 9:40 PM  
**Status**: ✅ Debug logging added, smart distance handling implemented
