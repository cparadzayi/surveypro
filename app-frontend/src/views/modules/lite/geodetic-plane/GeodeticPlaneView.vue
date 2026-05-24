<template>
  <ModuleScaffold
    title="Geodetic ↔ Plane Transformations"
    description="Transform Cape Datum coordinates (Lo 25/27/29/31/33) to WGS84 with mapping and export capabilities"
  >
    <div class="space-y-4">
      <!-- Header Info -->
      <div class="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
        <h3 class="font-semibold text-indigo-900 mb-2">↔️ Cape Datum ↔ WGS84 Transformation</h3>
        <p class="text-sm text-indigo-700">
          Convert coordinates from Cape Datum (Modified Clarke 1880 ellipsoid) using Cape Feet or Meters 
          to WGS84 (EPSG:4326). Supports all Zimbabwe Lo zones with MapLibre rendering using CRS:84.
        </p>
        <div class="mt-2 flex flex-wrap gap-2 text-xs text-indigo-600">
          <span class="px-2 py-1 bg-indigo-100 rounded">Lo 25, 27, 29, 31, 33</span>
          <span class="px-2 py-1 bg-indigo-100 rounded">Cape Feet (C)</span>
          <span class="px-2 py-1 bg-indigo-100 rounded">International Feet (I)</span>
          <span class="px-2 py-1 bg-indigo-100 rounded">Meters (M)</span>
        </div>
      </div>

      <!-- Input Section -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <!-- CSV Import -->
        <div class="bg-white rounded-lg shadow-md p-4">
          <h3 class="font-semibold text-gray-900 mb-3">📁 Import CSV</h3>
          <div class="space-y-3">
            <input
              ref="fileInput"
              type="file"
              accept=".csv"
              @change="handleFileUpload"
              class="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
            />
            <p class="text-xs text-gray-500">
              Expected CSV columns: <code class="bg-gray-100 px-1 rounded">Point,Y,X,SR_num,Description,Survey_date,System,Meas_unit</code><br>
              Unit codes: <code class="bg-gray-100 px-1 rounded">C</code>=Cape Feet, <code class="bg-gray-100 px-1 rounded">I</code>=Int. Feet, <code class="bg-gray-100 px-1 rounded">M</code>=Meters
            </p>
            <button
              v-if="capePoints.length > 0"
              @click="clearAllData"
              class="text-sm text-red-600 hover:text-red-700 underline"
            >
              Clear all data
            </button>
          </div>
        </div>

        <!-- Manual Entry -->
        <div class="bg-white rounded-lg shadow-md p-4">
          <h3 class="font-semibold text-gray-900 mb-3">✏️ Manual Entry</h3>
          <div class="space-y-3">
            <div class="grid grid-cols-2 gap-2">
              <input
                v-model="manualEntry.id"
                placeholder="Point ID"
                class="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500"
              />
              <select
                v-model="manualEntry.unit"
                class="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500"
              >
                <option value="C">Cape Feet (C)</option>
                <option value="I">Int. Feet (I)</option>
                <option value="M">Meters (M)</option>
              </select>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <input
                v-model.number="manualEntry.y"
                type="number"
                placeholder="Y (Westing)"
                class="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500"
              />
              <input
                v-model.number="manualEntry.x"
                type="number"
                placeholder="X (Southing)"
                class="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div class="grid grid-cols-2 gap-2">
              <select
                v-model="manualEntry.system"
                class="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500"
              >
                <option value="Lo 25">Lo 25</option>
                <option value="Lo 27">Lo 27</option>
                <option value="Lo 29">Lo 29</option>
                <option value="Lo 31">Lo 31</option>
                <option value="Lo 33">Lo 33</option>
              </select>
              <input
                v-model="manualEntry.description"
                placeholder="Description (optional)"
                class="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button
              @click="addManualPoint"
              :disabled="!isManualEntryValid"
              class="w-full px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Add Point
            </button>
          </div>
        </div>
      </div>

      <!-- Statistics -->
      <div v-if="capePoints.length > 0" class="bg-white rounded-lg shadow-md p-4">
        <div class="flex flex-wrap gap-4 text-sm">
          <div class="px-3 py-2 bg-blue-50 rounded-md">
            <span class="font-medium text-blue-900">{{ capePoints.length }}</span>
            <span class="text-blue-700"> points loaded</span>
          </div>
          <div class="px-3 py-2 bg-green-50 rounded-md">
            <span class="font-medium text-green-900">{{ wgs84Points.length }}</span>
            <span class="text-green-700"> transformed to WGS84</span>
          </div>
          <div class="px-3 py-2 bg-purple-50 rounded-md">
            <span class="font-medium text-purple-900">{{ polygons.length }}</span>
            <span class="text-purple-700"> polygons</span>
          </div>
          <div v-if="bounds" class="px-3 py-2 bg-amber-50 rounded-md">
            <span class="text-amber-700">Area: </span>
            <span class="font-medium text-amber-900">{{ bounds.widthKm.toFixed(2) }} × {{ bounds.heightKm.toFixed(2) }} km</span>
          </div>
        </div>
      </div>

      <!-- Map Section -->
      <div class="bg-white rounded-lg shadow-md overflow-hidden">
        <div class="flex items-center justify-between px-4 py-2 bg-gray-50 border-b">
          <h3 class="font-semibold text-gray-900">🗺️ Map View (CRS:84)</h3>
          <div class="flex items-center gap-2">
            <button
              @click="toggleSatellite"
              :class="[
                'px-3 py-1.5 text-sm font-medium rounded-md',
                isSatellite
                  ? 'bg-sky-100 text-sky-700 hover:bg-sky-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              ]"
              title="Toggle satellite imagery"
            >
              {{ isSatellite ? '🛰️ Satellite' : '🗺️ Street' }}
            </button>
            <button
              @click="toggleSnapMode"
              :class="[
                'px-3 py-1.5 text-sm font-medium rounded-md',
                snapToPoints
                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              ]"
              title="Snap to existing points when drawing"
            >
              {{ snapToPoints ? '🧲 Snap ON' : '○ Snap OFF' }}
            </button>
            <button
              @click="toggleLabels"
              :class="[
                'px-3 py-1.5 text-sm font-medium rounded-md',
                showLabels
                  ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              ]"
            >
              {{ showLabels ? '🏷️ Labels ON' : '🏷️ Labels OFF' }}
            </button>
            <button
              @click="toggleDrawingMode"
              :class="[
                'px-3 py-1.5 text-sm font-medium rounded-md',
                isDrawingMode
                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                  : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
              ]"
            >
              {{ isDrawingMode ? '⛔ Cancel Drawing' : '✏️ Draw Polygon' }}
            </button>
            <button
              @click="fitToBounds"
              class="px-3 py-1.5 text-sm font-medium bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
            >
              🔍 Fit View
            </button>
          </div>
        </div>
        <div ref="mapContainer" class="w-full h-[500px]"></div>
        <div v-if="isDrawingMode" class="px-4 py-2 bg-yellow-50 border-t">
          <div class="flex items-center justify-between">
            <p class="text-sm text-yellow-800">
              <strong>Drawing Mode:</strong> Click map to add vertices. Click first point to close. Press ESC to cancel.
              <span v-if="drawingPoints.length > 0" class="ml-2">
                Vertices: {{ drawingPoints.length }}
              </span>
            </p>
            <div class="flex gap-2">
              <button
                v-if="drawingPoints.length > 0"
                @click="removeLastVertex"
                class="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
              >
                ↩️ Undo Last
              </button>
              <button
                v-if="drawingPoints.length >= 3"
                @click="closePolygon"
                class="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
              >
                ✓ Close Polygon
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Data Tables -->
      <div v-if="capePoints.length > 0" class="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <!-- Original Coordinates -->
        <div class="bg-white rounded-lg shadow-md p-4">
          <h3 class="font-semibold text-gray-900 mb-3">📍 Cape Datum Coordinates</h3>
          <div class="overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-3 py-2 text-left font-medium text-gray-700">Point</th>
                  <th class="px-3 py-2 text-left font-medium text-gray-700">Y</th>
                  <th class="px-3 py-2 text-left font-medium text-gray-700">X</th>
                  <th class="px-3 py-2 text-left font-medium text-gray-700">System</th>
                  <th class="px-3 py-2 text-left font-medium text-gray-700">Unit</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200">
                <tr v-for="point in capePoints" :key="point.id" class="hover:bg-gray-50">
                  <td class="px-3 py-2 font-medium text-gray-900">{{ point.id }}</td>
                  <td class="px-3 py-2 text-gray-600 font-mono">{{ point.y.toFixed(3) }}</td>
                  <td class="px-3 py-2 text-gray-600 font-mono">{{ point.x.toFixed(3) }}</td>
                  <td class="px-3 py-2 text-gray-600">{{ point.system }}</td>
                  <td class="px-3 py-2">
                    <span
                      :class="[
                        'px-2 py-0.5 text-xs rounded-full',
                        point.unit === 'C' ? 'bg-amber-100 text-amber-800' :
                        point.unit === 'I' ? 'bg-blue-100 text-blue-800' :
                        'bg-green-100 text-green-800'
                      ]"
                    >
                      {{ point.unit === 'C' ? 'Cape Ft' : point.unit === 'I' ? 'Int Ft' : 'Meters' }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Transformed Coordinates -->
        <div class="bg-white rounded-lg shadow-md p-4">
          <h3 class="font-semibold text-gray-900 mb-3">🌐 WGS84 Coordinates</h3>
          <div class="overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-3 py-2 text-left font-medium text-gray-700">Point</th>
                  <th class="px-3 py-2 text-left font-medium text-gray-700">Longitude</th>
                  <th class="px-3 py-2 text-left font-medium text-gray-700">Latitude</th>
                  <th class="px-3 py-2 text-left font-medium text-gray-700">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200">
                <tr v-for="point in wgs84Points" :key="point.id" class="hover:bg-gray-50">
                  <td class="px-3 py-2 font-medium text-gray-900">{{ point.id }}</td>
                  <td class="px-3 py-2 text-gray-600 font-mono">{{ point.lng.toFixed(6) }}°</td>
                  <td class="px-3 py-2 text-gray-600 font-mono">{{ point.lat.toFixed(6) }}°</td>
                  <td class="px-3 py-2">
                    <button
                      @click="openInGoogleMaps(point)"
                      class="text-xs text-blue-600 hover:text-blue-700 underline"
                    >
                      Maps
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Polygons Section -->
      <div v-if="polygons.length > 0" class="bg-white rounded-lg shadow-md p-4">
        <h3 class="font-semibold text-gray-900 mb-3">🔷 Polygons</h3>
        <div class="space-y-3">
          <div v-for="(polygon, polyIndex) in polygons" :key="polyIndex" class="p-3 bg-gray-50 rounded-md">
            <div class="flex items-center justify-between mb-2">
              <div>
                <span class="font-medium text-gray-900">Polygon {{ polyIndex + 1 }}</span>
                <span class="text-sm text-gray-600 ml-2">{{ polygon.length }} vertices</span>
                <div v-if="polygonAreas[polyIndex]" class="text-xs text-green-600 mt-1 font-mono">
                  {{ formatAreaAllUnits(polygonAreas[polyIndex]) }}
                </div>
              </div>
              <div class="flex gap-2">
                <button
                  @click="togglePolygonEdit(polyIndex)"
                  class="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                >
                  {{ editingPolygon === polyIndex ? 'Done' : 'Edit' }}
                </button>
                <button
                  @click="deletePolygon(polyIndex)"
                  class="px-2 py-1 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 rounded"
                >
                  Delete
                </button>
              </div>
            </div>
            <!-- Vertex list when editing -->
            <div v-if="editingPolygon === polyIndex" class="mt-2 space-y-1">
              <div 
                v-for="(vertex, vIndex) in polygon" 
                :key="vIndex"
                class="flex items-center justify-between px-2 py-1 bg-white rounded text-sm"
              >
                <span class="font-mono text-gray-700">
                  {{ vIndex + 1 }}. {{ vertex.id }} 
                  <span class="text-gray-500">({{ vertex.lng.toFixed(6) }}, {{ vertex.lat.toFixed(6) }})</span>
                </span>
                <button
                  @click="removePolygonVertex(polyIndex, vIndex)"
                  :disabled="polygon.length <= 3"
                  class="px-2 py-0.5 text-xs bg-red-100 text-red-600 rounded hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Remove vertex (minimum 3 required)"
                >
                  ✕
                </button>
              </div>
              <div class="flex gap-2 mt-2">
                <button
                  @click="startAddingVertices(polyIndex)"
                  class="px-3 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
                >
                  + Add Vertices
                </button>
                <span v-if="addingVerticesTo === polyIndex" class="text-xs text-green-600 py-1">
                  Click map to add vertices
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Export Actions -->
      <div v-if="wgs84Points.length > 0" class="bg-white rounded-lg shadow-md p-4">
        <h3 class="font-semibold text-gray-900 mb-3">📤 Export Options</h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button
            @click="exportToGoogleMaps"
            class="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            🗺️ Google Maps
          </button>
          <button
            v-if="polygons.length > 0"
            @click="exportPolygonsToGoogleMaps"
            class="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
          >
            🔷 Polygons to Maps
          </button>
          <button
            @click="exportToWhatsApp"
            class="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
          >
            💬 WhatsApp
          </button>
          <button
            @click="exportKML"
            class="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-md hover:bg-amber-700"
          >
            📍 KML
          </button>
          <button
            @click="exportCSV"
            class="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-600 rounded-md hover:bg-gray-700"
          >
            📄 CSV
          </button>
        </div>
      </div>
    </div>
  </ModuleScaffold>
</template>
<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import ModuleScaffold from '../../../../components/scaffold/ModuleScaffold.vue'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  type CapeCoordinate,
  type WGS84Coordinate,
  type MeasurementUnit,
  batchCapeToWGS84,
  calculateBounds,
  getGoogleMapsUrl,
  getGoogleMapsDirectionsUrl,
  getWhatsAppShareUrl,
  generateKML,
  downloadFile,
  parseLoZone
} from '../../../../utils/geodeticTransform'

