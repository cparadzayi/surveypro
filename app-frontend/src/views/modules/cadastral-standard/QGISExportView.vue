<template>
  <div class="qgis-export-view p-6 max-w-7xl mx-auto space-y-6">
    <!-- Header -->
    <div class="bg-white rounded-lg shadow-sm border p-6">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
          <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/>
          </svg>
        </div>
        <div>
          <h2 class="text-2xl font-bold text-gray-900">QGIS Export & Digitization</h2>
          <p class="text-sm text-gray-600">Export coordinate points to PostGIS and digitize land parcels in QGIS</p>
        </div>
      </div>
    </div>

    <!-- Status Card -->
    <div v-if="exportStatus" class="bg-white rounded-lg shadow-sm border p-6">
      <div class="flex items-start gap-4">
        <div v-if="exportStatus.success" class="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
          <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
          </svg>
        </div>
        <div v-else class="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
          <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </div>
        <div class="flex-1">
          <h3 class="font-semibold" :class="exportStatus.success ? 'text-green-900' : 'text-red-900'">
            {{ exportStatus.message }}
          </h3>
          <p v-if="exportStatus.details" class="text-sm text-gray-600 mt-1">{{ exportStatus.details }}</p>
        </div>
      </div>
    </div>

    <!-- Coordinate List Summary -->
    <div class="bg-white rounded-lg shadow-sm border">
      <div class="px-6 py-4 border-b bg-gray-50">
        <h3 class="text-lg font-semibold text-gray-900">Coordinate List Summary</h3>
      </div>
      <div class="p-6">
        <div v-if="loading" class="text-center py-8">
          <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p class="mt-2 text-sm text-gray-600">Loading coordinate list...</p>
        </div>

        <div v-else-if="coordinateList.length === 0" class="text-center py-8">
          <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          <p class="mt-2 text-sm text-gray-600">No coordinate list found. Please complete Step 4 (Coordinate List) first.</p>
        </div>

        <div v-else>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div class="bg-blue-50 rounded-lg p-4">
              <div class="text-sm text-blue-600 font-medium">Survey Points (CSV)</div>
              <div class="text-2xl font-bold text-blue-900">{{ coordinateList.length }}</div>
              <div class="text-xs text-blue-500 mt-1">From your coordinate list</div>
            </div>
            <div class="bg-green-50 rounded-lg p-4">
              <div class="text-sm text-green-600 font-medium">Exported to PostGIS</div>
              <div class="text-2xl font-bold text-green-900">{{ exportedCount }}</div>
              <div class="text-xs text-green-500 mt-1">Available in QGIS</div>
            </div>
            <div class="bg-purple-50 rounded-lg p-4">
              <div class="text-sm text-purple-600 font-medium">Land Parcels</div>
              <div class="text-2xl font-bold text-purple-900">{{ parcelCount }}</div>
              <div class="text-xs text-purple-500 mt-1">Digitized in QGIS</div>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="flex flex-wrap gap-3 mb-6">
            <button
              @click="exportToPostGIS"
              :disabled="exporting || coordinateList.length === 0"
              class="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <svg v-if="!exporting" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
              </svg>
              <div v-else class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              {{ exporting ? 'Exporting...' : 'Export to PostGIS Database' }}
            </button>

            <button
              @click="showProjectManager = true"
              class="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 flex items-center gap-2 font-medium shadow-md hover:shadow-lg transition-all"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/>
              </svg>
              🎯 Open QGIS Manager
            </button>
            
            <button
              @click="refreshParcels"
              :disabled="refreshing"
              class="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <svg v-if="!refreshing" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
              <div v-else class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              {{ refreshing ? 'Refreshing...' : 'Refresh Parcels' }}
            </button>
            
            <button
              @click="generateMetadata"
              :disabled="generatingMetadata || parcelCount === 0"
              class="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
              title="Generate area consistency data (bearings, distances) for all parcels"
            >
              <svg v-if="!generatingMetadata" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
              </svg>
              <div v-else class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              {{ generatingMetadata ? 'Generating...' : 'Generate Metadata' }}
            </button>
          </div>
          
          <!-- Continue Button -->
          <div class="border-t pt-6">
            <div class="flex items-center justify-between">
              <div class="text-sm text-gray-600">
                <p class="font-medium mb-1">Ready to continue?</p>
                <p>After digitizing parcels in QGIS, click Refresh Parcels, then continue to Area Computation.</p>
              </div>
              <button
                @click="continueToNextStep"
                :disabled="parcelCount === 0"
                class="px-8 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
              >
                Continue to Area Computation
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- Preview Table -->
          <div class="mt-6 overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Point Name</th>
                  <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Y (Northing)</th>
                  <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">X (Easting)</th>
                  <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Elevation</th>
                  <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200">
                <tr v-for="point in coordinateList.slice(0, 10)" :key="point.name" class="hover:bg-gray-50">
                  <td class="px-4 py-3 font-medium text-gray-900">{{ point.name }}</td>
                  <td class="px-4 py-3 text-right font-mono text-sm">{{ formatNumber(point.y) }}</td>
                  <td class="px-4 py-3 text-right font-mono text-sm">{{ formatNumber(point.x) }}</td>
                  <td class="px-4 py-3 text-right font-mono text-sm">{{ point.elevation ? formatNumber(point.elevation) : '-' }}</td>
                  <td class="px-4 py-3 text-center">
                    <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                      Ready
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
            <div v-if="coordinateList.length > 10" class="px-4 py-3 bg-gray-50 text-sm text-gray-600 text-center">
              Showing 10 of {{ coordinateList.length }} points
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- QGIS Workflow Instructions -->
    <div class="bg-white rounded-lg shadow-sm border p-6">
      <h3 class="text-lg font-semibold text-gray-900 mb-4">QGIS Digitization Workflow</h3>
      <ol class="space-y-3 text-sm text-gray-700">
        <li class="flex gap-3">
          <span class="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-semibold">1</span>
          <span><strong>Export coordinate points</strong> to the PostGIS database using the button above</span>
        </li>
        <li class="flex gap-3">
          <span class="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-semibold">2</span>
          <span><strong>Open QGIS</strong> and create a new PostGIS connection (click "QGIS Connection Info" for details)</span>
        </li>
        <li class="flex gap-3">
          <span class="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-semibold">3</span>
          <span><strong>Add layers:</strong> Load <code class="bg-gray-100 px-1 rounded">coordinate_points</code> (read-only) and <code class="bg-gray-100 px-1 rounded">land_parcels</code> (editable)</span>
        </li>
        <li class="flex gap-3">
          <span class="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-semibold">4</span>
          <span><strong>Enable snapping</strong> to coordinate_points layer (Settings → Snapping Options)</span>
        </li>
        <li class="flex gap-3">
          <span class="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-semibold">5</span>
          <span><strong>Digitize parcels:</strong> Use "Add Polygon Feature" tool, snap to coordinate points, enter stand name</span>
        </li>
        <li class="flex gap-3">
          <span class="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-semibold">6</span>
          <span><strong>Save changes</strong> to the land_parcels layer in QGIS</span>
        </li>
        <li class="flex gap-3">
          <span class="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-semibold">7</span>
          <span><strong>Return to SurveyPro</strong> and proceed to Step 5(b) - Area Computation for area computation</span>
        </li>
      </ol>
    </div>

    <!-- QGIS Project Manager Modal -->
    <div v-if="showProjectManager" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div class="bg-white rounded-lg shadow-2xl max-w-6xl w-full my-8">
        <div class="px-6 py-4 border-b flex items-center justify-between bg-gradient-to-r from-green-600 to-emerald-600">
          <h3 class="text-xl font-bold text-white flex items-center gap-2">
            <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/>
            </svg>
            QGIS Project Manager
          </h3>
          <button @click="showProjectManager = false" class="text-white hover:text-gray-200 transition-colors">
            <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div class="p-6 max-h-[80vh] overflow-y-auto">
          <QGISProjectManager
            :project-id="workflowState?.selectedProject?.id || workflowState?.projectInfo?.projectId"
            :project-name="workflowState?.selectedProject?.project_name || workflowState?.projectInfo?.projectName || 'Current Project'"
            :client-name="workflowState?.selectedProject?.client_name || workflowState?.projectInfo?.clientName"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, inject } from 'vue'
