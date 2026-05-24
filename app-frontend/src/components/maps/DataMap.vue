<template>
  <div class="relative w-full h-96 border rounded">
    <div class="absolute top-2 left-2 z-10 text-[11px] bg-white/90 border rounded px-2 py-1 shadow-sm">
      <span class="font-medium">Renderer:</span>
      <span v-if="forceWgs84">WGS84 basemap</span>
      <span v-else>
        LO planar
        <span v-if="sridLabel">
          (EPSG:{{ sridLabel }}
          <span v-if="loLabel"> • Lo{{ loLabel }}</span>
          <span v-if="cmLabel"> • CM {{ cmLabel }}°E</span>)
        </span>
      </span>
    </div>
    <div class="absolute top-2 right-2 z-10 flex items-center gap-2">
      <button class="text-[11px] bg-white/90 border rounded px-2 py-1 shadow-sm hover:bg-gray-50"
              @click="toggleRenderer" :disabled="!canPreviewWgs84">
        {{ forceWgs84 ? 'Use LO planar' : 'Preview WGS84' }}
      </button>
      <button class="text-[11px] bg-white/90 border rounded px-2 py-1 shadow-sm hover:bg-gray-50"
              @click="zoomWorld100M" title="Switch to basemap and zoom to ~1:100,000,000">
        1:100M world
      </button>
    </div>
    <div class="absolute inset-0" ref="mapEl"></div>
    <!-- Planar grid overlay -->
    <svg v-if="!useBasemap" class="absolute inset-0 pointer-events-none" :viewBox="svgViewBox" preserveAspectRatio="none">
      <!-- light grid -->
      <g stroke="#e5e7eb" stroke-width="1">
        <line v-for="x in gridLinesX" :key="'vx-'+x" :x1="x" y1="0" :x2="x" :y2="svgH" />
        <line v-for="y in gridLinesY" :key="'hz-'+y" x1="0" :y1="y" :x2="svgW" :y2="y" />
      </g>
      <!-- Central meridian (Y=0) and ticks with labels -->
      <g v-if="axisPx !== null">
        <line :x1="axisPx" y1="0" :x2="axisPx" :y2="svgH" stroke="#ef4444" stroke-width="2" stroke-dasharray="4 3" />
        <g v-for="(t, i) in axisTicksX" :key="'cm-t'+i">
          <line :x1="axisPx - 5" :y1="t.py" :x2="axisPx + 5" :y2="t.py" stroke="#ef4444" stroke-width="1" />
          <text :x="axisPx + 7" :y="t.py + 3" fill="#ef4444" font-size="10" font-weight="600">{{ formatAxisLabelX(t.x) }}</text>
        </g>
        <text :x="axisPx + 6" y="12" fill="#ef4444" font-size="10" font-weight="700">Y=0</text>
      </g>
      <!-- Equator (X=0) and ticks (only if visible) with labels -->
      <g v-if="axisPy !== null">
        <line x1="0" :y1="axisPy" :x2="svgW" :y2="axisPy" stroke="#10b981" stroke-width="2" stroke-dasharray="4 3" />
        <g v-for="(t, i) in axisTicksY" :key="'eq-t'+i">
          <line :x1="t.px" :y1="axisPy - 5" :x2="t.px" :y2="axisPy + 5" stroke="#10b981" stroke-width="1" />
          <text :x="t.px + 4" :y="axisPy - 6" fill="#10b981" font-size="10" font-weight="600">{{ formatAxisLabelY(t.y) }}</text>
        </g>
        <text x="4" :y="axisPy - 6" fill="#10b981" font-size="10" font-weight="700">X=0</text>
      </g>
    </svg>
    <!-- Simple scalebar -->
    <div class="absolute bottom-2 left-2 z-10 text-[11px] bg-white/90 border rounded px-2 py-1 shadow-sm">
      <template v-if="!useBasemap">
        <div class="flex items-end gap-2">
          <div class="h-2 bg-gray-800" :style="{ width: scalePx + 'px' }"></div>
          <div>{{ formatMeters(scaleMeters) }}</div>
        </div>
      </template>
      <template v-else>
        <div ref="scaleEl"></div>
      </template>
    </div>
    <!-- Cursor coords -->
    <div class="absolute bottom-2 right-2 z-10 text-[11px] bg-white/90 border rounded px-2 py-1 shadow-sm min-w-[180px] text-right font-mono">
      <template v-if="!useBasemap">
        <span v-if="cursor">Y {{ fmt(-cursor.lng) }}, X {{ fmt(-cursor.lat) }}</span>
        <span v-else>Y —, X —</span>
      </template>
      <template v-else>
        <span v-if="cursor">{{ fmt(cursor.lat, 6) }}, {{ fmt(cursor.lng, 6) }}</span>
        <span v-else>—, —</span>
      </template>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, onMounted, onUnmounted, onBeforeUnmount, watch, computed } from 'vue'
import L from 'leaflet'
import proj4 from 'proj4'
import 'proj4leaflet'
import { coordinateTransform, CAPE_LO_ZONES, transformToLatLng } from '../../services/coordinateTransform'
import { getLayer } from '../../services/spatial'

const props = withDefaults(defineProps<{ 
  layerId?: number; 
  items: Array<any>;
  backgroundItems?: Array<any>;  // Layer features (no polygon)
  parcels?: Array<any>;  // Land parcels with polygon geometry
  showPolygon?: boolean;
  enableClick?: boolean;  // Enable clicking on background points
  designation?: string;  // Stand/Erf designation to label the polygon
}>(), {
  showPolygon: true,
  backgroundItems: () => [],
  parcels: () => [],
  enableClick: false,
  designation: ''
})

const emit = defineEmits<{
  (e: 'point-click', payload: { y: number; x: number; name?: string }): void
}>()

const mapEl = ref<HTMLDivElement|null>(null)
const scaleEl = ref<HTMLDivElement|null>(null)
let map: L.Map | null = null
let markers: L.CircleMarker[] = []
let backgroundMarkers: L.CircleMarker[] = []
let selectedMarkers: L.CircleMarker[] = []

// Layer groups for organized layer management (PERMANENT FIX)
let backgroundPointsLayer: L.LayerGroup | null = null
let selectedPointsLayer: L.LayerGroup | null = null
let polygonsLayer: L.LayerGroup | null = null

// Draw lock to prevent race conditions
let isDrawing = false
let drawQueued = false
let useBasemap = false
const currentSrid = ref<number|undefined>(undefined)
const currentZoom = ref<number>(0)

const LO_SRIDS = new Set([22285, 22287, 22289, 22291, 22293])
// Explicit central meridian mapping (degrees East) by EPSG, based on QGIS Cape / Lo belts
const CM_BY_EPSG: Record<number, number> = {
  22275: 15, // Lo15
  22277: 17, // Lo17
  22279: 19, // Lo19
  22281: 21, // Lo21
  22283: 23, // Lo23
  22285: 25, // Lo25
  22287: 27, // Lo27
  22289: 29, // Lo29
  22291: 31, // Lo31
  22293: 33  // Lo33
}

