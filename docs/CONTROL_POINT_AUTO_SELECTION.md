# Control Point Auto-Selection Feature

## Overview
Implemented intelligent control point selection that automatically selects all trig beacons within a 20km radius of the survey centroid, using the central meridian from Project Setup.

## User Flow

### 1. Project Setup (Step 1)
User selects **Central Meridian** (Lo 25/27/29/31/33) based on survey location.

### 2. CSV Import
User imports survey coordinates → System calculates **survey centroid** from imported points.

### 3. Control Point Selection (Step 2) - **AUTOMATIC**

#### What Happens Automatically:
1. **Fetch Control Points**
   - System fetches all control points for the selected Lo zone from API
   - Uses `centralMeridian` from Project Setup (persisted in workflow state)
   - API call: `GET /api/control-points?gauss_lo={loZone}&limit=5000`

2. **Calculate Survey Centroid**
   - Averages WGS84 coordinates from all imported survey points
   - Formula: `avgLat = Σ(lat) / n`, `avgLng = Σ(lng) / n`

3. **Filter by 20km Radius**
   - Calculates distance from survey centroid to each control point
   - Uses Haversine formula for accurate geodesic distance
   - Filters control points where `distance ≤ 20km`

4. **Auto-Select Nearby Points**
   - Automatically selects all control points within 20km
   - Updates selection state
   - Shows success message: "✓ X control points auto-selected within 20km radius!"

#### User Actions:
- **Review** auto-selected points on map
- **Add/Remove** points manually if needed
- **Save & Continue** to proceed with selection
- **Skip for Now** if they want to select later

## Implementation Details

### File Modified
**`ControlPointSelectionView.vue`**

### New State Variables
```typescript
const controlPoints = ref<any[]>([])           // Fetched control points
const isLoadingControlPoints = ref(false)      // Loading state
const autoSelectionApplied = ref(false)        // Prevent duplicate auto-selection
```

### Key Functions

#### 1. `fetchControlPoints()`
Fetches control points from API based on project's central meridian:
```typescript
async function fetchControlPoints() {
  const loZone = workflowState.projectInfo.centralMeridian
  const response = await axios.get(`${API_BASE}/control-points`, {
    params: { 
      gauss_lo: loZone,
      limit: 5000
    }
  })
  controlPoints.value = response.data.data
  
  // Trigger auto-selection if conditions met
  if (surveyCenter.value && !autoSelectionApplied.value) {
    autoSelectNearbyPoints()
  }
}
```

#### 2. `calculateDistance()`
Haversine formula for geodesic distance:
```typescript
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}
```

#### 3. `autoSelectNearbyPoints()`
Filters and auto-selects control points within 20km:
```typescript
function autoSelectNearbyPoints() {
  const RADIUS_KM = 20
  const centerLat = surveyCenter.value.lat
  const centerLng = surveyCenter.value.lng
  
  const nearbyPoints = controlPoints.value.filter(point => {
    const distance = calculateDistance(centerLat, centerLng, point.y, point.x)
    return distance <= RADIUS_KM
  })
  
  if (nearbyPoints.length > 0) {
    controlPointsSelection.value.points = nearbyPoints.map(p => p.id)
    autoSelectionApplied.value = true
    showSuccessMessage.value = true
  }
}
```

### Watchers
Monitors changes to central meridian or survey center:
```typescript
watch(
  () => [workflowState.projectInfo.centralMeridian, surveyCenter.value],
  ([newMeridian, newCenter]) => {
    if (newMeridian && newCenter) {
      fetchControlPoints()
    }
  }
)
```

### Lifecycle
```typescript
onMounted(() => {
  // Load existing selection from workflow state
  if (workflowState.projectInfo.centralMeridian) {
    controlPointsSelection.value.meridian = workflowState.projectInfo.centralMeridian
  }
  
  if (workflowState.projectInfo.controlPointIds?.length > 0) {
    controlPointsSelection.value.points = [...workflowState.projectInfo.controlPointIds]
    autoSelectionApplied.value = true // Don't auto-select if user already has a selection
  }
  
  // Fetch control points if we have a central meridian
  if (workflowState.projectInfo.centralMeridian) {
    fetchControlPoints()
  }
})
```

## Data Flow

### Persistence Chain
```
Project Setup (Step 1)
  ↓ saves
workflowState.projectInfo.centralMeridian = 31
  ↓ used by
Control Point Selection (Step 2)
  ↓ fetches
API: GET /control-points?gauss_lo=31
  ↓ filters
Points within 20km of survey centroid
  ↓ auto-selects
controlPointsSelection.value.points = [id1, id2, ...]
  ↓ saves
workflowState.projectInfo.controlPointIds = [id1, id2, ...]
  ↓ used by
Coordinate List, Area Computation, PDFs
```

## UI Feedback

### Loading State
```html
<div v-if="isLoadingControlPoints" class="bg-blue-50 border border-blue-200 rounded-lg p-3">
  <p class="text-sm text-blue-800">
    🔄 Loading control points for Lo{{ workflowState.projectInfo.centralMeridian }}...
  </p>
</div>
```