import { batchCreateCoordinatePoints, listCoordinatePoints, listLandParcels, getQGISConnectionInfo, updateLandParcelsProject, calculateParcelAreas, type QGISConnectionInfo } from '@/services/spatial'
import QGISProjectManager from '@/components/QGISProjectManager.vue'

// Inject workflow state from parent
const workflowState = inject<any>('workflowState')

// State
const coordinateList = ref<Array<{ name: string; y: number; x: number; elevation?: number }>>([])
const exportedCount = ref(0)
const loading = ref(false)
const exporting = ref(false)
const refreshing = ref(false)
const calculating = ref(false)
const generatingMetadata = ref(false)
const exportStatus = ref<{ success: boolean; message: string; details?: string } | null>(null)
const dbConnection = ref<QGISConnectionInfo | null>(null)
const showQGISModal = ref(false)
const showProjectManager = ref(false)
const parcelCount = ref(0)
const calculatedParcels = ref<any[]>([])

// Load coordinate list from workflow state
onMounted(async () => {
  // Load from adjustedCoordinates (generated in Step 4)
  console.log('🔍 [QGISExport] Checking for adjusted coordinates...')
  console.log('  - workflowState exists?', !!workflowState)
  console.log('  - adjustedCoordinates exists?', !!workflowState?.adjustedCoordinates)
  console.log('  - adjustedCoordinates length:', workflowState?.adjustedCoordinates?.length || 0)
  
  if (workflowState?.adjustedCoordinates && workflowState.adjustedCoordinates.length > 0) {
    coordinateList.value = workflowState.adjustedCoordinates.map((pt: any) => ({
      name: pt.pointId || pt.name || pt.pointName,  // Use pointId from adjusted coordinates
      y: pt.y || pt.northing,
      x: pt.x || pt.easting,
      elevation: pt.elevation || pt.z
    }))
    console.log(`✅ Loaded ${coordinateList.value.length} coordinates from workflow state`)
    console.log('Sample point:', coordinateList.value[0])
  } else {
    console.warn('⚠️ No adjusted coordinates found in workflow state')
    console.warn('💡 You need to run Calculations Part 1 first to generate adjusted coordinates')
  }
  
  // Check how many points are already exported and load parcel count
  await checkExportedPoints()
  await loadParcelCount()
})