// PROJ4LEAFLET: Define proper CRS for Cape Lo projections
// Using EPSG:22289 (Cape Lo29) as reference - adjust for other Lo belts dynamically
function createCapeLoCRS(srid: number): any {
  const lo = CM_BY_EPSG[srid]
  if (!lo) {
    console.warn(`[DataMap] Unknown SRID ${srid}, falling back to Lo29`)
  }
  
  const centralMeridian = lo || 29
  
  // CRITICAL FIX: Proj4 definition for Cape / Lo family (Transverse Mercator on Clarke 1880)
  // Standard axis order (Easting, Northing) - Leaflet expects [lat, lng] = [Northing, Easting]
  // Zimbabwe cadastral data is stored as P(Y, X) = P(Northing, Easting) which maps to [lat, lng]
  const proj4def = `+proj=tmerc +lat_0=0 +lon_0=${centralMeridian} +k=1 +x_0=0 +y_0=0 +ellps=clrk80 +towgs84=-136,-108,-292,0,0,0,0 +units=m +no_defs`
  
  return new (L as any).Proj.CRS(`EPSG:${srid}`, proj4def, {
    resolutions: [
      8192,   // zoom 0:  1 pixel = 8192m
      4096,   // zoom 1:  1 pixel = 4096m
      2048,   // zoom 2:  1 pixel = 2048m
      1024,   // zoom 3:  1 pixel = 1024m
      512,    // zoom 4:  1 pixel = 512m
      256,    // zoom 5:  1 pixel = 256m
      128,    // zoom 6:  1 pixel = 128m
      64,     // zoom 7:  1 pixel = 64m
      32,     // zoom 8:  1 pixel = 32m
      16,     // zoom 9:  1 pixel = 16m
      8,      // zoom 10: 1 pixel = 8m
      4,      // zoom 11: 1 pixel = 4m
      2,      // zoom 12: 1 pixel = 2m
      1,      // zoom 13: 1 pixel = 1m
      0.5,    // zoom 14: 1 pixel = 0.5m
      0.25,   // zoom 15: 1 pixel = 0.25m (cadastral detail)
      0.125,  // zoom 16: 1 pixel = 0.125m
      0.0625, // zoom 17: 1 pixel = 0.0625m
      0.03125,// zoom 18: 1 pixel = 0.03125m
      0.015625,// zoom 19: 1 pixel = 0.015625m
      0.0078125// zoom 20: 1 pixel = 0.0078125m
    ],
    origin: [0, 0],
    bounds: (L as any).bounds(
      [-5000000, -5000000],  // Cover full South Africa extent
      [5000000, 5000000]
    )
  })
}
const forceWgs84 = ref(false)
const sridLabel = computed(() => currentSrid.value ? String(currentSrid.value) : '')
function fallbackLoFromSrid(s: number): number | null {
  // Heuristic for unknown EPSG in Cape/Lo family: EPSG 22270..22299 → Lo = (srid % 100) - 60
  if (s >= 22270 && s <= 22299) {
    const lo = (s % 100) - 60
    // Valid Lo belts are odd (15,17,...,33)
    if (lo >= 1 && lo <= 89 && lo % 2 === 1) return lo
  }
  return null
}

const cmLabel = computed(() => {
  const s = currentSrid.value
  if (!s) return ''
  const cm = CM_BY_EPSG[s] ?? fallbackLoFromSrid(s)
  return cm ? String(cm) : ''
})

const loLabel = computed(() => {
  const s = currentSrid.value
  if (!s) return ''
  const lo = CM_BY_EPSG[s] ?? fallbackLoFromSrid(s)
  return lo ? String(lo) : ''
})

// Dynamic marker sizing based on zoom level
function getMarkerRadius(zoom: number, isBackground: boolean): number {
  // Base sizes
  const baseRadius = isBackground ? 3 : 6
  
  // Zoom scaling: markers grow as we zoom in
  // Zoom 0-5: Small markers
  // Zoom 6-10: Medium markers
  // Zoom 11-15: Large markers
  // Zoom 16+: Extra large markers
  
  if (zoom <= 5) {
    return baseRadius * 0.7  // Smaller for overview
  } else if (zoom <= 10) {
    return baseRadius * 1.0  // Normal size
  } else if (zoom <= 15) {
    return baseRadius * 1.5  // Larger for detail
  } else {
    return baseRadius * 2.0  // Extra large for close-up
  }
}

function updateMarkerSizes() {
  if (!map) return
  const zoom = map.getZoom()
  currentZoom.value = zoom
  
  // Update background markers
  backgroundMarkers.forEach(marker => {
    marker.setRadius(getMarkerRadius(zoom, true))
  })
  
  // Update selected markers
  selectedMarkers.forEach(marker => {
    marker.setRadius(getMarkerRadius(zoom, false))
  })
}

function ensureBaseLayer() {
  if (!map) return
  const hasTile = (map as any)._layers && Object.values((map as any)._layers).some((l: any) => l instanceof L.TileLayer)
  if (useBasemap && !hasTile) {
    const el = mapEl.value!
    map.remove()
    map = L.map(el, { worldCopyJump: true, minZoom: 0, maxZoom: 19, zoomSnap: 0.25 })
    
    // CRITICAL FIX: Re-initialize layer groups when map is recreated
    backgroundPointsLayer = L.layerGroup().addTo(map)
    selectedPointsLayer = L.layerGroup().addTo(map)
    polygonsLayer = L.layerGroup().addTo(map)
    console.log('[DataMap] Layer groups re-initialized (WGS84 mode)')
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM contributors' }).addTo(map)
    // attach scale control for basemap
    if (scaleEl.value) {
      const ctrl = L.control.scale({ imperial: false })
      ctrl.addTo(map)
    }
    bindMapEvents()
  } else if (!useBasemap && hasTile) {
    const el = mapEl.value!
    map.remove()
    
    // PROJ4LEAFLET: Restore proper CRS based on SRID
    const srid = currentSrid.value
    let crs: any = L.CRS.Simple
    let usesProj4 = false
    
    if (srid && LO_SRIDS.has(srid)) {
      console.log(`[DataMap] 🌍 Restoring Proj4Leaflet CRS for EPSG:${srid}`)
      crs = createCapeLoCRS(srid)
      usesProj4 = true
    }
    
    // Initialize with appropriate CRS
    if (usesProj4) {
      map = L.map(el, { 
        crs: crs,
        minZoom: 8,
        maxZoom: 20,
        zoomSnap: 0.5,
        zoomDelta: 0.5,
        wheelPxPerZoomLevel: 60
      })
      console.log('[DataMap] ✅ Using Proj4Leaflet CRS - native Y,X coordinates')
    } else {
      map = L.map(el, { 
        crs: L.CRS.Simple,
        minZoom: -5,
        maxZoom: 5,
        zoomSnap: 0.25,
        wheelPxPerZoomLevel: 120
      })
      console.log('[DataMap] Using L.CRS.Simple (legacy mode)')
    }
    
    // CRITICAL FIX: Re-initialize layer groups when map is recreated
    backgroundPointsLayer = L.layerGroup().addTo(map)
    selectedPointsLayer = L.layerGroup().addTo(map)
    polygonsLayer = L.layerGroup().addTo(map)
    console.log('[DataMap] Layer groups re-initialized (Planar mode)')
    
    bindMapEvents()
  }
}

async function draw() {
  // PERMANENT FIX: Prevent concurrent draw() calls
  if (isDrawing) {
    console.log('[DataMap] Draw already in progress, queueing...')
    drawQueued = true
    return
  }
  
  isDrawing = true
  try {
    await performDraw()
  } finally {
    isDrawing = false
    
    // If another draw was queued, run it now
    if (drawQueued) {
      drawQueued = false
      setTimeout(() => draw(), 50)
    }
  }
}

