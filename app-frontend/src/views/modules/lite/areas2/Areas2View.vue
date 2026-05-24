<template>
  <div class="p-4 space-y-4">
    <h1 class="text-xl font-semibold">Areas v2 (Search, ZIM P(Y,X))</h1>

    <!-- Project Context Display -->
    <div v-if="currentProject" class="bg-blue-50 border border-blue-200 rounded p-3">
      <div class="flex items-center gap-2 text-sm">
        <span class="font-semibold text-blue-900">📋 Active Project:</span>
        <span class="text-blue-800">{{ currentProject.name }}</span>
        <span v-if="currentProject.client_name" class="text-blue-600">• Client: {{ currentProject.client_name }}</span>
        <span v-if="currentProject.district" class="text-blue-600">• District: {{ currentProject.district }}</span>
      </div>
    </div>
    <div v-else class="bg-amber-50 border border-amber-200 rounded p-3">
      <div class="text-sm text-amber-800">
        ℹ️ No project selected. Select a project in the Cadastral Standard workflow for integrated data access.
      </div>
    </div>
    
    <!-- Auto-export/load status -->
    <div v-if="autoExporting" class="bg-blue-50 border border-blue-200 rounded p-3 animate-pulse">
      <div class="flex items-center gap-2 text-sm">
        <svg class="animate-spin h-4 w-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span class="font-medium text-blue-900">📤 Exporting coordinates to PostGIS and preparing map...</span>
      </div>
    </div>

    <div class="bg-white rounded border p-4 space-y-3">
      <!-- Points source selection -->
      <div class="flex flex-wrap gap-3 items-end">
        <!-- Auto-selected layer (Cadastral workflow) -->
        <div v-if="currentProjectId && layerId" class="flex items-center gap-2">
          <div class="text-xs">
            <div class="text-gray-600 mb-1">Points Layer</div>
            <div class="inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-blue-50 to-green-50 border border-blue-200 rounded">
              <svg class="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
              </svg>
              <span class="text-sm font-medium text-gray-800">{{ layerInfo?.name || 'Auto-selected' }}</span>
              <span class="text-xs text-green-700 font-semibold">✓ Automatic</span>
            </div>
          </div>
        </div>
        
        <!-- Manual layer selection (fallback for standalone use) -->
        <label v-else class="block">
          <span class="text-xs text-gray-600">Points Layer</span>
          <LayerSelect v-model="layerId" />
        </label>
        
        <div v-if="layerId" class="text-xs flex items-center gap-2">
          <span v-if="layerLoading" class="text-gray-500">Checking SRID…</span>
          <template v-else>
            <span v-if="layerInfo?.srid" class="inline-flex items-center gap-1 px-1.5 py-0.5 border rounded bg-green-50 text-green-700">SRID {{ layerInfo.srid }}</span>
            <span v-else class="inline-flex items-center gap-1 px-1.5 py-0.5 border rounded bg-amber-50 text-amber-700">SRID not set — set it in the selector to enable WGS84 basemap</span>
          </template>
          
          <!-- Show coordinate list points loaded on map -->
          <span v-if="loadingLayerFeatures" class="inline-flex items-center gap-1 px-1.5 py-0.5 border rounded bg-blue-50 text-blue-700">
            Loading points...
          </span>
          <span v-else-if="layerFeatures.length > 0" class="inline-flex items-center gap-1 px-1.5 py-0.5 border rounded bg-blue-50 text-blue-700">
            📍 {{ layerFeatures.length }} points on map
          </span>
        </div>
        
        <!-- Land Parcels indicator -->
        <div v-if="currentProjectId" class="text-xs flex items-center gap-2">
          <span v-if="loadingParcels" class="inline-flex items-center gap-1 px-1.5 py-0.5 border rounded bg-purple-50 text-purple-700">
            Loading parcels...
          </span>
          <span v-else class="inline-flex items-center gap-1 px-1.5 py-0.5 border rounded bg-purple-50 text-purple-700">
            🏘️ {{ landParcels.length }} land parcels
          </span>
          <button 
            @click="loadLandParcels" 
            :disabled="loadingParcels"
            class="px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700 disabled:opacity-50"
            title="Refresh parcels from database (after QGIS editing)"
          >
            🔄 Refresh
          </button>
        </div>
        
        <button class="px-3 py-1 bg-rose-600 text-white rounded disabled:opacity-50" :disabled="!points.length" @click="clearPoints">Clear all</button>
        
        <!-- CSV import only shown when NOT in Cadastral workflow (standalone mode) -->
        <template v-if="!currentProjectId">
          <input type="file" accept=".csv" @change="handleCsvImport" class="hidden" ref="csvInput" />
          <button class="px-3 py-1 bg-blue-600 text-white rounded" @click="triggerCsvImport">📂 Import CSV</button>
        </template>
        
        <label class="block">
          <span class="text-xs text-gray-600">Search point</span>
          <input ref="searchEl" v-model="q" @input="onInput" @keydown.down.prevent="highlightNext()" @keydown.up.prevent="highlightPrev()" @keydown.enter.prevent="enterAdd()" @keydown.esc.prevent="clearSuggestions()" :disabled="!layerId" class="border rounded px-2 py-1 w-64" placeholder="Beacon/Name" />
        </label>
        <button class="px-3 py-1 bg-slate-600 text-white rounded disabled:opacity-50" :disabled="!selectedSuggestion" @click="addSelected">Add Point</button>
      </div>

      <ul v-if="suggestions.length" class="border rounded max-h-40 overflow-auto text-sm">
        <li v-for="(s, idx) in suggestions" :key="s.id" @mouseenter="hoverIndex=idx" @mouseleave="hoverIndex=-1"
            :class="['px-2 py-1 cursor-pointer', (selectedSuggestion && selectedSuggestion.id===s.id) || hoverIndex===idx ? 'bg-slate-100' : 'hover:bg-slate-50']"
            @click="addFromSuggestion(s)">
          {{ displayName(s) }} — (Y: {{ coordFmt(s.geometry.coordinates[1]) }}, X: {{ coordFmt(s.geometry.coordinates[0]) }})
        </li>
      </ul>
  <div v-else-if="q.trim().length>=1 && !loading && !error" class="text-xs text-gray-500">No matching points</div>
      <div v-if="error" class="text-xs text-red-600">{{ error }}</div>

      <!-- Table: user-selected polygon vertices -->
      <div class="text-xs text-gray-500">Drag row numbers or use Alt+↑/↓ to reorder</div>
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead>
            <tr class="text-left text-gray-600">
              <th class="p-2">#</th>
              <th class="p-2">Point</th>
              <th class="p-2">Y (westing)</th>
              <th class="p-2">X (southing)</th>
              <th class="p-2"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(p,i) in points" :key="i" class="border-t hover:bg-gray-50" draggable="true" @dragstart="onDragStart(i)" @dragover.prevent @drop="onDrop(i)" @click="focusedRow=i">
              <td class="p-2 select-none cursor-move bg-gray-100 hover:bg-gray-200" title="⬍ Drag to reorder points">
                <span class="text-gray-500">⋮⋮</span> {{ i+1 }}
              </td>
              <td class="p-2">
                <input v-model="p.nameText" :placeholder="`P${i+1}`" class="border rounded px-2 py-1 w-28" @focus="focusedRow=i" />
              </td>
              <td class="p-2">
                <input v-model="p.yText" @blur="normalize(i,'y')" :class="['border rounded px-2 py-1 w-40', isValidY(i) ? 'border-gray-300' : 'border-red-500']" placeholder="e.g. 123,45" @focus="focusedRow=i" />
                <div v-if="!isValidY(i)" class="text-[10px] text-red-600 mt-0.5">Enter a number or D:M:S (min/sec &lt; 60)</div>
              </td>
              <td class="p-2">
                <input v-model="p.xText" @blur="normalize(i,'x')" :class="['border rounded px-2 py-1 w-40', isValidX(i) ? 'border-gray-300' : 'border-red-500']" placeholder="e.g. 678:12:30 or 678,12" @focus="focusedRow=i" />
                <div v-if="!isValidX(i)" class="text-[10px] text-red-600 mt-0.5">Enter a number or D:M:S (min/sec &lt; 60)</div>
              </td>
              <td class="p-2"><button class="text-red-600" @click="removePoint(i)">Remove</button></td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Controls: area policy, compute, save -->
      <div class="flex flex-wrap gap-3 items-end">
        <label class="block">
          <span class="text-xs text-gray-600">Designation (Stand/Erf)</span>
          <input v-model="designation" class="border rounded px-2 py-1 w-40" placeholder="e.g. Stand 2399" />
        </label>
        <label class="block">
          <span class="text-xs text-gray-600">Area unit policy</span>
          <select v-model.number="hectaresThreshold" class="border rounded px-2 py-1">
            <option :value="10000">>= 10,000 m² → ha (4dp)</option>
            <option :value="999999999">Always m²</option>
            <option :value="0">Always ha</option>
          </select>
        </label>
        <label class="block">
          <span class="text-xs text-gray-600">Save result</span>
          <input type="checkbox" v-model="save" class="ml-2 align-middle" />
        </label>
        <LayerSelect v-if="save" v-model="saveLayerId" />
        
        <!-- Auto-compute toggle -->
        <label class="flex items-center gap-2 px-3 py-1 bg-blue-50 border border-blue-200 rounded cursor-pointer hover:bg-blue-100 transition-colors" title="Automatically compute area as you add/remove points">
          <input type="checkbox" v-model="autoCompute" class="w-4 h-4" />
          <span class="text-xs font-medium text-blue-700">⚡ Auto-compute</span>
        </label>
        
        <!-- Manual compute button (only show when auto-compute is off) -->
        <button 
          v-if="!autoCompute" 
          class="px-3 py-1 bg-green-600 text-white rounded disabled:opacity-50" 
          :disabled="validCount < 3" 
          @click="doCompute"
        >
          Compute
        </button>
        
        <!-- Save button (when auto-compute is on and result exists) -->
        <button 
          v-else-if="result && designation.trim()" 
          class="px-3 py-1 bg-purple-600 text-white rounded disabled:opacity-50 hover:bg-purple-700" 
          :disabled="validCount < 3 || computing"
          @click="doCompute"
          title="Save computed parcel to database"
        >
          💾 Save Parcel
        </button>
        
        <span class="inline-flex items-center gap-1 text-xs">
          <!-- Computing indicator -->
          <span v-if="computing" class="inline-flex items-center gap-1 px-2 py-1 rounded-full border bg-blue-50 text-blue-700 border-blue-200">
            <svg class="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Computing...
          </span>
          
          <!-- Point count -->
          <span 
            :class="[
              'px-2 py-1 rounded-full border font-medium',
              validCount >= 3 ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'
            ]"
          >
            {{ validCount }} {{ validCount === 1 ? 'point' : 'points' }} selected
          </span>
          <span v-if="validCount < 3" class="text-amber-600 hidden sm:inline">(need 3+ for area)</span>
        </span>
        <label class="ml-auto inline-flex items-center gap-1 text-xs text-gray-600">
          <input type="checkbox" v-model="debug" /> Debug
        </label>
        <button class="px-3 py-1 bg-slate-700 text-white rounded disabled:opacity-50" :disabled="validCount < 2" @click="exportCsvPoints">📊 Export CSV</button>
      </div>

      <!-- Map preview -->
      <div class="mt-3">
        <DataMap 
          :items="mapItems" 
          :background-items="layerMapItems"
          :parcels="landParcels"
          :layer-id="layerId" 
          :show-polygon="showPolygon"
          :enable-click="true"
          :designation="designation"
          @point-click="onMapPointClick"
        />
      </div>
    </div>

    <div v-if="result" class="bg-white rounded border p-4 space-y-2">
      <div class="text-lg font-medium">
        Stand / Erf : {{ designation || 'Not specified' }}
      </div>
      <div class="text-sm text-gray-600">Centroid P(Y,X): {{ fmtNumber(result.centroid.y) }}, {{ fmtNumber(result.centroid.x) }}</div>

      <div v-if="result.residuals" class="mt-3">
        <h3 class="font-semibold">Residuals and edge checks</h3>
        <div class="text-xs text-gray-600">Sum dY = {{ fmtNumber(result.residuals.sumDy) }}, Sum dX = {{ fmtNumber(result.residuals.sumDx) }}</div>
        <div class="overflow-x-auto mt-2">
          <table class="min-w-full text-xs">
            <thead>
              <tr class="text-left text-gray-600">
                <th class="p-2">#</th>
                <th class="p-2">Point</th>
                <th class="p-2">Y-Coordinate</th>
                <th class="p-2">X-Coordinate</th>
                <th class="p-2">Dist (m)</th>
                <th class="p-2">Direction</th>
                <th v-if="debug" class="p-2">dy_og</th>
                <th v-if="debug" class="p-2">dx_og</th>
                <th v-if="debug" class="p-2">dist_og</th>
                <th v-if="debug" class="p-2">bearing_deg</th>
                <th class="p-2">dY</th>
                <th class="p-2">dX</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, idx) in displayRows" :key="idx" class="border-t">
                <td class="p-2">{{ idx+1 }}</td>
                <td class="p-2">{{ row.name }}</td>
                <td class="p-2">{{ fmtNumber(row.y) }}</td>
                <td class="p-2">{{ fmtNumber(row.x) }}</td>
                <td class="p-2">{{ row.edge ? row.edge.distanceRounded.toFixed(2) : '' }}</td>
                <td class="p-2">{{ row.edge ? formatBearing(row.edge) : '' }}</td>
                <td v-if="debug" class="p-2">{{ row.edge ? fmt3(row.edge.to.y - row.edge.from.y) : '' }}</td>
                <td v-if="debug" class="p-2">{{ row.edge ? fmt3(row.edge.to.x - row.edge.from.x) : '' }}</td>
                <td v-if="debug" class="p-2">{{ row.edge ? fmt3(row.edge.distance) : '' }}</td>
                <td v-if="debug" class="p-2">{{ row.edge ? rawBearingDeg(row.edge).toFixed(4) : '' }}</td>
                <td class="p-2">{{ row.edge ? fmtNumber(row.edge.dy) : '' }}</td>
                <td class="p-2">{{ row.edge ? fmtNumber(row.edge.dx) : '' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <!-- Area display - centered below the table -->
        <div class="mt-4 text-center">
          <div class="text-lg font-medium">
            <template v-if="result.area.display.unit==='ha'">Area: {{ Math.abs(result.area.display.hectares).toFixed(4) }} ha</template>
            <template v-else>Area: {{ fmtAreaM2(Math.abs(result.area.display.square_meters)) }} m²</template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent, onMounted, onBeforeUnmount, watch, inject } from 'vue'
import LayerSelect from '../../../../components/inputs/LayerSelect.vue'
import { areaCompute } from '../../../../services/compute'
import { parseFlexibleNumberOrDMS, decimalToDMS, formatDMS, bankersRound } from '../../../../utils/dms'
import { getDMSPolicy, getAreaPolicy } from '../../../../utils/displayConfig'
import { searchFeatures, getLayer, listLayerFeatures, listLayers, createLayer, batchCreateFeatures, listLandParcels, createLandParcel, checkParcelDuplicates } from '@/services/spatial'
import { useProjectContext } from '../../../../stores/projectContext'
const DataMap = defineAsyncComponent(() => import('../../../../components/maps/DataMap.vue'))

// Project context integration
const { currentProject, currentProjectId, hasProject } = useProjectContext()

// Inject workflow state from parent (if available from Cadastral workflow)
const workflowState = inject<any>('workflowState', null)

// Layer features for map display
const layerFeatures = ref<Feature[]>([])
const loadingLayerFeatures = ref(false)

// Land parcels from database
const landParcels = ref<any[]>([])
const loadingParcels = ref(false)

type PointAdhoc = { nameText: string; yText: string; xText: string }
const points = ref<PointAdhoc[]>([])
const layerId = ref<number | undefined>(undefined)
const layerInfo = ref<Layer | null>(null)
const layerLoading = ref(false)
const save = ref(false)
const saveLayerId = ref<number | undefined>(undefined)
const areaPolicy = getAreaPolicy()
const hectaresThreshold = ref(areaPolicy.thresholdMeters)
const designation = ref('')
const result = ref<any | null>(null)
const debug = ref(false)
const dragIndex = ref<number | null>(null)
const focusedRow = ref<number>(-1)
// Auto-compute state
const autoCompute = ref(true) // Enable/disable real-time computation
const computing = ref(false)
let computeTimeout: any = null
// Search state
const q = ref('')
const suggestions = ref<Feature[]>([])
const selectedSuggestion = ref<Feature | null>(null)
const hoverIndex = ref<number>(-1)
const searchEl = ref<HTMLInputElement | null>(null)
const csvInput = ref<HTMLInputElement | null>(null)
const loading = ref(false)
const error = ref<string>('')

const selectedForMap = computed(() => {
  const arr: Array<{ y:number; x:number; name?: string }> = []
  for (let i = 0; i < points.value.length; i++) {
    const p = points.value[i]
    const y = parseFlexibleCoordinate(p.yText)
    const x = parseFlexibleCoordinate(p.xText)
    if (y === null || x === null) continue
    const name = (p.nameText && p.nameText.trim()) ? p.nameText.trim() : `P${i+1}`
    arr.push({ y, x, name })
  }
  // Return in original order for display
  // Spatial sorting will be done separately for polygon rendering
  return arr
})

// Adapt selection to DataMap items contract
// ONLY include user-selected points for polygon calculation
// Layer features are displayed separately (no polygon)
const mapItems = computed(() => {
  const items: any[] = []
  
  // Add user-selected points (for area calculation and polygon)
  for (let i = 0; i < selectedForMap.value.length; i++) {
    const p = selectedForMap.value[i]
    items.push({
      geometry: { type: 'Point', coordinates: [p.x, p.y] },
      properties: { 
        name: p.name || `P${i+1}`,
        _isSelected: true
      }
    })
  }
  
  return items
})

// Separate items for layer features (background points, no polygon)
const layerMapItems = computed(() => {
  return layerFeatures.value.map(feature => ({
    geometry: feature.geometry,
    properties: {
      ...feature.properties,
      _isLayerFeature: true
    }
  }))
})

const validCount = computed(() => {
  let n = 0
  for (const p of points.value) {
    const y = parseFlexibleCoordinate(p.yText)
    const x = parseFlexibleCoordinate(p.xText)
    if (y !== null && x !== null) n++
  }
  return n
})

// Only show polygon when user has selected points for area calculation
// Don't show polygon when just displaying layer features
const showPolygon = computed(() => {
  return selectedForMap.value.length >= 3
})

// Debounced auto-compute: triggers real-time area calculation after 500ms of no changes
function recomputeIfReady() {
  if (!autoCompute.value) return
  
  // Clear existing timeout
  if (computeTimeout) {
    clearTimeout(computeTimeout)
  }
  
  // Debounce: wait 500ms after last change before computing
  computeTimeout = setTimeout(() => {
    void autoComputeArea()
  }, 500)
}

function removePoint(i: number) { points.value.splice(i, 1); void recomputeIfReady() }
function clearPoints() { if (points.value.length) { if (confirm('Clear all points?')) { points.value = []; result.value = null } } }

function coordFmt(v: number) { return Number(v).toFixed(2) }
function displayName(f: Feature) {
  const props: any = f?.properties || {}
  return props.name || props.beacon || props.point_name || f.id
}
let debounceTimer: any = null
async function onInput() {
  selectedSuggestion.value = null
  hoverIndex.value = -1
  error.value = ''
  if (!layerId.value || q.value.trim().length < 1) { suggestions.value = []; return }
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(async () => {
    loading.value = true
    try {
      const query = q.value.trim()
      const rows = await searchFeatures(layerId.value!, query, 20)
      const qLower = query.toLowerCase()
      suggestions.value = rows.filter(r => String(displayName(r)).toLowerCase().includes(qLower))
      if (suggestions.value && suggestions.value.length) {
        hoverIndex.value = 0
        selectedSuggestion.value = suggestions.value[0]
      } else {
        hoverIndex.value = -1
        selectedSuggestion.value = null
      }
    } catch (e:any) {
      error.value = 'Search failed'
      suggestions.value = []
    } finally {
      loading.value = false
    }
  }, 250)
}
function setSelected(f: Feature) { selectedSuggestion.value = f }
function addSelected() {
  if (!selectedSuggestion.value) return
  const f = selectedSuggestion.value
  
  // Validate geometry
  if (!f.geometry?.coordinates || f.geometry.coordinates.length < 2) {
    console.error('Invalid feature geometry:', f)
    alert('Invalid point geometry')
    return
  }
  
  // GeoJSON coordinates are [x, y] order; Cape Lo: Y=Westing(~97k), X=Southing(~2.2M)
  const [x, y] = f.geometry.coordinates
  const name = f.properties?.name || f.properties?.beacon || f.properties?.point_name || ''
  points.value.push({ nameText: name, yText: String(y), xText: String(x) })
  q.value = ''
  suggestions.value = []
  selectedSuggestion.value = null
  // Focus search for quick consecutive adds
  requestAnimationFrame(() => { searchEl.value?.focus() })
  // Auto compute if we have 3+ points
  void recomputeIfReady()
}
function addFromSuggestion(f: Feature) {
  // Allow clicking a suggestion to add immediately
  selectedSuggestion.value = f
  addSelected()
}
function clearSuggestions() {
  suggestions.value = []
  selectedSuggestion.value = null
  hoverIndex.value = -1
}
function highlightNext() {
  if (!suggestions.value.length) return
  if (hoverIndex.value < suggestions.value.length - 1) hoverIndex.value++
  else hoverIndex.value = 0
  selectedSuggestion.value = suggestions.value[hoverIndex.value]
}
function highlightPrev() {
  if (!suggestions.value.length) return
  if (hoverIndex.value > 0) hoverIndex.value--
  else hoverIndex.value = suggestions.value.length - 1
  selectedSuggestion.value = suggestions.value[hoverIndex.value]
}
function enterAdd() { if (selectedSuggestion.value) addSelected() }

// Handle map point click
function onMapPointClick(payload: { y: number; x: number; name?: string }) {
  // Add point to the list
  points.value.push({
    nameText: payload.name || `P${points.value.length + 1}`,
    yText: String(payload.y),
    xText: String(payload.x)
  })
  // Auto compute if we have 3+ points
  void recomputeIfReady()
}

watch(layerId, async () => {
  q.value = ''
  suggestions.value = []
  selectedSuggestion.value = null
  layerInfo.value = null
  layerFeatures.value = []
  
  if (!layerId.value) return
  
  layerLoading.value = true
  try {
    // Load layer metadata
    layerInfo.value = await getLayer(layerId.value)
    
    // Check if this is a coordinate list layer (survey_points or coordinate_points type)
    const isCoordinateListLayer = 
      layerInfo.value.layer_type === 'survey_points' || 
      layerInfo.value.layer_type === 'coordinate_points' ||
      layerInfo.value.geom_type === 'Point'
    
    if (isCoordinateListLayer) {
      console.log(`[Areas2View] Loading coordinate list points from layer: ${layerInfo.value.name} (type: ${layerInfo.value.layer_type})`)
      loadingLayerFeatures.value = true
      
      try {
        // Load all features from the layer (paginated)
        let allFeatures: Feature[] = []
        let page = 1
        const limit = 100
        let hasMore = true
        
        while (hasMore) {
          const response = await listLayerFeatures(layerId.value, { page, limit })
          allFeatures = allFeatures.concat(response.items)
          
          console.log(`[Areas2View] Loaded page ${page}: ${response.items.length} points (total so far: ${allFeatures.length})`)
          
          // Check if there are more pages
          hasMore = response.items.length === limit && allFeatures.length < response.total
          page++
        }
        
        layerFeatures.value = allFeatures
        console.log(`[Areas2View] ✅ Loaded ${layerFeatures.value.length} coordinate list points on map`)
      } catch (e) {
        console.error('[Areas2View] Error loading layer features:', e)
        layerFeatures.value = []
      } finally {
        loadingLayerFeatures.value = false
      }
    } else {
      console.warn(`[Areas2View] Layer is not a coordinate list (type: ${layerInfo.value.layer_type}, geom: ${layerInfo.value.geom_type}) - points will not be loaded`)
      loadingLayerFeatures.value = false
      layerFeatures.value = []
    }
  } catch (e) {
    console.error('[Areas2View] Error loading layer:', e)
    layerInfo.value = null
  } finally {
    layerLoading.value = false
  }
})

function onDragStart(i: number) { dragIndex.value = i }
function onDrop(i: number) {
  if (dragIndex.value === null || dragIndex.value === i) return
  const fromIndex = dragIndex.value
  const [m] = points.value.splice(dragIndex.value, 1)
  points.value.splice(i, 0, m)
  dragIndex.value = null
  console.log(`🔄 [Drag-Drop] Reordered point from position ${fromIndex + 1} to ${i + 1} - triggering auto-compute`)
  void recomputeIfReady()
}

function moveRow(from: number, delta: number) {
  if (from < 0) return
  const to = from + delta
  if (to < 0 || to >= points.value.length) return
  const [m] = points.value.splice(from, 1)
  points.value.splice(to, 0, m)
  focusedRow.value = to
  console.log(`⌨️ [Keyboard] Moved point from position ${from + 1} to ${to + 1} - triggering auto-compute`)
  void recomputeIfReady()
}

// Keyboard: Alt+ArrowUp / Alt+ArrowDown to reorder focused row
function onKey(e: KeyboardEvent) {
  if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); moveRow(focusedRow.value, -1) }
  if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); moveRow(focusedRow.value, +1) }
}

