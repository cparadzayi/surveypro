<template>
  <div class="survey-plan-preview">
    <!-- Controls Panel -->
    <div class="controls-panel">
      <div class="controls-header">
        <h3>Survey Plan Preview</h3>
        <button @click="refreshPreview" class="btn-refresh" :disabled="loading">
          <span v-if="!loading">🔄 Refresh</span>
          <span v-else>⏳ Loading...</span>
        </button>
      </div>
      
      <div class="controls-grid">
        <!-- Scale Selection -->
        <div class="control-group">
          <label>Scale</label>
          <select v-model="selectedScale" @change="onScaleChange">
            <option :value="null">Auto (Recommended)</option>
            <option value="500">1:500</option>
            <option value="1000">1:1000</option>
            <option value="1250">1:1250</option>
            <option value="1500">1:1500</option>
            <option value="2000">1:2000</option>
            <option value="2500">1:2500</option>
            <option value="3000">1:3000</option>
            <option value="4000">1:4000</option>
            <option value="5000">1:5000</option>
            <option value="6000">1:6000</option>
            <option value="10000">1:10000</option>
          </select>
        </div>
        
        <!-- Sheet Size Selection -->
        <div class="control-group">
          <label>Sheet Size</label>
          <select v-model="selectedSheetSize" @change="onSheetSizeChange">
            <option :value="null">Auto (Recommended)</option>
            <option value="SI727_500x400">500 × 400mm</option>
            <option value="SI727_800x500">800 × 500mm</option>
            <option value="SI727_1000x800">1000 × 800mm</option>
          </select>
        </div>
        
        <!-- Area Type -->
        <div class="control-group">
          <label>Area Type</label>
          <select v-model="areaType" @change="onAreaTypeChange">
            <option value="urban">Urban</option>
            <option value="peri-urban">Peri-Urban</option>
            <option value="rural">Rural</option>
          </select>
        </div>
      </div>
      
      <!-- Layer Toggles -->
      <div class="layer-toggles">
        <label class="toggle-item">
          <input type="checkbox" v-model="layers.parcels" @change="updateLayers">
          <span>Parcels</span>
        </label>
        <label class="toggle-item">
          <input type="checkbox" v-model="layers.beacons" @change="updateLayers">
          <span>Beacons</span>
        </label>
        <label class="toggle-item">
          <input type="checkbox" v-model="layers.labels" @change="updateLayers">
          <span>Labels</span>
        </label>
        <label class="toggle-item">
          <input type="checkbox" v-model="layers.sheetLayout" @change="updateLayers">
          <span>Sheet Layout</span>
        </label>
        <label class="toggle-item">
          <input type="checkbox" v-model="layers.grid" @change="updateLayers">
          <span>Grid</span>
        </label>
      </div>
      
      <!-- Statistics -->
      <div v-if="previewData" class="statistics">
        <div class="stat-item">
          <span class="stat-label">Scale:</span>
          <span class="stat-value">{{ previewData.scale.label }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Sheet:</span>
          <span class="stat-value">{{ previewData.sheetSize }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Parcels:</span>
          <span class="stat-value">{{ previewData.metadata.totalParcels }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Points:</span>
          <span class="stat-value">{{ previewData.metadata.totalPoints }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Shared Beacons:</span>
          <span class="stat-value">{{ previewData.metadata.sharedBeacons }}</span>
        </div>
        <div class="stat-item" :class="{ 'stat-warning': previewData.metadata.labelCollisions > 0 }">
          <span class="stat-label">Label Collisions:</span>
          <span class="stat-value">{{ previewData.metadata.labelCollisions }}</span>
        </div>
      </div>
    </div>
    
    <!-- Map Container -->
    <div ref="mapContainer" class="map-container"></div>
    
    <!-- Loading Overlay -->
    <div v-if="loading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <p>Loading survey plan preview...</p>
    </div>
    
    <!-- Error Message -->
    <div v-if="error" class="error-message">
      <p>{{ error }}</p>
      <button @click="refreshPreview">Try Again</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { getSurveyPlanPreview, type PreviewData } from '../services/surveyPlanPreview'

const props = defineProps<{
  projectId: number
}>()

const emit = defineEmits<{
  (e: 'preview-loaded', data: PreviewData): void
  (e: 'error', error: string): void
}>()

// State
const mapContainer = ref<HTMLElement | null>(null)
const map = ref<maplibregl.Map | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const previewData = ref<PreviewData | null>(null)

// Controls
const selectedScale = ref<number | null>(null)
const selectedSheetSize = ref<string | null>(null)
const areaType = ref<'urban' | 'peri-urban' | 'rural'>('urban')

// Layer visibility
const layers = ref({
  parcels: true,
  beacons: true,
  labels: true,
  sheetLayout: true,
  grid: false
})

// Initialize map
onMounted(async () => {
  if (!mapContainer.value) return
  
  // Create map
  map.value = new maplibregl.Map({
    container: mapContainer.value,
    style: {
      version: 8,
      sources: {},
      layers: []
    },
    center: [0, 0],
    zoom: 15
  })
  
  map.value.on('load', () => {
    loadPreviewData()
  })
})

onUnmounted(() => {
  map.value?.remove()
})

// Load preview data
async function loadPreviewData() {
  loading.value = true
  error.value = null
  
  try {
    const data = await getSurveyPlanPreview(props.projectId, {
      scale: selectedScale.value || undefined,
      sheetSize: selectedSheetSize.value || undefined,
      areaType: areaType.value
    })
    
    previewData.value = data
    renderPreview(data)
    emit('preview-loaded', data)
    
  } catch (err: any) {
    const errorMsg = err.message || 'Failed to load preview'
    error.value = errorMsg
    emit('error', errorMsg)
  } finally {
    loading.value = false
  }
}

// Render preview on map
function renderPreview(data: PreviewData) {
  if (!map.value) return
  
  // Clear existing layers and sources
  clearMap()
  
  // Fit map to extent
  const { extent } = data.analysis
  map.value.fitBounds(
    [[extent.minX, extent.minY], [extent.maxX, extent.maxY]],
    { padding: 50 }
  )
  
  // Add layers
  if (layers.value.parcels) addParcelsLayer(data)
  if (layers.value.beacons) addBeaconsLayer(data)
  if (layers.value.labels) addLabelsLayer(data)
  if (layers.value.sheetLayout) addSheetLayoutLayer(data)
  if (layers.value.grid) addGridLayer(data)
}

// Add parcels layer
function addParcelsLayer(data: PreviewData) {
  if (!map.value) return
  
  const features = data.parcels.map(parcel => ({
    type: 'Feature' as const,
    properties: {
      stand: parcel.stand,
      area: parcel.areaFormatted
    },
    geometry: parcel.geometry
  }))
  
  map.value.addSource('parcels', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection' as const,
      features
    } as any
  })
  
  map.value.addLayer({
    id: 'parcels-fill',
    type: 'fill',
    source: 'parcels',
    paint: {
      'fill-color': '#3b82f6',
      'fill-opacity': 0.1
    }
  })
  
  map.value.addLayer({
    id: 'parcels-outline',
    type: 'line',
    source: 'parcels',
    paint: {
      'line-color': '#1e40af',
      'line-width': 2
    }
  })
}

// Add beacons layer
function addBeaconsLayer(data: PreviewData) {
  if (!map.value) return
  
  const features = data.topology.beacons.map(beacon => ({
    type: 'Feature' as const,
    properties: {
      name: beacon.name,
      shared: beacon.shared,
      parcels: beacon.parcels.join(', ')
    },
    geometry: {
      type: 'Point' as const,
      coordinates: [beacon.x, beacon.y]
    }
  }))
  
  map.value.addSource('beacons', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection' as const,
      features
    } as any
  })
  
  map.value.addLayer({
    id: 'beacons',
    type: 'circle',
    source: 'beacons',
    paint: {
      'circle-radius': [
        'case',
        ['get', 'shared'],
        6,
        4
      ],
      'circle-color': [
        'case',
        ['get', 'shared'],
        '#ef4444',
        '#10b981'
      ],
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff'
    }
  })
  
  map.value.addLayer({
    id: 'beacon-labels',
    type: 'symbol',
    source: 'beacons',
    layout: {
      'text-field': ['get', 'name'],
      'text-size': 10,
      'text-offset': [0, -1.5],
      'text-anchor': 'top'
    },
    paint: {
      'text-color': '#1f2937',
      'text-halo-color': '#ffffff',
      'text-halo-width': 1
    }
  })
}