// Map
const mapContainer = ref<HTMLDivElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
let map: maplibregl.Map | null = null
let pointMarkers: maplibregl.Marker[] = []
let polygonLayers: string[] = []
let drawingMarkers: maplibregl.Marker[] = []

// Data
const capePoints = ref<CapeCoordinate[]>([])
const wgs84Points = ref<WGS84Coordinate[]>([])
const polygons = ref<WGS84Coordinate[][]>([])
const polygonAreas = ref<number[]>([])

// Drawing
const isDrawingMode = ref(false)
// Drawing points with their IDs
const drawingPoints = ref<{ coords: [number, number]; pointId: string | null }[]>([])
const snapToPoints = ref(true)
const showLabels = ref(true)
const editingPolygon = ref<number | null>(null)
const addingVerticesTo = ref<number | null>(null)
const isSatellite = ref(false)

// Manual entry
const manualEntry = ref({
  id: '',
  y: 0,
  x: 0,
  system: 'Lo 33',
  unit: 'C' as MeasurementUnit,
  description: ''
})

// Snap to nearest point - returns coordinates and optional point ID
function snapToNearestPoint(lngLat: [number, number]): { coords: [number, number]; pointId: string | null } {
  if (!snapToPoints.value || wgs84Points.value.length === 0) {
    return { coords: lngLat, pointId: null }
  }
  
  const threshold = 0.0005 // ~50 meters at equator
  let nearest: WGS84Coordinate | null = null
  let minDistance = Infinity
  
  for (const point of wgs84Points.value) {
    const dx = lngLat[0] - point.lng
    const dy = lngLat[1] - point.lat
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < threshold && dist < minDistance) {
      minDistance = dist
      nearest = point
    }
  }
  
  if (nearest) {
    console.log(`[GeodeticPlane] Snapped to point ${nearest.id}`)
    return { coords: [nearest.lng, nearest.lat], pointId: nearest.id }
  }
  
  return { coords: lngLat, pointId: null }
}