async function performDraw() {
  if (!map) return
  
  console.log('[DataMap] 🎨 Starting draw cycle...')
  
  // PERMANENT FIX: Clear ALL layers properly
  if (backgroundPointsLayer) {
    backgroundPointsLayer.clearLayers()
  }
  if (selectedPointsLayer) {
    selectedPointsLayer.clearLayers()
  }
  if (polygonsLayer) {
    polygonsLayer.clearLayers()
  }
  
  // Also clear old marker arrays (backup cleanup)
  markers.forEach(m => { try { m.remove() } catch(e) {} })
  markers = []
  backgroundMarkers = []
  selectedMarkers = []

  // Decide rendering CRS
  const srid = currentSrid.value
  useBasemap = forceWgs84.value || srid === 4326
  ensureBaseLayer()

  // Get current zoom for initial sizing
  const zoom = map.getZoom()
  currentZoom.value = zoom

// Helper function to convert points to latlngs using the standardized service
  const convertToLatLngs = (points: any[]) => {
    if (!points || points.length === 0) {
      console.warn('[DataMap] convertToLatLngs: No points provided');
      return [];
    }
    
    // Use the coordinate transformation service
    // If CRS is Simple (no SRID set), we need to pass map's CRS directly
    if (!currentSrid.value && map) {
      const mapCRS = (map as any).options.crs
      console.log('[DataMap] 🔧 Using Simple CRS - transforming with map CRS directly')
      return transformToLatLng(points, mapCRS)
    }
    
    const result = coordinateTransform.transformForLeaflet(points);
    if (result.length === 0 && points.length > 0) {
      console.error('[DataMap] ❌ Transform returned empty array for non-empty input!')
      console.error('[DataMap] Points:', points.length, 'currentSrid:', currentSrid.value)
    }
    return result;
  }

  // Process background items (layer features - no polygon)
  console.log(`[DataMap] Processing ${props.backgroundItems?.length || 0} background items`)
  if (props.backgroundItems && props.backgroundItems.length > 0) {
    console.log('[DataMap] Sample background item:', props.backgroundItems[0])
    const sampleCoords = props.backgroundItems[0]?.geometry?.coordinates
    if (sampleCoords) {
      console.log(`[DataMap] 📍 Sample raw coords from DB: [0]=${sampleCoords[0]}, [1]=${sampleCoords[1]}`)
      console.log(`[DataMap] 📍 Interpreting as: X=${sampleCoords[0]}, Y=${sampleCoords[1]} (GeoJSON [x,y] order)`)
    }
  }
  
  const bgPts = (props.backgroundItems || []).map((f:any, i:number) => {
    // GeoJSON coordinates are in standard [x, y] order
    // Cape Lo: Y = Westing (~97k), X = Southing (~2.2M)
    const x = Number(f?.geometry?.coordinates?.[0])  // X = Southing (first in GeoJSON)
    const y = Number(f?.geometry?.coordinates?.[1])  // Y = Westing (second in GeoJSON)
    const name = f?.properties?.name || f?.properties?.beacon || f?.properties?.point_name || `BG${i+1}`
    
    if (i === 0 && Number.isFinite(y) && Number.isFinite(x)) {
      console.log(`[DataMap] First valid point: ${name} at P(Y=${y.toFixed(2)}, X=${x.toFixed(2)})`)
    }
    
    return { y, x, name, latlng: null as any }
  }).filter(p => Number.isFinite(p.y) && Number.isFinite(p.x))
  
  console.log(`[DataMap] Extracted ${bgPts.length} valid background points from ${props.backgroundItems?.length || 0} items`)

  const bgLatLngs = convertToLatLngs(bgPts)
  console.log(`[DataMap] 📍 Transformed to ${bgLatLngs.length} latLng coordinates`)
  if (bgLatLngs.length > 0) {
    console.log(`[DataMap] 📍 First transformed point: [${bgLatLngs[0][0].toFixed(2)}, ${bgLatLngs[0][1].toFixed(2)}]`)
  }
  
  // Store latlng for distance calculations
  bgPts.forEach((pt, i) => { pt.latlng = bgLatLngs[i] })

  // Process main items (selected points - with polygon)
  const pts = (props.items || []).map((f:any, i:number) => ({
    // CRITICAL FIX: GeoJSON coordinates are [longitude, latitude] = [X, Y]
    x: Number(f?.geometry?.coordinates?.[0] ?? f?.x),  // Easting
    y: Number(f?.geometry?.coordinates?.[1] ?? f?.y),  // Northing
    name: f?.properties?.name || f?.properties?.beacon || f?.properties?.point_name || `P${i+1}`
  })).filter(p => Number.isFinite(p.y) && Number.isFinite(p.x))

  const latlngs = convertToLatLngs(pts)

  // Calculate nearby points using density-based approach
  const nearbyPointIndices = new Set<number>()
  if (latlngs.length >= 3) {  // Only activate for parcels (3+ points)
    // Calculate bounding box of selected points
    const selectedBounds = L.latLngBounds(latlngs as any)
    const center = selectedBounds.getCenter()
    
    // Calculate search radius based on selected bounds
    const ne = selectedBounds.getNorthEast()
    const sw = selectedBounds.getSouthWest()
    const diagonal = Math.sqrt(
      Math.pow(ne.lat - sw.lat, 2) + Math.pow(ne.lng - sw.lng, 2)
    )
    const searchRadius = diagonal * 1.5  // Search within 150% of diagonal
    
    // Find all points within search radius
    const candidatePoints: Array<{index: number, dist: number}> = []
    bgPts.forEach((pt, i) => {
      const dist = Math.sqrt(
        Math.pow(pt.latlng[0] - center.lat, 2) + 
        Math.pow(pt.latlng[1] - center.lng, 2)
      )
      if (dist <= searchRadius) {
        candidatePoints.push({ index: i, dist })
      }
    })
    
    // Calculate local point density (average distance to nearest neighbors)
    let totalNearestDist = 0
    candidatePoints.forEach(cp => {
      // Find distance to nearest neighbor
      let minDist = Infinity
      candidatePoints.forEach(other => {
        if (cp.index !== other.index) {
          const d = Math.abs(cp.dist - other.dist)
          if (d < minDist) minDist = d
        }
      })
      totalNearestDist += minDist
    })
    const avgNearestDist = candidatePoints.length > 0 
      ? totalNearestDist / candidatePoints.length 
      : diagonal * 0.1
    
    // Adaptive threshold based on density
    // Dense areas: smaller threshold (fewer labels)
    // Sparse areas: larger threshold (more labels)
    const densityFactor = avgNearestDist / diagonal
    const adaptiveThreshold = diagonal * Math.min(0.8, Math.max(0.3, densityFactor * 2))
    
    // Select nearby points within adaptive threshold
    // Limit to max 30 points to prevent clutter
    const sortedCandidates = candidatePoints
      .filter(cp => cp.dist <= adaptiveThreshold)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 30)  // Max 30 labeled points
    
    sortedCandidates.forEach(cp => {
      nearbyPointIndices.add(cp.index)
    })
  }

  // Render background points with enhanced UX for clicking
  console.log(`[DataMap] Rendering ${bgLatLngs.length} background points, enableClick=${props.enableClick}, zoom=${zoom}`)
  
  for (let i = 0; i < bgLatLngs.length; i++) {
    const isNearby = nearbyPointIndices.has(i)
    const baseRadius = getMarkerRadius(zoom, true)
    
    // Larger radius when click is enabled for easier targeting
    const radius = props.enableClick 
      ? baseRadius * (isNearby ? 2.0 : 1.5)  // Much larger for clicking
      : baseRadius * (isNearby ? 1.5 : 1.2)  // INCREASED: all points bigger for visibility
    
    const m = L.circleMarker(bgLatLngs[i] as any, {
      radius: Math.max(radius, 12), // INCREASED: Minimum 12px for visibility
      color: '#2563eb',  // BLUE border (blue-600) for all background points
      weight: 3,
      fillColor: '#3b82f6',  // BLUE fill (blue-500) for all background points
      fillOpacity: 0.8,
      fill: true,
      stroke: true,
      pane: 'markerPane',
      interactive: props.enableClick
    })
    
    // Log first marker for debugging
    if (i === 0) {
      console.log(`[DataMap] 🔵 Created first background marker at:`, bgLatLngs[i], 'with radius:', Math.max(radius, 8))
      console.log(`[DataMap] 🔵 Marker options:`, m.options)
    }
    
    // Always show labels when click is enabled
    const tooltip = m.bindTooltip(String(bgPts[i].name), {
      permanent: props.enableClick || isNearby,
      direction: 'top',
      offset: L.point(0, props.enableClick ? -10 : (isNearby ? -8 : -6)),
      className: props.enableClick ? 'area-map-label-clickable' : 'area-map-label'
    })
    
    // Add click handler if enabled
    if (props.enableClick) {
      const pointData = bgPts[i]
      
      // Shared click handler for both marker and label
      const handleClick = () => {
        emit('point-click', { y: pointData.y, x: pointData.x, name: pointData.name })
        
        // Visual feedback: briefly flash the marker
        m.setStyle({ fillColor: '#22c55e', fillOpacity: 1.0 })
        setTimeout(() => {
          m.setStyle({ fillColor: '#60a5fa', fillOpacity: 0.7 })
        }, 200)
      }
      
      // Click handler for marker
      m.on('click', handleClick)
      
      // Make label clickable by adding event listener after tooltip is created
      m.on('tooltipopen', () => {
        const tooltipEl = tooltip.getTooltip()?.getElement()
        if (tooltipEl) {
          tooltipEl.style.cursor = 'pointer'
          tooltipEl.style.pointerEvents = 'auto'
          
          // Add click handler to label
          tooltipEl.addEventListener('click', (e) => {
            e.stopPropagation()
            handleClick()
          })
          
          // No hover color change for background labels - only for selected points
        }
      })
      
      // Hover effects
      m.on('mouseover', () => {
        m.setStyle({ 
          fillColor: '#3b82f6', 
          fillOpacity: 0.9,
          weight: 3,
          radius: radius * 1.2
        })
      })
      
      m.on('mouseout', () => {
        m.setStyle({ 
          fillColor: '#60a5fa', 
          fillOpacity: 0.7,
          weight: 2,
          radius: radius
        })
      })
      
      // Add pointer cursor
      m.on('add', () => {
        const element = m.getElement() as HTMLElement
        if (element) {
          element.style.cursor = 'pointer'
          element.style.transition = 'all 0.2s ease'
        }
      })
    }
    
    // PERMANENT FIX: Add to layer group instead of map directly
    if (backgroundPointsLayer) {
      m.addTo(backgroundPointsLayer)
    } else {
      m.addTo(map!)
    }
    markers.push(m)
    backgroundMarkers.push(m)
  }
  
  console.log(`[DataMap] ✅ Added ${backgroundMarkers.length} BLUE background point markers to layer group (color: #2563eb, fill: #3b82f6, opacity: 0.8)`)
  
  // CRITICAL: Verify layer group is attached to map
  if (backgroundPointsLayer && map) {
    const isAttached = map.hasLayer(backgroundPointsLayer)
    console.log(`[DataMap] 🔍 Background layer group attached to map: ${isAttached}`)
    if (!isAttached) {
      console.error('[DataMap] ❌ CRITICAL: Background layer group NOT attached! Re-adding...')
      backgroundPointsLayer.addTo(map)
    }
  }
  
  // Verify DOM elements are visible
  setTimeout(() => {
    const elements = document.querySelectorAll('.leaflet-interactive')
    const paths = document.querySelectorAll('path.leaflet-interactive')
    const circles = document.querySelectorAll('circle.leaflet-interactive')
    
    if (elements.length > 0) {
      console.log(`[DataMap] ✅ DOM Verified: ${elements.length} interactive elements (${paths.length} paths, ${circles.length} circles)`)
      
      // Sample first path element (SVG marker)
      const firstPath = paths[0] as SVGPathElement
      if (firstPath) {
        const style = window.getComputedStyle(firstPath)
        const attrs = {
          fill: firstPath.getAttribute('fill'),
          stroke: firstPath.getAttribute('stroke'),
          strokeWidth: firstPath.getAttribute('stroke-width'),
          fillOpacity: firstPath.getAttribute('fill-opacity'),
          d: firstPath.getAttribute('d')?.substring(0, 50) + '...'
        }
        console.log(`[DataMap] 📊 First path SVG attributes:`, attrs)
        console.log(`[DataMap] 📊 First path computed style: fill=${style.fill}, stroke=${style.stroke}, opacity=${style.opacity}, fillOpacity=${style.fillOpacity}`)
        
        // Check if path has any drawing commands
        const d = firstPath.getAttribute('d')
        if (!d || d.length < 10) {
          console.error('[DataMap] ❌ CRITICAL: Path has no drawing commands! Marker not rendering.')
        }
      }
    } else {
      console.warn('[DataMap] ⚠️ No interactive elements found in DOM - markers may not be rendering!')
      console.warn('[DataMap] 🔍 Debug info:')
      console.warn('  - backgroundPointsLayer exists:', !!backgroundPointsLayer)
      console.warn('  - selectedPointsLayer exists:', !!selectedPointsLayer)
      console.warn('  - map exists:', !!map)
      if (backgroundPointsLayer) {
        console.warn('  - backgroundPointsLayer layer count:', backgroundPointsLayer.getLayers().length)
      }
    }
  }, 200)

  // Render land parcels from database (polygons with stand labels)
  if (props.parcels && props.parcels.length > 0) {
    console.log(`[DataMap] 🏘️ Rendering ${props.parcels.length} land parcels on map`)
    console.log('[DataMap] First parcel sample:', props.parcels[0])
    
    for (const parcel of props.parcels) {
      try {
        // Extract polygon coordinates from geometry
        let coordinates: number[][][] = []
        
        // Priority: geojson (from view) > geometry > geom with coordinates
        if (parcel.geojson?.coordinates) {
          // GeoJSON from land_parcels_full view
          coordinates = parcel.geojson.coordinates
        } else if (parcel.geometry?.coordinates) {
          // Alternative property name (from RETURNING clause)
          coordinates = parcel.geometry.coordinates
        } else if (parcel.geom?.coordinates) {
          // Parsed geom object
          coordinates = parcel.geom.coordinates
        } else {
          console.warn(`[DataMap] ❌ Parcel ${parcel.stand}: No valid geometry found!`)
          continue
        }
        
        if (!coordinates || !coordinates[0] || coordinates[0].length < 3) {
          console.warn('[DataMap] Invalid parcel geometry:', parcel.stand, parcel)
          continue
        }
        
        // Convert coordinates to LatLng using same pattern as points
        // GeoJSON coordinates are [x, y] order; Cape Lo: Y=Westing(~97k), X=Southing(~2.2M)
        const ring = coordinates[0]
        const parcelPts = ring.map(coord => ({
          x: coord[0],  // X = Southing (first in GeoJSON)
          y: coord[1]   // Y = Westing (second in GeoJSON)
        }))
        const parcelLatLngs = convertToLatLngs(parcelPts)
        
        // CRITICAL: Check if transformation succeeded
        if (!parcelLatLngs || parcelLatLngs.length === 0) {
          console.warn(`[DataMap] ⚠️ Parcel ${parcel.stand}: Transformation returned empty array, skipping`)
          console.warn(`[DataMap] Points: ${parcelPts.length}, currentSrid: ${currentSrid.value}`)
          continue
        }
        
        // Determine parcel status: computed (green) or pending (yellow)
        const hasComputedArea = parcel.area_sqm && parcel.area_sqm > 0
        const isComputed = hasComputedArea
        
        // Color-coded styling based on computation status
        const parcelPoly = L.polygon(parcelLatLngs as any, {
          color: isComputed ? '#15803d' : '#ca8a04', // DARKER green-700 : yellow-600
          weight: 4, // INCREASED border thickness
          fillColor: isComputed ? '#4ade80' : '#fde047', // green-400 : yellow-300
          fillOpacity: isComputed ? 0.4 : 0.45, // INCREASED opacity for visibility
          lineJoin: 'round',
          className: isComputed ? 'land-parcel-computed' : 'land-parcel-pending'
          // Note: Polygons use overlayPane (z-400), markers use markerPane (z-600) by default
        })
        
        const statusIcon = isComputed ? '✅' : '⏳'
        const statusText = isComputed ? 'Computed' : 'Pending computation'
        console.log(`[DataMap] ${statusIcon} Created ${statusText} polygon for parcel ${parcel.stand}, area=${parcel.area_sqm || 'N/A'}`)
        
        // Add popup with parcel info and status
        const statusBadge = isComputed 
          ? `<span class="px-2 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-semibold">✅ Computed</span>`
          : `<span class="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded text-[10px] font-semibold">⏳ Pending</span>`
        
        const popupContent = `
          <div class="text-xs">
            <div class="flex items-center justify-between gap-2 mb-1">
              <div class="font-bold ${isComputed ? 'text-green-700' : 'text-yellow-700'}">${parcel.stand || 'Unknown Stand'}</div>
              ${statusBadge}
            </div>
            ${parcel.area_sqm ? `<div class="font-medium text-green-600">Area: ${(parcel.area_sqm / 10000).toFixed(4)} ha</div>` : '<div class="text-yellow-600 text-[10px]">⚠️ Area not computed yet</div>'}
            ${parcel.owner ? `<div class="text-gray-600">Owner: ${parcel.owner}</div>` : ''}
            ${parcel.notes ? `<div class="text-gray-500 text-[10px] mt-1">${parcel.notes}</div>` : ''}
          </div>
        `
        parcelPoly.bindPopup(popupContent)
        
        // PERMANENT FIX: Add polygon to dedicated layer group
        if (polygonsLayer) {
          parcelPoly.addTo(polygonsLayer)
        } else {
          parcelPoly.addTo(map!)
        }
        
        // Add stand label at centroid with color-coded status
        if (parcel.stand) {
          const centroid = parcelPoly.getBounds().getCenter()
          const standLabel = L.circleMarker(centroid, {
            radius: 0,
            opacity: 0,
            fillOpacity: 0
          })
          
          // Different label style based on computation status
          const labelClass = isComputed ? 'land-parcel-label-computed' : 'land-parcel-label-pending'
          
          standLabel.bindTooltip(parcel.stand, {
            permanent: true,
            direction: 'center',
            className: labelClass
          })
          
          standLabel.addTo(map!)
          markers.push(standLabel)
        }
        
        console.log(`[DataMap] Rendered parcel: ${parcel.stand}`)
      } catch (err) {
        console.error('[DataMap] Error rendering parcel:', parcel.stand, err)
      }
    }
  }

  // Simple polygon overlay for visual closure when 3+ points exist
  // Only show polygon if showPolygon prop is true
  if (props.showPolygon && latlngs.length >= 3) {
    const poly = L.polygon(latlngs as any, {
      color: '#059669', // emerald-600
      weight: 2,
      fillColor: '#34d399', // emerald-400
      fillOpacity: 0.2,
      lineJoin: 'round'
      // Note: Uses overlayPane by default (z-400), below markerPane (z-600)
    })
    // PERMANENT FIX: Add polygon to dedicated layer group
    if (polygonsLayer) {
      poly.addTo(polygonsLayer)
    } else {
      poly.addTo(map!)
    }
    
    // Add designation label at polygon centroid if provided
    if (props.designation && props.designation.trim()) {
      // Calculate centroid of polygon
      const centroid = poly.getBounds().getCenter()
      
      // Create a marker at centroid with designation label
      const labelMarker = L.circleMarker(centroid, {
        radius: 0,  // Invisible marker
        opacity: 0,
        fillOpacity: 0
      })
      
      labelMarker.bindTooltip(props.designation, {
        permanent: true,
        direction: 'center',
        className: 'polygon-designation-label'
      })
      
      labelMarker.addTo(map!)
      markers.push(labelMarker)
    }
  }

  // Render main points (larger, colored, with labels, dynamic sizing)
  for (let i = 0; i < latlngs.length; i++) {
    const m = L.circleMarker(latlngs[i] as any, {
      radius: Math.max(getMarkerRadius(zoom, false), 14), // INCREASED: Minimum 14px for visibility
      color: '#dc2626',  // RED border (red-600) for selected points
      weight: 4,
      fillColor: '#ef4444',  // RED fill (red-500) for selected points
      fillOpacity: 0.9,
      fill: true,
      stroke: true,
      pane: 'markerPane',
      interactive: false
    })
    
    // Log first marker for debugging
    if (i === 0) {
      console.log(`[DataMap] 🔴 Created first selected marker at:`, latlngs[i], 'with radius:', Math.max(getMarkerRadius(zoom, false), 10))
      console.log(`[DataMap] 🔴 Marker options:`, m.options)
    }
    const tooltip = m.bindTooltip(String(pts[i].name), {
      permanent: true,
      direction: 'top',
      offset: L.point(0, -8),
      className: 'area-map-label area-map-label-selected'
    })
    
    // Add hover effect to selected point labels
    m.on('tooltipopen', () => {
      const tooltipEl = tooltip.getTooltip()?.getElement()
      if (tooltipEl) {
        tooltipEl.addEventListener('mouseenter', () => {
          tooltipEl.style.backgroundColor = '#991b1b'
          tooltipEl.style.borderColor = '#7f1d1d'
          tooltipEl.style.boxShadow = '0 4px 8px rgba(0,0,0,0.25)'
        })
        
        tooltipEl.addEventListener('mouseleave', () => {
          tooltipEl.style.backgroundColor = 'rgba(255,255,255,0.9)'
          tooltipEl.style.borderColor = '#cbd5e1'
          tooltipEl.style.boxShadow = '0 1px 2px rgba(0,0,0,0.06)'
        })
      }
    })
    
    // PERMANENT FIX: Add to layer group instead of map directly
    if (selectedPointsLayer) {
      m.addTo(selectedPointsLayer)
    } else {
      m.addTo(map!)
    }
    markers.push(m)
    selectedMarkers.push(m)
  }
  
  if (latlngs.length > 0) {
    console.log(`[DataMap] ✅ Added ${latlngs.length} RED selected point markers to layer group (color: #dc2626, fill: #ef4444, opacity: 0.9)`)
  }

  // Fit bounds intelligently:
  // - If single point selected, use density-based zoom to show nearby points
  // - If multiple points exist, center on them with moderate padding
  // - Otherwise, show all background points
  try {
    if (latlngs.length === 1) {
      // Single point: calculate density-based radius to show nearby points
      const center = latlngs[0] as L.LatLngExpression
      const lat = (latlngs[0] as any)[0]
      const lng = (latlngs[0] as any)[1]
      
      // Calculate density by finding distances to nearest background points
      let radius = 50 // Default 50m radius if no background points
      
      if (bgLatLngs.length > 0) {
        // Find distances to all background points
        const distances: number[] = []
        bgLatLngs.forEach((bgLatLng: any) => {
          const dist = Math.sqrt(
            Math.pow(bgLatLng[0] - lat, 2) + 
            Math.pow(bgLatLng[1] - lng, 2)
          )
          distances.push(dist)
        })
        
        // Sort and get nearest neighbors
        distances.sort((a, b) => a - b)
        
        // Use average of 5-10 nearest neighbors to determine density
        const nearestCount = Math.min(10, Math.max(5, Math.floor(distances.length * 0.1)))
        const nearestDistances = distances.slice(0, nearestCount)
        const avgNearestDist = nearestDistances.reduce((sum, d) => sum + d, 0) / nearestDistances.length
        
        // Set radius based on density:
        // - Dense areas (avg < 20m): show 3x the average distance (tight zoom)
        // - Medium areas (20-100m): show 4x the average distance
        // - Sparse areas (> 100m): show 5x the average distance (wider view)
        if (avgNearestDist < 20) {
          radius = Math.max(25, avgNearestDist * 3) // Min 25m for very dense
        } else if (avgNearestDist < 100) {
          radius = avgNearestDist * 4
        } else {
          radius = Math.min(250, avgNearestDist * 5) // Max 250m for sparse
        }
        
        console.log(`[DataMap] Single point zoom - Avg nearest: ${avgNearestDist.toFixed(1)}m, Radius: ${radius.toFixed(1)}m`)
      }
      
      if (useBasemap) {
        // WGS84: Calculate appropriate zoom level based on radius
        // Rough approximation: zoom level for desired radius in degrees
        const radiusDeg = radius / 111320 // Convert meters to degrees (approximate)
        const zoom = Math.log2(360 / (radiusDeg * 4)) // Calculate zoom level
        map!.setView(center, Math.min(18, Math.max(12, zoom)))
      } else {
        // Planar mode: Create bounds around the point using calculated radius
        const bounds = L.latLngBounds(
          [lat - radius, lng - radius],
          [lat + radius, lng + radius]
        )
        map!.fitBounds(bounds)
      }
    } else if (latlngs.length > 1) {
      // Multiple points: center on selected points with moderate padding to show nearby context
      const b = L.latLngBounds(latlngs as any)
      if (b.isValid()) {
        // Use 30% padding and higher max zoom for better view of the polygon
        // This centers the polygon and shows nearby points without too much empty space
        map!.fitBounds(b.pad(0.3), { maxZoom: 16 })
      }
    } else if (bgLatLngs.length > 0) {
      // No selected points: show all background points
      console.log(`[DataMap] 🔍 Fitting bounds to ${bgLatLngs.length} background points`)
      
      // DEBUG: Show first 3 latLng values to verify transformation
      if (bgLatLngs.length > 0) {
        console.log(`[DataMap] 🔍 First 3 transformed latLngs:`)
        bgLatLngs.slice(0, 3).forEach((ll, i) => {
          console.log(`  [${i}]: [${ll[0].toFixed(2)}, ${ll[1].toFixed(2)}]`)
        })
      }
      
      const b = L.latLngBounds(bgLatLngs as any)
      console.log(`[DataMap] 🔍 Bounds:`, b.toBBoxString(), 'Valid:', b.isValid())
      
      if (b.isValid()) {
        // Use Leaflet's built-in fitBounds with appropriate padding and maxZoom
        // This handles all the zoom calculation properly for different CRS
        const mapOptions = (map as any).options
        const usesProj4 = mapOptions.crs && mapOptions.crs.code && mapOptions.crs.code.startsWith('EPSG:')
        
        // For Proj4 CRS (Cape Lo), use higher max zoom for detail
        // For Simple CRS, use lower max zoom
        const maxZoom = usesProj4 ? 18 : 2
        
        console.log(`[DataMap] 📐 Using ${usesProj4 ? 'Proj4' : 'Simple'} CRS, maxZoom: ${maxZoom}`)
        
        const containerSize = map!.getSize()
        console.log(`[DataMap] 📐 Map container size: ${containerSize.x}px × ${containerSize.y}px`)
        
        // CRITICAL: Skip fitBounds if container not rendered yet
        if (containerSize.x === 0 || containerSize.y === 0) {
          console.warn('[DataMap] ⚠️ Container size is 0, skipping fitBounds - will retry after render')
          // Retry after container renders
          setTimeout(() => {
            console.log('[DataMap] 🔄 Retrying fitBounds after container render...')
            draw()
          }, 100)
          return
        }
        
        console.log(`[DataMap] 📐 Current CRS code: ${mapOptions.crs.code || 'Simple'}`)
        console.log(`[DataMap] 📐 Before fitBounds - Zoom: ${map!.getZoom()}, Center: [${map!.getCenter().lat.toFixed(1)}, ${map!.getCenter().lng.toFixed(1)}]`)
        
        // Fit bounds with padding and appropriate zoom range
        // For Proj4 CRS (Cape Lo), use minZoom 14 to ensure points are visible
        const fitOptions: any = { 
          padding: [50, 50],  // Less padding for more data visibility
          maxZoom: maxZoom
        }
        
        // CRITICAL: Set minimum zoom for Proj4 to ensure data is visible
        if (usesProj4) {
          fitOptions.minZoom = 14  // Don't zoom out too far for survey data
          console.log(`[DataMap] 📐 Using minZoom: 14 to keep data visible`)
        }
        
        map!.fitBounds(b, fitOptions)
        
        console.log(`[DataMap] 🔍 After fitBounds - Zoom: ${map!.getZoom()}, Center: [${map!.getCenter().lat.toFixed(1)}, ${map!.getCenter().lng.toFixed(1)}]`)
        console.log(`[DataMap] 🔍 Map viewport bounds:`, map!.getBounds().toBBoxString())
      }
    }
  } catch (err) {
    console.error('[DataMap] ❌ Error in fitBounds:', err)
  }

  // CRITICAL FIX: Wait for CRS to be fully initialized before final positioning
  if (!useBasemap && map) {
    setTimeout(() => {
      const crs = (map as any).options.crs;
      const usesProj4CRS = crs && crs.code && crs.code.startsWith('EPSG:');
      
      if (usesProj4CRS && bgLatLngs.length > 0) {
        console.log('[DataMap] 🔄 Re-validating bounds after CRS initialization...');
        
        // Re-calculate bounds to ensure they're in the correct coordinate system
        const b = L.latLngBounds(bgLatLngs as any);
        if (b.isValid()) {
          const center = b.getCenter();
          const currentCenter = map?.getCenter();
          const currentZoom = map?.getZoom();
          
          console.log('[DataMap] 📍 Current center:', currentCenter ? [currentCenter.lat, currentCenter.lng] : 'null');
          console.log('[DataMap] 🎯 Bounds center:', [center.lat, center.lng]);
          
          // If center is significantly different, re-center the map
          if (currentCenter) {
            const distance = Math.sqrt(
              Math.pow(currentCenter.lat - center.lat, 2) + 
              Math.pow(currentCenter.lng - center.lng, 2)
            );
            
            if (distance > 1000) { // If off by more than 1km
              console.log('[DataMap] 🚨 Center misaligned, re-centering map...');
              map?.setView(center, currentZoom || 12);
            }
          }
        }
      }
    }, 500); // Wait 500ms for CRS to fully initialize
  }

  // Update grid/scalebar metrics for planar mode
  if (!useBasemap) {
    updatePlanarGrid()
  }
}

