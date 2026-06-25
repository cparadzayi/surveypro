<!-- ⚠️ DEPRECATED: This Leaflet-based component has been replaced by MapLibreAreaView.vue
       This file is kept for reference only and is no longer used in the cadastral workflow.
       See: AREA_COMPUTATION_DEPRECATION.md for migration details -->
<template>
  <div class="h-full flex flex-col bg-white">
    <!-- DEPRECATION WARNING BANNER -->
    <div class="bg-yellow-50 border-b-4 border-yellow-400 p-4">
      <div class="flex items-center">
        <div class="flex-shrink-0">
          <svg class="h-6 w-6 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div class="ml-3">
          <h3 class="text-sm font-medium text-yellow-800">
            ⚠️ DEPRECATED COMPONENT - This Leaflet version is no longer maintained
          </h3>
          <div class="mt-2 text-sm text-yellow-700">
            <p>This component has been replaced by <strong>MapLibreAreaView.vue</strong> which provides:</p>
            <ul class="list-disc list-inside mt-1">
              <li>Better performance with large datasets</li>
              <li>Satellite imagery overlay</li>
              <li>Built-in collision detection for labels</li>
              <li>Professional cadastral symbols (SGO standards)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
    
    <div class="flex-shrink-0 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-blue-800 text-white p-6">
      <div class="max-w-7xl mx-auto">
        <div class="flex-1">
          <div class="flex items-center gap-4 mb-2">
            <h2 class="text-2xl font-bold">📐 Land Parcel Area Computation (DEPRECATED)</h2>
            <!-- Viewer Toggle - DISABLED -->
            <div class="flex items-center gap-2 bg-blue-700 rounded-lg p-1 opacity-50 cursor-not-allowed">
              <button
                disabled
                class="px-3 py-1.5 rounded-md text-sm font-medium bg-white text-blue-900 shadow-sm">
                📍 Leaflet (Deprecated)
              </button>
              <button
                disabled
                class="px-3 py-1.5 rounded-md text-sm font-medium text-gray-400 cursor-not-allowed">
                🛰️ MapLibre
              </button>
            </div>
          </div>
          <p class="text-blue-100">⚠️ This component is deprecated. Use MapLibreAreaView instead.</p>
        </div>
        <div class="flex gap-3">
          <button
            @click="saveAllParcels"
            :disabled="!canSave"
            class="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all font-medium shadow-md">
            💾 Save to Database
          </button>
          <button
            @click="exportReport"
            :disabled="!allParcelsComputed"
            class="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all font-medium shadow-md">
            📄 Export PDF
          </button>
        </div>
      </div>
    </div>

    <!-- Statistics Cards -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div class="bg-white shadow-md rounded-lg p-4 border-l-4 border-blue-500">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-gray-600 text-sm font-medium">Survey Points</p>
            <p class="text-3xl font-bold text-blue-600">{{ coordinatePoints.length }}</p>
          </div>
          <div class="text-blue-500 text-4xl">📍</div>
        </div>
      </div>
      
      <div class="bg-white shadow-md rounded-lg p-4 border-l-4 border-green-500">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-gray-600 text-sm font-medium">Defined Parcels</p>
            <p class="text-3xl font-bold text-green-600">{{ totalParcels }}</p>
          </div>
          <div class="text-green-500 text-4xl">🏠</div>
        </div>
      </div>
      
      <div class="bg-white shadow-md rounded-lg p-4 border-l-4 border-purple-500">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-gray-600 text-sm font-medium">Total Area</p>
            <p class="text-xl font-bold text-purple-600">{{ formatTotalArea }}</p>
          </div>
          <div class="text-purple-500 text-4xl">📏</div>
        </div>
      </div>
      
      <div class="bg-white shadow-md rounded-lg p-4 border-l-4 border-orange-500">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-gray-600 text-sm font-medium">Projection</p>
            <p class="text-xl font-bold text-orange-600">Lo {{ centralMeridian }}°</p>
          </div>
          <div class="text-orange-500 text-4xl">🌍</div>
        </div>
      </div>
    </div>

    <!-- Interactive Map -->
    <div class="bg-white shadow-lg rounded-lg overflow-hidden">
      <div class="bg-gray-50 border-b border-gray-200 px-6 py-4">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900">🗺️ Interactive Map (QGIS-Style)</h3>
          
          <!-- Toolbar -->
          <div class="flex items-center gap-2">
            <button
              @click="startDrawing"
              :class="['px-4 py-2 rounded-lg font-medium transition-all', isDrawing ? 'bg-yellow-600 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200']">
              ✏️ {{ isDrawing ? 'Drawing...' : 'Draw Polygon' }}
            </button>
            <button
              v-if="isDrawing"
              @click="cancelDrawing"
              class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-all">
              ❌ Cancel
            </button>
            <button
              @click="toggleLabels"
              :class="['px-4 py-2 rounded-lg font-medium transition-all', showLabels ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200']">
              🏷️ Labels
            </button>
            <button
              @click="fitMapToPoints"
              class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition-all">
              🎯 Fit View
            </button>
            <button
              @click="clearAll"
              :disabled="totalParcels === 0"
              class="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 disabled:bg-gray-100 disabled:text-gray-400 font-medium transition-all">
              🗑️ Clear All
            </button>
          </div>
        </div>
      </div>
      
      <div class="relative" style="height: 600px;">
        <div ref="mapContainer" style="width: 100%; height: 100%;"></div>
        
        <!-- Drawing Instructions -->
        <div v-if="isDrawing" class="absolute top-4 left-1/2 transform -translate-x-1/2 bg-yellow-600 text-white rounded-lg shadow-lg px-6 py-3 animate-pulse z-[1000]">
          <p class="font-medium">✏️ Click on points to build polygon. Press ESC or click Cancel when done.</p>
        </div>
        
        <!-- Map Legend -->
        <div class="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-4 border border-gray-300 z-[1000]">
          <h4 class="font-semibold text-gray-900 mb-2 text-sm">Legend</h4>
          <div class="space-y-2 text-xs">
            <div class="flex items-center gap-2">
              <div class="w-3 h-3 rounded-full bg-blue-600"></div>
              <span class="text-gray-700">Survey Points</span>
            </div>
            <div class="flex items-center gap-2">
              <div class="w-3 h-3 bg-green-500 border-2 border-green-700"></div>
              <span class="text-gray-700">Completed Parcels</span>
            </div>
            <div class="flex items-center gap-2">
              <div class="w-3 h-3 bg-yellow-300 border-2 border-yellow-600"></div>
              <span class="text-gray-700">Drawing Mode</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Quick Parcel Builder -->
    <div class="bg-white shadow-lg rounded-lg p-6">
      <h3 class="text-lg font-semibold text-gray-900 mb-4">⚡ Quick Parcel Builder</h3>
      <p class="text-sm text-gray-600 mb-4">Alternatively, search and select points manually to build a parcel.</p>
      
      <div class="flex gap-2 mb-4">
        <input
          v-model="searchQuery"
          @input="filterPoints"
          type="text"
          placeholder="Search point by name (e.g., ST1, 2283A)..."
          class="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
        <button
          @click="clearSelection"
          :disabled="selectedPoints.length === 0"
          class="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all font-medium">
          Clear
        </button>
      </div>

      <!-- Search Results -->
      <div v-if="filteredPoints.length > 0 && searchQuery" class="mb-4 border border-gray-200 rounded-lg max-h-48 overflow-auto shadow-sm">
        <button
          v-for="point in filteredPoints.slice(0, 10)"
          :key="point.id"
          @click="addToSelection(point)"
          class="w-full px-4 py-3 text-left hover:bg-blue-50 text-sm border-b last:border-b-0 transition-colors">
          <span class="font-semibold text-gray-900">{{ point.id }}</span>
          <span class="text-gray-500 ml-3">Y: {{ point.y.toFixed(3) }}, X: {{ point.x.toFixed(3) }}</span>
        </button>
      </div>

      <!-- Selected Points -->
      <div v-if="selectedPoints.length > 0" class="space-y-4">
        <div class="bg-gray-50 rounded-lg p-4">
          <h4 class="font-medium text-gray-900 mb-2">Selected Points ({{ selectedPoints.length }})</h4>
          <div class="flex flex-wrap gap-2">
            <span
              v-for="(point, idx) in selectedPoints"
              :key="idx"
              class="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
              {{ point.id }}
              <button @click="removeFromSelection(idx)" class="hover:text-blue-900">×</button>
            </span>
          </div>
        </div>

        <div class="flex gap-3">
          <input
            v-model="parcelDesignation"
            type="text"
            placeholder="Enter parcel designation (e.g., LOT 1, STAND 2283)"
            class="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 font-medium" />
          <button
            @click="saveManualParcel"
            :disabled="!canSaveManual"
            class="px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all font-semibold shadow-md">
            💾 Save Parcel
          </button>
        </div>
        <p class="text-xs text-gray-500">
          ℹ️ Minimum 3 points required. {{ selectedPoints.length }} selected.
        </p>
      </div>
    </div>

    <!-- Parcels List -->
    <div v-if="totalParcels > 0" class="bg-white shadow-lg rounded-lg p-6">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h3 class="text-lg font-semibold text-gray-900">📋 Defined Land Parcels ({{ totalParcels }})</h3>
          <p class="text-sm text-gray-600 mt-1">
            {{ computedParcelsCount }} of {{ totalParcels }} areas computed
            <span v-if="allParcelsComputed" class="text-green-600 font-medium ml-2">✓ All complete</span>
          </p>
        </div>
      </div>

      <div class="space-y-4">
        <div
          v-for="(parcel, index) in parcels"
          :key="index"
          class="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
          <div class="flex justify-between items-start mb-3">
            <div class="flex-1">
              <h4 class="font-semibold text-gray-900 text-lg">{{ parcel.designation }}</h4>
              <p class="text-sm text-gray-600">{{ parcel.points.length }} boundary points: {{ parcel.points.map(p => p.id).join(', ') }}</p>
            </div>
            <div class="flex gap-2">
              <button
                @click="zoomToParcel(index)"
                class="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 font-medium transition-colors">
                🔍 Zoom
              </button>
              <button
                @click="removeParcel(index)"
                class="px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 font-medium transition-colors">
                🗑️ Delete
              </button>
            </div>
          </div>
          
          <!-- Computing Indicator -->
          <div v-if="!parcel.areaResult" class="mt-3 bg-blue-50 rounded-lg p-3 text-sm">
            <div class="flex items-center text-blue-700">
              <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-700 mr-2"></div>
              <span>Computing area...</span>
            </div>
          </div>
          
          <!-- Area Results -->
          <div v-else class="mt-3 space-y-2">
            <div class="bg-green-50 rounded-lg p-3">
              <div class="text-green-800 font-semibold flex items-center gap-2">
                <span>✓</span>
                <span>Area: {{ formatArea(parcel.areaResult) }}</span>
              </div>
              <div class="text-gray-700 text-xs mt-2 space-y-1">
                <div>Centroid: Y={{ parcel.areaResult.centroid.y.toFixed(3) }}, X={{ parcel.areaResult.centroid.x.toFixed(3) }}</div>
              </div>
            </div>
            
            <!-- Closure Analysis -->
            <div v-if="parcel.areaResult.residuals" class="bg-gray-50 rounded-lg p-3 text-xs">
              <div class="font-semibold text-gray-700 mb-1">📊 Traverse Closure</div>
              <div class="space-y-1 text-gray-600">
                <div>Residuals: ΣdY={{ parcel.areaResult.residuals.sumDy.toFixed(3) }}m, ΣdX={{ parcel.areaResult.residuals.sumDx.toFixed(3) }}m</div>
                <div :class="getClosureClass(parcel)" class="font-semibold">
                  {{ getClosureIcon(parcel) }} Closure Error: {{ getClosureError(parcel).toFixed(3) }}m ({{ getClosureQuality(parcel) }})
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
      <div class="text-gray-400 text-6xl mb-4">📐</div>
      <h3 class="text-xl font-semibold text-gray-700 mb-2">No Parcels Defined Yet</h3>
      <p class="text-gray-600 mb-6">Start by drawing polygons on the map or using the Quick Parcel Builder.</p>
      <button
        @click="startDrawing"
        class="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold shadow-md transition-all">
        ✏️ Start Drawing Parcels
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, inject, nextTick, watch } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import proj4 from 'proj4';
import 'proj4leaflet';
import type { CadastralWorkflowState } from '../../../types/cadastral';
import { usePolygonDrawing } from '../../../composables/usePolygonDrawing';
import { useParcelManagement, type ParcelPoint } from '../../../composables/useParcelManagement';
import { coordinateTransform } from '../../../services/coordinateTransform';