### Success Message
```html
<div v-if="showSuccessMessage" class="bg-green-50 border border-green-200 rounded-lg p-3">
  <p class="text-sm text-green-800 font-medium">
    ✓ {{ controlPointsSelection.points.length }} control points auto-selected within 20km radius!
  </p>
</div>
```

### Map Display
- **ControlPointMapView** receives `controlPoints` array (not empty anymore)
- Shows all fetched control points on map
- Pre-selected points highlighted
- User can zoom, pan, and modify selection

## Edge Cases Handled

### 1. No Central Meridian Set
```typescript
if (!loZone) {
  console.log('[ControlPointSelection] No central meridian set, skipping control point fetch')
  return
}
```

### 2. No Survey Center Available
```typescript
const surveyCenter = computed(() => {
  if (!workflowState.importedPoints || workflowState.importedPoints.length === 0) {
    return null
  }
  // Calculate centroid...
})
```
Falls back to traditional `ControlPointSelector` component.

### 3. No Points Within 20km
```typescript
if (nearbyPoints.length > 0) {
  // Auto-select
} else {
  console.log(`[ControlPointSelection] ⚠️ No control points found within 20km radius`)
}
```
User can manually select points or skip the step.

### 4. Existing Selection
```typescript
if (workflowState.projectInfo.controlPointIds?.length > 0) {
  controlPointsSelection.value.points = [...workflowState.projectInfo.controlPointIds]
  autoSelectionApplied.value = true // Don't auto-select if user already has a selection
}
```
Respects user's previous selection, doesn't override.

## Benefits

### For Users
- ✅ **Automatic** - No manual searching required
- ✅ **Intelligent** - Uses project setup data
- ✅ **Accurate** - 20km radius ensures nearby points
- ✅ **Flexible** - Can modify selection after auto-selection
- ✅ **Fast** - Instant selection on page load

### For Workflow
- ✅ **Persistent** - Uses saved central meridian from Step 1
- ✅ **Context-aware** - Uses survey centroid from CSV import
- ✅ **Consistent** - Same Lo zone throughout workflow
- ✅ **Traceable** - Detailed console logging

## Testing Procedure

### Test Case 1: New Project with CSV Import
1. Create new project
2. Select Lo 31 in Project Setup
3. Import CSV with coordinates around Zvishavane (~30.07°E, -20.32°S)
4. Navigate to Control Point Selection
5. **Expected:** 
   - Loading message appears
   - Control points fetched for Lo 31
   - Points within 20km auto-selected
   - Success message shows count
   - Map displays selected points

### Test Case 2: Existing Project with Saved Selection
1. Open project with existing control point selection
2. Navigate to Control Point Selection
3. **Expected:**
   - Previous selection loaded
   - No auto-selection (respects existing choice)
   - Map displays previously selected points

### Test Case 3: No CSV Import Yet
1. Create new project
2. Select Lo 31 in Project Setup
3. Navigate to Control Point Selection (skip CSV import)
4. **Expected:**
   - No survey center available
   - Falls back to traditional selector
   - User can manually search and select

### Test Case 4: Different Lo Zones
1. Test with Lo 25, 27, 29, 31, 33
2. Import CSV with coordinates in each zone
3. **Expected:**
   - Correct control points fetched for each zone
   - Auto-selection works for each zone
   - Points match the selected Lo zone

## Console Logs

### Successful Auto-Selection
```
[ControlPointSelection] Component mounted
[ControlPointSelection] Project ID: 51
[ControlPointSelection] Current central meridian: 31
[ControlPointSelection] Survey center: { lat: -20.32, lng: 30.07 }
[ControlPointSelection] Fetching control points for Lo31...
[ControlPointSelection] ✅ Loaded 542 control points for Lo31
[ControlPointSelection] 🎯 Auto-selecting control points within 20km of survey center...
[ControlPointSelection] Survey center: [-20.320000, 30.070000]
[ControlPointSelection] ✅ Auto-selected 8 control points within 20km
[ControlPointSelection] Selected point IDs: [123, 456, 789, ...]
```

### No Points Within Radius
```
[ControlPointSelection] 🎯 Auto-selecting control points within 20km of survey center...
[ControlPointSelection] Survey center: [-20.320000, 30.070000]
[ControlPointSelection] ⚠️ No control points found within 20km radius
```

## Future Enhancements

### Possible Improvements
1. **Configurable Radius** - Allow user to adjust 20km radius
2. **Minimum Count** - Ensure at least 3 points selected
3. **Quality Scoring** - Prioritize higher-quality control points
4. **Distance Display** - Show distance to each point in list
5. **Optimal Selection** - Use triangulation algorithm for best coverage
6. **Caching** - Cache fetched control points for faster re-selection

## Summary

**Feature:** Automatic control point selection within 20km radius
**Trigger:** CSV import + Project Setup central meridian
**Radius:** 20km from survey centroid
**Method:** Haversine distance calculation
**Fallback:** Manual selection if no auto-selection possible
**Persistence:** Uses workflow state from Project Setup
**User Control:** Can modify selection after auto-selection

**Status:** ✅ Implemented and ready for testing
