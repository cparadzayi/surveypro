<template>
  <ModuleScaffold
    title="MapLibre Playground"
    description="Interactive MapLibre GL map testing environment"
  >
    <div class="space-y-4">
      <!-- CSV Import Section -->
      <div class="bg-white rounded-lg shadow-md p-4">
        <h3 class="font-semibold text-gray-900 mb-3">📁 Import Survey Points (Cape Lo 31)</h3>
        <div class="flex items-center gap-4">
          <input
            ref="fileInput"
            type="file"
            accept=".csv"
            @change="handleFileUpload"
            class="block text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
          />
          <button
            v-if="surveyPoints.length > 0"
            @click="clearPoints"
            class="px-4 py-2 text-sm font-medium text-red-700 bg-red-50 rounded-md hover:bg-red-100"
          >
            Clear Points
          </button>
        </div>
        <p class="text-xs text-gray-500 mt-2">
          Expected columns: Point, Y, X, Status, Description, Date<br>
          <strong>Note:</strong> Y=Westing, X=Southing in Cape Lo 31 (EPSG:22291)
        </p>
        <div v-if="surveyPoints.length > 0" class="mt-3 space-y-1">
          <div class="text-sm text-green-700">
            ✅ Loaded {{ surveyPoints.length }} points
          </div>
          <div v-if="coordinateStats" class="text-xs text-gray-600">
            Y range: {{ coordinateStats.minY.toFixed(2) }} to {{ coordinateStats.maxY.toFixed(2) }}m<br>
            X range: {{ coordinateStats.minX.toFixed(2) }} to {{ coordinateStats.maxX.toFixed(2) }}m<br>
            Center: {{ coordinateStats.centerLng.toFixed(6) }}°E, {{ Math.abs(coordinateStats.centerLat).toFixed(6) }}°S
          </div>
        </div>
      </div>

      <!-- Map Container -->
      <div class="bg-white rounded-lg shadow-md overflow-hidden">
        <div ref="mapContainer" class="w-full h-[600px]"></div>
      </div>

      <!-- Map Info -->
      <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 class="font-semibold text-blue-900 mb-2">📍 Marker Location</h3>
        <div class="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span class="font-medium text-gray-700">Longitude (E):</span>
            <span class="ml-2 text-gray-900">30°04'28"</span>
            <span class="ml-2 text-gray-600">({{ markerLng.toFixed(6) }}°)</span>
          </div>
          <div>
            <span class="font-medium text-gray-700">Latitude (S):</span>
            <span class="ml-2 text-gray-900">20°19'13"</span>
            <span class="ml-2 text-gray-600">({{ markerLat.toFixed(6) }}°)</span>
          </div>
          <div class="col-span-2">
            <span class="font-medium text-gray-700">Location:</span>
            <span class="ml-2 text-gray-900">Zvishavane</span>
          </div>
        </div>
      </div>

      <!-- Map Controls Info -->
      <div class="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h3 class="font-semibold text-gray-900 mb-2">🎮 Map Controls</h3>
        <ul class="text-sm text-gray-700 space-y-1">
          <li>• <strong>Pan:</strong> Click and drag</li>
          <li>• <strong>Zoom:</strong> Scroll wheel or +/- buttons</li>
          <li>• <strong>Rotate:</strong> Right-click and drag (or Ctrl + drag)</li>
          <li>• <strong>Pitch:</strong> Ctrl + drag up/down</li>
        </ul>
      </div>
    </div>
  </ModuleScaffold>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import ModuleScaffold from '../../../components/scaffold/ModuleScaffold.vue'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { capeLoToWGS84, type CapeLoPoint, type WGS84Point } from '../../../utils/coordinateTransform'

const mapContainer = ref<HTMLDivElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
let map: maplibregl.Map | null = null

// Survey points data
interface SurveyPoint extends WGS84Point {
  date?: string
}

const surveyPoints = ref<SurveyPoint[]>([])
const pointMarkers = ref<maplibregl.Marker[]>([])
const coordinateStats = ref<{
  minY: number
  maxY: number
  minX: number
  maxX: number
  centerLng: number
  centerLat: number
} | null>(null)

