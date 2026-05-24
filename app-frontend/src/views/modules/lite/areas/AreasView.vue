<template>
  <div class="p-6 max-w-7xl mx-auto space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold text-gray-900">Land Parcel Areas</h1>
      <button @click="showQGISModal = true" class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
        📡 QGIS Connection
      </button>
    </div>

    <!-- Project Context Display (from Areas2View) -->
    <div v-if="currentProject" class="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <div class="flex items-center gap-3 text-sm">
        <span class="font-semibold text-blue-900">📋 Active Project:</span>
        <span class="text-blue-800 font-medium">{{ currentProject.name }}</span>
        <span v-if="currentProject.client_name" class="text-blue-600">• Client: {{ currentProject.client_name }}</span>
        <span v-if="currentProject.district" class="text-blue-600">• District: {{ currentProject.district }}</span>
        <span v-if="currentSurveyor" class="text-blue-600">• Surveyor: {{ currentSurveyor.name }}</span>
      </div>
    </div>
    <div v-else class="bg-amber-50 border border-amber-200 rounded-lg p-4">
      <div class="text-sm text-amber-800">
        ℹ️ No project selected. Select a surveyor and project below for integrated data access.
      </div>
    </div>

    <!-- Surveyor & Project Selection -->
    <div class="bg-white rounded-lg shadow-sm border p-6">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- Surveyor Selection -->
        <label class="block">
          <span class="text-sm font-medium text-gray-700 mb-2 block">Select Surveyor</span>
          <select 
            v-model="selectedSurveyorId" 
            @change="onSurveyorChange"
            class="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option :value="null">Choose a surveyor...</option>
            <option v-for="s in surveyors" :key="s.id" :value="s.id">
              {{ s.name }}{{ s.license_number ? ` (${s.license_number})` : '' }}
            </option>
          </select>
        </label>

        <!-- Project Selection -->
        <label class="block">
          <span class="text-sm font-medium text-gray-700 mb-2 block">Select Project</span>
          <select 
            v-model="selectedProjectId" 
            @change="onProjectChange"
            :disabled="!selectedSurveyorId"
            class="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          >
            <option :value="null">Choose a project...</option>
            <option v-for="p in filteredProjects" :key="p.id" :value="p.id">
              {{ p.name }} {{ p.code ? `(${p.code})` : '' }}
            </option>
          </select>
        </label>
      </div>
    </div>

    <template v-if="selectedProjectId">
      <!-- Coordinate Points Section -->
      <div class="bg-white rounded-lg shadow-sm border">
        <div class="px-6 py-4 border-b bg-gray-50">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-gray-900">
              Coordinate Points ({{ coordinatePoints.length }})
            </h2>
            <div class="flex gap-2">
              <button 
                @click="addCoordinatePoint" 
                class="px-4 py-2 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700"
              >
                + Add Point
              </button>
              <button 
                v-if="coordinatePoints.length > 0"
                @click="viewAllOnGoogleMaps"
                class="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
                title="Open all points in Google Maps"
              >
                🗺️ View on Google Maps
              </button>
              <button 
                v-if="coordinatePoints.length > 0"
                @click="exportToDatabase" 
                :disabled="exporting"
                class="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {{ exporting ? 'Exporting...' : '📤 Export to Database' }}
              </button>
            </div>
          </div>
        </div>

        <div class="p-6">
          <div v-if="coordinatePoints.length === 0" class="text-center py-12 text-gray-500">
            <p class="text-lg mb-2">No coordinate points yet</p>
            <p class="text-sm">Add points manually or import from CSV</p>
          </div>

          <div v-else class="overflow-x-auto">
            <table class="w-full">
              <thead class="bg-gray-50 border-b">
                <tr>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Y (Westing)</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">X (Southing)</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Elevation</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                  <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Map</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200">
                <tr v-for="(pt, idx) in coordinatePoints" :key="idx" class="hover:bg-gray-50">
                  <td class="px-4 py-3">
                    <input 
                      v-model="pt.name" 
                      class="w-20 border rounded px-2 py-1 text-sm"
                      placeholder="A"
                    />
                  </td>
                  <td class="px-4 py-3">
                    <input 
                      v-model.number="pt.y" 
                      type="number" 
                      step="0.001"
                      class="w-32 border rounded px-2 py-1 text-sm font-mono"
                      placeholder="124.500"
                    />
                  </td>
                  <td class="px-4 py-3">
                    <input 
                      v-model.number="pt.x" 
                      type="number" 
                      step="0.001"
                      class="w-32 border rounded px-2 py-1 text-sm font-mono"
                      placeholder="679.300"
                    />
                  </td>
                  <td class="px-4 py-3">
                    <input 
                      v-model.number="pt.elevation" 
                      type="number" 
                      step="0.1"
                      class="w-24 border rounded px-2 py-1 text-sm"
                      placeholder="1500"
                    />
                  </td>
                  <td class="px-4 py-3">
                    <input 
                      v-model="pt.description" 
                      class="w-48 border rounded px-2 py-1 text-sm"
                      placeholder="Optional notes"
                    />
                  </td>
                  <td class="px-4 py-3 text-right">
                    <button 
                      @click="removeCoordinatePoint(idx)"
                      class="text-red-600 hover:text-red-800 text-sm"
                    >
                      Remove
                    </button>
                  </td>
                  <td class="px-4 py-3 text-center">
                    <button
                      @click.stop="viewPointOnGoogleMaps(pt)"
                      class="text-green-600 hover:text-green-800 text-lg leading-none"
                      title="View this point on Google Maps"
                    >📍</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Land Parcels Section -->
      <div class="bg-white rounded-lg shadow-sm border">
        <div class="px-6 py-4 border-b bg-gray-50">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-gray-900">
              Land Parcels ({{ landParcels.length }})
            </h2>
            <div class="flex gap-2">
              <button 
                @click="loadParcels" 
                :disabled="loading"
                class="px-4 py-2 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
              >
                {{ loading ? 'Loading...' : '🔄 Refresh' }}
              </button>
              <button 
                @click="computeAllAreas" 
                :disabled="computing || landParcels.length === 0"
                class="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {{ computing ? 'Computing...' : '🧮 Compute All Areas' }}
              </button>
            </div>
          </div>
        </div>

        <div class="p-6">
          <div v-if="landParcels.length === 0" class="text-center py-12 text-gray-500">
            <p class="text-lg mb-2">No land parcels found</p>
            <p class="text-sm">Digitize parcels in QGIS and save to database</p>
            <button @click="showQGISModal = true" class="mt-4 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              View QGIS Instructions
            </button>
          </div>

          <div v-else class="overflow-x-auto">
            <table class="w-full">
              <thead class="bg-gray-50 border-b">
                <tr>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stand</th>
                  <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Area (m²)</th>
                  <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Area (ha)</th>
                  <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Perimeter (m)</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Owner</th>
                  <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200">
                <tr v-for="parcel in landParcels" :key="parcel.id" class="hover:bg-gray-50 cursor-pointer" @click="toggleParcelDetails(parcel.id)">
                  <td class="px-4 py-3 font-medium">
                    <div class="flex items-center gap-2">
                      <span v-if="expandedParcelId === parcel.id">▼</span>
                      <span v-else>▶</span>
                      {{ parcel.stand }}
                    </div>
                  </td>
                  <td class="px-4 py-3 text-right font-mono">{{ formatAreaM2(parcel.area_m2) }}</td>
                  <td class="px-4 py-3 text-right font-mono">{{ formatAreaHa(parcel.area_ha) }}</td>
                  <td class="px-4 py-3 text-right font-mono">{{ parcel.perimeter_m ? Number(parcel.perimeter_m).toFixed(2) : '-' }}</td>
                  <td class="px-4 py-3 text-sm text-gray-600">{{ parcel.owner || '-' }}</td>
                  <td class="px-4 py-3 text-center">
                    <span v-if="parcel.area_m2" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      ✓ Computed
                    </span>
                    <span v-else class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                      Pending
                    </span>
                  </td>
                </tr>
                <!-- Expanded Details Row -->
                <tr v-if="expandedParcelId === parcel.id && parcelDetails[parcel.id]" :key="`${parcel.id}-details`">
                  <td colspan="6" class="px-4 py-4 bg-gray-50">
                    <div class="space-y-4">
                      <!-- Area Display with Threshold Logic -->
                      <div class="text-center py-3 bg-white rounded-lg border">
                        <div class="text-2xl font-bold text-gray-900">
                          {{ formatAreaWithThreshold(parcel.area_m2) }}
                        </div>
                        <div class="text-sm text-gray-500 mt-1">
                          Centroid: P({{ fmtNumber(parcelDetails[parcel.id]?.centroid?.y) }}, {{ fmtNumber(parcelDetails[parcel.id]?.centroid?.x) }})
                        </div>
                      </div>

                      <!-- Residuals Table -->
                      <div v-if="parcelDetails[parcel.id]?.residuals" class="bg-white rounded-lg border p-4">
                        <h4 class="font-semibold text-sm mb-2">Traverse Analysis</h4>
                        <div class="text-xs text-gray-600 mb-3">
                          Sum dY = {{ fmtNumber(parcelDetails[parcel.id].residuals.sumDy) }}, 
                          Sum dX = {{ fmtNumber(parcelDetails[parcel.id].residuals.sumDx) }}
                          <span v-if="parcelDetails[parcel.id].residuals.closureError" class="ml-3 font-medium">
                            Closure Error: {{ fmtNumber(parcelDetails[parcel.id].residuals.closureError) }} m
                          </span>
                        </div>
                        <div class="overflow-x-auto">
                          <table class="min-w-full text-xs">
                            <thead class="bg-gray-50">
                              <tr class="text-left text-gray-600">
                                <th class="p-2">#</th>
                                <th class="p-2">Point</th>
                                <th class="p-2">Y-Coordinate</th>
                                <th class="p-2">X-Coordinate</th>
                                <th class="p-2">Dist (m)</th>
                                <th class="p-2">Direction</th>
                                <th class="p-2">dY</th>
                                <th class="p-2">dX</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr v-for="(row, idx) in parcelDetails[parcel.id].displayRows" :key="idx" class="border-t hover:bg-gray-50">
                                <td class="p-2">{{ idx + 1 }}</td>
                                <td class="p-2 font-medium">{{ row.name }}</td>
                                <td class="p-2 font-mono">{{ fmtNumber(row.y) }}</td>
                                <td class="p-2 font-mono">{{ fmtNumber(row.x) }}</td>
                                <td class="p-2 font-mono">{{ row.edge ? row.edge.distanceRounded.toFixed(2) : '' }}</td>
                                <td class="p-2 font-mono">{{ row.edge ? formatBearing(row.edge) : '' }}</td>
                                <td class="p-2 font-mono">{{ row.edge ? fmtNumber(row.edge.dy) : '' }}</td>
                                <td class="p-2 font-mono">{{ row.edge ? fmtNumber(row.edge.dx) : '' }}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Computation Results -->
      <div v-if="batchResults" class="bg-white rounded-lg shadow-sm border">
        <div class="px-6 py-4 border-b bg-gray-50">
          <h2 class="text-lg font-semibold text-gray-900">Computation Results</h2>
        </div>
        <div class="p-6">
          <!-- Summary Cards -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div class="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <div class="text-sm text-blue-600 font-medium">Total Parcels</div>
              <div class="text-3xl font-bold text-blue-900">{{ batchResults.total_polygons }}</div>
            </div>
            <div class="bg-green-50 rounded-lg p-4 border border-green-200">
              <div class="text-sm text-green-600 font-medium">Successful</div>
              <div class="text-3xl font-bold text-green-900">{{ batchResults.success_count }}</div>
            </div>
            <div class="bg-red-50 rounded-lg p-4 border border-red-200">
              <div class="text-sm text-red-600 font-medium">Failed</div>
              <div class="text-3xl font-bold text-red-900">{{ batchResults.failure_count }}</div>
            </div>
          </div>

          <!-- Detailed Results -->
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="bg-gray-50 border-b">
                <tr>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stand</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Area</th>
                  <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Closure Error</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vertices</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200">
                <tr v-for="result in batchResults.results" :key="result.polygon_id" class="hover:bg-gray-50">
                  <td class="px-4 py-3 font-medium">{{ result.designation }}</td>
                  <td class="px-4 py-3">
                    <span v-if="result.success" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      ✓ Success
                    </span>
                    <span v-else class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                      ✗ Failed
                    </span>
                  </td>
                  <td class="px-4 py-3 text-right font-mono">
                    <span v-if="result.area">{{ result.area.display }} {{ result.area.unit }}</span>
                    <span v-else class="text-gray-400">-</span>
                  </td>
                  <td class="px-4 py-3 text-right font-mono">
                    <span v-if="result.closure_error_m !== undefined" :class="closureErrorClass(result.closure_error_m)">
                      {{ result.closure_error_m.toFixed(3) }} m
                    </span>
                    <span v-else class="text-gray-400">-</span>
                  </td>
                  <td class="px-4 py-3 text-sm text-gray-600">
                    <span v-if="result.vertex_names">{{ result.vertex_names.join(', ') }}</span>
                    <span v-else-if="result.error" class="text-red-600">{{ result.error }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="mt-4 flex gap-2">
            <button @click="exportResultsCSV" class="px-4 py-2 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700">
              📄 Export CSV
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- QGIS Connection Modal -->
    <div v-if="showQGISModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div class="px-6 py-4 border-b flex items-center justify-between">
          <h3 class="text-lg font-semibold">QGIS Connection & Workflow</h3>
          <button @click="showQGISModal = false" class="text-gray-400 hover:text-gray-600">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div class="p-6 space-y-4">
          <div>
            <h4 class="font-medium mb-2">Workflow Steps:</h4>
            <ol class="list-decimal list-inside space-y-2 text-sm text-gray-700">
              <li>Add coordinate points in the table above</li>
              <li>Click "Export to Database" to save points</li>
              <li>Open QGIS and add PostGIS connection (details below)</li>
              <li>Add <code class="bg-gray-100 px-1 rounded">coordinate_points</code> layer to map</li>
              <li>Add <code class="bg-gray-100 px-1 rounded">land_parcels</code> layer (create if needed)</li>
              <li>Enable snapping to coordinate_points (Settings → Snapping)</li>
              <li>Digitize polygons using "Add Polygon Feature" tool</li>
              <li>Enter stand name and save each parcel</li>
              <li>Return here and click "Compute All Areas"</li>
            </ol>
          </div>

          <div v-if="dbConnection" class="bg-gray-50 rounded-lg p-4 space-y-3">
            <h4 class="font-medium">Database Connection:</h4>
            <div class="space-y-2 text-sm font-mono">
              <div><span class="text-gray-600">Host:</span> {{ dbConnection.connection.host }}</div>
              <div><span class="text-gray-600">Port:</span> {{ dbConnection.connection.port }}</div>
              <div><span class="text-gray-600">Database:</span> {{ dbConnection.connection.database }}</div>
              <div><span class="text-gray-600">Username:</span> {{ dbConnection.connection.username }}</div>
            </div>
            <button @click="copyConnectionString" class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              📋 Copy Connection String
            </button>
          </div>

          <div v-else class="text-center py-4">
            <button @click="loadDBConnection" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              Load Connection Info
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import proj4 from 'proj4'
import { 
  listProjects, 
  listCoordinatePoints, 
  batchCreateCoordinatePoints,
  listLandParcels,
  getDBConnectionInfo,
  type Project,
  type CoordinatePoint as CoordPoint,
  type LandParcel,
  type DBConnectionInfo
} from '@/services/spatial'
import { batchAreaComputeV2, areaCompute, type BatchAreaComputeV2Response } from '@/services/compute'
import { decimalToDMS, formatDMS } from '@/utils/dms'
import { getDMSPolicy } from '@/utils/displayConfig'
import { useProjectContext } from '@/stores/projectContext'
import { useSurveyors, type Surveyor, type SurveyProject } from '@/composables/useSurveyors'
import { bankersRound, formatAreaM2, formatAreaHa, formatAreaWithThreshold } from '@/utils/areaFormatting'

// Project context integration (from Areas2View)
const { currentProject, currentProjectId, setCurrentProject } = useProjectContext()

// Surveyors composable
const { surveyors, surveyProjects, fetchSurveyors, fetchSurveyProjects } = useSurveyors()

// State
const selectedSurveyorId = ref<number | null>(null)
const selectedProjectId = ref<number | null>(null)
const coordinatePoints = ref<Array<{ name: string; y: number; x: number; elevation?: number; description?: string }>>([])
const landParcels = ref<LandParcel[]>([])
const batchResults = ref<BatchAreaComputeV2Response | null>(null)
const dbConnection = ref<DBConnectionInfo | null>(null)
const showQGISModal = ref(false)
const loading = ref(false)
const exporting = ref(false)
const computing = ref(false)

// Parcel details expansion
const expandedParcelId = ref<number | null>(null)
const parcelDetails = ref<Record<number, any>>({})

// Computed: Current surveyor
const currentSurveyor = computed(() => {
  if (!selectedSurveyorId.value) return null
  return surveyors.value.find(s => s.id === selectedSurveyorId.value) || null
})

// Computed: Filtered projects by surveyor
const filteredProjects = computed(() => {
  if (!selectedSurveyorId.value) return []
  return surveyProjects.value.filter((p: SurveyProject) => p.surveyor_id === selectedSurveyorId.value)
})

// Load surveyors and projects on mount
onMounted(async () => {
  try {
    // Load surveyors and projects
    await fetchSurveyors()
    await fetchSurveyProjects()
    
    // If there's a current project from context, auto-select it
    if (currentProjectId.value) {
      const project = surveyProjects.value.find((p: SurveyProject) => p.id === currentProjectId.value)
      if (project) {
        selectedSurveyorId.value = project.surveyor_id
        selectedProjectId.value = project.id
        await loadCoordinatePoints()
        await loadParcels()
      }
    }
  } catch (err) {
    console.error('Failed to load initial data:', err)
    alert('Failed to load surveyors and projects')
  }
})

// Surveyor change handler
function onSurveyorChange() {
  // Reset project selection when surveyor changes
  selectedProjectId.value = null
  coordinatePoints.value = []
  landParcels.value = []
  batchResults.value = null
}

// Project change handler
async function onProjectChange() {
  console.log('🔄 Project changed:', selectedProjectId.value)
  if (!selectedProjectId.value) return
  
  coordinatePoints.value = []
  landParcels.value = []
  batchResults.value = null
  
  // Update project context
  const project = surveyProjects.value.find((p: SurveyProject) => p.id === selectedProjectId.value)
  if (project) {
    setCurrentProject(project as any)
    console.log('📋 Set current project:', project.name)
  }
  
  console.log('📡 Loading coordinate points and parcels...')
  await Promise.all([loadCoordinatePoints(), loadParcels()])
  console.log('✅ Loading complete')
}

// Load coordinate points
async function loadCoordinatePoints() {
  if (!selectedProjectId.value) return
  
  console.log('📍 Loading coordinate points for project:', selectedProjectId.value)
  loading.value = true
  try {
    const dbPoints = await listCoordinatePoints(selectedProjectId.value)
    console.log('📍 Received points:', dbPoints.length, dbPoints)
    // Convert database points to editable format
    coordinatePoints.value = dbPoints.map(pt => ({
      name: pt.name,
      y: pt.y,
      x: pt.x,
      elevation: pt.elevation,
      description: pt.description
    }))
    console.log('📍 Loaded coordinate points:', coordinatePoints.value.length)
  } catch (err) {
    console.error('❌ Failed to load coordinate points:', err)
    // Don't alert - it's ok if there are no points yet
  } finally {
    loading.value = false
  }
}

// Load land parcels
async function loadParcels() {
  if (!selectedProjectId.value) return
  
  console.log('🏘️ Loading land parcels for project:', selectedProjectId.value)
  loading.value = true
  try {
    landParcels.value = await listLandParcels(selectedProjectId.value)
    console.log('🏘️ Loaded land parcels:', landParcels.value.length, landParcels.value)
  } catch (err) {
    console.error('❌ Failed to load parcels:', err)
    alert('Failed to load land parcels')
  } finally {
    loading.value = false
  }
}

// Add coordinate point
function addCoordinatePoint() {
  coordinatePoints.value.push({
    name: String.fromCharCode(65 + coordinatePoints.value.length), // A, B, C...
    y: 0,
    x: 0
  })
}

// Remove coordinate point
function removeCoordinatePoint(index: number) {
  coordinatePoints.value.splice(index, 1)
}

// Export to database
async function exportToDatabase() {
  if (!selectedProjectId.value) return
  if (coordinatePoints.value.length === 0) {
    alert('No coordinate points to export')
    return
  }

  // Validate
  const invalid = coordinatePoints.value.filter(pt => !pt.name || pt.y === 0 || pt.x === 0)
  if (invalid.length > 0) {
    alert('Please fill in all coordinate point names and values')
    return
  }

  exporting.value = true
  try {
    const result = await batchCreateCoordinatePoints(selectedProjectId.value, coordinatePoints.value)
    alert(`Successfully exported ${result.count} coordinate points to database`)
  } catch (err: any) {
    console.error('Export failed:', err)
    if (err.response?.status === 409) {
      alert('⚠️ Coordinate points already exist in database.\n\nThese points were loaded from the database and are already saved.\n\nTo add new points, use the "+ Add Point" button.')
    } else {
      alert(`Export failed: ${err.response?.data?.error || err.message}`)
    }
  } finally {
    exporting.value = false
  }
}

// Compute all areas
async function computeAllAreas() {
  if (!selectedProjectId.value) return
  
  computing.value = true
  batchResults.value = null
  
  try {
    const result = await batchAreaComputeV2({
      project_id: selectedProjectId.value,
      tolerance: 0.001,
      hectaresThreshold: 10000,
      roundMetersDecimals: 0,
      roundHectaresDecimals: 4
    })
    
    batchResults.value = result
    
    // Reload parcels to get updated areas
    await loadParcels()
    
    if (result.failure_count > 0) {
      alert(`Computation complete: ${result.success_count} succeeded, ${result.failure_count} failed`)
    } else {
      alert(`All ${result.success_count} parcels computed successfully!`)
    }
  } catch (err: any) {
    console.error('Computation failed:', err)
    alert(`Computation failed: ${err.response?.data?.error || err.message}`)
  } finally {
    computing.value = false
  }
}

// Load DB connection info
async function loadDBConnection() {
  try {
    dbConnection.value = await getDBConnectionInfo()
  } catch (err) {
    console.error('Failed to load DB connection:', err)
    alert('Failed to load database connection info')
  }
}

// Copy connection string
function copyConnectionString() {
  if (!dbConnection.value) return
  navigator.clipboard.writeText(dbConnection.value.qgis_uri)
  alert('Connection string copied to clipboard!')
}

// Closure error styling
function closureErrorClass(error: number) {
  if (error < 0.05) return 'text-green-600 font-medium'
  if (error < 0.5) return 'text-yellow-600 font-medium'
  return 'text-red-600 font-medium'
}

// Export results to CSV
function exportResultsCSV() {
  if (!batchResults.value) return
  
  const rows = [
    ['Stand', 'Status', 'Area (m²)', 'Area (ha)', 'Closure Error (m)', 'Vertices'].join(',')
  ]
  
  for (const result of batchResults.value.results) {
    rows.push([
      result.designation,
      result.success ? 'Success' : 'Failed',
      result.area?.m2.toFixed(2) || '',
      result.area?.ha.toFixed(4) || '',
      result.closure_error_m?.toFixed(3) || '',
      result.vertex_names?.join('; ') || result.error || ''
    ].join(','))
  }
  
  const csv = rows.join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `parcel-areas-${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ===== AREAS2VIEW-STYLE DISPLAY FUNCTIONS =====

// Toggle parcel details expansion and load detailed computation
async function toggleParcelDetails(parcelId: number) {
  if (expandedParcelId.value === parcelId) {
    expandedParcelId.value = null
    return
  }
  
  expandedParcelId.value = parcelId
  
  // If details not loaded, compute them
  if (!parcelDetails.value[parcelId]) {
    await loadParcelDetails(parcelId)
  }
}

// Load detailed area computation for a parcel
async function loadParcelDetails(parcelId: number) {
  const parcel = landParcels.value.find(p => p.id === parcelId)
  if (!parcel || !parcel.geom) return
  
  try {
    // Extract vertices from polygon geometry
    const coords = parcel.geom.coordinates[0] // First ring of polygon
    const points = coords.slice(0, -1).map((coord: number[]) => ({
      y: coord[0], // PostGIS stores as [y, x]
      x: coord[1]
    }))
    
    // Compute area with residuals
    const result = await areaCompute({
      points,
      hectaresThreshold: 10000,
      roundMetersDecimals: 2,
      roundHectaresDecimals: 4,
      includeResiduals: true,
      save: false
    })
    
    // Build display rows from edges
    const edges = result.residuals?.edges || []
    const displayRows: Array<{ name: string; y: number; x: number; edge: any | null }> = []
    
    if (edges.length > 0) {
      // First point
      displayRows.push({
        name: `P1`,
        y: edges[0].from.y,
        x: edges[0].from.x,
        edge: null
      })
      
      // Subsequent points with edges
      for (let i = 0; i < edges.length; i++) {
        displayRows.push({
          name: `P${i + 2}`,
          y: edges[i].to.y,
          x: edges[i].to.x,
          edge: edges[i]
        })
      }
    }
    
    parcelDetails.value[parcelId] = {
      ...result,
      displayRows
    }
  } catch (err) {
    console.error('Failed to load parcel details:', err)
    alert('Failed to compute parcel details')
  }
}

// Format number with banker's rounding
function fmtNumber(n: any): string {
  if (n === null || n === undefined) return '-'
  return bankersRound(Number(n), 2).toFixed(2)
}

// ===== GOOGLE MAPS INTEGRATION =====

// Zimbabwe Lo system (Cape datum, Gauss-Conform/TMSO) projection definitions
// +axis=wsu = Westing, Southing, Up — matches surveyor Y/X convention directly
const LO_PROJECTIONS: Record<number, string> = {
  29: '+proj=tmerc +axis=wsu +lat_0=0 +lon_0=29 +k=1 +x_0=0 +y_0=0 +ellps=clrk80 +towgs84=-136,-108,-292,0,0,0,0 +units=m +no_defs',
  31: '+proj=tmerc +axis=wsu +lat_0=0 +lon_0=31 +k=1 +x_0=0 +y_0=0 +ellps=clrk80 +towgs84=-136,-108,-292,0,0,0,0 +units=m +no_defs',
}
const WGS84 = '+proj=longlat +datum=WGS84 +no_defs'

// Convert Lo29/Lo31 (Y=Westing, X=Southing) to WGS84 { lat, lng }
function loToWGS84(y: number, x: number, centralMeridian: number): { lat: number; lng: number } | null {
  const projStr = LO_PROJECTIONS[centralMeridian]
  if (!projStr) return null
  try {
    // proj4 with +axis=wsu accepts [Y_westing, X_southing] directly and returns [lng, lat]
    const [lng, lat] = proj4(projStr, WGS84, [y, x])
    return { lat, lng }
  } catch {
    return null
  }
}

// Get the central meridian for the selected project
const projectCentralMeridian = computed(() => {
  const project = filteredProjects.value.find((p: any) => p.id === selectedProjectId.value)
  return project?.central_meridian ? Number(project.central_meridian) : null
})

// Open all coordinate points on Google Maps
function viewAllOnGoogleMaps() {
  const cm = projectCentralMeridian.value
  if (!cm) {
    alert('Project central meridian (Lo zone) is not set. Please update the project settings.')
    return
  }
  const validPoints = coordinatePoints.value
    .map(pt => loToWGS84(pt.y, pt.x, cm))
    .filter((p): p is { lat: number; lng: number } => p !== null)
  if (validPoints.length === 0) {
    alert('No valid points to display.')
    return
  }
  // Centre on average position
  const avgLat = validPoints.reduce((s, p) => s + p.lat, 0) / validPoints.length
  const avgLng = validPoints.reduce((s, p) => s + p.lng, 0) / validPoints.length
  // Build Google Maps URL with all points as markers
  const markers = validPoints.map((p, i) => {
    const name = coordinatePoints.value[i]?.name || String(i + 1)
    return `markers=label:${encodeURIComponent(name)}|${p.lat.toFixed(7)},${p.lng.toFixed(7)}`
  }).join('&')
  const url = `https://maps.google.com/maps?q=${avgLat.toFixed(7)},${avgLng.toFixed(7)}&z=17&${markers}`
  window.open(url, '_blank')
}

// Open a single point on Google Maps
function viewPointOnGoogleMaps(pt: { name: string; y: number; x: number }) {
  const cm = projectCentralMeridian.value
  if (!cm) {
    alert('Project central meridian (Lo zone) is not set.')
    return
  }
  const wgs = loToWGS84(pt.y, pt.x, cm)
  if (!wgs) {
    alert('Could not convert coordinates.')
    return
  }
  const url = `https://maps.google.com/maps?q=${wgs.lat.toFixed(7)},${wgs.lng.toFixed(7)}&z=19`
  window.open(url, '_blank')
}

// Format bearing in DMS format (from Areas2View)
function formatBearing(edge: any): string {
  const bearingDeg = typeof edge?.bearingRoundedDeg === 'number' 
    ? edge.bearingRoundedDeg 
    : rawBearingDeg(edge)
  
  const dms = decimalToDMS(bearingDeg)
  const policy = getDMSPolicy('default')
  return formatDMS(dms, policy.secondsDecimals, policy.separator)
}

// Calculate raw bearing in degrees
function rawBearingDeg(e: any): number {
  if (typeof e?.bearingDeg === 'number') return e.bearingDeg
  const dy = (e?.to?.y ?? 0) - (e?.from?.y ?? 0)
  const dx = (e?.to?.x ?? 0) - (e?.from?.x ?? 0)
  let deg = Math.atan2(dy, dx) * 180 / Math.PI
  if (deg < 0) deg += 360
  return deg
}
</script>