// Flag to track if we've already auto-loaded for this project
const autoLoadedProjectId = ref<number | null>(null)
const autoExporting = ref(false)

// Function to auto-export adjusted coordinates to PostGIS
async function autoExportCoordinatesToPostGIS() {
  if (!currentProjectId.value) {
    console.log('ℹ️ [Areas2View] No project - skipping auto-export')
    return null
  }
  
  if (!workflowState?.adjustedCoordinates || workflowState.adjustedCoordinates.length === 0) {
    console.log('ℹ️ [Areas2View] No adjusted coordinates available - skipping auto-export')
    return null
  }
  
  if (autoExporting.value) {
    console.log('⏳ [Areas2View] Export already in progress')
    return null
  }
  
  try {
    autoExporting.value = true
    const coordinates = workflowState.adjustedCoordinates
    
    console.log(`📤 [Areas2View] Auto-exporting ${coordinates.length} coordinates to PostGIS...`)
    
    // ALWAYS create a fresh layer with timestamp to avoid legacy data
    const projectName = currentProject.value?.name || 'Survey'
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ')
    
    // Get SRID from workflow if available, default to LO29
    const srid = workflowState?.projectInfo?.centralMeridian === 'Lo31' ? 22291 : 22289
    
    console.log(`📋 [Areas2View] Creating fresh coordinate layer (SRID: ${srid})...`)
    
    const coordinateLayer = await createLayer(currentProjectId.value, {
      name: `${projectName} - Coordinate List Points (${timestamp})`,
      layer_type: 'coordinate_points',
      geom_type: 'Point',
      srid: srid
    })
    
    console.log(`✅ [Areas2View] Created layer: ${coordinateLayer.name} (ID: ${coordinateLayer.id})`)
    
    // Batch create features (points)
    const features = coordinates.map((coord: any) => ({
      geometry: {
        type: 'Point',
        coordinates: [coord.y || coord.northing, coord.x || coord.easting]
      },
      properties: {
        name: coord.pointId || coord.name || coord.pointName,
        elevation: coord.elevation || coord.z,
        northing: coord.y || coord.northing,
        easting: coord.x || coord.easting,
        source: 'cadastral_workflow'
      }
    }))
    
    console.log(`📍 [Areas2View] Uploading ${features.length} points to layer ${coordinateLayer.id}...`)
    const result = await batchCreateFeatures(coordinateLayer.id, {
      features,
      replace_duplicates: true // Replace existing features
    })
    
    console.log(`✅ [Areas2View] Successfully exported ${result.created} points to PostGIS`)
    
    return coordinateLayer
  } catch (err) {
    console.error('❌ [Areas2View] Failed to auto-export coordinates:', err)
    return null
  } finally {
    autoExporting.value = false
  }
}

