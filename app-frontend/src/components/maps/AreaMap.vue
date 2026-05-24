<template>
  <div class="space-y-2">
    <div class="flex gap-2 items-end">
      <label class="block">
        <span class="text-xs text-gray-600">Layer</span>
        <LayerSelect v-model="layerIdLocal" />
      </label>
      <label class="block">
        <span class="text-xs text-gray-600">Search point</span>
        <input v-model="q" @input="onInput" class="border rounded px-2 py-1 w-64" placeholder="Beacon/Name" />
      </label>
      <button class="px-3 py-1 bg-slate-600 text-white rounded" :disabled="!selectedSuggestion" @click="addSelected">Add</button>
      <label class="ml-auto flex items-center gap-2 text-xs">
        <input type="checkbox" v-model="useBasemap" />
        Show on basemap (WGS84)
      </label>
      <span v-if="fallbackMsg" class="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">{{ fallbackMsg }}</span>
    </div>

    <ul v-if="suggestions.length" class="border rounded max-h-40 overflow-auto text-sm">
      <li v-for="s in suggestions" :key="s.id" class="px-2 py-1 hover:bg-slate-100 cursor-pointer" @click="setSelected(s)">
        {{ displayName(s) }} — (Y: {{ coordFmt(s.geometry.coordinates[1]) }}, X: {{ coordFmt(s.geometry.coordinates[0]) }})
      </li>
    </ul>

    <div ref="mapEl" class="w-full h-80 rounded border" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import proj4 from 'proj4'
import 'proj4leaflet'
import LayerSelect from '../inputs/LayerSelect.vue'
import { searchFeatures, type Feature } from '../../services/spatial'

// Provide component name for TS tooling
defineOptions({ name: 'AreaMap' })

const emit = defineEmits<{
  (e: 'add-point', payload: { y: number; x: number; name?: string }): void
  (e: 'changed-selection', payload: { points: Array<{ y: number; x: number; name?: string }>}): void
}>()

const props = defineProps<{
  selected: Array<{ y: number; x: number; name?: string }>
  layerId?: number
}>()

const layerIdLocal = ref<number | undefined>(props.layerId)
const q = ref('')
const suggestions = ref<Feature[]>([])
const selectedSuggestion = ref<Feature | null>(null)

let map: L.Map | null = null
const mapEl = ref<HTMLDivElement | null>(null)
const useBasemap = ref(false)
const fallbackMsg = ref('')
let markers: L.Layer[] = []
let poly: L.Polyline | null = null
let polyFill: L.Polygon | null = null
let geojsonLayer: L.GeoJSON<any> | null = null

// Cape Lo projection constants (matching DataMap.vue and CalculationsPart2View.vue)
const LO_SRIDS = new Set([22285, 22287, 22289, 22291, 22293]);
const CM_BY_EPSG: Record<number, number> = {
  22285: 25, // Lo25
  22287: 27, // Lo27
  22289: 29, // Lo29
  22291: 31, // Lo31
  22293: 33  // Lo33
};

// Layer groups for organized management
let backgroundPointsLayer: L.LayerGroup | null = null;
let selectedPointsLayer: L.LayerGroup | null = null;
let polygonsLayer: L.LayerGroup | null = null;

function coordFmt(v: number) { return Number(v).toFixed(2) }
function displayName(f: Feature) { return f.properties?.name || f.id }

// PROJ4LEAFLET: Create proper CRS for Cape Lo projections (matching DataMap.vue)
function createCapeLoCRS(srid: number): any {
  const lo = CM_BY_EPSG[srid];
  if (!lo) {
    console.warn(`[AreaMap] Unknown SRID ${srid}, falling back to Lo29`);
  }
  
  const centralMeridian = lo || 29;
  
  // Proj4 definition for Cape / Lo family (Transverse Mercator on Clarke 1880)
  const proj4def = `+proj=tmerc +lat_0=0 +lon_0=${centralMeridian} +k=1 +x_0=0 +y_0=0 +ellps=clrk80 +towgs84=-136,-108,-292,0,0,0,0 +units=m +no_defs`;
  
  return new (L as any).Proj.CRS(`EPSG:${srid}`, proj4def, {
    resolutions: [
      8192, 4096, 2048, 1024, 512, 256, 128, 64, 32, 16, 8, 4, 2, 1, 0.5, 0.25
    ],
    origin: [0, 0],
    bounds: (L as any).bounds(
      [-5000000, -5000000],
      [5000000, 5000000]
    )
  });
}