// Toggle snap mode
function toggleSnapMode() {
  snapToPoints.value = !snapToPoints.value
}

// Toggle labels
function toggleLabels() {
  showLabels.value = !showLabels.value
  displayPointsOnMap()
}

// Toggle satellite imagery
function toggleSatellite() {
  if (!map) return
  
  isSatellite.value = !isSatellite.value
  
  // Update the raster source URL
  const source = map.getSource('basemap') as maplibregl.RasterTileSource
  if (source) {
    const newTiles = isSatellite.value
      ? ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}']
      : [
          'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
          'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
          'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
        ]
    source.setTiles(newTiles)
  }
  
  console.log(`[GeodeticPlane] Switched to ${isSatellite.value ? 'satellite' : 'street'} imagery`)
}

// Remove last vertex while drawing
function removeLastVertex() {
  if (drawingPoints.value.length > 0) {
    drawingPoints.value.pop()
    updateDrawingPreview()
  }
}

// Computed
const isManualEntryValid = computed(() => {
  return manualEntry.value.id && 
         !isNaN(manualEntry.value.y) && 
         !isNaN(manualEntry.value.x) &&
         manualEntry.value.y !== 0 &&
         manualEntry.value.x !== 0
})

const bounds = computed(() => {
  if (wgs84Points.value.length === 0) return null
  return calculateBounds(wgs84Points.value)
})

