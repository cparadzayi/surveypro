# MapLibre Polygon Builder Implementation Plan
**SI 727/1979 Compliant Interactive Area Computation**

---

## 🎯 Objective

Implement interactive polygon drawing in MapLibreAreaView.vue that allows users to:
1. Click survey points to build parcels (clockwise recommended)
2. Auto-complete when starting point clicked again (QGIS-style)
3. ESC key or right-click to manually complete polygon
4. Compute areas with SI 727/1979 compliance validation
5. Display closure ratios and tolerance status
6. Save parcels to database with full geometry validation

---

## 📋 Requirements from User

### **Method 1: Auto-Complete on Starting Point**
```
User clicks:  P1 → P2 → P3 → P4 → P1 (click again)
Result:       Polygon closed, area computed, prompt for designation
```

### **Method 2: ESC Key or Right-Click**
```
User clicks:  P1 → P2 → P3 → P4
User action:  Press ESC or right-click
Result:       Polygon closed (P4 → P1), area computed, prompt for designation
```

### **Method 3: Existing Parcels**
```
If database has parcels → Load and compute areas
Use "compute once, use multiple times" principle
```

### **SI 727/1979 Compliance**
- Urban: 1:5,000 tolerance
- Peri-Urban: 1:4,000 tolerance (NEW)
- Rural: 1:3,000 tolerance (CORRECTED)
- Display closure ratio: Perimeter / Closure Error
- Color-coded PASS/FAIL status

---

## 🏗️ Architecture

### **State Management**
```typescript
// Drawing state
const isDrawing = ref(false);
const selectedPoints = ref<any[]>([]);
const currentPolygon = ref<any>(null);

// SI 727/1979 compliance
type AreaType = 'urban' | 'peri-urban' | 'rural';
const areaType = ref<AreaType>('urban');

// Parcels
interface Parcel {
  id?: number;
  designation: string;
  points: any[];
  areaResult?: AreaComputeResponse;
  geometry?: any;
}
const parcels = ref<Parcel[]>([]);
```

### **Key Functions**
```typescript
// Drawing control
function startDrawing(): void
function cancelDrawing(): void
function addPointToPolygon(point: any): void
function completePolygon(): void

// SI 727/1979 compliance
function calculateClosureRatio(parcel: Parcel): number
function validateSI727Compliance(parcel: Parcel, areaType: AreaType): ValidationResult
function getSI727Tolerance(areaType: AreaType): number

// Area computation
async function computeParcelArea(points: any[]): Promise<AreaComputeResponse>
async function saveParcel(parcel: Parcel): Promise<void>

// Event handlers
function handlePointClick(point: any): void
function handleKeyPress(e: KeyboardEvent): void
function handleRightClick(e: MouseEvent): void
```

---

## 🎨 UI Components

### **1. Drawing Toolbar**
```vue
<div class="absolute top-4 left-4 bg-white rounded-lg shadow-lg p-2 z-10">
  <!-- Area Type Selector -->
  <div class="mb-2 p-3 bg-blue-50 border border-blue-200 rounded">
    <label class="text-xs font-semibold">📋 SI 727/1979 Area Type</label>
    <div class="flex flex-col gap-1 mt-2">
      <label><input type="radio" value="urban" v-model="areaType" /> Urban (1:5,000)</label>
      <label><input type="radio" value="peri-urban" v-model="areaType" /> Peri-Urban (1:4,000)</label>
      <label><input type="radio" value="rural" v-model="areaType" /> Rural (1:3,000)</label>
    </div>
  </div>

  <!-- Drawing Controls -->
  <button @click="startDrawing" v-if="!isDrawing">✏️ Start Drawing</button>
  <button @click="completePolygon" v-if="isDrawing && selectedPoints.length >= 3">✅ Complete ({{ selectedPoints.length }} pts)</button>
  <button @click="cancelDrawing" v-if="isDrawing">❌ Cancel</button>
  <button @click="undoLastPoint" v-if="isDrawing && selectedPoints.length > 0">↩️ Undo</button>
</div>
```

### **2. Drawing Instructions Overlay**
```vue
<div v-if="isDrawing" class="absolute top-4 left-1/2 transform -translate-x-1/2 bg-yellow-600 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-pulse">
  <p class="font-medium">
    ✏️ Click survey points to build polygon. 
    {{ selectedPoints.length >= 3 ? 'Press ESC, right-click, or click starting point to complete.' : `Need ${3 - selectedPoints.length} more point(s).` }}
  </p>
</div>
```

### **3. Selected Points Display**
```vue
<div v-if="isDrawing && selectedPoints.length > 0" class="absolute top-20 right-4 bg-white rounded-lg shadow-lg p-4 max-w-xs z-10">
  <h4 class="font-semibold text-sm mb-2">Selected Points ({{ selectedPoints.length }})</h4>
  <div class="flex flex-wrap gap-1">
    <span v-for="(pt, idx) in selectedPoints" :key="idx" class="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
      {{ pt.id }}
    </span>
  </div>
</div>
```

