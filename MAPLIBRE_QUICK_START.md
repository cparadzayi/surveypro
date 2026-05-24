# MapLibre Polygon Builder - Quick Implementation Guide

## ✅ Already Complete
1. **Shared composable created:** `useAreaCompliance.ts` 
2. **Imports added to MapLibreAreaView.vue**
3. **State variables added**
4. **Duplicate function removed**

## 🎯 What's Left - 3 Main Tasks

### **Task 1: Add UI Controls to Toolbar** (15 min)
Add after existing buttons in toolbar (around line 85):

```vue
<!-- SI 727/1979 Area Type Selector -->
<div class="border-t pt-3 mt-3">
  <label class="text-xs font-semibold">📋 SI 727/1979 Area Type</label>
  <div class="flex flex-col gap-1 mt-2">
    <label class="text-xs"><input type="radio" value="urban" v-model="areaType" /> Urban (1:5,000)</label>
    <label class="text-xs"><input type="radio" value="peri-urban" v-model="areaType" /> Peri-Urban (1:4,000)</label>
    <label class="text-xs"><input type="radio" value="rural" v-model="areaType" /> Rural (1:3,000)</label>
  </div>
</div>

<!-- Drawing Controls -->
<div class="border-t pt-3 mt-3">
  <button v-if="!isDrawing" @click="startDrawing" class="w-full px-4 py-2 bg-blue-600 text-white rounded">
    ✏️ Start Drawing
  </button>
  <template v-else>
    <button @click="completePolygon" :disabled="selectedPoints.length < 3" class="w-full px-4 py-2 bg-green-600 text-white rounded mb-2">
      ✅ Complete ({{ selectedPoints.length }})
    </button>
    <button @click="undoLastPoint" class="w-full px-4 py-2 bg-yellow-600 text-white rounded mb-2">
      ↩️ Undo
    </button>
    <button @click="cancelDrawing" class="w-full px-4 py-2 bg-red-600 text-white rounded">
      ❌ Cancel
    </button>
  </template>
</div>
```

Add overlays after map container (around line 120):

```vue
<!-- Drawing Instructions -->
<div v-if="isDrawing" class="absolute top-4 left-1/2 transform -translate-x-1/2 bg-yellow-600 text-white px-6 py-3 rounded-lg z-50 animate-pulse">
  <p class="text-sm">✏️ Click points to build polygon. {{ selectedPoints.length < 3 ? `Need ${3 - selectedPoints.length} more` : 'Press ESC or click start point to complete' }}</p>
</div>

<!-- Selected Points -->
<div v-if="isDrawing && selectedPoints.length > 0" class="absolute top-24 right-4 bg-white rounded-lg shadow-lg p-4 z-10">
  <h4 class="text-sm font-semibold mb-2">Selected ({{ selectedPoints.length }})</h4>
  <div class="flex flex-wrap gap-1">
    <span v-for="(pt, i) in selectedPoints" :key="i" class="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">{{ pt.id }}</span>
  </div>
</div>

<!-- Parcels -->
<div v-if="parcels.length > 0" class="absolute bottom-20 left-4 bg-white rounded-lg shadow-xl p-4 max-w-md max-h-96 overflow-auto z-10">
  <h3 class="font-semibold mb-3">📦 Parcels ({{ parcels.length }})</h3>
  <div v-for="(p, i) in parcels" :key="i" class="mb-3 p-3 border rounded">
    <h4 class="font-semibold">{{ p.designation }}</h4>
    <p v-if="p.areaResult" class="text-sm mt-1">{{ formatArea(p.areaResult.area) }}</p>
    <div v-if="p.areaResult" class="mt-2 p-2 bg-gray-50 rounded">
      <p class="text-xs">📋 SI 727/1979</p>
      <p class="text-xs">Ratio: 1:{{ Math.round(calculateClosureRatio(p)) }}</p>
      <div :class="validateSI727Compliance(p, areaType).pass ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'" class="text-xs font-semibold px-2 py-1 rounded mt-1">
        {{ validateSI727Compliance(p, areaType).message }}
      </div>
    </div>
  </div>
  <button @click="saveAllParcels" class="w-full mt-3 px-4 py-2 bg-green-600 text-white rounded font-semibold">
    💾 Save All ({{ parcels.length }})
  </button>
</div>
```

### **Task 2: Add Drawing Functions** (30 min)
Add before `onMounted` (around line 938):