// Initialize map
onMounted(() => {
  if (!mapContainer.value) return

  map = new maplibregl.Map({
    container: mapContainer.value,
    style: {
      version: 8,
      sources: {
        'basemap': {
          type: 'raster',
          tiles: [
            'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
            'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
            'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
          ],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors'
        }
      },
      layers: [
        {
          id: 'basemap',
          type: 'raster',
          source: 'basemap',
          minzoom: 0,
          maxzoom: 19
        }
      ]
    },
    center: [31, -20],
    zoom: 6
  })

  map.addControl(new maplibregl.NavigationControl(), 'top-right')
  map.addControl(new maplibregl.ScaleControl(), 'bottom-left')

  map.on('click', handleMapClick)

  console.log('[GeodeticPlane] Map initialized')
})

// Cleanup
onBeforeUnmount(() => {
  clearDrawingOverlays()
  pointMarkers.forEach(m => m.remove())
  if (map) {
    map.remove()
    map = null
  }
})

// Handle map click for drawing
function handleMapClick(e: maplibregl.MapMouseEvent) {
  if (!map) return

  // Handle adding vertices to existing polygon
  if (addingVerticesTo.value !== null) {
    const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat]
    addVertexToPolygon(addingVerticesTo.value, lngLat)
    return
  }

  if (!isDrawingMode.value) return

  let lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat]
  
  // Snap to nearest point if enabled
  if (snapToPoints.value) {
    const snapResult = snapToNearestPoint(lngLat)
    lngLat = snapResult.coords
    drawingPoints.value.push({ coords: lngLat, pointId: snapResult.pointId })
  } else {
    drawingPoints.value.push({ coords: lngLat, pointId: null })
  }
  
  // Check if clicking near first point to close polygon
  if (drawingPoints.value.length >= 3) {
    const firstPoint = drawingPoints.value[0]
    const distance = Math.sqrt(
      Math.pow(lngLat[0] - firstPoint.coords[0], 2) + 
      Math.pow(lngLat[1] - firstPoint.coords[1], 2)
    )
    
    if (distance < 0.001) {
      closePolygon()
      return
    }
  }
  
  updateDrawingPreview()
}

// Update drawing preview on map
function updateDrawingPreview() {
  if (!map || drawingPoints.value.length === 0) return

  drawingMarkers.forEach(m => m.remove())
  drawingMarkers = []

  drawingPoints.value.forEach((pt, index) => {
    const el = document.createElement('div')
    el.className = 'drawing-vertex'
    el.style.width = '12px'
    el.style.height = '12px'
    el.style.borderRadius = '50%'
    el.style.backgroundColor = index === 0 ? '#10b981' : '#f59e0b'
    el.style.border = '2px solid white'
    el.style.boxShadow = '0 1px 3px rgba(0,0,0,0.4)'
    
    const marker = new maplibregl.Marker({ element: el })
      .setLngLat(pt.coords)
      .addTo(map!)
    
    drawingMarkers.push(marker)
  })

  const lineGeoJSON = {
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'LineString' as const,
      coordinates: drawingPoints.value.map(p => p.coords)
    }
  }

  if (map.getSource('drawing-line')) {
    (map.getSource('drawing-line') as maplibregl.GeoJSONSource).setData(lineGeoJSON as any)
  } else {
    map.addSource('drawing-line', {
      type: 'geojson',
      data: lineGeoJSON as any
    })
    
    map.addLayer({
      id: 'drawing-line',
      type: 'line',
      source: 'drawing-line',
      paint: {
        'line-color': '#f59e0b',
        'line-width': 3,
        'line-dasharray': [2, 1]
      }
    })
  }
}

