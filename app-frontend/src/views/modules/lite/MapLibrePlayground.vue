<template>
  <ModuleScaffold
    title="MapLibre Playground"
    description="Interactive MapLibre GL map testing environment"
  >
    <div class="space-y-4">
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

const mapContainer = ref<HTMLDivElement | null>(null)
let map: maplibregl.Map | null = null

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

onBeforeUnmount(() => {
  if (map) {
    map.remove()
    map = null
  }
})
</script>

<style scoped>
/* Additional styles if needed */
</style>
