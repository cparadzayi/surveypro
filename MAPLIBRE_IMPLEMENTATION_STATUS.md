# MapLibre Polygon Builder - Implementation Status

**Date:** January 16, 2025  
**Objective:** Interactive Area Computation with SI 727/1979 Compliance  
**Target Component:** `MapLibreAreaView.vue`

---

## ✅ Completed

### **1. Shared Compliance Composable** ✅
**File:** `app-frontend/src/composables/useAreaCompliance.ts`

**Features:**
- ✅ TypeScript interfaces for `AreaType`, `Parcel`, `ComplianceValidation`
- ✅ `calculateClosureGap(parcel)` - √(ΣdY² + ΣdX²)
- ✅ `calculateClosureRatio(parcel)` - Perimeter / Closure Error
- ✅ `getSI727Tolerance(areaType)` - Returns 5000, 4000, or 3000
- ✅ `validateSI727Compliance(parcel, areaType)` - Full validation with pass/fail
- ✅ `getClosureGapStatus(parcel)` - Legacy quality indicator
- ✅ `formatArea(area)` - Display formatting (m² or ha)
- ✅ `formatCoordinate(value)` - Coordinate formatting
- ✅ `getAreaTypeLabel(areaType)` - Label with tolerance

**Benefits:**
- ✅ Reusable across **CalculationsPart2View** and **MapLibreAreaView**
- ✅ Single source of truth for SI 727/1979 logic
- ✅ Type-safe with full TypeScript support
- ✅ Already complies with regulation requirements

---

### **2. Implementation Plan** ✅
**File:** `MAPLIBRE_POLYGON_BUILDER_PLAN.md`

**Includes:**
- ✅ Detailed requirements analysis
- ✅ State management architecture
- ✅ UI component mockups
- ✅ 6-phase implementation roadmap
- ✅ MapLibre-specific GeoJSON examples
- ✅ Testing scenarios
- ✅ Estimated timeline (3.5 hours)

---

### **3. CalculationsPart2View SI 727/1979 Integration** ✅
**File:** `app-frontend/src/views/modules/cadastral-standard/CalculationsPart2View.vue`

**Already Implemented:**
- ✅ Area type selector UI (Urban/Peri-Urban/Rural)
- ✅ Closure ratio calculation
- ✅ SI 727/1979 validation functions
- ✅ Compliance status display with color coding
- ✅ Real-time validation on area computation

**Can Serve as Reference:**
This implementation can be used as a template for MapLibreAreaView enhancements.

---

## 📋 Next Steps for MapLibreAreaView

### **Phase 1: Add Drawing State (30 min)**

```typescript
// Add to MapLibreAreaView.vue <script setup>

import { ref } from 'vue';
import { areaCompute } from '../../../services/compute';
import { useAreaCompliance, type AreaType, type Parcel } from '../../../composables/useAreaCompliance';

// Use the compliance composable
const {
  calculateClosureRatio,
  validateSI727Compliance,
  getSI727Tolerance,
  formatArea,
  getAreaTypeLabel
} = useAreaCompliance();

// Drawing state
const isDrawing = ref(false);
const selectedPoints = ref<any[]>([]);
const areaType = ref<AreaType>('urban');

// Parcels
const parcels = ref<Parcel[]>([]);
const isComputing = ref(false);

// Temp drawing layers (GeoJSON)
let tempPolygonSource: maplibregl.GeoJSONSource | null = null;
let parcelsSource: maplibregl.GeoJSONSource | null = null;
```

---

### **Phase 2: Add UI Controls (45 min)**

**Update Template:**