// Function to auto-load coordinate layer (with auto-export if needed)
async function autoLoadCoordinateLayer() {
  if (!currentProjectId.value) {
    console.log('ℹ️ [Areas2View] No project context available - skipping auto-load')
    return
  }
  
  // Skip if already loaded for this project
  if (autoLoadedProjectId.value === currentProjectId.value) {
    console.log(`ℹ️ [Areas2View] Already auto-loaded for project ${currentProjectId.value}`)
    return
  }
  
  try {
    console.log(`🔍 [Areas2View] Auto-loading layers for project ${currentProjectId.value}...`)
    
    // If we have workflow coordinates, export them first
    let exportedLayer = null
    if (workflowState?.adjustedCoordinates && workflowState.adjustedCoordinates.length > 0) {
      console.log(`📤 [Areas2View] Detected ${workflowState.adjustedCoordinates.length} coordinates from workflow - auto-exporting...`)
      exportedLayer = await autoExportCoordinatesToPostGIS()
      
      if (exportedLayer) {
        // Use the exported layer
        console.log(`✅ [Areas2View] Using auto-exported layer: ${exportedLayer.name} (ID: ${exportedLayer.id})`)
        layerId.value = exportedLayer.id
        autoLoadedProjectId.value = currentProjectId.value
        // The watcher on layerId will automatically load the features
        return
      }
    }
    
    // Otherwise, try to find existing coordinate layer
    const layers = await listLayers(currentProjectId.value)
    console.log(`📋 [Areas2View] Found ${layers.length} layers:`, layers.map(l => `${l.name} (type: ${l.layer_type})`))
    
    // Find coordinate layer - look for POINT layers only (exclude polygon layers)
    const coordinateLayer = layers.find(l => {
      const isPointLayer = l.geom_type === 'Point' || l.layer_type === 'coordinate_points'
      const hasCoordinateName = l.name.toLowerCase().includes('coordinate') || l.name.toLowerCase().includes('points')
      const isNotPolygon = !l.name.toLowerCase().includes('polygon') && l.geom_type !== 'Polygon'
      
      return isPointLayer && hasCoordinateName && isNotPolygon
    })
    
    if (coordinateLayer) {
      console.log(`✅ [Areas2View] Auto-selecting layer: ${coordinateLayer.name} (ID: ${coordinateLayer.id})`)
      layerId.value = coordinateLayer.id
      autoLoadedProjectId.value = currentProjectId.value
      // The watcher on layerId will automatically load the features
    } else {
      console.log(`ℹ️ [Areas2View] No coordinate layer found for project ${currentProjectId.value}`)
      console.log(`   Available layers: ${layers.map(l => l.name).join(', ')}`)
    }
  } catch (err) {
    console.error('❌ [Areas2View] Failed to auto-load layers:', err)
  }
}