// Convert coordinate points to LatLng format based on CRS (matching other components)
function convertToLatLngs(points: Array<{ y: number; x: number }>) {
  if (!points || points.length === 0) {
    console.warn('[AreaMap] convertToLatLngs: No points provided');
    return [];
  }
  
  // Filter out invalid coordinates
  const validPoints = points.filter(p => {
    const isValid = isFinite(p.x) && isFinite(p.y) && 
                   !isNaN(p.x) && !isNaN(p.y) &&
                   p.x !== null && p.y !== null &&
                   p.x !== undefined && p.y !== undefined;
    if (!isValid) {
      console.warn('[AreaMap] ❌ Invalid coordinate filtered out:', p);
    }
    return isValid;
  });
  
  console.log(`[AreaMap] 📍 Filtered ${validPoints.length}/${points.length} valid coordinates`);
  
  if (validPoints.length === 0) {
    console.error('[AreaMap] ❌ No valid coordinates after filtering!');
    return [];
  }
  
  const crs = (map as any)?.options?.crs;
  const usesProj4CRS = crs && crs.code && crs.code.startsWith('EPSG:');
  
  console.log(`[AreaMap] 🔍 CRS Detection: code="${crs?.code}", usesProj4=${usesProj4CRS}`);
  
  if (usesProj4CRS) {
    // Proj4Leaflet expects projected coordinates in native order: [Easting, Northing]
    // Zimbabwe data is P(Y, X) = P(Northing, Easting), so we pass [X, Y] = [Easting, Northing]
    console.log(`[AreaMap] ✅ Using Proj4 coordinate order: [X, Y] (Easting, Northing)`);
    if (validPoints.length > 0) {
      console.log(`[AreaMap] 📍 First valid point: P(${validPoints[0].y}, ${validPoints[0].x}) → [${validPoints[0].x}, ${validPoints[0].y}]`);
    }
    const result = validPoints.map(p => [p.x, p.y]);
    
    // Validate result for Infinity/NaN
    const hasInvalid = result.some(coord => !coord.every(isFinite));
    if (hasInvalid) {
      console.error('[AreaMap] ❌ Transformation produced invalid coordinates!');
      return [];
    }
    
    return result;
  } else {
    // Legacy L.CRS.Simple: Planar LO convention P(Y, X) → [-X, -Y]
    console.log(`[AreaMap] 🔄 Using legacy coordinate order: [-X, -Y]`);
    const result = validPoints.map(p => [-p.x, -p.y]);
    
    // Validate result for Infinity/NaN
    const hasInvalid = result.some(coord => !coord.every(isFinite));
    if (hasInvalid) {
      console.error('[AreaMap] ❌ Legacy transformation produced invalid coordinates!');
      return [];
    }
    
    return result;
  }
}

async function onInput() {
  selectedSuggestion.value = null
  if (!layerIdLocal.value || q.value.trim().length < 2) { suggestions.value = []; return }
  const rows = await searchFeatures(layerIdLocal.value, q.value.trim(), 20).catch(() => [])
  suggestions.value = rows
}

function setSelected(f: Feature) {
  selectedSuggestion.value = f
}

function addSelected() {
  if (!selectedSuggestion.value) return
  const f = selectedSuggestion.value
  // GeoJSON coordinates are [x, y] order; Cape Lo: Y=Westing(~97k), X=Southing(~2.2M)
  const [x, y] = f.geometry.coordinates
  emit('add-point', { y, x, name: f.properties?.name })
  q.value = ''
  suggestions.value = []
  selectedSuggestion.value = null
}