// Area conversion utilities
function formatAreaAllUnits(areaM2: number): string {
  const m2 = areaM2
  const hectares = areaM2 / 10000
  const acres = areaM2 / 4046.85642
  const morgen = areaM2 / 8565.32 // South African morgen (1 morgen = 0.856532 ha)
  
  // Square feet conversions
  // 1 Cape foot = 0.3047972654 m, so 1 Cape sq ft = 0.09290341 m²
  // 1 International foot = 0.3048 m, so 1 Int sq ft = 0.09290304 m²
  const capeSqFt = areaM2 / 0.09290341
  const intSqFt = areaM2 / 0.09290304 // English/International square feet
  
  if (areaM2 < 10000) {
    return `${m2.toFixed(2)} m² | ${hectares.toFixed(4)} ha | ${acres.toFixed(4)} ac | ${morgen.toFixed(4)} mg | ${intSqFt.toFixed(2)} ft² (Int) | ${capeSqFt.toFixed(2)} ft² (Cape)`
  } else {
    return `${hectares.toFixed(4)} ha | ${m2.toFixed(2)} m² | ${acres.toFixed(4)} ac | ${morgen.toFixed(4)} mg | ${intSqFt.toFixed(2)} ft² (Int) | ${capeSqFt.toFixed(2)} ft² (Cape)`
  }
}

// Close and save polygon
function closePolygon() {
  if (drawingPoints.value.length < 3) {
    alert('Polygon must have at least 3 vertices')
    return
  }

  const polygonWGS84: WGS84Coordinate[] = drawingPoints.value.map((pt, index) => ({
    id: pt.pointId || `V${index + 1}`,
    lng: pt.coords[0],
    lat: pt.coords[1]
  }))

  polygons.value.push(polygonWGS84)
  
  const area = calculatePolygonArea(polygonWGS84)
  polygonAreas.value.push(area)

  clearDrawingOverlays()
  isDrawingMode.value = false
  drawingPoints.value = []

  displayPolygons()

  console.log(`[GeodeticPlane] Polygon created with ${polygonWGS84.length} vertices, area: ${area.toFixed(2)} m²`)
}

// Calculate polygon area using shoelace formula
function calculatePolygonArea(points: WGS84Coordinate[]): number {
  if (points.length < 3) return 0

  let area = 0
  const n = points.length

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    area += points[i].lng * points[j].lat
    area -= points[j].lng * points[i].lat
  }

  area = Math.abs(area) / 2

  const avgLat = points.reduce((sum, p) => sum + p.lat, 0) / points.length
  const metersPerDegLat = 111320
  const metersPerDegLng = 111320 * Math.cos(avgLat * Math.PI / 180)

  return area * metersPerDegLat * metersPerDegLng
}

// Clear drawing overlays
function clearDrawingOverlays() {
  drawingMarkers.forEach(m => m.remove())
  drawingMarkers = []

  if (map) {
    if (map.getLayer('drawing-line')) {
      map.removeLayer('drawing-line')
    }
    if (map.getSource('drawing-line')) {
      map.removeSource('drawing-line')
    }
  }
}

// Display polygons on map
function displayPolygons() {
  if (!map) return

  polygonLayers.forEach(layerId => {
    if (map!.getLayer(layerId)) map!.removeLayer(layerId)
    if (map!.getLayer(`${layerId}-outline`)) map!.removeLayer(`${layerId}-outline`)
    if (map!.getLayer(`${layerId}-fill`)) map!.removeLayer(`${layerId}-fill`)
    // Remove vertex layers
    const vertexLayerId = `${layerId}-vertices`
    if (map!.getLayer(vertexLayerId)) map!.removeLayer(vertexLayerId)
  })
  polygonLayers = []

  for (let i = 0; i < polygons.value.length; i++) {
    const sourceId = `polygon-${i}`
    const vertexSourceId = `polygon-vertices-${i}`
    if (map.getSource(sourceId)) {
      map.removeSource(sourceId)
    }
    if (map.getSource(vertexSourceId)) {
      map.removeSource(vertexSourceId)
    }
  }

  polygons.value.forEach((polygon: WGS84Coordinate[], index: number) => {
    const sourceId = `polygon-${index}`
    const coords = polygon.map((p: WGS84Coordinate) => [p.lng, p.lat])
    coords.push([polygon[0].lng, polygon[0].lat])

    map!.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'Feature' as const,
        properties: { index },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [coords]
        }
      }
    })

    // Hollow fill - very transparent
    map!.addLayer({
      id: `${sourceId}-fill`,
      type: 'fill',
      source: sourceId,
      paint: {
        'fill-color': '#8B4513',
        'fill-opacity': 0.05
      }
    } as any)

    // Brown border
    map!.addLayer({
      id: `${sourceId}-outline`,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': '#8B4513',
        'line-width': 2.5
      }
    } as any)

    // Add vertex markers source
    const vertexSourceId = `polygon-vertices-${index}`
    const vertexFeatures = polygon.map((p: WGS84Coordinate, i: number) => ({
      type: 'Feature' as const,
      properties: { index: i, pointId: p.id },
      geometry: {
        type: 'Point' as const,
        coordinates: [p.lng, p.lat]
      }
    }))

    map!.addSource(vertexSourceId, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection' as const,
        features: vertexFeatures as any
      }
    })

    // Vertex markers
    map!.addLayer({
      id: `${vertexSourceId}`,
      type: 'circle',
      source: vertexSourceId,
      paint: {
        'circle-radius': 6,
        'circle-color': '#8B4513',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff'
      }
    } as any)

    // Vertex labels
    map!.addLayer({
      id: `${vertexSourceId}-labels`,
      type: 'symbol',
      source: vertexSourceId,
      layout: {
        'text-field': ['get', 'pointId'],
        'text-size': 11,
        'text-offset': [0, -1.2],
        'text-anchor': 'bottom',
        'text-font': ['Open Sans Bold']
      },
      paint: {
        'text-color': '#8B4513',
        'text-halo-color': '#ffffff',
        'text-halo-width': 2
      }
    } as any)

    polygonLayers.push(sourceId)
  })
}
// Toggle drawing mode
function toggleDrawingMode() {
  isDrawingMode.value = !isDrawingMode.value
  
  if (!isDrawingMode.value) {
    clearDrawingOverlays()
    drawingPoints.value = []
  }
}