// Auto-load coordinate layer when component mounts with project context
onMounted(async () => {
  window.addEventListener('keydown', onKey)
  
  console.log(`🔍 [Areas2View] Component mounted`)
  console.log(`   - currentProjectId: ${currentProjectId.value}`)
  console.log(`   - currentProject:`, currentProject.value)
  console.log(`   - hasProject: ${hasProject.value}`)
  
  // Try immediate load
  await autoLoadCoordinateLayer()
  
  // Load land parcels from database
  await loadLandParcels()
})

// Watch for project context changes (since component uses v-show and doesn't remount)
watch(currentProjectId, async (newProjectId, oldProjectId) => {
  console.log(`🔄 [Areas2View] currentProjectId changed from ${oldProjectId} to ${newProjectId}`)
  if (newProjectId) {
    await autoLoadCoordinateLayer()
    await loadLandParcels()
  }
})

// Also watch for when the component becomes visible (calculations-part2 step)
// This handles the case where the component is mounted but hidden with v-show
watch(() => currentProject.value, async (newProject) => {
  if (newProject) {
    console.log(`🔄 [Areas2View] currentProject changed to:`, newProject.name)
    // Trigger auto-load when project becomes available
    await autoLoadCoordinateLayer()
  }
})

// Watch points array for real-time area computation
watch(points, () => {
  if (autoCompute.value) {
    recomputeIfReady()
  }
}, { deep: true })

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  // Clean up timeout on unmount
  if (computeTimeout) {
    clearTimeout(computeTimeout)
  }
})
// Map adds are handled via the search controls; DataMap is a read-only preview here.

