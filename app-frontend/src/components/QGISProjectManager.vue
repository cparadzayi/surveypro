<template>
  <div class="qgis-project-manager bg-white rounded-lg shadow-sm border p-6 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center">
          <svg class="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/>
          </svg>
        </div>
        <div>
          <h3 class="text-xl font-bold text-gray-900">QGIS Project Manager</h3>
          <p class="text-sm text-gray-600">Intelligent layer guidance for {{ projectName }}</p>
        </div>
      </div>
      
      <!-- Status Badge -->
      <div v-if="connectionInfo" class="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-800 rounded-lg">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <span class="font-medium">Connection Ready</span>
      </div>
    </div>

    <!-- Project Info Card -->
    <div class="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-5 border border-blue-200">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <div class="text-xs font-medium text-blue-600 uppercase">Project</div>
          <div class="text-lg font-bold text-gray-900 mt-1">{{ projectName }}</div>
        </div>
        <div>
          <div class="text-xs font-medium text-blue-600 uppercase">Client</div>
          <div class="text-lg font-semibold text-gray-700 mt-1">{{ clientName || 'N/A' }}</div>
        </div>
        <div>
          <div class="text-xs font-medium text-blue-600 uppercase">Project ID</div>
          <div class="text-lg font-mono font-semibold text-gray-700 mt-1">#{{ projectId }}</div>
        </div>
      </div>
    </div>

    <!-- Action Buttons -->
    <div class="flex flex-wrap gap-3">
      <button
        @click="loadConnectionInfo"
        :disabled="loading"
        class="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2 font-medium shadow-md hover:shadow-lg transition-all"
      >
        <svg v-if="!loading" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <div v-else class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
        {{ loading ? 'Loading...' : 'Show QGIS Instructions' }}
      </button>

      <button
        @click="copyConnectionDetails"
        :disabled="!connectionInfo"
        class="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2 font-medium shadow-md hover:shadow-lg transition-all"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
        </svg>
        Copy Connection Info
      </button>
    </div>

    <!-- Alert Messages -->
    <div v-if="successMessage" class="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
      <svg class="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
      <div class="flex-1">
        <p class="font-semibold text-green-900">{{ successMessage }}</p>
      </div>
      <button @click="successMessage = ''" class="text-green-600 hover:text-green-800">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    </div>

    <div v-if="errorMessage" class="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
      <svg class="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
      <div class="flex-1">
        <p class="font-semibold text-red-900">{{ errorMessage }}</p>
      </div>
      <button @click="errorMessage = ''" class="text-red-600 hover:text-red-800">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    </div>

    <!-- Layer Information Card -->
    <div v-if="connectionInfo" class="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-5 border border-purple-200">
      <h4 class="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
        <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"/>
        </svg>
        QGIS Layers for This Project
      </h4>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- Reference Layer -->
        <div class="bg-white rounded-lg p-4 border-2 border-blue-300">
          <div class="flex items-center gap-2 mb-3">
            <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
            <span class="font-bold text-blue-900">Reference Points Layer</span>
            <span class="ml-auto px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded">READ ONLY</span>
          </div>
          <div class="space-y-2">
            <div>
              <div class="text-xs text-gray-600 font-medium mb-1">Table:</div>
              <code class="block bg-blue-100 px-3 py-2 rounded text-sm font-mono text-blue-900">coordinate_points</code>
            </div>
            <div>
              <div class="text-xs text-gray-600 font-medium mb-1">Filter:</div>
              <code class="block bg-blue-50 px-3 py-2 rounded text-sm font-mono text-blue-900">"project_id" = {{ projectId }}</code>
            </div>
            <div>
              <div class="text-xs text-gray-600 font-medium mb-1">Schema:</div>
              <code class="block bg-blue-50 px-3 py-2 rounded text-sm font-mono text-blue-900">{{ connectionInfo.connection.schema }}</code>
            </div>
          </div>
          <p class="text-xs text-gray-600 mt-3">📍 Use for reference and snapping</p>
        </div>

        <!-- Digitization Layer -->
        <div class="bg-white rounded-lg p-4 border-2 border-green-300">
          <div class="flex items-center gap-2 mb-3">
            <svg class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
            </svg>
            <span class="font-bold text-green-900">Digitization Layer</span>
            <span class="ml-auto px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">EDITABLE</span>
          </div>
          <div class="space-y-2">
            <div>
              <div class="text-xs text-gray-600 font-medium mb-1">Table:</div>
              <code class="block bg-green-100 px-3 py-2 rounded text-sm font-mono text-green-900">land_parcels</code>
            </div>
            <div>
              <div class="text-xs text-gray-600 font-medium mb-1">Filter:</div>
              <code class="block bg-green-50 px-3 py-2 rounded text-sm font-mono text-green-900">"project_id" = {{ projectId }}</code>
            </div>
            <div>
              <div class="text-xs text-gray-600 font-medium mb-1">Primary Key:</div>
              <code class="block bg-green-50 px-3 py-2 rounded text-sm font-mono text-green-900">id</code>
            </div>
          </div>
          <p class="text-xs text-gray-600 mt-3">✏️ Draw parcels here (project_id auto-assigned)</p>
        </div>
      </div>
      
      <div class="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <div class="flex gap-2">
          <svg class="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <div class="text-sm">
            <p class="font-semibold text-amber-900 mb-1">⚠️ Important: Use Base Tables, Not Views</p>
            <p class="text-amber-800">Add the base tables <code class="bg-amber-100 px-1 rounded">coordinate_points</code> and <code class="bg-amber-100 px-1 rounded">land_parcels</code> with the filters shown above. Do NOT create or use project-specific views. This ensures reliable QGIS editing.</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Instructions Panel -->
    <div v-if="connectionInfo?.instructions && showInstructions" class="bg-gray-900 rounded-lg p-6 text-gray-100 font-mono text-sm overflow-x-auto">
      <div class="flex items-center justify-between mb-4">
        <h4 class="text-lg font-bold text-white flex items-center gap-2">
          <svg class="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          Step-by-Step QGIS Instructions
        </h4>
        <button @click="showInstructions = false" class="text-gray-400 hover:text-white">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
      
      <div class="space-y-1">
        <div v-for="(line, index) in connectionInfo.instructions" :key="index" :class="getLineClass(line)">
          {{ line }}
        </div>
      </div>
      
      <div class="mt-4 pt-4 border-t border-gray-700 flex gap-3">
        <button @click="copyInstructions" class="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded transition-colors">
          📋 Copy All Instructions
        </button>
        <button @click="printInstructions" class="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded transition-colors">
          🖨️ Print Instructions
        </button>
      </div>
    </div>

    <!-- Quick Stats -->
    <div v-if="connectionInfo" class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="bg-blue-50 rounded-lg p-4 border border-blue-200">
        <div class="text-sm text-blue-600 font-medium">Database</div>
        <div class="text-lg font-bold text-gray-900 mt-1">{{ connectionInfo.connection.database }}</div>
      </div>
      <div class="bg-green-50 rounded-lg p-4 border border-green-200">
        <div class="text-sm text-green-600 font-medium">Schema</div>
        <div class="text-lg font-bold text-gray-900 mt-1">{{ connectionInfo.connection.schema }}</div>
      </div>
      <div class="bg-purple-50 rounded-lg p-4 border border-purple-200">
        <div class="text-sm text-purple-600 font-medium">Security</div>
        <div class="text-lg font-bold text-gray-900 mt-1">🔒 Schema Isolated</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getQGISConnectionInfo, type QGISConnectionInfo } from '@/services/spatial'