// Add labels layer
function addLabelsLayer(data: PreviewData) {
  if (!map.value) return
  
  const features = data.labels.map(label => ({
    type: 'Feature' as const,
    properties: {
      text: label.text,
      fontSize: label.fontSize,
      hasCollision: label.hasCollision
    },
    geometry: {
      type: 'Point' as const,
      coordinates: [label.x, label.y]
    }
  }))
  
  map.value.addSource('labels', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection' as const,
      features
    } as any
  })
  
  map.value.addLayer({
    id: 'labels',
    type: 'symbol',
    source: 'labels',
    layout: {
      'text-field': ['get', 'text'],
      'text-size': 14,
      'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold']
    },
    paint: {
      'text-color': [
        'case',
        ['get', 'hasCollision'],
        '#dc2626',
        '#1f2937'
      ],
      'text-halo-color': '#ffffff',
      'text-halo-width': 2
    }
  })
}

// Add sheet layout layer
function addSheetLayoutLayer(data: PreviewData) {
  if (!map.value) return
  
  const { extent } = data.analysis
  const { scale } = data
  
  // Calculate sheet bounds in real-world coordinates
  const sheetWidthMeters = (data.layout.sheet.width / 1000) * scale.value
  const sheetHeightMeters = (data.layout.sheet.height / 1000) * scale.value
  
  const centerX = extent.center.x
  const centerY = extent.center.y
  
  const sheetBounds = [
    [centerX - sheetWidthMeters / 2, centerY - sheetHeightMeters / 2],
    [centerX + sheetWidthMeters / 2, centerY + sheetHeightMeters / 2]
  ]
  
  map.value.addSource('sheet-layout', {
    type: 'geojson',
    data: {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [sheetBounds[0][0], sheetBounds[0][1]],
          [sheetBounds[1][0], sheetBounds[0][1]],
          [sheetBounds[1][0], sheetBounds[1][1]],
          [sheetBounds[0][0], sheetBounds[1][1]],
          [sheetBounds[0][0], sheetBounds[0][1]]
        ]]
      }
    }
  })
  
  map.value.addLayer({
    id: 'sheet-layout',
    type: 'line',
    source: 'sheet-layout',
    paint: {
      'line-color': '#f59e0b',
      'line-width': 3,
      'line-dasharray': [4, 2]
    }
  })
}