async function refreshGraphics() {
  if (!map) return
  
  // Clear existing markers and layers from layer groups
  if (backgroundPointsLayer) backgroundPointsLayer.clearLayers();
  if (selectedPointsLayer) selectedPointsLayer.clearLayers();
  if (polygonsLayer) polygonsLayer.clearLayers();
  
  markers.forEach(m => m.remove())
  markers = []
  if (poly) { poly.remove(); poly = null }
  if (polyFill) { polyFill.remove(); polyFill = null }
  if (geojsonLayer) { geojsonLayer.remove(); geojsonLayer = null }

  const pts = props.selected
  if (!pts || !pts.length) return

  // Use consistent coordinate transformation approach
  let latlngs: L.LatLngExpression[] = []
  
  if (useBasemap.value && layerIdLocal.value) {
    // Try WGS84 transformation first (existing functionality)
    try {
      const { transformLayerPoints } = await import('../../services/spatial')
      const res = await transformLayerPoints(layerIdLocal.value, pts.map(p => ({ y: p.y, x: p.x })))
      const allPresent = Array.isArray(res.coords) && res.coords.length === pts.length && res.coords.every(c => !!c)
      const withinRange = allPresent && res.coords!.every(c => Math.abs(c!.lat) <= 85 && Math.abs(c!.lon) <= 180)
      if (res.ok && allPresent && withinRange) {
        latlngs = res.coords!.map(c => [c!.lat, c!.lon] as L.LatLngExpression)
        fallbackMsg.value = ''
        // Build a GeoJSON FeatureCollection for labeled points in WGS84
        const fc: any = {
          type: 'FeatureCollection',
          features: pts.map((p, i) => ({
            type: 'Feature',
            properties: { name: p.name || `P${i+1}` },
            geometry: { type: 'Point', coordinates: [ (res.coords![i]!.lon as number), (res.coords![i]!.lat as number) ] }
          }))
        }
        geojsonLayer = L.geoJSON(fc, {
          pointToLayer: (feature: any, latlng: any) => {
            const m = L.circleMarker(latlng, {
              radius: 4,
              color: '#4f46e5',
              weight: 2,
              fillColor: '#6366f1',
              fillOpacity: 0.9
            })
            m.bindTooltip(String(feature.properties?.name ?? ''), {
              permanent: true,
              direction: 'top',
              offset: L.point(0, -8),
              className: 'area-map-label'
            })
            return m
          }
        })
        if (selectedPointsLayer) {
          geojsonLayer.addTo(selectedPointsLayer);
        } else {
          geojsonLayer.addTo(map!);
        }
      } else {
        // Fallback to Proj4Leaflet or planar rendering
        console.warn('[AreaMap] Basemap transform unavailable; falling back to Proj4Leaflet or planar rendering.')
        useBasemap.value = false
        ensureBaseLayer()
        latlngs = convertToLatLngs(pts) as L.LatLngExpression[]
        fallbackMsg.value = 'Basemap disabled: using Proj4Leaflet or planar coordinates'
      }
    } catch {
      console.warn('[AreaMap] Basemap transform failed; falling back to Proj4Leaflet or planar rendering.')
      useBasemap.value = false
      ensureBaseLayer()
      latlngs = convertToLatLngs(pts) as L.LatLngExpression[]
      fallbackMsg.value = 'Basemap disabled: using Proj4Leaflet or planar coordinates'
    }
  } else {
    // Use consistent coordinate transformation
    latlngs = convertToLatLngs(pts) as L.LatLngExpression[]
    // Clear any previous message if user opted out
    if (!useBasemap.value) fallbackMsg.value = ''
  }

  // Create base layer if needed
  ensureBaseLayer()

  // In planar mode (or basemap fallback), build a GeoJSON layer too
  if (!geojsonLayer) {
    // For consistent coordinate handling, use the same transformation as points
    const fc: any = {
      type: 'FeatureCollection',
      features: pts.map((p, i) => ({
        type: 'Feature',
        properties: { name: p.name || `P${i+1}` },
        geometry: { type: 'Point', coordinates: [ p.y, p.x ] }
      }))
    }
    geojsonLayer = L.geoJSON(fc, {
      pointToLayer: (feature: any, latlng: any) => {
        const m = L.circleMarker(latlng, {
          radius: 4,
          color: '#4f46e5',
          weight: 2,
          fillColor: '#6366f1',
          fillOpacity: 0.9
        })
        m.bindTooltip(String(feature.properties?.name ?? ''), {
          permanent: true,
          direction: 'top',
          offset: L.point(0, -8),
          className: 'area-map-label'
        })
        return m
      }
    })
    if (selectedPointsLayer) {
      geojsonLayer.addTo(selectedPointsLayer);
    } else {
      geojsonLayer.addTo(map!);
    }
  }
  
  // Add polyline and polygon with layer management
  if (latlngs.length >= 2) {
    poly = L.polyline([...latlngs, latlngs[0]], { color: 'indigo', weight: 2 })
    if (polygonsLayer) {
      poly.addTo(polygonsLayer);
    } else {
      poly.addTo(map!);
    }
  }
  
  // Add a filled polygon when we have at least 3 points for better visual closure
  if (latlngs.length >= 3) {
    polyFill = L.polygon(latlngs as any, { color: '#4338ca', weight: 1, fillColor: '#818cf8', fillOpacity: 0.15 })
    if (polygonsLayer) {
      polyFill.addTo(polygonsLayer);
    } else {
      polyFill.addTo(map!);
    }
  }

  // Fit/zoom to bounds
  if (latlngs.length >= 1) {
    const b = L.latLngBounds(latlngs as any)
    map!.fitBounds(b.pad(0.2))
  }
}