function parseFlexibleCoordinate(s: string): number | null {
  return parseFlexibleNumberOrDMS(s)
}

function normalize(i: number, field: 'y'|'x') {
  const p = points.value[i]
  const v = field==='y' ? parseFlexibleCoordinate(p.yText) : parseFlexibleCoordinate(p.xText)
  if (v !== null) {
    if (field==='y') p.yText = String(v)
    else p.xText = String(v)
  }
  // On coordinate edit, auto compute if enough points
  void recomputeIfReady()
}
function isValidY(i: number) { return parseFlexibleCoordinate(points.value[i].yText) !== null }
function isValidX(i: number) { return parseFlexibleCoordinate(points.value[i].xText) !== null }

// Sort points in clockwise order around their centroid
// Generic function that preserves all properties
function sortPointsClockwise<T extends { y: number; x: number }>(pts: T[]): T[] {
  if (pts.length < 3) return pts
  
  // Calculate centroid
  const centroidY = pts.reduce((sum, p) => sum + p.y, 0) / pts.length
  const centroidX = pts.reduce((sum, p) => sum + p.x, 0) / pts.length
  
  // Sort by angle from centroid (clockwise)
  return [...pts].sort((a, b) => {
    const angleA = Math.atan2(a.x - centroidX, a.y - centroidY)
    const angleB = Math.atan2(b.x - centroidX, b.y - centroidY)
    return angleA - angleB
  })
}