```vue
<!-- Add after existing toolbar (around line 43) -->
<div class="absolute top-4 left-4 bg-white rounded-lg shadow-lg p-3 flex flex-col gap-2 z-10 max-w-xs">
  <!-- Existing buttons (Labels, Fit View, Trigs, Satellite) ... -->
  
  <!-- SI 727/1979 Area Type Selector -->
  <div class="border-t pt-2 mt-2">
    <label class="text-xs font-semibold text-gray-700 mb-2 block">
      📋 SI 727/1979 Area Type
    </label>
    <div class="flex flex-col gap-1">
      <label class="flex items-center text-xs cursor-pointer">
        <input type="radio" value="urban" v-model="areaType" class="mr-2" />
        Urban (1:5,000)
      </label>
      <label class="flex items-center text-xs cursor-pointer">
        <input type="radio" value="peri-urban" v-model="areaType" class="mr-2" />
        Peri-Urban (1:4,000)
      </label>
      <label class="flex items-center text-xs cursor-pointer">
        <input type="radio" value="rural" v-model="areaType" class="mr-2" />
        Rural (1:3,000)
      </label>
    </div>
  </div>
  
  <!-- Drawing Controls -->
  <div class="border-t pt-2 mt-2">
    <button
      v-if="!isDrawing"
      @click="startDrawing"
      class="w-full px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors">
      ✏️ Start Drawing
    </button>
    
    <template v-else>
      <button
        @click="completePolygon"
        :disabled="selectedPoints.length < 3"
        class="w-full px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 disabled:bg-gray-400 transition-colors">
        ✅ Complete ({{ selectedPoints.length }} pts)
      </button>
      <button
        @click="undoLastPoint"
        :disabled="selectedPoints.length === 0"
        class="w-full px-4 py-2 bg-yellow-600 text-white rounded-md text-sm font-medium hover:bg-yellow-700 disabled:bg-gray-400 transition-colors">
        ↩️ Undo Last
      </button>
      <button
        @click="cancelDrawing"
        class="w-full px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 transition-colors">
        ❌ Cancel
      </button>
    </template>
  </div>
</div>

<!-- Drawing Instructions Overlay -->
<div v-if="isDrawing" class="absolute top-4 left-1/2 transform -translate-x-1/2 bg-yellow-600 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-pulse">
  <p class="font-medium text-sm text-center">
    ✏️ Click survey points to build polygon.<br>
    {{ selectedPoints.length < 3 ? `Need ${3 - selectedPoints.length} more point(s).` : 'Click starting point again, press ESC, or right-click to complete.' }}
  </p>
</div>

<!-- Selected Points Panel -->
<div v-if="isDrawing && selectedPoints.length > 0" class="absolute top-20 right-4 bg-white rounded-lg shadow-lg p-4 max-w-xs z-10">
  <h4 class="font-semibold text-sm mb-2">Selected Points ({{ selectedPoints.length }})</h4>
  <div class="flex flex-wrap gap-1">
    <span v-for="(pt, idx) in selectedPoints" :key="idx" 
          class="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-mono">
      {{ pt.id }}
    </span>
  </div>
</div>

<!-- Parcels Panel -->
<div v-if="parcels.length > 0" class="absolute bottom-20 left-4 bg-white rounded-lg shadow-xl p-4 max-w-md max-h-96 overflow-auto z-10">
  <h3 class="font-semibold text-gray-900 mb-3">📦 Computed Parcels ({{ parcels.length }})</h3>
  
  <div v-for="(parcel, idx) in parcels" :key="idx" class="mb-3 p-3 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors">
    <div class="flex justify-between items-start mb-2">
      <div class="flex-1">
        <h4 class="font-semibold text-gray-900">{{ parcel.designation }}</h4>
        <p class="text-xs text-gray-600">{{ parcel.points.length }} points</p>
      </div>
      <button @click="deleteParcel(idx)" class="text-red-600 hover:text-red-800 text-sm">
        🗑️
      </button>
    </div>
    
    <!-- Area Result -->
    <div v-if="parcel.areaResult" class="mt-2">
      <p class="text-sm font-semibold text-gray-900">
        {{ formatArea(parcel.areaResult.area) }}
      </p>
      <p class="text-xs text-gray-600 mt-1">
        Centroid: {{ formatCoordinate(parcel.areaResult.centroid.y) }}, {{ formatCoordinate(parcel.areaResult.centroid.x) }}
      </p>
      
      <!-- SI 727/1979 Compliance -->
      <div class="mt-2 p-2 bg-gray-50 border border-gray-200 rounded">
        <p class="text-xs font-semibold text-gray-700 mb-1">📋 SI 727/1979 Regulation 13(3)</p>
        <p class="text-xs text-gray-600 mb-1">
          Closure Ratio: <span class="font-mono font-semibold">1:{{ Math.round(calculateClosureRatio(parcel)) }}</span>
        </p>
        <div :class="validateSI727Compliance(parcel, areaType).pass ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'" 
             class="text-xs font-semibold px-2 py-1 rounded">
          {{ validateSI727Compliance(parcel, areaType).message }}
        </div>
      </div>
    </div>
    
    <!-- Computing Indicator -->
    <div v-else class="mt-2 bg-blue-50 rounded p-2 text-xs text-blue-700 flex items-center">
      <div class="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-700 mr-2"></div>
      <span>Computing area...</span>
    </div>
  </div>
  
  <!-- Save All Button -->
  <button
    @click="saveAllParcels"
    class="w-full mt-3 px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors shadow-md">
    💾 Save All to Database ({{ parcels.length }})
  </button>
</div>
```