// Convert DMS to decimal degrees
// Longitude: 30°04'28"E = 30 + 4/60 + 28/3600 = 30.074444°
// Latitude: 20°19'13"S = -(20 + 19/60 + 13/3600) = -20.320278°
const markerLng = 30 + 4/60 + 28/3600  // 30.074444
const markerLat = -(20 + 19/60 + 13/3600)  // -20.320278

onMounted(() => {
  if (!mapContainer.value) return

  // Initialize MapLibre GL map
  map = new maplibregl.Map({
    container: mapContainer.value,
    style: {
      version: 8,
      sources: {
        'osm': {
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
          id: 'osm',
          type: 'raster',
          source: 'osm',
          minzoom: 0,
          maxzoom: 19
        }
      ]
    },
    center: [markerLng, markerLat],
    zoom: 13,
    pitch: 0,
    bearing: 0
  })

  // Add navigation controls
  map.addControl(new maplibregl.NavigationControl(), 'top-right')

  // Add scale control
  map.addControl(new maplibregl.ScaleControl(), 'bottom-left')

  // Create a custom marker element
  const markerElement = document.createElement('div')
  markerElement.className = 'custom-marker'
  markerElement.style.width = '30px'
  markerElement.style.height = '30px'
  markerElement.style.borderRadius = '50%'
  markerElement.style.backgroundColor = '#ef4444'
  markerElement.style.border = '3px solid white'
  markerElement.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)'
  markerElement.style.cursor = 'pointer'

  // Add marker with popup
  const marker = new maplibregl.Marker({
    element: markerElement,
    anchor: 'center'
  })
    .setLngLat([markerLng, markerLat])
    .addTo(map)

  // Create popup
  const popup = new maplibregl.Popup({
    offset: 25,
    closeButton: true,
    closeOnClick: false
  })
    .setLngLat([markerLng, markerLat])
    .setHTML(`
      <div style="padding: 8px; font-family: sans-serif;">
        <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: bold; color: #1f2937;">
          📍 Zvishavane
        </h3>
        <div style="font-size: 13px; color: #4b5563; line-height: 1.5;">
          <div><strong>Longitude:</strong> 30°04'28"E</div>
          <div><strong>Latitude:</strong> 20°19'13"S</div>
          <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #6b7280;">
            ${markerLng.toFixed(6)}°, ${markerLat.toFixed(6)}°
          </div>
        </div>
      </div>
    `)
    .addTo(map)

  // Show popup on marker click
  markerElement.addEventListener('click', () => {
    if (popup.isOpen()) {
      popup.remove()
    } else {
      popup.addTo(map!)
    }
  })

  console.log('MapLibre GL map initialized')
  console.log(`Marker placed at: ${markerLng.toFixed(6)}°E, ${Math.abs(markerLat).toFixed(6)}°S`)
})

// Parse CSV file
function parseCSV(text: string): CapeLoPoint[] {
  const lines = text.trim().split('\n')
  if (lines.length < 2) {
    throw new Error('CSV file is empty or has no data rows')
  }

  // Parse header
  const header = lines[0].split(',').map(h => h.trim().toLowerCase())
  const pointIdx = header.indexOf('point')
  const yIdx = header.indexOf('y')
  const xIdx = header.indexOf('x')
  const statusIdx = header.indexOf('status')
  const descIdx = header.indexOf('description')
  const dateIdx = header.indexOf('date')

  if (pointIdx === -1 || yIdx === -1 || xIdx === -1) {
    throw new Error('CSV must contain Point, Y, and X columns')
  }

  // Parse data rows
  const points: (CapeLoPoint & { date?: string })[] = []
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim())
    if (values.length < 3) continue // Skip empty rows

    const point: CapeLoPoint & { date?: string } = {
      id: values[pointIdx] || `Point_${i}`,
      y: parseFloat(values[yIdx]),
      x: parseFloat(values[xIdx]),
      status: statusIdx !== -1 ? values[statusIdx] : undefined,
      description: descIdx !== -1 ? values[descIdx] : undefined
    }

    if (dateIdx !== -1) {
      (point as any).date = values[dateIdx]
    }

    if (!isNaN(point.y) && !isNaN(point.x)) {
      points.push(point)
    }
  }

  return points
}