// Inject workflow state
const workflowState = inject<CadastralWorkflowState>('workflowState');

// Emit events
const emit = defineEmits<{
  (e: 'switch-viewer', viewer: 'leaflet' | 'maplibre'): void;
}>();

// Map references
const mapContainer = ref<HTMLDivElement | null>(null);
const mapRef = ref<L.Map | null>(null);
let pointMarkersLayer: L.LayerGroup | null = null;
let polygonsLayer: L.LayerGroup | null = null;

// Parcel management
const {
  parcels,
  totalParcels,
  computedParcelsCount,
  totalArea,
  totalAreaHa,
  allParcelsComputed,
  addParcel,
  deleteParcel,
  clearAllParcels,
  findMatchingPoints
} = useParcelManagement();

// Drawing
const {
  isDrawing,
  drawingPoints,
  startDrawing: startDrawMode,
  addPoint,
  finishDrawing: finishDrawMode,
  cancelDrawing: cancelDrawMode
} = usePolygonDrawing({
  map: mapRef,
  onPolygonComplete: handlePolygonComplete
});

// State
const centralMeridian = ref(31);
const searchQuery = ref('');
const filteredPoints = ref<ParcelPoint[]>([]);
const selectedPoints = ref<ParcelPoint[]>([]);
const parcelDesignation = ref('');
const showLabels = ref(true);
const currentZoom = ref(0);
const labelBounds = ref<Array<{ minX: number; maxX: number; minY: number; maxY: number; pointId: string }>>([]);