function ensureBaseLayer() {
  if (!map) return
  const hasTile = (map as any)._layers && Object.values((map as any)._layers).some((l: any) => l instanceof L.TileLayer)
  
  if (useBasemap.value && !hasTile) {
    // Switch to default CRS and add OSM tile layer
    const el = mapEl.value!
    map.remove()
    map = L.map(el) // default EPSG:3857
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM contributors' }).addTo(map)
    console.log('[AreaMap] Switched to WGS84 basemap')
  } else if (!useBasemap.value && hasTile) {
    const el = mapEl.value!
    map.remove()
    
    // Try to use Proj4Leaflet if we have a Cape Lo layer
    let crs: any = L.CRS.Simple;
    let useProj4 = false;
    
    if (layerIdLocal.value && LO_SRIDS.has(layerIdLocal.value)) {
      console.log(`[AreaMap] 🌍 Using Proj4Leaflet CRS for EPSG:${layerIdLocal.value}`);
      crs = createCapeLoCRS(layerIdLocal.value);
      useProj4 = true;
    } else {
      console.log('[AreaMap] Using L.CRS.Simple (legacy mode)');
    }
    
    const mapOptions: any = { crs };
    
    if (useProj4) {
      mapOptions.center = [0, 0];
      mapOptions.zoom = 12;
      mapOptions.minZoom = 8;
      mapOptions.maxZoom = 18;
    } else {
      mapOptions.center = [0, 0];
      mapOptions.zoom = 0;
    }
    
    map = L.map(el, mapOptions);
    
    // Initialize layer groups
    backgroundPointsLayer = L.layerGroup().addTo(map!);
    selectedPointsLayer = L.layerGroup().addTo(map!);
    polygonsLayer = L.layerGroup().addTo(map!);
    
    // Add metric scale for Proj4CRS
    if (useProj4) {
      L.control.scale({ 
        imperial: false, 
        metric: true,
        maxWidth: 150,
        position: 'bottomleft'
      }).addTo(map!);
      console.log('[AreaMap] Metric scale added');
    }
    
    console.log(`[AreaMap] Map created with ${useProj4 ? 'Proj4Leaflet' : 'L.CRS.Simple'}`);
  }
}

onMounted(() => {
  if (!mapEl.value) return
  
  // Initialize map with appropriate CRS
  let crs: any = L.CRS.Simple;
  let useProj4 = false;
  
  // Try to use Proj4Leaflet if we have a Cape Lo layer
  if (layerIdLocal.value && LO_SRIDS.has(layerIdLocal.value)) {
    console.log(`[AreaMap] 🌍 Initializing with Proj4Leaflet CRS for EPSG:${layerIdLocal.value}`);
    crs = createCapeLoCRS(layerIdLocal.value);
    useProj4 = true;
  } else {
    console.log('[AreaMap] Initializing with L.CRS.Simple (legacy mode)');
  }
  
  const mapOptions: any = { crs };
  
  if (useProj4) {
    mapOptions.center = [0, 0];
    mapOptions.zoom = 12;
    mapOptions.minZoom = 8;
    mapOptions.maxZoom = 18;
  } else {
    mapOptions.center = [0, 0];
    mapOptions.zoom = 0;
  }
  
  map = L.map(mapEl.value, mapOptions);
  
  // Initialize layer groups
  backgroundPointsLayer = L.layerGroup().addTo(map!);
  selectedPointsLayer = L.layerGroup().addTo(map!);
  polygonsLayer = L.layerGroup().addTo(map!);
  
  // Add metric scale for Proj4CRS
  if (useProj4) {
    L.control.scale({ 
      imperial: false, 
      metric: true,
      maxWidth: 150,
      position: 'bottomleft'
    }).addTo(map!);
    console.log('[AreaMap] Metric scale added');
  }
  
  console.log(`[AreaMap] Map initialized with ${useProj4 ? 'Proj4Leaflet' : 'L.CRS.Simple'}`);
  
  refreshGraphics()
})

onBeforeUnmount(() => {
  if (map) map.remove()
})

watch(() => props.selected, () => refreshGraphics(), { deep: true })
watch(useBasemap, () => refreshGraphics())
watch(() => props.layerId, (v) => { layerIdLocal.value = v })
watch(layerIdLocal, () => { q.value = ''; suggestions.value = []; selectedSuggestion.value = null })
</script>

<style scoped>
.leaflet-container { height: 20rem; }
.area-map-label {
  background: rgba(255,255,255,0.9);
  color: #111827;
  border: 1px solid #cbd5e1; /* slate-300 */
  border-radius: 4px;
  padding: 1px 4px;
  font-size: 12px;
  font-weight: 500;
  box-shadow: 0 1px 2px rgba(0,0,0,0.06);
}
</style>