### **4. Parcels Panel**
```vue
<div v-if="parcels.length > 0" class="absolute bottom-4 left-4 bg-white rounded-lg shadow-xl p-4 max-w-md max-h-96 overflow-auto z-10">
  <h3 class="font-semibold text-gray-900 mb-3">📦 Parcels ({{ parcels.length }})</h3>
  
  <div v-for="(parcel, idx) in parcels" :key="idx" class="mb-3 p-3 border border-gray-200 rounded-lg">
    <div class="flex justify-between items-start">
      <div class="flex-1">
        <h4 class="font-semibold">{{ parcel.designation }}</h4>
        <p class="text-xs text-gray-600">{{ parcel.points.length }} points</p>
        
        <!-- Area Result -->
        <div v-if="parcel.areaResult" class="mt-2 text-sm">
          <p class="font-semibold">{{ formatArea(parcel.areaResult.area) }}</p>
          
          <!-- SI 727/1979 Compliance -->
          <div class="mt-2 p-2 bg-gray-50 border rounded">
            <p class="text-xs font-semibold text-gray-700">📋 SI 727/1979</p>
            <p class="text-xs text-gray-600">
              Ratio: 1:{{ Math.round(calculateClosureRatio(parcel)) }}
            </p>
            <div :class="validateSI727Compliance(parcel, areaType).pass ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'" 
                 class="text-xs font-semibold px-2 py-1 rounded mt-1">
              {{ validateSI727Compliance(parcel, areaType).message }}
            </div>
          </div>
        </div>
      </div>
      
      <button @click="deleteParcel(idx)" class="text-red-600 hover:text-red-800">🗑️</button>
    </div>
  </div>
  
  <!-- Export Button -->
  <button @click="exportToDatabase" class="w-full mt-3 px-4 py-2 bg-green-600 text-white rounded-lg font-semibold">
    💾 Save All to Database
  </button>
</div>
```

---

## 🔧 Implementation Steps

### **Phase 1: Drawing Mode Foundation** (30 min)
- [x] Add drawing state variables
- [ ] Add area type selector to UI
- [ ] Implement `startDrawing()` and `cancelDrawing()`
- [ ] Add keyboard listener for ESC key
- [ ] Add right-click prevention and handler

### **Phase 2: Point Selection** (45 min)
- [ ] Modify survey peg click handler to check `isDrawing`
- [ ] Implement `addPointToPolygon(point)`
- [ ] Check if starting point clicked again (auto-complete)
- [ ] Add visual feedback (selected points, temp polygon)
- [ ] Implement `undoLastPoint()`

### **Phase 3: Polygon Completion** (30 min)
- [ ] Implement `completePolygon()`
- [ ] Show designation prompt modal
- [ ] Call `areaCompute` service with selected points
- [ ] Parse residuals (ΣdY, ΣdX, edges)
- [ ] Add parcel to local list

### **Phase 4: SI 727/1979 Compliance** (20 min)
- [ ] Implement `calculateClosureRatio(parcel)`
- [ ] Implement `getSI727Tolerance(areaType)`
- [ ] Implement `validateSI727Compliance(parcel, areaType)`
- [ ] Display compliance status in parcel card

### **Phase 5: Visual Feedback** (30 min)
- [ ] Draw temporary polygon line in MapLibre
- [ ] Highlight selected points (change color)
- [ ] Add start point marker (larger, different color)
- [ ] Show real-time polygon preview
- [ ] Add completion polygon with fill

### **Phase 6: Database Integration** (45 min)
- [ ] Implement `saveParcel()` function
- [ ] Call parcels store to save to database
- [ ] Include geometry, area, compliance status
- [ ] Handle save errors gracefully
- [ ] Refresh parcel list after save

---

## 🎯 MapLibre-Specific Considerations

### **GeoJSON Layers**
```typescript
// Drawing layer (temporary)
map.addSource('temp-polygon', {
  type: 'geojson',
  data: { type: 'FeatureCollection', features: [] }
});

map.addLayer({
  id: 'temp-polygon-line',
  type: 'line',
  source: 'temp-polygon',
  paint: {
    'line-color': '#fbbf24',
    'line-width': 3,
    'line-dasharray': [2, 2]
  }
});

// Completed parcels layer
map.addSource('parcels', {
  type: 'geojson',
  data: { type: 'FeatureCollection', features: [] }
});

map.addLayer({
  id: 'parcels-fill',
  type: 'fill',
  source: 'parcels',
  paint: {
    'fill-color': '#10b981',
    'fill-opacity': 0.2
  }
});

map.addLayer({
  id: 'parcels-outline',
  type: 'line',
  source: 'parcels',
  paint: {
    'line-color': '#047857',
    'line-width': 3
  }
});
```