// Computed
const coordinatePoints = computed(() => {
  if (!workflowState?.adjustedCoordinates) return [];
  return workflowState.adjustedCoordinates.map((pt: any) => ({
    id: pt.pointId || pt.point_id || pt.id || 'Unknown',
    y: pt.y,
    x: pt.x,
    status: pt.status || ''
  }));
});

const canSaveManual = computed(() =>
  selectedPoints.value.length >= 3 && parcelDesignation.value.trim() !== ''
);

const canSave = computed(() => totalParcels.value > 0);

const formatTotalArea = computed(() => {
  if (totalArea.value === 0) return '0 m²';
  if (totalArea.value >= 10000) return `${totalAreaHa.value.toFixed(4)} ha`;
  return `${totalArea.value.toFixed(2)} m²`;
});

// Lifecycle
onMounted(async () => {
  if (workflowState?.projectInfo?.centralMeridian) {
    centralMeridian.value = workflowState.projectInfo.centralMeridian;
  }
  
  await nextTick();
  initializeMap();
});

// Watch for label toggle and zoom changes
watch(showLabels, () => {
  renderPoints();
});

watch(currentZoom, () => {
  if (showLabels.value) {
    renderPoints();
  }
});

// Map functions
function initializeMap() {
  if (!mapContainer.value) return;
  
  const sridMap: Record<number, number> = {
    25: 22285, 27: 22287, 29: 22289, 31: 22291, 33: 22293
  };
  const srid = sridMap[centralMeridian.value] || 22291;
  
  // CRITICAL: Use L.CRS.Simple instead of Proj4 CRS to avoid inverse transformation errors
  // Cape Lo projected coordinates are too large for Proj4 inverse transformations
  console.log(`[AreaComputation] 🔧 Using L.CRS.Simple for SRID: ${srid} (avoiding Proj4 issues)`);
  
  const crs = L.CRS.Simple;
  
  // For L.CRS.Simple: Use raw coordinates with simple negation
  let initialCenter: [number, number] = [0, 0];
  let dataSpread = 0;
  
  if (coordinatePoints.value.length > 0) {
    // Calculate average - L.CRS.Simple uses [y, x] directly
    const avgX = coordinatePoints.value.reduce((sum, p) => sum + p.x, 0) / coordinatePoints.value.length;
    const avgY = coordinatePoints.value.reduce((sum, p) => sum + p.y, 0) / coordinatePoints.value.length;
    
    // Calculate data spread for dynamic zoom range
    const xCoords = coordinatePoints.value.map(p => p.x);
    const yCoords = coordinatePoints.value.map(p => p.y);
    const xSpread = Math.max(...xCoords) - Math.min(...xCoords);
    const ySpread = Math.max(...yCoords) - Math.min(...yCoords);
    dataSpread = Math.max(xSpread, ySpread);
    
    // For L.CRS.Simple: [lat, lng] = [X, Y] (no negation needed - Simple CRS handles it)
    initialCenter = [avgX, avgY];
    console.log(`[AreaComputation] 📍 Calculated initial center from ${coordinatePoints.value.length} points: P(Y=${avgY.toFixed(0)}, X=${avgX.toFixed(0)}) → [${avgX.toFixed(0)}, ${avgY.toFixed(0)}]`);
    console.log(`[AreaComputation] 📏 Data spread: ${dataSpread.toFixed(2)}m`);
  } else {
    console.warn('[AreaComputation] ⚠️ No coordinate points available, using [0,0]');
  }
  
  // Dynamic zoom calculation based on data spread
  // L.CRS.Simple formula: zoom = log2(pixels / (coordinates × 256))
  const mapContainerWidth = 800; // Typical map container width in pixels
  
  // Fallback for no data or single point
  const effectiveDataSpread = Math.max(dataSpread, 100); // Minimum 100m view
  
  // minZoom: Show all data with 10x margin (allow zooming way out)
  const minZoomSpread = Math.max(effectiveDataSpread * 10, 1000); // At least 1km view
  const minZoom = Math.floor(Math.log2(mapContainerWidth / (minZoomSpread * 256)));
  
  // maxZoom: Allow zooming to see ~10m detail clearly (for individual points)
  const maxZoomDetail = 10; // 10 meters
  const maxZoom = Math.ceil(Math.log2(mapContainerWidth / (maxZoomDetail * 256)));
  
  // Initial zoom: Show all data with 30% padding
  const initialZoomSpread = effectiveDataSpread * 1.3;
  const initialZoom = Math.log2(mapContainerWidth / (initialZoomSpread * 256));
  
  console.log(`[AreaComputation] 🔍 Dynamic zoom calculation:`);
  console.log(`  - Data spread: ${effectiveDataSpread.toFixed(0)}m`);
  console.log(`  - Min zoom: ${minZoom} (shows ${minZoomSpread.toFixed(0)}m)`);
  console.log(`  - Initial zoom: ${initialZoom.toFixed(2)} (shows ${initialZoomSpread.toFixed(0)}m)`);
  console.log(`  - Max zoom: ${maxZoom} (shows ~${maxZoomDetail}m detail)`);
  
  mapRef.value = L.map(mapContainer.value, {
    crs: crs,
    center: initialCenter,  // ✅ Data-driven center
    zoom: initialZoom,      // ✅ Dynamic initial zoom based on data spread
    minZoom: minZoom,       // ✅ Dynamic min zoom (10x data spread)
    maxZoom: maxZoom,       // ✅ Dynamic max zoom (~10m detail)
    zoomControl: true,
    attributionControl: false,
    scrollWheelZoom: true,  // ✅ Enable scroll wheel zoom
    doubleClickZoom: true,  // ✅ Enable double-click zoom
    boxZoom: true,          // ✅ Enable box zoom (shift+drag)
    keyboard: true,         // ✅ Enable keyboard navigation
    dragging: true,         // ✅ Enable map dragging
    zoomSnap: 0.5,
    zoomDelta: 0.5,
    fadeAnimation: false,   // ✅ Disable fade animation
    zoomAnimation: false,   // ✅ Disable zoom animation
    markerZoomAnimation: false  // ✅ Disable marker zoom animation
  });
  
  // White background
  L.rectangle([[-10000000, -10000000], [10000000, 10000000]], {
    fillColor: '#ffffff',
    fillOpacity: 1,
    stroke: false,
    interactive: false
  }).addTo(mapRef.value);
  
  // Initialize layers
  pointMarkersLayer = L.layerGroup().addTo(mapRef.value);
  polygonsLayer = L.layerGroup().addTo(mapRef.value);
  
  // Initial render
  renderPoints();
  
  // CRITICAL: Fit map to points immediately to show them at proper zoom
  // Small delay ensures layers are fully initialized
  setTimeout(() => {
    fitMapToPoints();
  }, 50);
  
  // Add zoom event listener for adaptive labeling
  mapRef.value.on('zoomend', () => {
    if (showLabels.value) {
      renderPoints();
    }
  });
  
  // ESC to cancel drawing
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isDrawing.value) {
      cancelDrawing();
    }
  });
  
  // Note: Point-specific click handlers are added in renderPoints()
  // This ensures only survey points are selectable for digitizing
}