// Add grid layer
function addGridLayer(data: PreviewData) {
  // TODO: Implement grid overlay
}

// Clear map
function clearMap() {
  if (!map.value) return
  
  const layerIds = ['parcels-fill', 'parcels-outline', 'beacons', 'beacon-labels', 'labels', 'sheet-layout']
  const sourceIds = ['parcels', 'beacons', 'labels', 'sheet-layout']
  
  layerIds.forEach(id => {
    if (map.value?.getLayer(id)) {
      map.value.removeLayer(id)
    }
  })
  
  sourceIds.forEach(id => {
    if (map.value?.getSource(id)) {
      map.value.removeSource(id)
    }
  })
}

// Update layers
function updateLayers() {
  if (previewData.value) {
    renderPreview(previewData.value)
  }
}

// Event handlers
function refreshPreview() {
  loadPreviewData()
}

function onScaleChange() {
  loadPreviewData()
}

function onSheetSizeChange() {
  loadPreviewData()
}

function onAreaTypeChange() {
  loadPreviewData()
}
</script>

<style scoped>
.survey-plan-preview {
  display: flex;
  height: 100%;
  position: relative;
}

.controls-panel {
  width: 300px;
  background: white;
  border-right: 1px solid #e5e7eb;
  padding: 1rem;
  overflow-y: auto;
}

.controls-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.controls-header h3 {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
}

.btn-refresh {
  padding: 0.5rem 1rem;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  font-size: 0.875rem;
}

.btn-refresh:hover:not(:disabled) {
  background: #2563eb;
}

.btn-refresh:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.controls-grid {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.control-group label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  margin-bottom: 0.25rem;
  color: #374151;
}

.control-group select {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
}

.layer-toggles {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: #f9fafb;
  border-radius: 0.375rem;
}

.toggle-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-size: 0.875rem;
}

.toggle-item input[type="checkbox"] {
  cursor: pointer;
}

.statistics {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem;
  background: #f9fafb;
  border-radius: 0.375rem;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  font-size: 0.875rem;
}

.stat-label {
  color: #6b7280;
}

.stat-value {
  font-weight: 600;
  color: #1f2937;
}

.stat-warning .stat-value {
  color: #dc2626;
}

.map-container {
  flex: 1;
  position: relative;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #e5e7eb;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-message {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: white;
  padding: 2rem;
  border-radius: 0.5rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  text-align: center;
  z-index: 1000;
}

.error-message p {
  color: #dc2626;
  margin-bottom: 1rem;
}

.error-message button {
  padding: 0.5rem 1rem;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
}
</style>