onMounted(async () => {
  if (!mapEl.value) return
  
  // EXPERT FIX: Initialize with SRID-appropriate CRS immediately (no switching)
  console.log('[DataMap] Initializing map with proper CRS...')
  
  let initialCRS: any = L.CRS.Simple
  let initialSettings: any = {
    center: [0, 0],
    zoom: 0,
    minZoom: -5,
    maxZoom: 5,
    zoomSnap: 0.25,
    wheelPxPerZoomLevel: 120
  }
  
  // Detect SRID BEFORE map creation to avoid CRS switching
  let detectedSrid = false
  if (props.layerId) {
    try {
      const layerData = await getLayer(props.layerId)
      if (layerData?.srid && LO_SRIDS.has(layerData.srid)) {
        console.log(`[DataMap] ✅ Detected SRID ${layerData.srid} - Using Proj4 CRS from start`)
        currentSrid.value = layerData.srid
        coordinateTransform.setProjection(layerData.srid)
        initialCRS = coordinateTransform.getCRS()
        
        // CRITICAL: Calculate initial center from data if available
        let initialCenter: [number, number] = [0, 0]
        const allItems = [...(props.backgroundItems || []), ...(props.items || [])]
        if (allItems.length > 0) {
          // Extract coordinates and calculate bounds
          const coords = allItems
            .map(item => item?.geometry?.coordinates)
            .filter(c => c && c.length === 2)
          
          if (coords.length > 0) {
            // Calculate center of data
            const avgY = coords.reduce((sum, c) => sum + c[0], 0) / coords.length
            const avgX = coords.reduce((sum, c) => sum + c[1], 0) / coords.length
            initialCenter = [avgX, avgY]  // [X, Y] for Leaflet
            console.log(`[DataMap] 📍 Calculated initial center from ${coords.length} points: [${avgX.toFixed(0)}, ${avgY.toFixed(0)}]`)
          }
        }
        
        initialSettings = {
          center: initialCenter,
          zoom: 14,  // Start at reasonable zoom for survey data
          minZoom: 8,
          maxZoom: 20,
          zoomSnap: 0.5,
          zoomDelta: 0.5,
          wheelPxPerZoomLevel: 60
        }
        detectedSrid = true
      } else {
        console.log('[DataMap] ⚠️ No compatible SRID in layer data, using Simple CRS')
      }
    } catch (err) {
      console.warn('[DataMap] ⚠️ Could not detect SRID, using Simple CRS:', err)
    }
  } else {
    console.log('[DataMap] ℹ️ No layerId provided, using Simple CRS')
  }
  
  // CRITICAL: If using Simple CRS, ensure coordinateTransform knows about it
  if (!detectedSrid && initialCRS === L.CRS.Simple) {
    console.log('[DataMap] 🔧 Configuring coordinateTransform for Simple CRS mode')
    // Simple CRS uses no projection, coordinateTransform will handle it
  }
  
  map = L.map(mapEl.value, { 
    crs: initialCRS,
    ...initialSettings
  })
  console.log(`[DataMap] Map initialized with ${initialCRS.code || 'L.CRS.Simple'}`)
  
  // Initialize layer groups
  backgroundPointsLayer = L.layerGroup().addTo(map)
  selectedPointsLayer = L.layerGroup().addTo(map)
  polygonsLayer = L.layerGroup().addTo(map)
  console.log('[DataMap] Layer groups initialized')
  
  bindMapEvents()
  
  // Wait for container to be properly sized, then draw
  setTimeout(() => {
    console.log('[DataMap] 🔍 Checking map container size...')
    const containerSize = map!.getSize()
    console.log(`[DataMap] 📏 Container: ${containerSize.x}px × ${containerSize.y}px`)
    console.log(`[DataMap] 📦 backgroundItems count: ${props.backgroundItems?.length || 0}`)
    console.log(`[DataMap] 📦 items count: ${props.items?.length || 0}`)
    
    if (containerSize.x === 0 || containerSize.y === 0) {
      console.warn('[DataMap] ⚠️ Container not ready, waiting...')
      setTimeout(() => {
        map!.invalidateSize()
        console.log('[DataMap] 🔄 Invalidated map size')
        console.log(`[DataMap] 📦 After invalidate - backgroundItems: ${props.backgroundItems?.length || 0}`)
        draw()
      }, 500)
    } else {
      console.log('[DataMap] ✅ Container ready')
      
      // Only draw if we have data, otherwise wait for watch to trigger
      const hasData = (props.backgroundItems?.length || 0) > 0 || (props.items?.length || 0) > 0
      if (hasData) {
        console.log('[DataMap] 📍 Data available, drawing immediately...')
        draw()
      } else {
        console.log('[DataMap] ⏳ No data yet, waiting for props to populate (watch will trigger draw)')
      }
    }
  }, 200)
})