// Handle file upload
async function handleFileUpload(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  try {
    const text = await file.text()
    const capeLoPoints = parseCSV(text)
    
    console.log(`📁 Loaded ${capeLoPoints.length} points from CSV`)
    console.log('Sample point (Cape Lo 31):', capeLoPoints[0])

    // Transform to WGS84
    const wgs84Points = capeLoPoints.map(point => {
      const transformed = capeLoToWGS84(point)
      return {
        ...transformed,
        date: (point as any).date
      }
    })

    surveyPoints.value = wgs84Points
    console.log('Sample point (WGS84):', wgs84Points[0])

    // Calculate coordinate statistics
    const yValues = capeLoPoints.map(p => p.y)
    const xValues = capeLoPoints.map(p => p.x)
    const lngs = wgs84Points.map(p => p.lng)
    const lats = wgs84Points.map(p => p.lat)
    
    coordinateStats.value = {
      minY: Math.min(...yValues),
      maxY: Math.max(...yValues),
      minX: Math.min(...xValues),
      maxX: Math.max(...xValues),
      centerLng: lngs.reduce((sum, lng) => sum + lng, 0) / lngs.length,
      centerLat: lats.reduce((sum, lat) => sum + lat, 0) / lats.length
    }

    console.log('📊 Coordinate Statistics:', coordinateStats.value)
    console.log(`🎯 Expected for Zvishavane: lng ≈ 30.07°, lat ≈ -20.32°`)

    // Display points on map
    displayPointsOnMap()
  } catch (error) {
    console.error('Error loading CSV:', error)
    alert(`Error loading CSV: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// Display points on map
function displayPointsOnMap() {
  if (!map) return

  // Clear existing markers
  pointMarkers.value.forEach(marker => marker.remove())
  pointMarkers.value = []

  // Add markers for each point
  surveyPoints.value.forEach(point => {
    // Create marker element
    const el = document.createElement('div')
    el.className = 'survey-point-marker'
    el.style.width = '12px'
    el.style.height = '12px'
    el.style.borderRadius = '50%'
    el.style.backgroundColor = '#3b82f6'
    el.style.border = '2px solid white'
    el.style.boxShadow = '0 1px 3px rgba(0,0,0,0.4)'
    el.style.cursor = 'pointer'

    // Create popup content
    const popupHTML = `
      <div style="padding: 8px; font-family: sans-serif; min-width: 200px;">
        <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold; color: #1f2937;">
          📍 ${point.id}
        </h3>
        <div style="font-size: 12px; color: #4b5563; line-height: 1.6;">
          ${point.description ? `<div><strong>Description:</strong> ${point.description}</div>` : ''}
          ${point.status ? `<div><strong>Status:</strong> ${point.status}</div>` : ''}
          ${point.date ? `<div><strong>Date:</strong> ${point.date}</div>` : ''}
          <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #6b7280;">
            <div>Lng: ${point.lng.toFixed(6)}°</div>
            <div>Lat: ${point.lat.toFixed(6)}°</div>
          </div>
        </div>
      </div>
    `

    // Create marker with popup
    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([point.lng, point.lat])
      .setPopup(new maplibregl.Popup({ offset: 15 }).setHTML(popupHTML))
      .addTo(map!)

    pointMarkers.value.push(marker)
  })

  // Fit map to points
  if (surveyPoints.value.length > 0) {
    const bounds = new maplibregl.LngLatBounds()
    surveyPoints.value.forEach(point => {
      bounds.extend([point.lng, point.lat])
    })
    map!.fitBounds(bounds, { padding: 50, maxZoom: 15 })
  }

  console.log(`✅ Displayed ${surveyPoints.value.length} points on map`)
}

// Clear all points
function clearPoints() {
  surveyPoints.value = []
  pointMarkers.value.forEach(marker => marker.remove())
  pointMarkers.value = []
  coordinateStats.value = null
  if (fileInput.value) {
    fileInput.value.value = ''
  }
  
  // Reset map view to Zvishavane
  if (map) {
    map.flyTo({ center: [markerLng, markerLat], zoom: 13 })
  }
}

onBeforeUnmount(() => {
  // Clear markers
  pointMarkers.value.forEach(marker => marker.remove())
  pointMarkers.value = []
  
  // Remove map
  if (map) {
    map.remove()
    map = null
  }
})
</script>

<style scoped>
/* Additional styles if needed */
</style>
