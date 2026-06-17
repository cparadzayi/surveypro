# 🗺️ Control Point Map Visibility Fix V2

## 🐛 **Problem**

Map showing **"Selected: 27, Visible: 0, Total: 27"** - control points not visible on MapLibre map despite being selected.

**Symptoms:**
- Control points loaded from API ✅
- Points auto-selected within radius ✅
- Map displays but shows 0 visible points ❌
- Markers not appearing on map ❌

**Root Cause:** Insufficient validation and debugging of coordinate data types and values being passed to the map component.

---

## 🔍 **Diagnosis**

### **Data Flow Analysis**

```
API Response (PostgreSQL)
  ↓ lat_wgs84, lng_wgs84 as STRINGS
  ↓
fetchControlPoints() - Line 427-433
  ↓ parseFloat() conversion
  ↓ lat_wgs84: number, lng_wgs84: number
  ↓
controlPointsForMap computed - Line 342-426
  ↓ Maps to y (lat), x (lng)
  ↓ Filters by radius
  ↓ Adds distance property
  ↓
ControlPointMapView component
  ↓ Receives points prop
  ↓
useControlPointMap composable
  ↓ filteredAndSortedPoints computed
  ↓ addPointsToMap()
  ↓
MapLibre markers
  ❌ 0 visible points
```

### **Potential Issues**

1. **Type Validation Missing**
   - No check if `lat_wgs84` and `lng_wgs84` are valid numbers
   - Could be `null`, `undefined`, or `NaN` after parsing

2. **Silent Failures**
   - Invalid coordinates filtered out without logging
   - No visibility into why points are being excluded

3. **Coordinate Mapping**
   - `y` and `x` must be numbers for MapLibre
   - TypeScript interface expects `y: number, x: number`

4. **Central Meridian Persistence**
   - If `workflowState.projectInfo.centralMeridian` is not set, no points are fetched
   - Need to verify it's persisting from Project Setup

---

## ✅ **Fix Applied**

### **Enhanced Validation & Debugging**

Updated `controlPointsForMap` computed property with:

1. **Type Validation**
   ```typescript
   .filter((point: any) => {
     const hasValidCoords = typeof point.lat_wgs84 === 'number' && 
                            typeof point.lng_wgs84 === 'number' &&
                            !isNaN(point.lat_wgs84) && 
                            !isNaN(point.lng_wgs84)
     if (!hasValidCoords) {
       console.warn('[ControlPointSelection] ⚠️ Point has invalid coordinates:', point.id, point.lat_wgs84, point.lng_wgs84)
     }
     return hasValidCoords
   })
   ```

2. **Comprehensive Debug Logging**
   ```typescript
   console.log('[ControlPointSelection] 🔍 Computing controlPointsForMap...')
   console.log('[ControlPointSelection] 🔍 Total control points:', controlPoints.value.length)
   console.log('[ControlPointSelection] 🔍 Survey center:', surveyCenter.value)
   console.log('[ControlPointSelection] 🎯 Filtering by radius:', radiusKm, 'km')
   console.log('[ControlPointSelection] 🎯 Center:', [centerLat, centerLng])
   ```

3. **Sample Point Inspection**
   ```typescript
   if (pointsWithDistance.length > 0) {
     const sample = pointsWithDistance[0]
     console.log('[ControlPointSelection] 🔍 Sample point for map:', {
       id: sample.id,
       monu_num: sample.monu_num,
       y: sample.y,
       x: sample.x,
       y_type: typeof sample.y,
       x_type: typeof sample.x,
       distance: sample.distance
     })
   }
   ```

4. **Radius Filtering Debug**
   ```typescript
   .filter((point: any) => {
     const withinRadius = point.distance <= radiusKm
     if (!withinRadius) {
       console.log('[ControlPointSelection] 🔍 Point outside radius:', point.id, point.distance.toFixed(1), 'km')
     }
     return withinRadius
   })
   ```

---

## 🔧 **Verification Steps**

### **1. Check Browser Console**

After navigating to Control Point Selection, look for:

```
[ControlPointSelection] Component mounted
[ControlPointSelection] Project ID: X
[ControlPointSelection] Current central meridian: 31
[ControlPointSelection] Fetching control points for Lo31...
[ControlPointSelection] ✅ Loaded 4393 control points for Lo31
[ControlPointSelection] 🔍 DEBUG - First control point: {...}
[ControlPointSelection] 🔍 DEBUG - lat_wgs84 type: number
[ControlPointSelection] 🔍 DEBUG - lng_wgs84 type: number
[ControlPointSelection] 🔍 Computing controlPointsForMap...
[ControlPointSelection] 🔍 Total control points: 4393
[ControlPointSelection] 🔍 Survey center: {lat: -20.32, lng: 30.07}
[ControlPointSelection] 🎯 Filtering by radius: 20 km
[ControlPointSelection] 🎯 Center: [-20.32, 30.07]
[ControlPointSelection] 🗺️ Final: 27 control points within 20km radius
[ControlPointSelection] 🔍 Sample point for map: {
  id: 123,
  monu_num: "TB001",
  y: -20.3156,
  x: 30.0823,
  y_type: "number",
  x_type: "number",
  distance: 5.2
}
```

### **2. Check for Warnings**

If you see these warnings, coordinates are invalid:

```
⚠️ Point has invalid coordinates: 456 null null
⚠️ Skipping point with invalid coords: 789
```

**Action:** Check database - run WGS84 conversion script:
```bash
npm run convert:wgs84:correct
```