// Initialize layer groups for the map
function initializeLayers() {
  if (!map) return;
  
  // Clear existing layers if any
  if (selectedPointsLayer) {
    selectedPointsLayer.clearLayers();
  }
  if (polygonsLayer) {
    polygonsLayer.clearLayers();
  }
  if (backgroundPointsLayer) {
    backgroundPointsLayer.clearLayers();
  }
  
  // Add layers to map
  selectedPointsLayer?.addTo(map);
  backgroundPointsLayer?.addTo(map);
  if (props.showPolygon) {
    polygonsLayer?.addTo(map);
  }
  
  console.log('[DataMap] ✅ Layer groups initialized');
}

// Helper function to switch to Proj4 CRS after map is already initialized
function switchToProj4CRS(srid: number) {
  if (!map || !mapEl.value) return
  
  console.log(`[DataMap] 🔄 Switching to Proj4 CRS for SRID ${srid}...`)
  
  try {
    // Set the projection using the coordinate transformation service
    coordinateTransform.setProjection(srid)
    
    // Get the new CRS from the service
    const newCRS = coordinateTransform.getCRS()
    
    // Store current view state
    const currentCenter = map.getCenter()
    const currentZoom = map.getZoom()
    
    // Remove the old map and create new one with new CRS
    map.remove()
    map = null
    
    // Create new map with Proj4 CRS
    map = L.map(mapEl.value, {
      crs: newCRS,
      center: [0, 0],
      zoom: 12,
      minZoom: 8,
      maxZoom: 20,  // Match the extended CRS resolutions array
      zoomSnap: 0.5,
      zoomDelta: 0.5,
      zoomControl: true,
      attributionControl: false
    })
    
    // Add metric scale for Proj4CRS
    L.control.scale({ 
      imperial: false, 
      metric: true,
      maxWidth: 150,
      position: 'bottomleft'
    }).addTo(map)
    
    console.log('[DataMap] ✅ New map created with Proj4 CRS')
    
    // Re-initialize layers
    initializeLayers()
    
    // Trigger redraw after a short delay to ensure CRS is ready
    setTimeout(() => {
      draw()
    }, 200)
    
  } catch (error) {
    console.error('[DataMap] ❌ Failed to switch to Proj4 CRS:', error)
    // Fallback to simple redraw
    setTimeout(() => draw(), 100)
  }
}