// Delete polygon
function deletePolygon(index: number) {
  polygons.value.splice(index, 1)
  polygonAreas.value.splice(index, 1)
  if (editingPolygon.value === index) {
    editingPolygon.value = null
  }
  displayPolygons()
}

// Toggle polygon edit mode
function togglePolygonEdit(index: number) {
  if (editingPolygon.value === index) {
    editingPolygon.value = null
    addingVerticesTo.value = null
  } else {
    editingPolygon.value = index
    addingVerticesTo.value = null
  }
}

// Remove vertex from polygon
function removePolygonVertex(polyIndex: number, vertexIndex: number) {
  const polygon = polygons.value[polyIndex]
  if (polygon.length <= 3) {
    alert('Polygon must have at least 3 vertices')
    return
  }
  
  polygons.value[polyIndex].splice(vertexIndex, 1)
  
  // Recalculate area
  const area = calculatePolygonArea(polygons.value[polyIndex])
  polygonAreas.value[polyIndex] = area
  
  displayPolygons()
  console.log(`[GeodeticPlane] Removed vertex ${vertexIndex} from polygon ${polyIndex + 1}`)
}

// Start adding vertices to existing polygon
function startAddingVertices(polyIndex: number) {
  if (addingVerticesTo.value === polyIndex) {
    addingVerticesTo.value = null
  } else {
    addingVerticesTo.value = polyIndex
  }
}

// Add vertex to existing polygon at clicked location
function addVertexToPolygon(polyIndex: number, lngLat: [number, number]) {
  const polygon = polygons.value[polyIndex]
  
  // Find the best position to insert (closest to existing edge)
  let bestIndex = polygon.length
  let minDistance = Infinity
  
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i]
    const p2 = polygon[(i + 1) % polygon.length]
    
    // Calculate distance from click to line segment
    const dist = pointToLineDistance(lngLat[0], lngLat[1], p1.lng, p1.lat, p2.lng, p2.lat)
    if (dist < minDistance) {
      minDistance = dist
      bestIndex = i + 1
    }
  }
  
  // Create new vertex with snapped or clicked coordinates
  let finalLngLat = lngLat
  let pointId: string | null = null
  if (snapToPoints.value) {
    const snapResult = snapToNearestPoint(lngLat)
    finalLngLat = snapResult.coords
    pointId = snapResult.pointId
  }
  
  const newVertex: WGS84Coordinate = {
    id: pointId || `V${polygon.length + 1}`,
    lng: finalLngLat[0],
    lat: finalLngLat[1]
  }
  
  // Insert at best position
  polygons.value[polyIndex].splice(bestIndex, 0, newVertex)
  
  // Recalculate area
  const area = calculatePolygonArea(polygons.value[polyIndex])
  polygonAreas.value[polyIndex] = area
  
  displayPolygons()
  console.log(`[GeodeticPlane] Added vertex to polygon ${polyIndex + 1} at position ${bestIndex}`)
}

// Calculate distance from point to line segment
function pointToLineDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const A = px - x1
  const B = py - y1
  const C = x2 - x1
  const D = y2 - y1

  const dot = A * C + B * D
  const lenSq = C * C + D * D
  let param = -1
  
  if (lenSq !== 0) {
    param = dot / lenSq
  }

  let xx, yy

  if (param < 0) {
    xx = x1
    yy = y1
  } else if (param > 1) {
    xx = x2
    yy = y2
  } else {
    xx = x1 + param * C
    yy = y1 + param * D
  }

  const dx = px - xx
  const dy = py - yy
  return Math.sqrt(dx * dx + dy * dy)
}

