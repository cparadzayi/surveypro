<template>
  <div class="control-point-selector">
    <!-- Central Meridian Selection -->
    <div class="mb-6">
      <label class="block text-sm font-medium text-gray-700 mb-2">
        Central Meridian (Gauss-Conformal) *
      </label>
      <div class="grid grid-cols-4 gap-2">
        <button
          v-for="lo in [27, 29, 31, 33]"
          :key="lo"
          type="button"
          @click="selectMeridian(lo)"
          :class="[
            'px-4 py-3 rounded-md border-2 transition-all',
            selectedMeridian === lo
              ? 'border-blue-600 bg-blue-50 text-blue-700 font-semibold'
              : 'border-gray-300 hover:border-gray-400 text-gray-700'
          ]"
        >
          Lo {{ lo }}
        </button>
      </div>
      <p class="mt-2 text-xs text-gray-500">
        Select the central meridian for your survey area
      </p>
    </div>

    <!-- Control Points Selection -->
    <div v-if="selectedMeridian" class="space-y-4">
      <div class="flex items-center justify-between">
        <label class="block text-sm font-medium text-gray-700">
          Select Control Points (Minimum 3) *
        </label>
        <span class="text-sm text-gray-600">
          {{ selectedPoints.length }} selected
        </span>
      </div>

      <!-- Search/Filter -->
      <div class="flex gap-2">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search by monument number or name..."
          class="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
        />
        <select
          v-model="filterType"
          class="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Types</option>
          <option value="PRIM">Primary</option>
          <option value="SEC">Secondary</option>
          <option value="TERT">Tertiary</option>
          <option value="QUART">Quaternary</option>
          <option value="TSM">TSM</option>
        </select>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="text-center py-8">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p class="mt-2 text-sm text-gray-600">Loading control points...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="bg-red-50 border border-red-200 rounded-md p-3">
        <p class="text-sm text-red-800">{{ error }}</p>
      </div>

      <!-- Control Points List -->
      <div v-else-if="filteredPoints.length > 0" class="border border-gray-300 rounded-md max-h-96 overflow-y-auto">
        <div
          v-for="point in filteredPoints"
          :key="point.id"
          @click="togglePoint(point)"
          :class="[
            'p-3 border-b border-gray-200 cursor-pointer transition-colors',
            isSelected(point.id)
              ? 'bg-blue-50 hover:bg-blue-100'
              : 'hover:bg-gray-50'
          ]"
        >
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <input
                  type="checkbox"
                  :checked="isSelected(point.id)"
                  class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  @click.stop="togglePoint(point)"
                />
                <span class="font-semibold text-gray-900">{{ point.monu_num }}</span>
                <span
                  :class="[
                    'px-2 py-0.5 text-xs font-medium rounded',
                    getTypeBadgeClass(point.type)
                  ]"
                >
                  {{ point.type }}
                </span>
              </div>
              <p class="mt-1 text-sm text-gray-700 ml-6">{{ point.monu_name }}</p>
              <div class="mt-1 text-xs text-gray-500 ml-6 grid grid-cols-2 gap-x-4">
                <div v-if="point.y_gauss && point.x_gauss">
                  <span class="font-medium">Coords:</span>
                  Y: {{ formatCoord(point.y_gauss) }}, X: {{ formatCoord(point.x_gauss) }}
                </div>
                <div v-if="point.area_nm">
                  <span class="font-medium">Area:</span> {{ point.area_nm }}
                </div>
              </div>
            </div>
            <div v-if="isSelected(point.id)" class="text-blue-600 font-semibold ml-2">
              #{{ getPointOrder(point.id) }}
            </div>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else class="text-center py-8 bg-gray-50 rounded-md">
        <p class="text-gray-600">No control points found for Lo{{ selectedMeridian }}</p>
        <p class="text-sm text-gray-500 mt-1">Try adjusting your search or filter</p>
      </div>

      <!-- Validation Message -->
      <div v-if="selectedPoints.length > 0 && selectedPoints.length < 3" class="bg-yellow-50 border border-yellow-200 rounded-md p-3">
        <p class="text-sm text-yellow-800">
          ⚠️ Please select at least 3 control points to connect to the national trig system
        </p>
      </div>

      <!-- Selected Points Summary -->
      <div v-if="selectedPoints.length >= 3" class="bg-green-50 border border-green-200 rounded-md p-3">
        <p class="text-sm text-green-800 font-medium">
          ✓ {{ selectedPoints.length }} control points selected
        </p>
        <div class="mt-2 flex flex-wrap gap-2">
          <span
            v-for="(point, index) in selectedPoints"
            :key="point.id"
            class="inline-flex items-center gap-1 px-2 py-1 bg-white border border-green-300 rounded text-xs"
          >
            <span class="font-semibold">{{ index + 1 }}.</span>
            {{ point.monu_num }}
            <button
              type="button"
              @click.stop="removePoint(point.id)"
              class="ml-1 text-red-600 hover:text-red-800"
            >
              ×
            </button>
          </span>
        </div>
      </div>
    </div>

    <!-- Instructions -->
    <div v-else class="bg-blue-50 border border-blue-200 rounded-md p-4">
      <p class="text-sm text-blue-800">
        <strong>Step 1:</strong> Select a central meridian above to view available control points
      </p>
    </div>

    <!-- Meridian Change Warning Modal -->
    <div v-if="showMeridianChangeWarning" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-lg p-6 max-w-md w-full shadow-xl">
        <div class="flex items-start mb-4">
          <div class="flex-shrink-0 text-3xl mr-3">🔄</div>
          <div>
            <h3 class="text-lg font-bold text-gray-900 mb-2">Switch Central Meridian?</h3>
            <p class="text-sm text-gray-700 mb-3">
              You have <strong>{{ selectedPoints.length }} control point(s)</strong> selected from <strong>Lo{{ selectedMeridian }}</strong>.
            </p>
            <p class="text-sm text-gray-700 mb-3">
              Switching to <strong>Lo{{ pendingMeridian }}</strong> will show control points for that meridian. 
              <strong class="text-blue-600">Your Lo{{ selectedMeridian }} selections will be saved</strong> and restored if you switch back.
            </p>
            <p class="text-sm text-gray-500 italic">
              💡 Each meridian maintains its own selection independently.
            </p>
          </div>
        </div>
        <div class="flex gap-2">
          <button
            type="button"
            @click="confirmMeridianChange"
            class="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors font-medium"
          >
            Switch to Lo{{ pendingMeridian }}
          </button>
          <button
            type="button"
            @click="cancelMeridianChange"
            class="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400 transition-colors font-medium"
          >
            Stay on Lo{{ selectedMeridian }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3042/api'

interface ControlPoint {
  id: number
  monu_num: string
  monu_name: string
  type: string
  y_gauss: number
  x_gauss: number
  area_nm: string
  gauss_lo: number
}

const props = defineProps<{
  modelValue: {
    meridian: number | null
    points: number[]
  }
  projectId?: number | null  // Project ID for database cache (null for new projects)
}>()

const emit = defineEmits<{
  'update:modelValue': [value: { meridian: number | null, points: number[] }]
}>()

// Expose method to save current cache before form submission
const saveCurrentCache = async () => {
  if (selectedMeridian.value && selectedPoints.value.length > 0 && props.projectId) {
    console.log(`[ControlPointSelector] Saving current cache for Lo${selectedMeridian.value} before form submission`)
    const pointIds = selectedPoints.value.map(p => p.id)
    await saveCacheToDatabase(selectedMeridian.value, pointIds)
  }
}

// Expose the method to parent component
defineExpose({
  saveCurrentCache
})

// Default to Lo31 if no meridian is provided
const selectedMeridian = ref<number | null>(props.modelValue.meridian || 31)
const selectedPoints = ref<ControlPoint[]>([])
const availablePoints = ref<ControlPoint[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const searchQuery = ref('')
const filterType = ref('')
const showMeridianChangeWarning = ref(false)
const pendingMeridian = ref<number | null>(null)

// Cache selected points per meridian (Lo27, Lo29, Lo31, Lo33)
const meridianPointsCache = ref<Record<number, ControlPoint[]>>({
  27: [],
  29: [],
  31: [],
  33: []
})

// Load cache from database if project exists
const loadCacheFromDatabase = async () => {
  if (!props.projectId) {
    console.log('[ControlPointSelector] No projectId, using session cache only')
    return
  }
  
  try {
    console.log(`[ControlPointSelector] Loading cache from database for project ${props.projectId}`)
    const response = await axios.get(`${API_BASE}/projects/${props.projectId}/meridian-cache`)
    
    if (response.data.ok && response.data.cache) {
      // Load cached IDs for each meridian
      for (const meridian of [27, 29, 31, 33]) {
        const cachedIds = response.data.cache[meridian] || []
        if (cachedIds.length > 0) {
          console.log(`[ControlPointSelector] Found ${cachedIds.length} cached points for Lo${meridian}`)
          // We'll fetch and match these IDs when user switches to that meridian
        }
      }
      
      // Store the raw IDs cache
      cachedPointIds.value = response.data.cache
    }
  } catch (err: any) {
    console.error('[ControlPointSelector] Failed to load cache from database:', err)
  }
}

// Store raw cached IDs from database
const cachedPointIds = ref<Record<number, number[]>>({
  27: [],
  29: [],
  31: [],
  33: []
})

// Save cache to database
const saveCacheToDatabase = async (meridian: number, pointIds: number[]) => {
  if (!props.projectId) {
    console.log('[ControlPointSelector] No projectId, skipping database save')
    return
  }
  
  try {
    console.log(`[ControlPointSelector] Saving ${pointIds.length} points to database for project ${props.projectId}, Lo${meridian}`)
    await axios.post(`${API_BASE}/projects/${props.projectId}/meridian-cache`, {
      meridian,
      controlPointIds: pointIds
    })
    
    // Update local cache
    cachedPointIds.value[meridian] = pointIds
  } catch (err: any) {
    console.error('[ControlPointSelector] Failed to save cache to database:', err)
  }
}

// Fetch control points when meridian changes
watch(selectedMeridian, async (newMeridian, oldMeridian) => {
  if (newMeridian) {
    // Save current selections to cache before switching
    if (oldMeridian && selectedPoints.value.length > 0) {
      console.log(`[ControlPointSelector] Caching ${selectedPoints.value.length} points for Lo${oldMeridian}`)
      meridianPointsCache.value[oldMeridian] = [...selectedPoints.value]
      
      // Save to database
      const pointIds = selectedPoints.value.map(p => p.id)
      await saveCacheToDatabase(oldMeridian, pointIds)
    }
    
    // Fetch control points for new meridian
    await fetchControlPoints(newMeridian)
    
    // Try to restore from session cache first
    if (meridianPointsCache.value[newMeridian] && meridianPointsCache.value[newMeridian].length > 0) {
      console.log(`[ControlPointSelector] Restoring ${meridianPointsCache.value[newMeridian].length} cached points from session for Lo${newMeridian}`)
      const cachedIds = meridianPointsCache.value[newMeridian].map(p => p.id)
      selectedPoints.value = availablePoints.value.filter(p => cachedIds.includes(p.id))
    }
    // Otherwise try to restore from database cache
    else if (cachedPointIds.value[newMeridian] && cachedPointIds.value[newMeridian].length > 0) {
      console.log(`[ControlPointSelector] Restoring ${cachedPointIds.value[newMeridian].length} cached points from database for Lo${newMeridian}`)
      selectedPoints.value = availablePoints.value.filter(p => cachedPointIds.value[newMeridian].includes(p.id))
      // Update session cache
      meridianPointsCache.value[newMeridian] = [...selectedPoints.value]
    } else {
      selectedPoints.value = []
    }
  } else {
    availablePoints.value = []
    selectedPoints.value = []
  }
  emitValue()
})

// Watch selected points changes
watch(selectedPoints, () => {
  emitValue()
}, { deep: true })

const selectMeridian = (lo: number) => {
  // If there are selected points and user is changing meridian, show warning
  if (selectedPoints.value.length > 0 && selectedMeridian.value !== lo) {
    pendingMeridian.value = lo
    showMeridianChangeWarning.value = true
  } else {
    selectedMeridian.value = lo
  }
}

const confirmMeridianChange = async () => {
  if (pendingMeridian.value !== null) {
    // Cache current selections before switching
    if (selectedMeridian.value && selectedPoints.value.length > 0) {
      console.log(`[ControlPointSelector] Caching ${selectedPoints.value.length} points for Lo${selectedMeridian.value} before switch`)
      meridianPointsCache.value[selectedMeridian.value] = [...selectedPoints.value]
      
      // Save to database
      const pointIds = selectedPoints.value.map(p => p.id)
      await saveCacheToDatabase(selectedMeridian.value, pointIds)
    }
    
    // Switch to new meridian (watch will handle restoration)
    selectedMeridian.value = pendingMeridian.value
    pendingMeridian.value = null
  }
  showMeridianChangeWarning.value = false
}

const cancelMeridianChange = () => {
  pendingMeridian.value = null
  showMeridianChangeWarning.value = false
}

const fetchControlPoints = async (meridian: number) => {
  loading.value = true
  error.value = null
  
  console.log(`[ControlPointSelector] Fetching control points for Lo${meridian}`)
  console.log(`[ControlPointSelector] API URL: ${API_BASE}/control-points?gauss_lo=${meridian}&limit=1000`)
  
  try {
    const response = await axios.get(`${API_BASE}/control-points`, {
      params: {
        gauss_lo: meridian,
        limit: 5000  // Increased to fetch all control points including TSM
      }
    })
    
    console.log(`[ControlPointSelector] Response:`, response.data)
    console.log(`[ControlPointSelector] Found ${response.data.data?.length || 0} control points`)
    
    // Log sample points to debug
    if (response.data.data && response.data.data.length > 0) {
      console.log(`[ControlPointSelector] Sample points:`, response.data.data.slice(0, 3))
      console.log(`[ControlPointSelector] Point types:`, [...new Set(response.data.data.map((p: any) => p.type))])
    }
    
    availablePoints.value = response.data.data || []
    
    if (availablePoints.value.length === 0) {
      error.value = `No control points found for Lo${meridian}. Please check if control points are imported.`
    }
  } catch (err: any) {
    console.error('[ControlPointSelector] Error fetching control points:', err)
    console.error('[ControlPointSelector] Error response:', err.response?.data)
    console.error('[ControlPointSelector] Validation messages:', err.response?.data?.messages)
    console.error('[ControlPointSelector] Full error object:', JSON.stringify(err.response?.data, null, 2))
    
    const validationMsg = err.response?.data?.messages?.[0]?.message || ''
    const validationPath = err.response?.data?.messages?.[0]?.instancePath || ''
    error.value = `${err.response?.data?.error || 'Failed to fetch control points'}${validationMsg ? ': ' + validationMsg : ''}${validationPath ? ' (at ' + validationPath + ')' : ''}`
  } finally {
    loading.value = false
  }
}

const filteredPoints = computed(() => {
  let points = availablePoints.value

  // Filter by type
  if (filterType.value) {
    points = points.filter(p => p.type === filterType.value)
  }

  // Filter by search query
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    points = points.filter(p =>
      p.monu_num?.toLowerCase().includes(query) ||
      p.monu_name?.toLowerCase().includes(query) ||
      p.area_nm?.toLowerCase().includes(query)
    )
  }

  return points
})

const isSelected = (pointId: number) => {
  return selectedPoints.value.some(p => p.id === pointId)
}

const getPointOrder = (pointId: number) => {
  const index = selectedPoints.value.findIndex(p => p.id === pointId)
  return index >= 0 ? index + 1 : null
}

const togglePoint = (point: ControlPoint) => {
  const index = selectedPoints.value.findIndex(p => p.id === point.id)
  if (index >= 0) {
    selectedPoints.value.splice(index, 1)
  } else {
    // Safety check: Ensure point is from the current meridian (use loose comparison for type safety)
    if (point.gauss_lo != selectedMeridian.value) {
      console.error(`Cannot add control point from Lo${point.gauss_lo} when current meridian is Lo${selectedMeridian.value}`)
      error.value = `Cannot mix control points from different meridians. Current: Lo${selectedMeridian.value}, Point: Lo${point.gauss_lo}`
      setTimeout(() => { error.value = null }, 3000)
      return
    }
    selectedPoints.value.push(point)
  }
}

const removePoint = (pointId: number) => {
  const index = selectedPoints.value.findIndex(p => p.id === pointId)
  if (index >= 0) {
    selectedPoints.value.splice(index, 1)
  }
}

const emitValue = () => {
  emit('update:modelValue', {
    meridian: selectedMeridian.value,
    points: selectedPoints.value.map(p => p.id)
  })
}

const getTypeBadgeClass = (type: string) => {
  const classes = {
    'PRIM': 'bg-purple-100 text-purple-800',
    'SEC': 'bg-blue-100 text-blue-800',
    'TERT': 'bg-green-100 text-green-800',
    'QUART': 'bg-yellow-100 text-yellow-800',
    'TSM': 'bg-gray-100 text-gray-800'
  }
  return classes[type as keyof typeof classes] || 'bg-gray-100 text-gray-800'
}

const formatCoord = (value: number | string) => {
  if (value === null || value === undefined) return 'N/A'
  const num = typeof value === 'string' ? parseFloat(value) : value
  return isNaN(num) ? 'N/A' : num.toFixed(2)
}

// Initialize: Load database cache first, then load current meridian
;(async () => {
  // Load cached selections from database if project exists
  await loadCacheFromDatabase()
  
  // Initialize from props if provided, or fetch default Lo31
  if (props.modelValue.meridian && props.modelValue.points.length > 0) {
    selectedMeridian.value = props.modelValue.meridian
    // Fetch and restore selected points
    await fetchControlPoints(props.modelValue.meridian)
    
    // Try to restore from props first
    const restoredPoints = availablePoints.value.filter(p =>
      props.modelValue.points.includes(p.id)
    )
    selectedPoints.value = restoredPoints
    
    // Initialize both caches with loaded points
    if (props.modelValue.meridian && restoredPoints.length > 0) {
      console.log(`[ControlPointSelector] Initializing session cache for Lo${props.modelValue.meridian} with ${restoredPoints.length} points`)
      meridianPointsCache.value[props.modelValue.meridian] = [...restoredPoints]
      cachedPointIds.value[props.modelValue.meridian] = restoredPoints.map(p => p.id)
    }
    
    // Also check if database has cached points for other meridians
    for (const meridian of [27, 29, 31, 33]) {
      if (meridian !== props.modelValue.meridian && cachedPointIds.value[meridian]?.length > 0) {
        console.log(`[ControlPointSelector] Found ${cachedPointIds.value[meridian].length} cached point IDs for Lo${meridian} in database`)
      }
    }
  } else if (selectedMeridian.value === 31) {
    // Auto-fetch control points for default Lo31
    await fetchControlPoints(31)
    
    // Check if database has cached points for Lo31
    if (cachedPointIds.value[31]?.length > 0) {
      console.log(`[ControlPointSelector] Restoring ${cachedPointIds.value[31].length} cached points for Lo31 from database`)
      selectedPoints.value = availablePoints.value.filter(p => cachedPointIds.value[31].includes(p.id))
      meridianPointsCache.value[31] = [...selectedPoints.value]
    }
  }
})()
</script>

<style scoped>
/* Custom scrollbar for control points list */
.overflow-y-auto::-webkit-scrollbar {
  width: 8px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 4px;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 4px;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: #555;
}
</style>