function createCapeLoCRS(srid: number): any {
  const cmMap: Record<number, number> = {
    22285: 25, 22287: 27, 22289: 29, 22291: 31, 22293: 33
  };
  const cm = cmMap[srid] || 31;
  
  // CRITICAL: Use +axis=wsu for Cape Lo South-Orientated system
  // wsu = Westing, Southing, Up (Y=Westing, X=Southing)
  const proj4def = `+proj=tmerc +axis=wsu +lat_0=0 +lon_0=${cm} +k=1 +x_0=0 +y_0=0 +ellps=clrk80 +towgs84=-136,-108,-292,0,0,0,0 +units=m +no_defs`;
  
  console.log(`[AreaComputation] 🌍 Creating CRS for EPSG:${srid} with +axis=wsu`);
  console.log(`[AreaComputation] 📐 Proj4 def: ${proj4def}`);
  
  return new (L as any).Proj.CRS(`EPSG:${srid}`, proj4def, {
    resolutions: [8192, 4096, 2048, 1024, 512, 256, 128, 64, 32, 16, 8, 4, 2, 1, 0.5, 0.25],
    origin: [0, 0],
    bounds: (L as any).bounds([-5000000, -5000000], [5000000, 5000000])
  });
}

function renderPoints() {
  if (!pointMarkersLayer) return;
  
  pointMarkersLayer.clearLayers();
  
  if (coordinatePoints.value.length === 0) {
    console.warn('[AreaComputation] No points to render');
    return;
  }
  
  console.log('[AreaComputation] 🎨 Rendering points with L.CRS.Simple:');
  
  // Reset label bounds for collision detection
  labelBounds.value = [];
  
  // Calculate adaptive label visibility based on zoom and density
  const zoom = mapRef.value?.getZoom() || 0;
  currentZoom.value = zoom;
  
  // Determine label visibility strategy based on zoom level
  const shouldShowAllLabels = zoom > -2; // Show all labels when zoomed in
  const labelSpacing = Math.max(50, 150 - (zoom * 20)); // Adaptive spacing based on zoom
  
  coordinatePoints.value.forEach((point, index) => {
    // For L.CRS.Simple: use raw coordinates [X, Y]
    const lat = point.x;
    const lng = point.y;
    
    // Log first 3 points for debugging
    if (index < 3) {
      console.log(`  Point ${index + 1} (${point.id}):  P(Y=${point.y}, X=${point.x}) → Display [${lat}, ${lng}]`);
    }
    
    const marker = L.circleMarker([lat, lng], {
      radius: 12,  // ✅ Larger radius for better visibility
      fillColor: '#3b82f6',
      color: '#1e40af',
      weight: 3,  // ✅ Thicker border
      opacity: 1,
      fillOpacity: 0.9,  // ✅ More opaque
      // Make marker clickable for digitizing
      interactive: true,
      bubblingMouseEvents: false  // Prevent event propagation
    });
    
    // Adaptive labeling: check for collisions and zoom level
    let shouldShowLabel = showLabels.value;
    
    if (showLabels.value && !shouldShowAllLabels) {
      // Check for label collision with existing labels
      const hasCollision = labelBounds.value.some(bound => {
        const distX = Math.abs(bound.minX - lng);
        const distY = Math.abs(bound.minY - lat);
        return distX < labelSpacing && distY < labelSpacing;
      });
      
      shouldShowLabel = !hasCollision;
      
      // If showing this label, add its bounds
      if (shouldShowLabel) {
        labelBounds.value.push({
          minX: lng,
          maxX: lng,
          minY: lat,
          maxY: lat,
          pointId: point.id
        });
      }
    }
    
    // Bind tooltip with adaptive visibility
    marker.bindTooltip(point.id, {
      permanent: shouldShowLabel,
      direction: 'top',
      offset: [0, -15],
      className: 'bg-white px-2 py-1 rounded shadow-md text-xs font-semibold border border-gray-300'
    });
    
    // CRITICAL: Add click handler to marker for digitizing
    // Uses exact point coordinates (centroid of circle marker) as vertex
    marker.on('click', (e: L.LeafletMouseEvent) => {
      if (isDrawing.value) {
        // Stop event from bubbling to map
        L.DomEvent.stopPropagation(e);
        
        // Use exact point coordinates from the data (centroid of marker)
        const exactCoords = L.latLng(lat, lng);
        addPoint(exactCoords);
        
        console.log(`[AreaComputation] 📍 Selected point ${point.id} at P(Y=${point.y}, X=${point.x})`);
      }
    });
    
    // Visual feedback when hovering over selectable points in draw mode
    marker.on('mouseover', () => {
      if (isDrawing.value) {
        // Change cursor
        if (marker.getElement()) {
          (marker.getElement() as HTMLElement).style.cursor = 'pointer';
        }
        // Highlight marker
        marker.setStyle({
          fillColor: '#10b981',  // Green when hoverable
          color: '#047857',
          weight: 4,
          radius: 14
        });
      }
    });
    
    marker.on('mouseout', () => {
      if (isDrawing.value) {
        // Reset to default style
        marker.setStyle({
          fillColor: '#3b82f6',
          color: '#1e40af',
          weight: 3,
          radius: 12
        });
      }
    });
    
    marker.addTo(pointMarkersLayer!);
  });
  
  console.log(`[AreaComputation] ✅ Rendered ${coordinatePoints.value.length} points using L.CRS.Simple`);
  
  // Log current map state for debugging
  if (mapRef.value) {
    console.log(`[AreaComputation] 📊 Current map state - Zoom: ${mapRef.value.getZoom()}`);
  }
}