---

### **Phase 3: Implement Drawing Functions (1 hour)**

```typescript
// Add to <script setup>

/**
 * Start drawing mode
 */
function startDrawing() {
  isDrawing.value = true;
  selectedPoints.value = [];
  
  // Change cursor
  if (map) {
    map.getCanvas().style.cursor = 'crosshair';
  }
  
  console.log('[MapLibre] Drawing mode started');
}

/**
 * Cancel drawing mode
 */
function cancelDrawing() {
  isDrawing.value = false;
  selectedPoints.value = [];
  
  // Reset cursor
  if (map) {
    map.getCanvas().style.cursor = '';
  }
  
  // Clear temporary polygon
  updateTempPolygon([]);
  
  console.log('[MapLibre] Drawing mode cancelled');
}

/**
 * Handle survey peg click during drawing
 */
function handlePointClick(point: any) {
  if (!isDrawing.value) return;
  
  // Check if starting point clicked again (auto-complete)
  if (selectedPoints.value.length >= 3 && point.id === selectedPoints.value[0].id) {
    console.log('[MapLibre] Starting point clicked again - auto-completing polygon');
    completePolygon();
    return;
  }
  
  // Add point to selection
  selectedPoints.value.push(point);
  console.log(`[MapLibre] Point selected: ${point.id} (${selectedPoints.value.length} total)`);
  
  // Update temporary polygon preview
  updateTempPolygon(selectedPoints.value);
}

/**
 * Undo last selected point
 */
function undoLastPoint() {
  if (selectedPoints.value.length === 0) return;
  
  const removed = selectedPoints.value.pop();
  console.log(`[MapLibre] Removed point: ${removed?.id}`);
  
  // Update temporary polygon preview
  updateTempPolygon(selectedPoints.value);
}

/**
 * Complete polygon and compute area
 */
async function completePolygon() {
  if (selectedPoints.value.length < 3) {
    alert('Minimum 3 points required to create a polygon.');
    return;
  }
  
  // Prompt for designation
  const designation = prompt('Enter parcel designation (e.g., LOT 1, STAND 2283):');
  if (!designation || designation.trim() === '') {
    console.log('[MapLibre] Polygon completion cancelled - no designation provided');
    return;
  }
  
  console.log(`[MapLibre] Computing area for parcel: ${designation}`);
  
  // Create parcel object
  const parcel: Parcel = {
    designation: designation.trim(),
    points: [...selectedPoints.value]
  };
  
  // Add to parcels list (computing)
  parcels.value.push(parcel);
  const parcelIndex = parcels.value.length - 1;
  
  // Reset drawing state
  isDrawing.value = false;
  selectedPoints.value = [];
  updateTempPolygon([]);
  
  if (map) {
    map.getCanvas().style.cursor = '';
  }
  
  // Compute area in background
  try {
    isComputing.value = true;
    
    // Call areaCompute service
    const response = await areaCompute({
      points: parcel.points.map(p => ({ y: p.y, x: p.x })),
      includeResiduals: true,
      roundMetersDecimals: 2,
      roundHectaresDecimals: 4
    });
    
    // Update parcel with results
    parcels.value[parcelIndex].areaResult = response;
    
    console.log(`[MapLibre] ✅ Area computed for ${designation}:`, response.area);
    console.log(`[MapLibre] Closure error: ${Math.sqrt(response.residuals!.sumDy ** 2 + response.residuals!.sumDx ** 2).toFixed(3)}m`);
    
    // Add completed polygon to map
    addCompletedParcelToMap(parcels.value[parcelIndex]);
    
  } catch (error) {
    console.error('[MapLibre] ❌ Error computing area:', error);
    alert('Failed to compute area. Check console for details.');
    
    // Remove failed parcel
    parcels.value.splice(parcelIndex, 1);
  } finally {
    isComputing.value = false;
  }
}

/**
 * Update temporary polygon preview
 */
function updateTempPolygon(points: any[]) {
  if (!map || !tempPolygonSource) return;
  
  if (points.length < 2) {
    tempPolygonSource.setData({ type: 'FeatureCollection', features: [] });
    return;
  }
  
  // Transform Cape Lo coordinates to WGS84
  const wgs84Points = capeLoArrayToWGS84(points.map(p => ({
    id: p.id,
    x: p.x,
    y: p.y,
    status: p.status
  })));
  
  // Create LineString for preview
  const coordinates = wgs84Points.map(p => [p.lng, p.lat]);
  
  tempPolygonSource.setData({
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates
      },
      properties: {}
    }]
  });
}

/**
 * Add completed parcel polygon to map
 */
function addCompletedParcelToMap(parcel: Parcel) {
  if (!map || !parcelsSource) return;
  
  // Transform points to WGS84
  const wgs84Points = capeLoArrayToWGS84(parcel.points.map(p => ({
    id: p.id,
    x: p.x,
    y: p.y,
    status: p.status
  })));
  
  // Create closed polygon coordinates
  const coordinates = wgs84Points.map(p => [p.lng, p.lat]);
  coordinates.push(coordinates[0]); // Close the polygon
  
  // Get existing features
  const currentData = parcelsSource._data as any;
  const features = currentData.features || [];
  
  // Add new parcel
  features.push({
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [coordinates]
    },
    properties: {
      designation: parcel.designation,
      area: formatArea(parcel.areaResult!.area),
      closureRatio: Math.round(calculateClosureRatio(parcel)),
      compliant: validateSI727Compliance(parcel, areaType.value).pass
    }
  });
  
  parcelsSource.setData({
    type: 'FeatureCollection',
    features
  });
  
  console.log(`[MapLibre] ✅ Added parcel ${parcel.designation} to map`);
}

/**
 * Delete parcel
 */
function deleteParcel(index: number) {
  const parcel = parcels.value[index];
  if (!confirm(`Delete parcel "${parcel.designation}"?`)) return;
  
  parcels.value.splice(index, 1);
  
  // Refresh map
  refreshParcelsOnMap();
  
  console.log(`[MapLibre] Deleted parcel: ${parcel.designation}`);
}

/**
 * Refresh all parcels on map
 */
function refreshParcelsOnMap() {
  if (!map || !parcelsSource) return;
  
  const features = parcels.value
    .filter(p => p.areaResult) // Only show computed parcels
    .map(parcel => {
      const wgs84Points = capeLoArrayToWGS84(parcel.points.map(p => ({
        id: p.id,
        x: p.x,
        y: p.y,
        status: p.status
      })));
      
      const coordinates = wgs84Points.map(p => [p.lng, p.lat]);
      coordinates.push(coordinates[0]);
      
      return {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [coordinates]
        },
        properties: {
          designation: parcel.designation,
          area: formatArea(parcel.areaResult!.area),
          closureRatio: Math.round(calculateClosureRatio(parcel)),
          compliant: validateSI727Compliance(parcel, areaType.value).pass
        }
      };
    });
  
  parcelsSource.setData({
    type: 'FeatureCollection',
    features: features as any
  });
}

/**
 * Save all parcels to database
 */
async function saveAllParcels() {
  // TODO: Implement database save
  console.log('[MapLibre] Saving parcels to database:', parcels.value);
  alert(`Save functionality coming soon!\n\n${parcels.value.length} parcels ready to save.`);
}
```