onBeforeUnmount(() => { if (map) map.remove() })

watch(() => [props.items, props.backgroundItems, props.parcels, currentSrid.value, forceWgs84.value], () => { 
  console.log('[DataMap] 🔔 Watch triggered - items:', props.items?.length, 'bgItems:', props.backgroundItems?.length, 'parcels:', props.parcels?.length)
  draw() 
}, { deep: true })
watch(() => props.layerId, async (v) => {
  if (!v) { 
    currentSrid.value = undefined
    draw()
    return 
  }
  
  try {
    const layer = await getLayer(v)
    const srid = Number(layer?.srid || 0) || undefined
    
    if (srid && LO_SRIDS.has(srid)) {
      console.log(`[DataMap] 🔄 LayerId changed: Detected SRID ${srid}, initializing Proj4 CRS`)
      
      // CRITICAL: Check if map needs CRS switch
      const currentMapCRS = (map as any)?.options?.crs
      const needsCRSSwitch = currentMapCRS && !currentMapCRS.code
      
      if (needsCRSSwitch) {
        console.log(`[DataMap] 🔄 Map is using Simple CRS, switching to Proj4 EPSG:${srid}`)
        currentSrid.value = srid
        switchToProj4CRS(srid)  // This reinitializes map + coordinateTransform
      } else {
        console.log(`[DataMap] ✅ Map already using Proj4, just updating transform`)
        currentSrid.value = srid
        coordinateTransform.setProjection(srid)
        draw()
      }
    } else {
      console.log(`[DataMap] ⚠️ LayerId ${v} has no compatible SRID (${layer?.srid})`)
      currentSrid.value = undefined
      draw()
    }
  } catch (err) {
    console.error('[DataMap] ❌ Failed to fetch layer for SRID detection:', err)
    currentSrid.value = undefined
    draw()
  }
}, { immediate: true })