function collectPoints(): Array<{ y: number; x: number }> {
  const arr: Array<{ y: number; x: number }> = []
  for (const p of points.value) {
    const y = parseFlexibleCoordinate(p.yText)
    const x = parseFlexibleCoordinate(p.xText)
    if (y === null || x === null) continue
    arr.push({ y, x })
  }
  // Return in original order - user's input order represents the traverse
  return arr
}
function collectNamedPoints(): Array<{ name: string; y: number; x: number }> {
  const arr: Array<{ name: string; y: number; x: number }> = []
  for (let i = 0; i < points.value.length; i++) {
    const p = points.value[i]
    const y = parseFlexibleCoordinate(p.yText)
    const x = parseFlexibleCoordinate(p.xText)
    if (y === null || x === null) continue
    const name = (p.nameText && p.nameText.trim()) ? p.nameText.trim() : `P${i+1}`
    arr.push({ name, y, x })
  }
  return arr
}

function exportCsvPoints() {
  const rows = collectNamedPoints()
  if (!rows.length) return
  
  // Use simple column names for compatibility with import
  const header = ['Point', 'Y', 'X', 'Status', 'Description', 'Date of survey']
  const lines = [header.join(',')]
  
  const today = new Date().toLocaleDateString()
  for (const r of rows) {
    const row = [
      r.name,
      bankersRound(r.y, 2).toFixed(2),
      bankersRound(r.x, 2).toFixed(2),
      'P', // Default status for area points
      '', // Empty description
      today
    ]
    lines.push(row.join(','))
  }
  
  const csv = lines.join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'area-points.csv'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

const displayRows = computed(() => {
  const edges = result.value?.residuals?.edges as any[] | undefined
  if (!edges || !edges.length) return [] as Array<{ name: string; y: number; x: number; edge: any | null }>
  
  // Safety check for edge data
  if (!edges[0]?.from || !edges[0]?.to) {
    console.warn('Invalid edge data structure')
    return []
  }
  
  const pts: Array<{ y:number; x:number }> = []
  pts.push({ y: edges[0].from.y, x: edges[0].from.x })
  for (let i = 0; i < edges.length; i++) {
    if (edges[i]?.to) {
      pts.push({ y: edges[i].to.y, x: edges[i].to.x })
    }
  }
  
  const names = points.value.map((p, i) => (p.nameText && p.nameText.trim()) ? p.nameText.trim() : `P${i+1}`)
  const rows: Array<{ name: string; y: number; x: number; edge: any | null }> = []
  for (let i = 0; i < pts.length; i++) {
    const name = i < names.length ? names[i] : (names[0] || `P${i+1}`)
    const edge = i === 0 ? null : edges[i - 1]
    rows.push({ name, y: pts[i].y, x: pts[i].x, edge })
  }
  return rows
})

function fmtNumber(n: number) { return bankersRound(Number(n), 2).toFixed(2) }
function fmt3(n: number) { return bankersRound(Number(n), 3).toFixed(3) }
function fmtAreaM2(n: number) { const abs = Math.abs(n); return abs < 10000 ? String(Math.round(n)) : bankersRound(Number(n), 2).toFixed(2) }

function rawBearingDeg(e: any): number {
  if (typeof e?.bearingDeg === 'number') return e.bearingDeg
  const dy = (e?.to?.y ?? 0) - (e?.from?.y ?? 0)
  const dx = (e?.to?.x ?? 0) - (e?.from?.x ?? 0)
  let deg = Math.atan2(dy, dx) * 180 / Math.PI
  if (deg < 0) deg += 360
  return deg
}
function formatBearing(e: any) {
  const bearingDeg = typeof e?.bearingRoundedDeg === 'number' ? e.bearingRoundedDeg : rawBearingDeg(e)
  const dms = decimalToDMS(bearingDeg)
  const policy = getDMSPolicy('default')
  return formatDMS(dms, policy.secondsDecimals, policy.separator)
}

function triggerCsvImport() {
  csvInput.value?.click()
}

function handleCsvImport(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const text = e.target?.result as string
      const rows = text.split(/\r?\n/).filter(row => row.trim() !== '')
      
      if (rows.length < 2) {
        alert('CSV file must have a header and at least one data row')
        return
      }
      
      // Parse header (case-insensitive)
      const header = rows[0].split(',').map(h => h.toLowerCase().trim())
      
      // Find column indices (support multiple formats)
      const pointIdx = header.findIndex(h => h.includes('point'))
      const yIdx = header.findIndex(h => h === 'y' || h.includes('westing'))
      const xIdx = header.findIndex(h => h === 'x' || h.includes('southing'))
      
      if (pointIdx === -1 || yIdx === -1 || xIdx === -1) {
        alert('CSV must have Point, Y, and X columns')
        return
      }
      
      let imported = 0
      for (let i = 1; i < rows.length; i++) {
        const cells = rows[i].split(',').map(c => c.trim())
        if (cells.length < 3) continue
        
        const name = cells[pointIdx] || `P${i}`
        const y = cells[yIdx] || ''
        const x = cells[xIdx] || ''
        
        if (y && x) {
          points.value.push({ nameText: name, yText: y, xText: x })
          imported++
        }
      }
      
      if (imported > 0) {
        alert(`✅ Successfully imported ${imported} points`)
        void recomputeIfReady()
      } else {
        alert('⚠️ No valid points found in CSV')
      }
    } catch (error) {
      console.error('CSV import error:', error)
      alert('Error importing CSV: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }
  }
  
  reader.readAsText(file)
  
  // Reset input so same file can be imported again
  target.value = ''
}

// Load land parcels from database
async function loadLandParcels() {
  if (!currentProjectId.value) {
    console.log('ℹ️ [Areas2View] No project ID - skipping parcel load')
    return
  }
  
  try {
    loadingParcels.value = true
    console.log(`🔍 [Areas2View] Loading land parcels for project ${currentProjectId.value}...`)
    
    const parcels = await listLandParcels(currentProjectId.value)
    landParcels.value = parcels
    
    console.log(`✅ [Areas2View] Loaded ${parcels.length} land parcels`)
    if (parcels.length > 0) {
      console.log('   Sample:', parcels[0])
    }
  } catch (err) {
    console.error('❌ [Areas2View] Failed to load land parcels:', err)
  } finally {
    loadingParcels.value = false
  }
}

// Save computed parcel to land_parcels table
async function saveParcelToDatabase(parcelData: any) {
  if (!currentProjectId.value) {
    console.warn('⚠️ No project ID - cannot save parcel')
    return null
  }
  
  if (!designation.value.trim()) {
    console.warn('⚠️ No designation - cannot save parcel')
    return null
  }
  
  try {
    console.log(`💾 [Areas2View] Checking for duplicates before saving parcel "${designation.value}"...`)
    
    // Create GeoJSON polygon from points
    const pts = collectPoints()
    const coordinates = pts.map(p => [p.x, p.y])
    // Close the polygon
    coordinates.push(coordinates[0])
    
    const geom = {
      type: 'Polygon',
      coordinates: [coordinates]
    }
    
    // Check for duplicates BEFORE saving
    const duplicateCheck = await checkParcelDuplicates({
      project_id: currentProjectId.value,
      stand: designation.value.trim(),
      geom: geom
    })
    
    // If duplicates found, show detailed warning
    if (duplicateCheck.hasDuplicates) {
      console.warn(`⚠️ [Areas2View] Found ${duplicateCheck.duplicateCount} potential duplicate(s)`)
      
      // Build detailed warning message
      let warningMessage = `⚠️ DUPLICATE DETECTED!\n\n`
      warningMessage += `Stand "${designation.value.trim()}" has ${duplicateCheck.duplicateCount} potential conflict(s):\n\n`
      
      // Group by severity
      const critical = duplicateCheck.duplicates.filter(d => d.severity === 'critical')
      const high = duplicateCheck.duplicates.filter(d => d.severity === 'high')
      const medium = duplicateCheck.duplicates.filter(d => d.severity === 'medium')
      
      if (critical.length > 0) {
        warningMessage += `🚫 CRITICAL ISSUES (${critical.length}):\n`
        critical.forEach((d, i) => {
          warningMessage += `  ${i + 1}. ${d.message}\n`
          if (d.overlap_percent) warningMessage += `     • Overlap: ${d.overlap_percent.toFixed(1)}%\n`
        })
        warningMessage += '\n'
      }
      
      if (high.length > 0) {
        warningMessage += `⚠️ HIGH PRIORITY (${high.length}):\n`
        high.forEach((d, i) => {
          warningMessage += `  ${i + 1}. ${d.message}\n`
          if (d.overlap_percent) warningMessage += `     • Overlap: ${d.overlap_percent.toFixed(1)}%\n`
        })
        warningMessage += '\n'
      }
      
      if (medium.length > 0) {
        warningMessage += `ℹ️ WARNINGS (${medium.length}):\n`
        medium.forEach((d, i) => {
          warningMessage += `  ${i + 1}. ${d.message}\n`
          if (d.overlap_percent) warningMessage += `     • Overlap: ${d.overlap_percent.toFixed(1)}%\n`
        })
        warningMessage += '\n'
      }
      
      // For critical or high severity, block the save
      if (critical.length > 0 || high.length > 0) {
        warningMessage += `\n❌ Cannot save: Critical or high-priority conflicts detected.\n`
        warningMessage += `Please:\n`
        warningMessage += `• Use a different stand number\n`
        warningMessage += `• Adjust polygon boundaries to avoid overlaps\n`
        warningMessage += `• Check if this parcel already exists\n`
        
        alert(warningMessage)
        return null
      }
      
      // For medium/low severity, ask for confirmation
      warningMessage += `\n⚠️ Do you want to save anyway?\n`
      warningMessage += `(Not recommended - may cause data inconsistency)`
      
      if (!confirm(warningMessage)) {
        console.log('📌 [Areas2View] User cancelled save due to duplicate warnings')
        return null
      }
    } else {
      console.log(`✅ [Areas2View] No duplicates detected - proceeding with save`)
    }
    
    // If we reach here, either no duplicates or user confirmed despite warnings
    const parcel = await createLandParcel({
      project_id: currentProjectId.value,
      stand: designation.value.trim(),
      geom: geom,
      notes: `Created from Areas2View - ${new Date().toLocaleString()}`
    })
    
    console.log(`✅ [Areas2View] Parcel saved to land_parcels table (ID: ${parcel.id})`)
    
    // Reload parcels to show the new one
    await loadLandParcels()
    
    return parcel
  } catch (err: any) {
    console.error('❌ [Areas2View] Failed to save parcel:', err)
    alert(`Failed to save parcel: ${err.message || 'Unknown error'}`)
    return null
  }
}

// Silent auto-compute (no alerts, runs in background)
async function autoComputeArea() {
  if (!autoCompute.value) return
  
  const pts = collectPoints()
  if (pts.length < 3) {
    // Not enough points - clear result
    result.value = null
    return
  }
  
  try {
    computing.value = true
    
    const payload: any = {
      points: pts,
      hectaresThreshold: hectaresThreshold.value,
      roundMetersDecimals: areaPolicy.metersDecimals,
      roundHectaresDecimals: areaPolicy.hectaresDecimals,
      includeResiduals: true,
      save: false, // Don't save during auto-compute
    }
    if (designation.value.trim()) payload.designation = designation.value.trim()
    
    const computeResult = await areaCompute(payload)
    
    if (!computeResult?.error) {
      result.value = computeResult
      const area = (computeResult as any).area_sqm || (computeResult as any).area || 0
      const areaNum = Number(area) || 0
      console.log(`🔄 [Auto-compute] Area: ${areaNum.toFixed(2)} m² (${pts.length} points)`)
    } else {
      console.warn('[Auto-compute] Computation error:', computeResult.error)
    }
  } catch (error) {
    console.error('[Auto-compute] Failed:', error)
    // Don't clear result on error - keep previous value
  } finally {
    computing.value = false
  }
}

// Manual compute (with alerts and saving)
async function doCompute() {
  const pts = collectPoints()
  if (pts.length < 3) { alert('Select at least 3 valid points'); return }
  
  try {
    const payload: any = {
      points: pts,
      hectaresThreshold: hectaresThreshold.value,
      roundMetersDecimals: areaPolicy.metersDecimals,
      roundHectaresDecimals: areaPolicy.hectaresDecimals,
      includeResiduals: true,
      save: !!save.value,
    }
    if (designation.value.trim()) payload.designation = designation.value.trim()
    if (save.value && saveLayerId.value) payload.layer_id = saveLayerId.value
    
    result.value = await areaCompute(payload)
    
    if (result.value?.error) {
      alert(`Computation error: ${result.value.error}`)
      return
    }
    
    // Auto-save to land_parcels table if designation is provided
    if (designation.value.trim() && currentProjectId.value) {
      console.log('💾 Auto-saving computed parcel to database...')
      await saveParcelToDatabase(result.value)
    }
  } catch (error) {
    console.error('Area computation failed:', error)
    alert(`Failed to compute area: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}
</script>

<script lang="ts">
export default { name: 'Areas2View' }
</script>

<style scoped>
</style>