---

### **Phase 4: Initialize Drawing Layers (30 min)**

```typescript
// Add to initializeMap() function after points are added

// Add temporary polygon source and layer
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

tempPolygonSource = map.getSource('temp-polygon') as maplibregl.GeoJSONSource;

// Add completed parcels source and layers
map.addSource('parcels', {
  type: 'geojson',
  data: { type: 'FeatureCollection', features: [] }
});

map.addLayer({
  id: 'parcels-fill',
  type: 'fill',
  source: 'parcels',
  paint: {
    'fill-color': [
      'case',
      ['==', ['get', 'compliant'], true],
      '#10b981',  // Green for compliant
      '#ef4444'   // Red for non-compliant
    ],
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

map.addLayer({
  id: 'parcels-labels',
  type: 'symbol',
  source: 'parcels',
  layout: {
    'text-field': ['get', 'designation'],
    'text-size': 14,
    'text-anchor': 'center'
  },
  paint: {
    'text-color': '#1f2937',
    'text-halo-color': '#ffffff',
    'text-halo-width': 2
  }
});

parcelsSource = map.getSource('parcels') as maplibregl.GeoJSONSource;

console.log('[MapLibre] ✅ Drawing layers initialized');
```

---

### **Phase 5: Update Point Click Handler (15 min)**