const canPreviewWgs84 = computed(() => true) // Always allow preview; data stays in-place for simple check
function toggleRenderer() {
  forceWgs84.value = !forceWgs84.value
}

// Zoom to approximately 1:100,000,000 on WGS84 basemap centered near the project
function zoomWorld100M() {
  forceWgs84.value = true
  useBasemap = true
  ensureBaseLayer()
  const { lat, lon } = estimateLatLon()
  const z = zoomForScale(100_000_000, lat)
  try { map && map.setView([lat, lon], z) } catch {}
}

// Compute Leaflet zoom for a target map scale at given latitude (approx, 96 dpi)
function zoomForScale(scaleDenom: number, latDeg: number) {
  const dpi = 96
  const mPerPxTarget = (0.0254 / dpi) * scaleDenom
  const baseResAtZ0 = 156543.03392804097 * Math.cos((latDeg || 0) * Math.PI / 180)
  const zFloat = Math.log2(baseResAtZ0 / mPerPxTarget)
  return Math.max(0, Math.round(zFloat * 4) / 4)
}

// Estimate lat/lon from current items and CM when no geodetic data is available
function estimateLatLon() {
  // Default to Zimbabwe center-ish if no data
  let lat = -18
  let lon = 31
  const xs: number[] = (props.items || [])
    .map((f: any) => Number(f?.geometry?.coordinates?.[1]))
    .filter((v: any) => Number.isFinite(v))
  if (xs.length) {
    const sorted = xs.slice().sort((a,b)=>a-b)
    const med = sorted[Math.floor(sorted.length/2)]
    // Rough meters-per-degree for latitude
    lat = -(med / 111132)
  }
  const cmNum = Number(cmLabel.value)
  if (Number.isFinite(cmNum) && cmNum > 0) lon = cmNum
  return { lat, lon }
}

// Simple planar grid math: map bounds → svg grid lines
const svgW = 1000, svgH = 1000
const svgViewBox = computed(() => `0 0 ${svgW} ${svgH}`)
const gridLinesX = ref<number[]>([])
const gridLinesY = ref<number[]>([])
const scalePx = ref(100) // default pixel bar
const scaleMeters = ref(100)
// Axes (central meridian and equator) in SVG px
const axisPx = ref<number|null>(null) // vertical line for Y=0
const axisPy = ref<number|null>(null) // horizontal line for X=0
const axisTicksX = ref<Array<{ py: number; x: number }>>([]) // ticks along Y=0 (varying X)
const axisTicksY = ref<Array<{ px: number; y: number }>>([]) // ticks along X=0 (varying Y)

function roundNice(n: number) {
  const p = Math.pow(10, Math.floor(Math.log10(n)))
  const d = n / p
  let m = 1
  if (d >= 5) m = 5
  else if (d >= 2) m = 2
  return m * p
}