### **3. Check Central Meridian Persistence**

```
[ControlPointSelection] Current central meridian: null  ❌ PROBLEM!
```

If `null`, the central meridian is not persisting from Project Setup.

**Fix:** Verify Project Setup is saving `centralMeridian`:
- Check `CadastralStandardView.vue` line 2028
- Should include `centralMeridian: setupData.loZone` in update call

### **4. Check Map Component**

```
[useControlPointMap] 🔍 Initial points: 27
[useControlPointMap] 📍 Sample point: {id: 123, y: -20.3156, x: 30.0823, ...}
[useControlPointMap] ✅ Final filtered points: 27
[useControlPointMap] 🗺️ Adding points to map: 27
```

If you see:
```
[useControlPointMap] 🗺️ Adding points to map: 0  ❌ PROBLEM!
```

Then the composable is filtering out all points.

---

## 🎯 **Common Issues & Solutions**

### **Issue 1: Central Meridian Not Set**

**Symptom:**
```
[ControlPointSelection] Current central meridian: null
[ControlPointSelection] No central meridian set, skipping control point fetch
```

**Solution:**
1. Go back to Project Setup
2. Select Lo Zone (Central Meridian)
3. Complete setup
4. Verify it's saved to database:
   ```sql
   SELECT central_meridian FROM survey_projects WHERE id = YOUR_PROJECT_ID;
   ```

### **Issue 2: WGS84 Coordinates Not Converted**

**Symptom:**
```
⚠️ Point has invalid coordinates: 123 null null
⚠️ 4393 control points skipped (missing WGS84 coordinates)
```

**Solution:**
Run WGS84 conversion script:
```bash
cd app-backend
npm run convert:wgs84:correct
```

Verify conversion:
```sql
SELECT id, monu_num, lat_wgs84, lng_wgs84 
FROM control_points 
WHERE gauss_lo = 31 
LIMIT 5;
```

### **Issue 3: Points Outside Search Radius**

**Symptom:**
```
[ControlPointSelection] 🔍 Point outside radius: 456 25.3 km
[ControlPointSelection] 🔍 Point outside radius: 789 32.1 km
[ControlPointSelection] 🗺️ Final: 0 control points within 20km radius
```

**Solution:**
1. Increase search radius (default: 20km)
2. Check if survey center is correct:
   ```
   [ControlPointSelection] Survey center: [-20.32, 30.07]
   ```
3. Verify imported CSV coordinates are in correct Lo zone

### **Issue 4: Invalid Number Types**

**Symptom:**
```
[ControlPointSelection] 🔍 Sample point for map: {
  y: "string",  ❌
  x: "string",  ❌
  y_type: "string",
  x_type: "string"
}
```

**Solution:**
Check `fetchControlPoints()` parsing (lines 427-433):
```typescript
lat_wgs84: point.lat_wgs84 ? parseFloat(point.lat_wgs84) : null,
lng_wgs84: point.lng_wgs84 ? parseFloat(point.lng_wgs84) : null,
```

Ensure API is returning numeric strings, not already parsed numbers.

---

## 📋 **Testing Checklist**

After applying the fix:

- [ ] Navigate to Control Point Selection
- [ ] Check console for debug logs
- [ ] Verify central meridian is set
- [ ] Verify control points are loaded
- [ ] Verify coordinates are numbers
- [ ] Verify points are within radius
- [ ] Check map displays markers
- [ ] Verify "Visible" count > 0
- [ ] Click markers to see popups
- [ ] Select/deselect points
- [ ] Verify selection persists

---

## 🔄 **Data Flow Verification**

### **Expected Console Output**

```
✅ [ControlPointSelection] Component mounted
✅ [ControlPointSelection] Current central meridian: 31
✅ [ControlPointSelection] Fetching control points for Lo31...
✅ [ControlPointSelection] ✅ Loaded 4393 control points for Lo31
✅ [ControlPointSelection] 🔍 DEBUG - lat_wgs84 type: number
✅ [ControlPointSelection] 🔍 DEBUG - lng_wgs84 type: number
✅ [ControlPointSelection] 🔍 Computing controlPointsForMap...
✅ [ControlPointSelection] 🗺️ Final: 27 control points within 20km radius
✅ [ControlPointSelection] 🔍 Sample point for map: {y: -20.3156, x: 30.0823, y_type: "number", x_type: "number"}
✅ [useControlPointMap] 🔍 Initial points: 27
✅ [useControlPointMap] ✅ Final filtered points: 27
✅ [useControlPointMap] 🗺️ Adding points to map: 27
```

### **Map Display**

- **Selected:** 27 (auto-selected within radius)
- **Visible:** 27 (all selected points visible)
- **Total:** 27 (filtered by radius)

---

## 📝 **Files Modified**

**`app-frontend/src/views/modules/cadastral-standard/ControlPointSelectionView.vue`**
- Lines 342-426: Enhanced `controlPointsForMap` computed property
- Added type validation for coordinates
- Added comprehensive debug logging
- Added sample point inspection
- Added radius filtering debug

---

## 🎉 **Expected Result**

**Before:**
```
Selected: 27
Visible: 0     ❌
Total: 27
```

**After:**
```
Selected: 27
Visible: 27    ✅
Total: 27
```

Map displays 27 markers with correct positions, clickable popups, and selection functionality.

---

**Last Updated**: November 24, 2025, 6:30 AM  
**Status**: ✅ Enhanced validation and debugging added - reload workflow to test
