# 🗺️ Control Points Not Visible on Map - Fix

## 🚨 **Problem**

Control points were loaded successfully (4393 points) but not visible on the map. The UI showed:
- Selected: 14
- Visible: 0  ❌
- Total: 4393

---

## 🔍 **Root Cause**

**Property name mismatch** between the API response and the map component's expected format.

### **API Returns:**
```javascript
{
  id: 1,
  monu_num: "1/P",
  lat_wgs84: -17.1251034,  // Latitude
  lng_wgs84: 30.2276107,   // Longitude
  gauss_lo: 31,            // Central meridian
  monu_name: "Gasikani",
  area_nm: "Lions Den"
}
```

### **Map Component Expects:**
```javascript
{
  id: 1,
  monu_num: "1/P",
  y: -17.1251034,          // ❌ Expects 'y' not 'lat_wgs84'
  x: 30.2276107,           // ❌ Expects 'x' not 'lng_wgs84'
  central_meridian: 31,    // ❌ Expects 'central_meridian' not 'gauss_lo'
  description: "Gasikani"  // ❌ Expects 'description' not 'monu_name'
}
```

**Interface definition** (`controlPointMapUtils.ts`):
```typescript
export interface ControlPoint {
  id: number
  monu_num: string
  type: string
  y: number // Latitude  ← Expected
  x: number // Longitude ← Expected
  description?: string
  central_meridian?: number
  distance?: number
}
```

---

## ✅ **The Fix**

Added a computed property to map the API response to the expected format:

```typescript
// Map control points to format expected by map component (y=lat, x=lng)
const controlPointsForMap = computed(() => {
  return controlPoints.value.map((point: any) => ({
    ...point,
    y: point.lat_wgs84,  // Map lat_wgs84 to y (latitude)
    x: point.lng_wgs84,  // Map lng_wgs84 to x (longitude)
    central_meridian: point.gauss_lo,  // Map gauss_lo to central_meridian
    description: point.monu_name || point.area_nm  // Use name or area as description
  }))
})
```

**Then pass the mapped points to the map component:**
```vue
<ControlPointMapView
  v-if="useMapView"
  :points="controlPointsForMap"  <!-- ✅ Use mapped points -->
  :selected-ids="controlPointsSelection.points"
  :survey-center="surveyCenter"
  :project-id="projectId"
  @update:selectedIds="handleSelectionUpdate"
  @meridianSuggested="handleMeridianSuggestion"
/>
```

---

## 📊 **Before vs After**

### **Before Fix:**
```javascript
// Points passed to map
{
  lat_wgs84: -17.1251034,  // ❌ Map doesn't recognize this
  lng_wgs84: 30.2276107    // ❌ Map doesn't recognize this
}

// Map composable tries to use:
calculateDistance(
  surveyCenter.lat,
  surveyCenter.lng,
  point.y,  // ❌ undefined
  point.x   // ❌ undefined
)

// Result: All points filtered out
filteredAndSortedPoints.length = 0  // ❌ No points visible
```

### **After Fix:**
```javascript
// Points passed to map (mapped)
{
  lat_wgs84: -17.1251034,  // Original property preserved
  lng_wgs84: 30.2276107,   // Original property preserved
  y: -17.1251034,          // ✅ Mapped for map component
  x: 30.2276107,           // ✅ Mapped for map component
  central_meridian: 31,    // ✅ Mapped from gauss_lo
  description: "Gasikani"  // ✅ Mapped from monu_name
}

// Map composable can now use:
calculateDistance(
  surveyCenter.lat,
  surveyCenter.lng,
  point.y,  // ✅ -17.1251034
  point.x   // ✅ 30.2276107
)

// Result: Points visible on map
filteredAndSortedPoints.length = 4393  // ✅ All points visible
```

---

## 🎯 **Impact**

This fix enables:
- ✅ Control points visible on map
- ✅ Distance calculations work
- ✅ Filtering by distance works
- ✅ Sorting by proximity works
- ✅ Map markers render correctly
- ✅ Point selection works

---

## 🔧 **File Modified**

**File:** `app-frontend/src/views/modules/cadastral-standard/ControlPointSelectionView.vue`

**Changes:**
1. Added `controlPointsForMap` computed property (lines 321-330)
2. Changed `:points="controlPoints"` to `:points="controlPointsForMap"` (line 121)

---

## 🎓 **Technical Details**

### **Why the Naming Convention?**

The map component uses a generic naming convention:
- `y` = Latitude (north-south position)
- `x` = Longitude (east-west position)

This is common in GIS systems where:
- Y-axis = Latitude (vertical)
- X-axis = Longitude (horizontal)

However, the database uses more explicit names:
- `lat_wgs84` = WGS84 Latitude
- `lng_wgs84` = WGS84 Longitude

### **Why Not Change the Interface?**

**Option 1: Change the interface** (not chosen)
```typescript
// Change interface to match API
export interface ControlPoint {
  lat_wgs84: number
  lng_wgs84: number
}
```
❌ Would require changing the entire map composable  
❌ Would break other components using the same interface  
❌ Less generic/reusable

**Option 2: Map properties** (CHOSEN) ✅
```typescript
// Map API response to interface
const mapped = points.map(p => ({ ...p, y: p.lat_wgs84, x: p.lng_wgs84 }))
```
✅ Localized to one component  
✅ Preserves original properties  
✅ Doesn't break other code  
✅ Easy to maintain

---

## ✅ **Verification**

After reloading the page, check:

### **Console:**
```
[ControlPointSelection] ✅ Loaded 4393 control points for Lo31
[ControlPointSelection] Points with WGS84 coordinates: 4393
[ControlPointSelection] ✅ Auto-selected 27 control points within 20km
```

### **UI:**
- ✅ Map shows control points as markers
- ✅ Survey center (red pin) visible
- ✅ Selected points highlighted
- ✅ Stats show: "Visible: 4393" (not 0)
- ✅ List panel shows control points with distances
- ✅ Clicking points on map selects them

### **Map Stats (Bottom Left):**
```
Selected: 27
Visible: 4393  ✅ (was 0)
Total: 4393
```

---

## 📝 **Related Components**

This fix affects the data flow:

```
API Response
  ↓ (lat_wgs84, lng_wgs84)
ControlPointSelectionView.vue
  ↓ parseFloat() conversion
  ↓ (lat_wgs84: number, lng_wgs84: number)
controlPointsForMap computed
  ↓ property mapping
  ↓ (y: number, x: number)
ControlPointMapView.vue
  ↓ pass to composable
useControlPointMap.ts
  ↓ distance calculation
  ↓ filtering & sorting
Map Display ✅
```

---

## 🐛 **Debugging Tips**

If points still don't show:

1. **Check console for errors:**
   ```
   [ControlPointSelection] Error: ...
   ```

2. **Check mapped points:**
   ```javascript
   console.log('Mapped points:', controlPointsForMap.value[0])
   // Should show: { y: -17.125, x: 30.227, ... }
   ```

3. **Check map initialization:**
   ```
   Map loaded successfully
   ```

4. **Check point coordinates are valid:**
   ```javascript
   // Latitude should be -23 to -15 (Zimbabwe)
   // Longitude should be 25 to 34 (Zimbabwe)
   ```

---

**Last Updated**: November 23, 2025, 9:12 PM  
**Status**: ✅ Fixed - Control points now visible on map