// Handle file upload
async function handleFileUpload(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  try {
    const text = await file.text()
    const points = parseCSV(text)
    
    capePoints.value = points
    
    const transformed = batchCapeToWGS84(points)
    wgs84Points.value = transformed.map((t: { wgs84: WGS84Coordinate }) => t.wgs84)
    
    console.log(`[GeodeticPlane] Loaded ${points.length} points from CSV`)
    console.log(`[GeodeticPlane] Sample transformation:`, {
      original: { id: points[0]?.id, y: points[0]?.y, x: points[0]?.x, unit: points[0]?.unit },
      transformed: { id: wgs84Points.value[0]?.id, lng: wgs84Points.value[0]?.lng, lat: wgs84Points.value[0]?.lat }
    })

    displayPointsOnMap()
    fitToBounds()
  } catch (error) {
    console.error('Error loading CSV:', error)
    alert(`Error loading CSV: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// Parse CSV
function parseCSV(text: string): CapeCoordinate[] {
  const lines = text.trim().split('\n')
  if (lines.length < 2) {
    throw new Error('CSV file is empty or has no data rows')
  }

  const header = lines[0].split(',').map(h => h.trim().toLowerCase())
  
  const pointIdx = header.findIndex(h => h.includes('point'))
  const yIdx = header.findIndex(h => h === 'y' || h.includes('westing'))
  const xIdx = header.findIndex(h => h === 'x' || h.includes('southing'))
  const srNumIdx = header.findIndex(h => h.includes('sr_num') || h.includes('survey'))
  const descIdx = header.findIndex(h => h.includes('description') || h.includes('desc'))
  const dateIdx = header.findIndex(h => h.includes('date'))
  const systemIdx = header.findIndex(h => h.includes('system') || h.includes('lo'))
  const unitIdx = header.findIndex(h => h.includes('unit') || h.includes('meas'))

  if (pointIdx === -1 || yIdx === -1 || xIdx === -1) {
    throw new Error('CSV must contain Point, Y, and X columns')
  }

  const points: CapeCoordinate[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim())
    if (values.length < 3) continue
    if (!values[pointIdx]) continue

    const y = parseFloat(values[yIdx])
    const x = parseFloat(values[xIdx])

    if (isNaN(y) || isNaN(x)) continue

    const unit = unitIdx !== -1 ? parseUnit(values[unitIdx]) : 'M'

    points.push({
      id: values[pointIdx] || `PT${i}`,
      y,
      x,
      sr_num: srNumIdx !== -1 ? values[srNumIdx] : undefined,
      description: descIdx !== -1 ? values[descIdx] : undefined,
      survey_date: dateIdx !== -1 ? values[dateIdx] : undefined,
      system: systemIdx !== -1 ? values[systemIdx] : 'Lo 33',
      unit
    })
  }

  return points
}

// Parse measurement unit
function parseUnit(unitStr: string): MeasurementUnit {
  const u = unitStr.trim().toUpperCase()
  if (u === 'C' || u.includes('CAPE')) return 'C'
  if (u === 'I' || u.includes('INT') || u.includes('FEET')) return 'I'
  return 'M'
}

// Add manual point
function addManualPoint() {
  if (!isManualEntryValid.value) return

  const point: CapeCoordinate = {
    id: manualEntry.value.id,
    y: manualEntry.value.y,
    x: manualEntry.value.x,
    system: manualEntry.value.system,
    unit: manualEntry.value.unit,
    description: manualEntry.value.description || undefined
  }

  capePoints.value.push(point)
  
  const wgs84 = batchCapeToWGS84([point])[0].wgs84
  wgs84Points.value.push(wgs84)

  manualEntry.value = {
    id: '',
    y: 0,
    x: 0,
    system: 'Lo 33',
    unit: 'C',
    description: ''
  }

  displayPointsOnMap()
  fitToBounds()
}

// Display points on map
function displayPointsOnMap() {
  if (!map) return

  // Remove existing point labels layer
  if (map.getLayer('point-labels')) {
    map.removeLayer('point-labels')
  }
  if (map.getSource('point-labels-source')) {
    map.removeSource('point-labels-source')
  }

  pointMarkers.forEach(m => m.remove())
  pointMarkers = []

  wgs84Points.value.forEach((point: WGS84Coordinate, index: number) => {
    const el = document.createElement('div')
    el.className = 'survey-point-marker'
    el.style.width = '14px'
    el.style.height = '14px'
    el.style.borderRadius = '50%'
    el.style.backgroundColor = '#3b82f6'
    el.style.border = '2px solid white'
    el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.4)'
    el.style.cursor = 'pointer'

    const capePoint = capePoints.value[index]
    const popupHTML = `
      <div style="padding: 10px; font-family: sans-serif; min-width: 220px;">
        <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: bold; color: #1f2937;">
          📍 ${point.id}
        </h3>
        <div style="font-size: 12px; color: #4b5563; line-height: 1.6;">
          <div><strong>Point Name:</strong> ${point.id}</div>
          <div><strong>Original:</strong> ${capePoint?.system || ''}</div>
          <div>Y: ${capePoint?.y.toFixed(3)} ${capePoint?.unit}</div>
          <div>X: ${capePoint?.x.toFixed(3)} ${capePoint?.unit}</div>
          ${capePoint?.description ? `<div><strong>Desc:</strong> ${capePoint.description}</div>` : ''}
          <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb;">
            <strong>WGS84:</strong><br>
            Lng: ${point.lng.toFixed(6)}°<br>
            Lat: ${point.lat.toFixed(6)}°
          </div>
        </div>
      </div>
    `

    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([point.lng, point.lat])
      .setPopup(new maplibregl.Popup({ offset: 15 }).setHTML(popupHTML))
      .addTo(map!)

    pointMarkers.push(marker)
  })

  // Add point labels if enabled
  if (showLabels.value && wgs84Points.value.length > 0) {
    const labelFeatures = wgs84Points.value.map((point: WGS84Coordinate) => ({
      type: 'Feature' as const,
      properties: { pointId: point.id },
      geometry: {
        type: 'Point' as const,
        coordinates: [point.lng, point.lat]
      }
    }))

    map!.addSource('point-labels-source', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection' as const,
        features: labelFeatures as any
      }
    })

    map!.addLayer({
      id: 'point-labels',
      type: 'symbol',
      source: 'point-labels-source',
      layout: {
        'text-field': ['get', 'pointId'],
        'text-size': 12,
        'text-offset': [0, -1.5],
        'text-anchor': 'bottom',
        'text-font': ['Open Sans Bold']
      },
      paint: {
        'text-color': '#1e40af',
        'text-halo-color': '#ffffff',
        'text-halo-width': 2
      }
    } as any)
  }
}

// Fit map to bounds
function fitToBounds() {
  if (!map || wgs84Points.value.length === 0) return

  if (wgs84Points.value.length === 1) {
    map.flyTo({
      center: [wgs84Points.value[0].lng, wgs84Points.value[0].lat],
      zoom: 15
    })
    return
  }

  const bounds = new maplibregl.LngLatBounds()
  wgs84Points.value.forEach((point: WGS84Coordinate) => {
    bounds.extend([point.lng, point.lat])
  })
  
  map.fitBounds(bounds, { padding: 50, maxZoom: 16 })
}

// Clear all data
function clearAllData() {
  capePoints.value = []
  wgs84Points.value = []
  polygons.value = []
  polygonAreas.value = []
  
  pointMarkers.forEach(m => m.remove())
  pointMarkers = []
  
  displayPolygons()
  clearDrawingOverlays()
  
  if (fileInput.value) {
    fileInput.value.value = ''
  }

  if (map) {
    map.flyTo({ center: [31, -20], zoom: 6 })
  }
}

// Open in Google Maps
function openInGoogleMaps(point: WGS84Coordinate) {
  const url = getGoogleMapsUrl(point)
  window.open(url, '_blank')
}

// Export to Google Maps (directions)
function exportToGoogleMaps() {
  if (wgs84Points.value.length === 0) return
  
  const url = getGoogleMapsDirectionsUrl(wgs84Points.value)
  window.open(url, '_blank')
}

// Export polygons to Google Maps (shows polygon centroid)
function exportPolygonsToGoogleMaps() {
  if (polygons.value.length === 0) return
  
  // Calculate centroid of first polygon
  const firstPoly = polygons.value[0]
  const centroid = calculatePolygonCentroid(firstPoly)
  
  // Build waypoints from all polygon vertices (unique points only)
  const allPoints = polygons.value.flat()
  const uniquePoints = allPoints.filter((p, i, arr) => 
    arr.findIndex(t => t.lng === p.lng && t.lat === p.lat) === i
  )
  
  if (uniquePoints.length > 1) {
    const url = getGoogleMapsDirectionsUrl(uniquePoints)
    window.open(url, '_blank')
  } else {
    // Single point - open directly
    window.open(getGoogleMapsUrl(uniquePoints[0] || centroid), '_blank')
  }
}

// Calculate polygon centroid
function calculatePolygonCentroid(points: WGS84Coordinate[]): WGS84Coordinate {
  let sumLng = 0
  let sumLat = 0
  for (const p of points) {
    sumLng += p.lng
    sumLat += p.lat
  }
  return {
    id: 'Centroid',
    lng: sumLng / points.length,
    lat: sumLat / points.length
  }
}

// Export to WhatsApp
function exportToWhatsApp() {
  if (wgs84Points.value.length === 0) return
  
  const url = getWhatsAppShareUrl(wgs84Points.value[0], 'Survey Location')
  window.open(url, '_blank')
}

// Export KML
function exportKML() {
  if (wgs84Points.value.length === 0) return

  const kmlContent = generateKML(wgs84Points.value, polygons.value, 'SurveyPro Geodetic Transform')
  downloadFile(kmlContent, 'geodetic_transform.kml', 'application/vnd.google-earth.kml+xml')
}

// Export CSV
function exportCSV() {
  if (wgs84Points.value.length === 0) return

  const headers = ['Point_ID', 'Cape_Y', 'Cape_X', 'Cape_System', 'Cape_Unit', 'WGS84_Longitude', 'WGS84_Latitude', 'Description']
  
  const rows = wgs84Points.value.map((wgs84: WGS84Coordinate, index: number) => {
    const cape = capePoints.value[index]
    return [
      wgs84.id,
      cape?.y?.toFixed(4) || '',
      cape?.x?.toFixed(4) || '',
      cape?.system || '',
      cape?.unit || '',
      wgs84.lng.toFixed(8),
      wgs84.lat.toFixed(8),
      wgs84.description || ''
    ].join(',')
  })

  const csvContent = [headers.join(','), ...rows].join('\n')
  downloadFile(csvContent, 'geodetic_transform.csv', 'text/csv')
}

// Keyboard handler for drawing
watch(isDrawingMode, (isActive) => {
  if (isActive) {
    document.addEventListener('keydown', handleKeyDown)
  } else {
    document.removeEventListener('keydown', handleKeyDown)
  }
})

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && isDrawingMode.value) {
    clearDrawingOverlays()
    drawingPoints.value = []
    isDrawingMode.value = false
  }
}
</script>

<style scoped>
:global(.survey-point-marker:hover) {
  transform: scale(1.2);
}

:global(.drawing-vertex:hover) {
  transform: scale(1.3);
  cursor: pointer;
}

table {
  font-size: 0.875rem;
}

tbody tr:hover {
  background-color: #f9fafb;
}
</style>