function fitMapToPoints() {
  if (!mapRef.value || coordinatePoints.value.length === 0) {
    console.warn('[AreaComputation] Cannot fit map: no map or no points');
    return;
  }
  
  console.log(`[AreaComputation] 🎯 Fitting map to ${coordinatePoints.value.length} points...`);
  console.log('[AreaComputation] Sample raw coordinate:', coordinatePoints.value[0]);
  
  // For L.CRS.Simple: use raw coordinates directly [X, Y]
  const transformedPoints = coordinatePoints.value.map(point => 
    L.latLng(point.x, point.y)
  );
  
  console.log('[AreaComputation] ✅ Using', transformedPoints.length, 'points for bounds');
  console.log('[AreaComputation] Sample point:', transformedPoints[0]);
  console.log('[AreaComputation] X coords range:', 
    Math.min(...coordinatePoints.value.map(p => p.x)).toFixed(0), 'to',
    Math.max(...coordinatePoints.value.map(p => p.x)).toFixed(0));
  console.log('[AreaComputation] Y coords range:', 
    Math.min(...coordinatePoints.value.map(p => p.y)).toFixed(0), 'to',
    Math.max(...coordinatePoints.value.map(p => p.y)).toFixed(0));
  
  // Create bounds from coordinates
  const bounds = L.latLngBounds(transformedPoints);
  
  const boundsInfo = {
    north: bounds.getNorth(),
    south: bounds.getSouth(),
    east: bounds.getEast(),
    west: bounds.getWest(),
    center: bounds.getCenter()
  };
  console.log('[AreaComputation] Bounds:', boundsInfo);
  console.log('[AreaComputation] Bounds size (width × height):', 
    Math.abs(boundsInfo.east - boundsInfo.west).toFixed(2), '×', 
    Math.abs(boundsInfo.north - boundsInfo.south).toFixed(2), 'meters');
  
  // CRITICAL FIX: For L.CRS.Simple, calculate zoom based on map container size
  // L.CRS.Simple zoom formula: pixels = coordinates × 256 × 2^zoom
  // We want the data to fit in the map container (typically 800x600 pixels)
  try {
    // Calculate center from bounds
    const avgLat = (bounds.getNorth() + bounds.getSouth()) / 2;
    const avgLng = (bounds.getEast() + bounds.getWest()) / 2;
    const center = L.latLng(avgLat, avgLng);
    
    // Calculate data spread
    const boundsWidth = Math.abs(bounds.getEast() - bounds.getWest());
    const boundsHeight = Math.abs(bounds.getNorth() - bounds.getSouth());
    const maxDimension = Math.max(boundsWidth, boundsHeight);
    
    // For L.CRS.Simple: zoom calculation to show points clearly separated
    // Formula: 2^zoom = (pixels / (coordinates × 256))
    // For 1267m spread, we want each ~100m to be ~50 pixels for clear separation
    // This means: 1267m should span ~634 pixels → zoom = log2(634 / (1267 × 256))
    // But we want to zoom in MORE to see points clearly, so use smaller target
    const targetPixels = 800; // Larger target = higher zoom = more detail
    const zoom = Math.log2(targetPixels / (maxDimension * 256));
    
    console.log(`[AreaComputation] 📐 Data spread: ${maxDimension.toFixed(0)}m, calculated zoom: ${zoom.toFixed(2)}`);
    console.log(`[AreaComputation] 📍 Setting view to center:`, center);
    
    // Use setView with calculated zoom
    mapRef.value.setView(center, zoom, { animate: false });
    
    console.log(`[AreaComputation] ✅ Map view set successfully (zoom: ${zoom.toFixed(2)})`);
    
  } catch (error) {
    console.error('[AreaComputation] ❌ Error setting map view:', error);
  }
}