// Check exported points
async function checkExportedPoints() {
  const projectId = workflowState?.selectedProject?.id || workflowState?.projectInfo?.projectId
  if (!projectId) return
  
  try {
    const points = await listCoordinatePoints(projectId)
    exportedCount.value = points.length
  } catch (err) {
    console.error('Failed to check exported points:', err)
  }
}

// Load parcel count
async function loadParcelCount() {
  const projectId = workflowState?.selectedProject?.id || workflowState?.projectInfo?.projectId
  if (!projectId) return
  
  try {
    const parcels = await listLandParcels(projectId)
    parcelCount.value = parcels.length
    console.log(`📊 Found ${parcels.length} land parcels for project ${projectId}`)
  } catch (err) {
    console.error('Failed to load parcel count:', err)
  }
}

// Export to PostGIS
async function exportToPostGIS() {
  // Check for project in multiple places
  const projectId = workflowState?.selectedProject?.id || workflowState?.projectInfo?.projectId
  
  if (!projectId) {
    alert('No project selected. Please select a project in Step 1 (CSV Import) before exporting coordinates.')
    return
  }

  if (coordinateList.value.length === 0) {
    alert('No coordinate points to export')
    return
  }

  exporting.value = true
  exportStatus.value = null

  try {
    const points = coordinateList.value.map(pt => ({
      name: pt.name,
      y: pt.y,
      x: pt.x,
      elevation: pt.elevation,
      description: `Exported from Coordinate List - ${new Date().toISOString()}`
    }))

    const result = await batchCreateCoordinatePoints(projectId, points)
    
    exportStatus.value = {
      success: true,
      message: `✅ Successfully exported ${points.length} coordinate points to PostGIS`,
      details: result.count === points.length 
        ? 'All points are now available in QGIS. Existing points were updated with latest coordinates.'
        : 'Points are now available in QGIS. You can proceed with parcel digitization.'
    }

    await checkExportedPoints()
  } catch (err: any) {
    console.error('Export failed:', err)
    
    // Handle specific error cases
    const errorMessage = err.response?.data?.error || err.message || 'Unknown error occurred'
    const is409 = err.response?.status === 409
    
    exportStatus.value = {
      success: false,
      message: is409 ? '⚠️ Duplicate Points Detected' : '❌ Export Failed',
      details: is409 
        ? 'Some coordinate points already exist in the database. This usually means they were previously exported. Try refreshing the page or contact support if the issue persists.'
        : errorMessage
    }
  } finally {
    exporting.value = false
  }
}

// Load DB connection info
async function loadDBConnection() {
  const projectId = workflowState?.selectedProject?.id || workflowState?.projectInfo?.projectId
  try {
    dbConnection.value = await getQGISConnectionInfo(projectId)
  } catch (err) {
    console.error('Failed to load DB connection:', err)
    alert('Failed to load database connection information')
  }
}

// Copy connection string
function copyConnectionString() {
  if (!dbConnection.value) return
  
  const conn = dbConnection.value.connection
  const connString = `postgresql://${conn.username}@${conn.host}:${conn.port}/${conn.database}`
  
  navigator.clipboard.writeText(connString).then(() => {
    alert('Connection string copied to clipboard!')
  })
}