```typescript
// Modify existing click handler for survey-pegs-circle
// Replace the existing map.on('click', 'survey-pegs-circle', ...) with:

map.on('click', 'survey-pegs-circle', (e) => {
  if (!e.features || e.features.length === 0) return;
  const props = e.features[0].properties;
  
  // If drawing mode is active, add point to polygon
  if (isDrawing.value) {
    // Find the full point data from coordinatePoints
    const point = coordinatePoints.value.find(p => p.id === props.id);
    if (point) {
      handlePointClick(point);
    }
    return; // Don't show popup in drawing mode
  }
  
  // Otherwise, show info popup
  new maplibregl.Popup()
    .setLngLat(e.lngLat)
    .setHTML(`
      <div class="p-2">
        <h3 class="font-semibold text-gray-900">${props.id}</h3>
        <p class="text-sm text-gray-600">Status: ${props.status}</p>
        <p class="text-xs text-gray-500 mt-1">
          ${e.lngLat.lng.toFixed(6)}, ${e.lngLat.lat.toFixed(6)}
        </p>
      </div>
    `)
    .addTo(map!);
});
```

---

### **Phase 6: Add Keyboard Listeners (15 min)**

```typescript
// Add to onMounted()

// ESC key to complete polygon
window.addEventListener('keydown', handleKeyPress);

function handleKeyPress(e: KeyboardEvent) {
  if (e.key === 'Escape' && isDrawing.value) {
    if (selectedPoints.value.length >= 3) {
      completePolygon();
    } else {
      cancelDrawing();
    }
  }
}

// Add to onBeforeUnmount()
window.removeEventListener('keydown', handleKeyPress);
```

---

## 🎯 Expected Timeline

| Task | Duration | Status |
|------|----------|--------|
| Phase 1: Drawing State | 30 min | ⏳ Pending |
| Phase 2: UI Controls | 45 min | ⏳ Pending |
| Phase 3: Drawing Functions | 60 min | ⏳ Pending |
| Phase 4: Initialize Layers | 30 min | ⏳ Pending |
| Phase 5: Point Click Handler | 15 min | ⏳ Pending |
| Phase 6: Keyboard Listeners | 15 min | ⏳ Pending |
| **TOTAL** | **3.25 hours** | **0% Complete** |

---

## 📚 Reference Files

- **Shared Composable:** `app-frontend/src/composables/useAreaCompliance.ts`
- **Implementation Plan:** `MAPLIBRE_POLYGON_BUILDER_PLAN.md`
- **Target Component:** `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue`
- **Reference Implementation:** `app-frontend/src/views/modules/cadastral-standard/CalculationsPart2View.vue`
- **Area Compute Service:** `app-frontend/src/services/compute.ts`

---

## ✅ Success Criteria

- [ ] User can click "Start Drawing" to enter drawing mode
- [ ] Survey pegs are clickable in drawing mode
- [ ] Selected points are highlighted
- [ ] Temporary polygon preview updates in real-time
- [ ] Auto-complete when starting point clicked again
- [ ] ESC key completes polygon (if 3+ points)
- [ ] Area computed with SI 727/1979 validation
- [ ] Color-coded compliance status (green/red)
- [ ] Completed parcels displayed on map
- [ ] Parcels panel shows all computed parcels
- [ ] All parcels can be saved to database

---

## 🚀 Ready to Implement!

The foundation is complete. All shared functions are ready. The implementation plan is detailed. You can now proceed with the 6 phases to add interactive polygon building to MapLibreAreaView.

**Next Action:** Start with Phase 1 - Add drawing state variables to MapLibreAreaView.vue