// Drawing functions
function startDrawing() {
  startDrawMode();
}

function cancelDrawing() {
  cancelDrawMode();
  selectedPoints.value = [];
}

async function handlePolygonComplete(points: L.LatLng[]) {
  if (points.length < 3) {
    alert('Minimum 3 points required.');
    return;
  }
  
  // Find matching survey points
  const matched = findMatchingPoints(points, coordinatePoints.value, 50);
  
  if (matched.length < 3) {
    alert('Could not match enough survey points. Please click closer to the points.');
    return;
  }
  
  // Prompt for designation
  const designation = prompt('Enter parcel designation (e.g., LOT 1, STAND 2283):');
  if (!designation) return;
  
  // Create polygon on map
  const polygon = L.polygon(
    matched.map(p => L.latLng(-p.y, -p.x)),
    {
      color: '#10b981',
      fillColor: '#d1fae5',
      fillOpacity: 0.4,
      weight: 3
    }
  ).addTo(polygonsLayer!);
  
  polygon.bindTooltip(designation, {
    sticky: true,
    className: 'bg-white px-3 py-2 rounded shadow-lg font-semibold'
  });
  
  // Add parcel
  await addParcel(designation, matched, polygon);
}

// Manual selection functions
function filterPoints() {
  if (!searchQuery.value) {
    filteredPoints.value = [];
    return;
  }
  
  const query = searchQuery.value.toLowerCase();
  filteredPoints.value = coordinatePoints.value.filter(p =>
    p.id.toLowerCase().includes(query)
  );
}