// Refresh parcels after QGIS digitization
async function refreshParcels() {
  const projectId = workflowState?.selectedProject?.id || workflowState?.projectInfo?.projectId
  
  if (!projectId) {
    alert('No project selected')
    return
  }
  
  refreshing.value = true
  calculating.value = true
  
  try {
    // Step 1: Update project_id for parcels that don't have it
    const updateResult = await updateLandParcelsProject(projectId)
    console.log(`✅ Updated ${updateResult.updated} parcels with project_id=${projectId}`)
    
    // Step 2: Calculate areas using shoelace method
    const calcResult = await calculateParcelAreas(projectId, false)
    console.log(`📐 Area calculation result:`, calcResult)
    console.log(`📐 Processed: ${calcResult.processed}, Errors: ${calcResult.errorCount}`)
    
    if (calcResult.errors && calcResult.errors.length > 0) {
      console.error('❌ Calculation errors:', calcResult.errors)
      // Log each error in detail
      calcResult.errors.forEach((err, idx) => {
        console.error(`  Error ${idx + 1}:`, {
          stand: err.stand,
          error: err.error,
          stack: err.stack
        })
      })
    }
    
    // Step 3: Reload parcel count and get calculated data
    await loadParcelCount()
    const parcels = await listLandParcels(projectId)
    console.log('📊 Parcels after calculation:', parcels)
    calculatedParcels.value = parcels.filter((p: any) => p.area_calculated)
    
    const successCount = calcResult.results.filter((r: any) => r.success).length
    const skippedCount = calcResult.results.filter((r: any) => r.skipped).length
    
    exportStatus.value = {
      success: true,
      message: `Refresh complete!`,
      details: `${updateResult.updated} parcels updated with project ID. ${successCount} areas calculated, ${skippedCount} already calculated. Total: ${parcelCount.value} parcels.`
    }
    
    console.log(`✅ Refresh complete: ${parcelCount.value} parcels, ${calculatedParcels.value.length} with calculated areas`)
  } catch (err: any) {
    console.error('Refresh failed:', err)
    exportStatus.value = {
      success: false,
      message: 'Refresh failed',
      details: err.response?.data?.error || err.message || 'Unknown error occurred'
    }
  } finally {
    refreshing.value = false
    calculating.value = false
  }
}

// Generate metadata (area consistency data) for all parcels
async function generateMetadata() {
  const projectId = workflowState?.selectedProject?.id || workflowState?.projectInfo?.projectId
  
  if (!projectId) {
    alert('No project selected')
    return
  }
  
  if (parcelCount.value === 0) {
    alert('No parcels found. Please digitize parcels in QGIS first.')
    return
  }
  
  generatingMetadata.value = true
  exportStatus.value = null
  
  try {
    console.log(`🔄 Generating metadata for all parcels in project ${projectId}...`)
    
    // Call the API to generate metadata
    const response = await fetch(`/api/land-parcels/generate-metadata`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ project_id: projectId })
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to generate metadata')
    }
    
    const result = await response.json()
    console.log('✅ Metadata generation result:', result)
    
    const successCount = result.data?.results?.filter((r: any) => r.updated).length || 0
    const totalCount = result.data?.results?.length || 0
    
    exportStatus.value = {
      success: true,
      message: `✅ Successfully generated metadata for ${successCount} of ${totalCount} parcels`,
      details: 'Area consistency data (south-oriented bearings, distances, from/to coordinates) has been calculated and stored. Your parcels are now ready for PDF generation with correct bearing values.'
    }
    
    console.log(`✅ Generated metadata for ${successCount} parcels`)
  } catch (err: any) {
    console.error('Metadata generation failed:', err)
    exportStatus.value = {
      success: false,
      message: '❌ Metadata Generation Failed',
      details: err.message || 'Unknown error occurred'
    }
  } finally {
    generatingMetadata.value = false
  }
}

// Continue to next step in workflow
function continueToNextStep() {
  if (parcelCount.value === 0) {
    alert('Please digitize and refresh land parcels before continuing.')
    return
  }
  
  // Emit event to parent to advance workflow
  if (workflowState) {
    workflowState.currentStep = 'area-computation'
    console.log('✅ Advancing to Area Computation')
  }
}

// Format number
function formatNumber(value: number | undefined): string {
  if (value === undefined) return '-'
  return value.toFixed(3)
}
</script>

<style scoped>
code {
  font-family: 'Courier New', monospace;
}
</style>