### **Point Selection Detection**
```typescript
// Check if click is near a survey peg
function findNearestPoint(lngLat: [number, number], tolerance: number = 20): any | null {
  const features = map.queryRenderedFeatures(
    map.project(lngLat),
    { layers: ['survey-pegs-circle'] }
  );
  
  return features.length > 0 ? features[0].properties : null;
}
```

### **Auto-Complete Detection**
```typescript
function isStartingPoint(point: any): boolean {
  if (selectedPoints.value.length < 3) return false;
  const firstPoint = selectedPoints.value[0];
  return point.id === firstPoint.id;
}
```

---

## 📊 Data Flow

### **Point Selection → Area Computation**
```
User clicks point
  ↓
Check if drawing mode active
  ↓
Check if starting point (auto-complete)
  ↓ YES
Complete polygon
  ↓
Prompt for designation
  ↓
Call areaCompute({ points: [...], includeResiduals: true })
  ↓
Parse response (area, centroid, residuals)
  ↓
Calculate closure ratio
  ↓
Validate SI 727/1979 compliance
  ↓
Add to parcels list
  ↓
Draw completed polygon on map
```

### **Database Save**
```
User clicks "Save All"
  ↓
For each parcel:
  ↓
  Build GeoJSON geometry
  ↓
  Call parcelsStore.createParcel({
    project_id,
    parcel_number: designation,
    points: [...],
    area_m2,
    centroid,
    closure_error_m,
    closure_ratio,
    si727_compliance: pass/fail,
    area_type
  })
  ↓
  Handle response
  ↓
Show success/error notification
```

---

## 🧪 Testing Scenarios

### **Test 1: Basic Polygon Creation**
```
1. Click "Start Drawing"
2. Select points: P1, P2, P3, P4
3. Press ESC
4. Enter designation: "LOT 1"
5. Verify area computed
6. Verify SI 727/1979 status shown
```

### **Test 2: Auto-Complete**
```
1. Click "Start Drawing"
2. Select points: P1, P2, P3, P4
3. Click P1 again (starting point)
4. Verify polygon auto-completes
5. Enter designation: "LOT 2"
6. Verify results
```

### **Test 3: SI 727/1979 Compliance**
```
1. Select area type: Urban (1:5,000)
2. Create parcel with good closure (ratio > 5000)
3. Verify ✅ PASS status (green)
4. Create parcel with poor closure (ratio < 5000)
5. Verify ❌ FAIL status (red)
```

### **Test 4: Multiple Parcels**
```
1. Create 3 parcels with different area types
2. Verify all show correct compliance status
3. Click "Save All to Database"
4. Verify all saved successfully
5. Check database for records
```

---

## 📚 Code Reuse from CalculationsPart2View

Already implemented in CalculationsPart2View.vue (lines 1451-1506):

```typescript
// ✅ Reuse these functions
function calculateClosureRatio(parcel: Parcel): number
function getSI727Tolerance(areaType: AreaType): number
function validateSI727Compliance(parcel: Parcel, areaType: AreaType)
```

**Action:** Copy these functions to MapLibreAreaView or extract to shared composable.

---

## 🚀 Estimated Timeline

| Phase | Duration | Complexity |
|-------|----------|------------|
| Phase 1: Foundation | 30 min | Low |
| Phase 2: Point Selection | 45 min | Medium |
| Phase 3: Polygon Completion | 30 min | Medium |
| Phase 4: SI 727/1979 | 20 min | Low (reuse existing) |
| Phase 5: Visual Feedback | 30 min | Medium |
| Phase 6: Database Save | 45 min | Medium |
| **TOTAL** | **3.5 hours** | **Medium** |

---

## ✅ Success Criteria

- [ ] User can click survey points to build polygon
- [ ] Polygon auto-completes when starting point clicked
- [ ] ESC key completes polygon
- [ ] Right-click completes polygon
- [ ] Area computed with residuals (ΣdY, ΣdX)
- [ ] Closure ratio displayed
- [ ] SI 727/1979 compliance validated
- [ ] Color-coded PASS/FAIL status
- [ ] Parcels saved to database
- [ ] Map shows completed polygons with labels

---

## 🎯 Next Steps

1. **Create shared composable** `useAreaCompliance.ts`:
   - Extract SI 727/1979 functions
   - Make available to both CalculationsPart2View and MapLibreAreaView

2. **Enhance MapLibreAreaView**:
   - Add drawing mode state and UI
   - Implement point selection handlers
   - Add temporary polygon rendering
   - Integrate area computation service
   - Add parcels panel with compliance display

3. **Test thoroughly**:
   - All polygon creation methods
   - SI 727/1979 validation for all area types
   - Database persistence
   - Visual feedback and UX

---

**Status:** 📋 **READY TO IMPLEMENT**