function addToSelection(point: ParcelPoint) {
  if (!selectedPoints.value.find(p => p.id === point.id)) {
    selectedPoints.value.push(point);
  }
  searchQuery.value = '';
}

function removeFromSelection(index: number) {
  selectedPoints.value.splice(index, 1);
}

function clearSelection() {
  selectedPoints.value = [];
  parcelDesignation.value = '';
}

async function saveManualParcel() {
  if (!canSaveManual.value) return;
  
  // Create polygon
  const polygon = L.polygon(
    selectedPoints.value.map(p => L.latLng(-p.y, -p.x)),
    {
      color: '#10b981',
      fillColor: '#d1fae5',
      fillOpacity: 0.4,
      weight: 3
    }
  ).addTo(polygonsLayer!);
  
  polygon.bindTooltip(parcelDesignation.value, {
    sticky: true,
    className: 'bg-white px-3 py-2 rounded shadow-lg font-semibold'
  });
  
  // Add parcel
  await addParcel(parcelDesignation.value, selectedPoints.value, polygon);
  
  // Clear selection
  clearSelection();
}

// Parcel actions
function removeParcel(index: number) {
  deleteParcel(index, mapRef.value || undefined);
}

function zoomToParcel(index: number) {
  const parcel = parcels.value[index];
  if (!parcel.polygon || !mapRef.value) return;
  
  const bounds = parcel.polygon.getBounds();
  mapRef.value.fitBounds(bounds, { 
    padding: [80, 80],
    maxZoom: 18
  });
}