```typescript
// ============================================================================
// DRAWING FUNCTIONS
// ============================================================================

function startDrawing() {
  isDrawing.value = true;
  selectedPoints.value = [];
  if (map) map.getCanvas().style.cursor = 'crosshair';
  console.log('[MapLibre] Drawing mode started');
}

function cancelDrawing() {
  isDrawing.value = false;
  selectedPoints.value = [];
  if (map) map.getCanvas().style.cursor = '';
  updateTempPolygon([]);
  console.log('[MapLibre] Drawing cancelled');
}

function handlePointClick(point: any) {
  if (!isDrawing.value) return;
  
  // Auto-complete if starting point clicked again
  if (selectedPoints.value.length >= 3 && point.id === selectedPoints.value[0].id) {
    console.log('[MapLibre] Starting point clicked - auto-completing');
    completePolygon();
    return;
  }
  
  selectedPoints.value.push(point);
  console.log(`[MapLibre] Point selected: ${point.id} (${selectedPoints.value.length} total)`);
  updateTempPolygon(selectedPoints.value);
}

function undoLastPoint() {
  if (selectedPoints.value.length === 0) return;
  const removed = selectedPoints.value.pop();
  console.log(`[MapLibre] Removed: ${removed?.id}`);
  updateTempPolygon(selectedPoints.value);
}

async function completePolygon() {
  if (selectedPoints.value.length < 3) {
    alert('Minimum 3 points required.');
    return;
  }
  
  const designation = prompt('Enter parcel designation (e.g., LOT 1):');
  if (!designation || !designation.trim()) return;
  
  console.log(`[MapLibre] Computing area for: ${designation}`);
  
  const parcel: Parcel = {
    designation: designation.trim(),
    points: [...selectedPoints.value]
  };
  
  parcels.value.push(parcel);
  const idx = parcels.value.length - 1;
  
  isDrawing.value = false;
  selectedPoints.value = [];
  updateTempPolygon([]);
  if (map) map.getCanvas().style.cursor = '';
  
  try {
    isComputing.value = true;
    const response = await areaCompute({
      points: parcel.points.map(p => ({ y: p.y, x: p.x })),
      includeResiduals: true,
      roundMetersDecimals: 2,
      roundHectaresDecimals: 4
    });
    
    parcels.value[idx].areaResult = response;
    console.log(`[MapLibre] ✅ Area: ${formatArea(response.area)}`);
    addCompletedParcelToMap(parcels.value[idx]);
  } catch (error) {
    console.error('[MapLibre] ❌ Error:', error);
    alert('Failed to compute area');
    parcels.value.splice(idx, 1);
  } finally {
    isComputing.value = false;
  }
}

function updateTempPolygon(points: any[]) {
  if (!map || !tempPolygonSource || points.length < 2) {
    if (tempPolygonSource) tempPolygonSource.setData({ type: 'FeatureCollection', features: [] });
    return;
  }
  
  const wgs84 = capeLoArrayToWGS84(points.map(p => ({ id: p.id, x: p.x, y: p.y, status: p.status })));
  const coords = wgs84.map(p => [p.lng, p.lat]);
  
  tempPolygonSource.setData({
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords },
      properties: {}
    }]
  });
}

function addCompletedParcelToMap(parcel: Parcel) {
  if (!map || !parcelsSource || !parcel.areaResult) return;
  
  const wgs84 = capeLoArrayToWGS84(parcel.points.map(p => ({ id: p.id, x: p.x, y: p.y, status: p.status })));
  const coords = wgs84.map(p => [p.lng, p.lat]);
  coords.push(coords[0]); // Close polygon
  
  const currentData = parcelsSource._data as any;
  const features = currentData.features || [];
  
  features.push({
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [coords] },
    properties: {
      designation: parcel.designation,
      compliant: validateSI727Compliance(parcel, areaType.value).pass
    }
  });
  
  parcelsSource.setData({ type: 'FeatureCollection', features });
}

function saveAllParcels() {
  console.log('[MapLibre] Save to database:', parcels.value);
  alert(`Coming soon!\n${parcels.value.length} parcels ready.`);
}

function handleKeyPress(e: KeyboardEvent) {
  if (e.key === 'Escape' && isDrawing.value) {
    if (selectedPoints.value.length >= 3) completePolygon();
    else cancelDrawing();
  }
}
```

### **Task 3: Initialize Layers & Update Click Handler** (20 min)

In `initializeMap()` after `addSurveyPoints()` call (around line 440):

```typescript
// Add drawing layers
map.addSource('temp-polygon', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
map.addLayer({ id: 'temp-polygon-line', type: 'line', source: 'temp-polygon', paint: { 'line-color': '#fbbf24', 'line-width': 3, 'line-dasharray': [2, 2] } });
tempPolygonSource = map.getSource('temp-polygon') as maplibregl.GeoJSONSource;

map.addSource('parcels', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
map.addLayer({ id: 'parcels-fill', type: 'fill', source: 'parcels', paint: { 'fill-color': ['case', ['get', 'compliant'], '#10b981', '#ef4444'], 'fill-opacity': 0.2 } });
map.addLayer({ id: 'parcels-outline', type: 'line', source: 'parcels', paint: { 'line-color': '#047857', 'line-width': 3 } });
parcelsSource = map.getSource('parcels') as maplibregl.GeoJSONSource;

console.log('[MapLibre] ✅ Drawing layers initialized');
```

Update survey peg click handler (around line 791):

```typescript
// REPLACE existing map.on('click', 'survey-pegs-circle', ...) with:
map.on('click', 'survey-pegs-circle', (e) => {
  if (!e.features || e.features.length === 0) return;
  const props = e.features[0].properties;
  
  // Drawing mode - add point
  if (isDrawing.value) {
    const point = coordinatePoints.value.find(p => p.id === props.id);
    if (point) handlePointClick(point);
    return;
  }
  
  // Normal mode - show popup
  new maplibregl.Popup()
    .setLngLat(e.lngLat)
    .setHTML(`<div class="p-2"><h3 class="font-semibold">${props.id}</h3></div>`)
    .addTo(map!);
});
```

In `onMounted()` add:

```typescript
window.addEventListener('keydown', handleKeyPress);
```

In `onBeforeUnmount()` add:

```typescript
window.removeEventListener('keydown', handleKeyPress);
```

## ✅ Done!

**Test it:**
1. Click "Start Drawing"
2. Click survey pegs (3+)
3. Press ESC or click starting point
4. Enter designation
5. See area + SI 727/1979 compliance!

**Total time:** ~1 hour