const props = defineProps<{
  projectId: number
  projectName: string
  clientName?: string
}>()

// State
const connectionInfo = ref<QGISConnectionInfo | null>(null)
const loading = ref(false)
const showInstructions = ref(false)
const successMessage = ref('')
const errorMessage = ref('')

// Load connection info on mount
onMounted(async () => {
  await loadConnectionInfo()
})

// Load QGIS connection info
async function loadConnectionInfo() {
  loading.value = true
  errorMessage.value = ''
  
  try {
    connectionInfo.value = await getQGISConnectionInfo(props.projectId)
    showInstructions.value = true
    console.log('📡 QGIS Connection Info:', connectionInfo.value)
  } catch (err: any) {
    console.error('Failed to load connection info:', err)
    errorMessage.value = err.response?.data?.error || err.message || 'Failed to load connection information'
  } finally {
    loading.value = false
  }
}

// Copy connection details to clipboard
function copyConnectionDetails() {
  if (!connectionInfo.value) return
  
  const text = `QGIS Connection Details
========================

Database: ${connectionInfo.value.connection.database}
Host: ${connectionInfo.value.connection.host}
Port: ${connectionInfo.value.connection.port}
Schema: ${connectionInfo.value.connection.schema}

Layers to Add:
--------------
1. REFERENCE LAYER (Read-Only):
   Table: coordinate_points
   Filter: "project_id" = ${props.projectId}
   Primary Key: id

2. DIGITIZATION LAYER (Editable):
   Table: land_parcels
   Filter: "project_id" = ${props.projectId}
   Primary Key: id

⚠️ Important: Use base tables, NOT views!
`
  
  navigator.clipboard.writeText(text).then(() => {
    successMessage.value = '📋 Connection details copied to clipboard!'
    setTimeout(() => successMessage.value = '', 3000)
  })
}

// Copy instructions to clipboard
function copyInstructions() {
  if (!connectionInfo.value?.instructions) return
  
  const text = connectionInfo.value.instructions.join('\n')
  navigator.clipboard.writeText(text).then(() => {
    successMessage.value = '📋 Instructions copied to clipboard!'
    setTimeout(() => successMessage.value = '', 3000)
  })
}

// Print instructions
function printInstructions() {
  window.print()
}

// Get line styling based on content
function getLineClass(line: string): string {
  if (line.startsWith('✅') || line.startsWith('🎯') || line.startsWith('📍') || line.startsWith('🔌') || line.startsWith('⚠️') || line.startsWith('✏️') || line.startsWith('💾') || line.startsWith('🔒')) {
    return 'text-green-400 font-bold mt-3'
  } else if (line.startsWith('  •') || line.startsWith('  ✓')) {
    return 'text-gray-300 ml-4'
  } else if (line.startsWith('    └─')) {
    return 'text-gray-400 ml-8 text-xs'
  } else if (line.trim() === '') {
    return 'h-2'
  }
  return 'text-gray-200'
}
</script>

<style scoped>
@media print {
  .qgis-project-manager {
    background: white !important;
  }
}
</style>