function clearAll() {
  if (!confirm('Delete all parcels?')) return;
  clearAllParcels(mapRef.value || undefined);
}

function toggleLabels() {
  showLabels.value = !showLabels.value;
}

// Utility functions
function formatArea(result: any) {
  const area = result.area;
  if (area.display.unit === 'ha') {
    return `${area.display.hectares.toFixed(4)} ha`;
  }
  return `${area.display.square_meters.toFixed(2)} m²`;
}

function getClosureError(parcel: any): number {
  if (!parcel.areaResult?.residuals) return 0;
  const { sumDy, sumDx } = parcel.areaResult.residuals;
  return Math.sqrt(sumDy * sumDy + sumDx * sumDx);
}

function getClosureQuality(parcel: any): string {
  const error = getClosureError(parcel);
  if (error < 0.05) return 'Excellent';
  if (error < 0.1) return 'Good';
  if (error < 0.5) return 'Fair';
  return 'Poor';
}

function getClosureIcon(parcel: any): string {
  const error = getClosureError(parcel);
  if (error < 0.05) return '✓';
  if (error < 0.1) return '✓';
  if (error < 0.5) return '⚠️';
  return '❌';
}

function getClosureClass(parcel: any): string {
  const error = getClosureError(parcel);
  if (error < 0.05) return 'text-green-700';
  if (error < 0.1) return 'text-blue-700';
  if (error < 0.5) return 'text-yellow-700';
  return 'text-red-700';
}

// Export functions
async function saveAllParcels() {
  if (!workflowState?.projectInfo?.projectId) {
    alert('No project selected. Please select a project first.');
    return;
  }
  
  try {
    // Import API service
    const { batchCreateLandParcels, prepareParcelForAPI } = await import('../../../services/landParcels');
    
    // Prepare parcels for API
    const parcelData = parcels.value.map(parcel => 
      prepareParcelForAPI(parcel.designation, parcel.points, parcel.areaResult)
    );
    
    // Save to database
    const result = await batchCreateLandParcels(workflowState.projectInfo.projectId, parcelData);
    
    if (result.created > 0) {
      alert(`Successfully saved ${result.created} parcel(s) to database!${result.failed > 0 ? `\n${result.failed} failed.` : ''}`);
      
      // Mark parcels as saved
      parcels.value.forEach(p => p.saved = true);
    } else {
      alert('Failed to save parcels. Please check console for errors.');
      console.error('Save errors:', result.errors);
    }
  } catch (error) {
    console.error('Error saving parcels:', error);
    alert('Failed to save parcels: ' + (error as Error).message);
  }
}

async function exportReport() {
  if (!workflowState?.projectInfo) {
    alert('No project information available.');
    return;
  }
  
  try {
    // Import PDF generator
    const { generateAreaComputationReport } = await import('../../../utils/area-computation-report');
    
    // Prepare options
    const options = {
      projectTitle: workflowState.surveyorInfo?.surveyOf || workflowState.projectInfo.name || 'Unnamed Project',
      surveyorName: workflowState.surveyorInfo?.landSurveyor || 'Unknown Surveyor',
      surveyorLicense: workflowState.surveyorInfo?.licenseNumber,
      surveyDate: workflowState.surveyorInfo?.surveyDate || new Date().toISOString().split('T')[0],
      centralMeridian: centralMeridian.value,
      district: workflowState.projectInfo.district
    };
    
    // Generate PDF
    const pdfBlob = generateAreaComputationReport(parcels.value, options);
    
    // Download PDF
    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `area_computation_${options.projectTitle.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
    
    alert('PDF report generated successfully!');
  } catch (error) {
    console.error('Error generating PDF:', error);
    alert('Failed to generate PDF: ' + (error as Error).message);
  }
}
</script>

<style scoped>
/* Custom styles for Leaflet tooltips */
:deep(.leaflet-tooltip) {
  background-color: white;
  border: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 600;
}
</style>