function updatePlanarGrid() {
  if (!map) return
  
  // TEMPORARY: Disable for Proj4Leaflet (grid not yet compatible)
  const crs = (map as any).options.crs
  if (crs && crs.code && crs.code.startsWith('EPSG:')) {
    return // Skip grid updates for Proj4 CRS
  }
  
  const b = map.getBounds()
  const nw = b.getNorthWest() as any // [lat, lng] where lat=-X, lng=-Y in planar mapping
  const se = b.getSouthEast() as any
  // With mapping lat = -X (southwards positive), lng = -Y (westwards positive)
  const minX = -nw.lat  // smaller X at top (more north)
  const maxX = -se.lat  // larger X at bottom (more south)
  const minY = -se.lng // smaller westing (Y) from lng=-Y
  const maxY = -nw.lng // larger westing (Y) from lng=-Y
  
  // Validate bounds
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    console.warn('[DataMap] Invalid bounds, skipping grid update')
    return
  }
  
  const dx = Math.max(1, maxX - minX)
  const dy = Math.max(1, maxY - minY)
  const stepX = roundNice(dx / 8) // grid spacing for X (southing)
  const stepY = roundNice(dy / 6) // grid spacing for Y (westing)
  const mapSize = map.getSize()
  
  // Validate map size
  if (!mapSize || mapSize.x <= 0 || mapSize.y <= 0) {
    console.warn('[DataMap] Invalid map size, skipping grid update')
    return
  }
  
  // pixels per unit for each axis mapped to screen dimensions
  const pxPerY = mapSize.x / dy // horizontal pixels per 1 unit of Y
  const pxPerX = mapSize.y / dx // vertical pixels per 1 unit of X
  const sx = svgW / mapSize.x
  const sy = svgH / mapSize.y
  
  // Validate calculated values
  if (!Number.isFinite(pxPerY) || !Number.isFinite(pxPerX) || !Number.isFinite(sx) || !Number.isFinite(sy)) {
    console.warn('[DataMap] Invalid pixel calculations, skipping grid update')
    return
  }
  const startX = Math.floor(minX / stepX) * stepX
  const startY = Math.floor(minY / stepY) * stepY
  // Vertical grid lines at constant Y values
  const linesX: number[] = []
  for (let y = startY; y <= maxY; y += stepY) {
    const px = (y - minY) * pxPerY * sx
    linesX.push(px)
  }
  // Horizontal grid lines at constant X values
  const linesY: number[] = []
  for (let x = startX; x <= maxX; x += stepX) {
    // increasing X should move downwards on screen
    const py = (x - minX) * pxPerX * sy
    linesY.push(py)
  }
  gridLinesX.value = linesX
  gridLinesY.value = linesY

  // scale bar: pick ~150px bar
  const targetPx = 150
  const meters = roundNice(targetPx / (mapSize.x / dx))
  scaleMeters.value = meters
  scalePx.value = meters * (mapSize.x / dx)

  // Central meridian (Y=0) vertical line position
  if (minY <= 0 && 0 <= maxY) {
    const calculatedAxisPx = (0 - minY) * pxPerY * sx
    if (Number.isFinite(calculatedAxisPx)) {
      axisPx.value = calculatedAxisPx
      // ticks along varying X at grid stepX
      const ticks: Array<{ py: number; x: number }> = []
      for (let x = startX; x <= maxX; x += stepX) {
        const py = (x - minX) * pxPerX * sy
        if (Number.isFinite(py)) {
          ticks.push({ py, x })
        }
      }
      axisTicksX.value = ticks
    } else {
      axisPx.value = null
      axisTicksX.value = []
    }
  } else {
    axisPx.value = null
    axisTicksX.value = []
  }

  // Equator (X=0) horizontal line position (may be outside view for Zimbabwe)
  if (minX <= 0 && 0 <= maxX) {
    const calculatedAxisPy = (0 - minX) * pxPerX * sy
    if (Number.isFinite(calculatedAxisPy)) {
      axisPy.value = calculatedAxisPy
      // ticks along varying Y at grid stepY
      const ticks: Array<{ px: number; y: number }> = []
      for (let y = startY; y <= maxY; y += stepY) {
        const px = (y - minY) * pxPerY * sx
        if (Number.isFinite(px)) {
          ticks.push({ px, y })
        }
      }
      axisTicksY.value = ticks
    } else {
      axisPy.value = null
      axisTicksY.value = []
    }
  } else {
    axisPy.value = null
    axisTicksY.value = []
  }
}

function formatMeters(m: number) {
  if (m >= 1000) return (m/1000).toFixed(m%1000===0?0:1) + ' km'
  return m.toFixed(m%1===0?0:1) + ' m'
}

// Cursor coordinate overlay
const cursor = ref<L.LatLng | null>(null)
function fmt(n: number, d = 3) {
  return Number(n).toFixed(d)
}
function bindMapEvents() {
  if (!map) return
  map.off('mousemove')
  map.off('mouseout')
  map.off('move')
  map.off('zoom')
  map.on('mousemove', (e: L.LeafletMouseEvent) => { cursor.value = e.latlng })
  map.on('mouseout', () => { cursor.value = null })
  map.on('move', () => { if (!useBasemap) updatePlanarGrid() })
  map.on('zoom', () => { 
    if (!useBasemap) updatePlanarGrid()
    updateMarkerSizes() // Update marker sizes on zoom
  })
}

function thousandsWithSpaces(n: number) {
  const s = Math.abs(n).toString()
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}
function formatAxisLabelX(x: number) {
  // Zimbabwe context: present X as Southing (S) always
  return `${thousandsWithSpaces(Math.abs(Math.round(x)))} m S`
}
function formatAxisLabelY(y: number) {
  // Zimbabwe context: present Y as Easting (E) always
  return `${thousandsWithSpaces(Math.abs(Math.round(y)))} m E`
}
</script>
<script lang="ts">
export default { name: 'DataMap' }
</script>
<style scoped>
.leaflet-container { height: 24rem; }
.area-map-label {
  background: rgba(255,255,255,0.9);
  color: #111827;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  padding: 1px 4px;
  font-size: 12px;
  font-weight: 500;
  box-shadow: 0 1px 2px rgba(0,0,0,0.06);
}

/* Selected polygon point labels - distinct styling with hover effect */
.area-map-label-selected {
  background: rgba(255,255,255,0.9) !important;
  color: #111827 !important;
  border: 1px solid #cbd5e1 !important;
  border-radius: 4px !important;
  padding: 2px 5px !important;
  font-size: 12px !important;
  font-weight: 600 !important;
  box-shadow: 0 1px 2px rgba(0,0,0,0.06) !important;
  cursor: default !important;
  transition: background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease !important;
  user-select: none !important;
}

/* Enhanced clickable point labels */
.area-map-label-clickable {
  background: #3b82f6 !important;
  color: white !important;
  border: 2px solid #1e40af !important;
  border-radius: 6px !important;
  padding: 3px 7px !important;
  font-size: 13px !important;
  font-weight: 600 !important;
  box-shadow: 0 2px 4px rgba(0,0,0,0.15) !important;
  pointer-events: auto !important;
  cursor: pointer !important;
  transition: background-color 0.15s ease, box-shadow 0.15s ease !important;
  user-select: none !important;
  white-space: nowrap !important;
}

/* Polygon designation label - centered on polygon */
.polygon-designation-label {
  background: rgba(5, 150, 105, 0.95) !important;
  color: white !important;
  border: 2px solid #047857 !important;
  border-radius: 8px !important;
  padding: 6px 12px !important;
  font-size: 15px !important;
  font-weight: 700 !important;
  box-shadow: 0 4px 6px rgba(0,0,0,0.2) !important;
  text-align: center !important;
  white-space: nowrap !important;
  letter-spacing: 0.5px !important;
  pointer-events: none !important;
}

/* Land parcel polygon labels - violet theme (legacy) */
.land-parcel-label {
  background: rgba(124, 58, 237, 0.95) !important;
  color: white !important;
  border: 2px solid #6d28d9 !important;
  border-radius: 6px !important;
  padding: 4px 10px !important;
  font-size: 13px !important;
  font-weight: 600 !important;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2) !important;
  text-align: center !important;
  white-space: nowrap !important;
  letter-spacing: 0.3px !important;
  pointer-events: none !important;
}

/* Land parcel labels - COMPUTED (green) */
.land-parcel-label-computed {
  background: rgba(22, 163, 74, 0.95) !important; /* green-600 */
  color: white !important;
  border: 2px solid #15803d !important; /* green-700 */
  border-radius: 6px !important;
  padding: 4px 10px !important;
  font-size: 13px !important;
  font-weight: 600 !important;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2) !important;
  text-align: center !important;
  white-space: nowrap !important;
  letter-spacing: 0.3px !important;
  pointer-events: none !important;
}

/* Land parcel labels - PENDING (yellow) */
.land-parcel-label-pending {
  background: rgba(234, 179, 8, 0.95) !important; /* yellow-500 */
  color: #422006 !important; /* yellow-950 for contrast */
  border: 2px solid #a16207 !important; /* yellow-700 */
  border-radius: 6px !important;
  padding: 4px 10px !important;
  font-size: 13px !important;
  font-weight: 600 !important;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2) !important;
  text-align: center !important;
  white-space: nowrap !important;
  letter-spacing: 0.3px !important;
  pointer-events: none !important;
}

/* Force Leaflet circle markers to be visible */
.leaflet-interactive {
  visibility: visible !important;
  display: block !important;
  /* DO NOT override opacity - let Leaflet control it */
}

/* Ensure circle markers render properly - PRESERVE SVG ATTRIBUTES */
path.leaflet-interactive {
  /* SVG path elements for circles must inherit their attributes from Leaflet */
  pointer-events: auto !important;
}

/* ensure container positions absolute overlays */
.relative > .leaflet-container { height: 100%; }
</style>
