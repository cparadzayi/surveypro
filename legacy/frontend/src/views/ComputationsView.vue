<template>
  <AppLayout>
    <div class="p-4 md:p-8">
      <div class="mb-6">
        <h1 class="text-2xl md:text-3xl font-bold text-gray-900 mb-2">Survey Computations</h1>
        <p class="text-gray-600">Perform survey calculations and COGO operations</p>
      </div>

      <!-- Computation Type Selector -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <button
          v-for="comp in computationTypes"
          :key="comp.id"
          @click="selectedType = comp.id"
          class="card hover:shadow-lg transition-shadow cursor-pointer text-left"
          :class="selectedType === comp.id ? 'ring-2 ring-primary-500' : ''"
        >
          <h3 class="font-bold text-gray-900 mb-1">{{ comp.label }}</h3>
          <p class="text-sm text-gray-600">{{ comp.description }}</p>
        </button>
      </div>

      <!-- Computation Form -->
      <div class="card">
        <!-- Inverse Computation -->
        <div v-if="selectedType === 'inverse'">
          <h2 class="text-xl font-bold text-gray-900 mb-4">Inverse Computation</h2>
          <form @submit.prevent="handleInverse" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Project</label>
              <select v-model="inverseData.project_id" required class="input">
                <option value="">Select a project</option>
                <option v-for="project in projectsStore.projects" :key="project.id" :value="project.id">
                  {{ project.name }}
                </option>
              </select>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <h3 class="font-medium text-gray-900 mb-2">Point 1</h3>
                <div class="space-y-2">
                  <input v-model.number="inverseData.point1.y" type="number" step="any" placeholder="Y (Westing)" required class="input" />
                  <input v-model.number="inverseData.point1.x" type="number" step="any" placeholder="X (Southing)" required class="input" />
                </div>
              </div>

              <div>
                <h3 class="font-medium text-gray-900 mb-2">Point 2</h3>
                <div class="space-y-2">
                  <input v-model.number="inverseData.point2.y" type="number" step="any" placeholder="Y (Westing)" required class="input" />
                  <input v-model.number="inverseData.point2.x" type="number" step="any" placeholder="X (Southing)" required class="input" />
                </div>
              </div>
            </div>

            <button type="submit" class="btn btn-primary" :disabled="loading">
              <span v-if="!loading">Calculate</span>
              <span v-else>Calculating...</span>
            </button>
          </form>

          <div v-if="result" class="mt-6 p-4 bg-success/10 border border-success rounded-lg">
            <h3 class="font-bold text-success mb-2">Results:</h3>
            <p><strong>Distance:</strong> {{ result.distance?.toFixed(3) }} m</p>
            <p class="mt-2"><strong>Bearing:</strong></p>
            <ul class="list-disc pl-5 space-y-1">
              <li>Decimal: {{ result.bearing?.toFixed(4) }}°</li>
              <li>DMS: {{ formatBearing(result.bearing, result.distance) }}</li>
              <li>Precision: {{ result.distance < 6000 ? '10 seconds' : '1 second' }}</li>
            </ul>
          </div>
        </div>

        <!-- Forward Computation -->
        <div v-if="selectedType === 'forward'">
          <h2 class="text-xl font-bold text-gray-900 mb-4">Forward Computation</h2>
          <form @submit.prevent="handleForward" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Project</label>
              <select v-model="forwardData.project_id" required class="input">
                <option value="">Select a project</option>
                <option v-for="project in projectsStore.projects" :key="project.id" :value="project.id">
                  {{ project.name }}
                </option>
              </select>
            </div>

            <div>
              <h3 class="font-medium text-gray-900 mb-2">Starting Point</h3>
              <div class="grid grid-cols-2 gap-4">
                <input v-model.number="forwardData.start_point.y" type="number" step="any" placeholder="Y (Westing)" required class="input" />
                <input v-model.number="forwardData.start_point.x" type="number" step="any" placeholder="X (Southing)" required class="input" />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Distance (m)</label>
                <input v-model.number="forwardData.distance" type="number" step="any" required class="input" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Bearing (°)</label>
                <input v-model.number="forwardData.bearing" type="number" step="any" min="0" max="360" required class="input" />
              </div>
            </div>

            <button type="submit" class="btn btn-primary" :disabled="loading">
              <span v-if="!loading">Calculate</span>
              <span v-else>Calculating...</span>
            </button>
          </form>

          <div v-if="result" class="mt-6 p-4 bg-success/10 border border-success rounded-lg">
            <h3 class="font-bold text-success mb-2">Results:</h3>
            <p><strong>Y (Westing):</strong> {{ result.y?.toFixed(3) }} m</p>
            <p><strong>X (Southing):</strong> {{ result.x?.toFixed(3) }} m</p>
          </div>
        </div>

        <!-- Area Calculation -->
        <div v-if="selectedType === 'area'">
          <h2 class="text-xl font-bold text-gray-900 mb-4">Area Calculation</h2>
          <form @submit.prevent="handleAreaCalculation" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Project</label>
              <select v-model="areaData.project_id" required class="input">
                <option value="">Select a project</option>
                <option v-for="project in projectsStore.projects" :key="project.id" :value="project.id">
                  {{ project.name }}
                </option>
              </select>
            </div>

            <div>
              <div class="flex justify-between items-center mb-2">
                <h3 class="font-medium text-gray-900">Polygon Points (Y Westing, X Southing)</h3>
                <button 
                  type="button" 
                  @click="addAreaPoint" 
                  class="text-sm text-primary-600 hover:text-primary-800"
                >
                  + Add Point
                </button>
              </div>
              
              <div class="space-y-2 max-h-60 overflow-y-auto p-2 border rounded">
                <div v-for="(point, index) in areaData.points" :key="index" class="grid grid-cols-12 gap-2 items-center">
                  <div class="col-span-1 text-sm text-gray-500">
                    {{ String.fromCharCode(65 + index) }}
                  </div>
                  <div class="col-span-5">
                    <input 
                      v-model.number="point.y" 
                      type="number" 
                      step="any" 
                      :placeholder="`Y${index + 1} (Westing)`" 
                      required 
                      class="input input-sm w-full" 
                    />
                  </div>
                  <div class="col-span-5">
                    <input 
                      v-model.number="point.x" 
                      type="number" 
                      step="any" 
                      :placeholder="`X${index + 1} (Southing)`" 
                      required 
                      class="input input-sm w-full" 
                    />
                  </div>
                  <div class="col-span-1">
                    <button 
                      type="button" 
                      @click="removeAreaPoint(index)"
                      class="text-red-500 hover:text-red-700"
                      :disabled="areaData.points.length <= 3"
                    >
                      ×
                    </button>
                  </div>
                </div>
              </div>
              <p v-if="areaData.points.length < 3" class="mt-1 text-sm text-red-600">
                At least 3 points are required to calculate an area
              </p>
            </div>

            <div class="flex space-x-2">
              <button 
                type="submit" 
                class="btn btn-primary" 
                :disabled="loading || areaData.points.length < 3"
              >
                <span v-if="!loading">Calculate Area</span>
                <span v-else>Calculating...</span>
              </button>
              <button 
                type="button" 
                @click="resetAreaForm"
                class="btn btn-outline"
              >
                Reset
              </button>
            </div>
          </form>

          <div v-if="areaResult" class="mt-6 p-4 bg-success/10 border border-success rounded-lg">
            <h3 class="font-bold text-success mb-2">Area Calculation Results:</h3>
            <p><strong>Area:</strong> {{ formatArea(areaResult.area) }}</p>
            <p v-if="areaResult.perimeter" class="mt-2">
              <strong>Perimeter:</strong> {{ areaResult.perimeter.toFixed(3) }} m
            </p>
          </div>
        </div>

        <!-- Traverse Adjustment (Placeholder) -->
        <div v-if="selectedType === 'traverse'">
          <h2 class="text-xl font-bold text-gray-900 mb-4">
            {{ computationTypes.find(c => c.id === selectedType)?.label }}
          </h2>
          <p class="text-gray-600">This computation type is coming soon...</p>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useProjectsStore } from '@/stores/projects'
import AppLayout from '@/components/AppLayout.vue'
import api from '@/services/api'
import type { InverseComputationInput, ForwardComputationInput } from '@/types'

// Convert decimal degrees to DMS (Degrees, Minutes, Seconds) with banker's rounding
const toDMS = (decimalDegrees: number, precision: '10s' | '1s' = '10s'): string => {
  // Apply distance-based precision
  const precisionValue = precision === '10s' ? 10 : 1
  const precisionDegrees = precisionValue / 3600 // Convert seconds to degrees
  
  // Apply banker's rounding
  const roundedDegrees = Math.round(decimalDegrees / precisionDegrees) * precisionDegrees
  
  // Get absolute value and determine sign
  const absDegrees = Math.abs(roundedDegrees)
  const sign = roundedDegrees < 0 ? '-' : ''
  
  // Calculate degrees, minutes, and seconds
  const degrees = Math.floor(absDegrees)
  const minutes = Math.floor((absDegrees - degrees) * 60)
  const seconds = (absDegrees - degrees - minutes / 60) * 3600
  
  // Format with appropriate precision
  if (precision === '10s') {
    return `${sign}${degrees}° ${minutes}' ${seconds.toFixed(0)}''`
  } else {
    return `${sign}${degrees}° ${minutes}' ${seconds.toFixed(1)}''`
  }
}

// Convert bearing from math convention (0° = east, counter-clockwise)
// to survey convention (0° = south, clockwise)
const toSurveyBearing = (bearing: number, distance: number): number => {
  // Convert from math convention to survey convention
  let surveyBearing = (90 - bearing) % 360
  if (surveyBearing < 0) surveyBearing += 360
  
  // Apply distance-based precision
  const precision = distance < 6000 ? '10s' : '1s'
  const precisionValue = precision === '10s' ? 10 : 1
  const precisionDegrees = precisionValue / 3600
  
  // Apply banker's rounding
  return Math.round(surveyBearing / precisionDegrees) * precisionDegrees
}

const projectsStore = useProjectsStore()
const selectedType = ref('inverse')
const loading = ref(false)
const result = ref<any>(null)
const areaResult = ref<{area: number, perimeter?: number} | null>(null)

// Format area according to specifications
const formatArea = (area: number): string => {
  if (area < 10000) {
    // For areas < 10,000 m²: round to nearest square meter
    const rounded = Math.round(area)
    return `${rounded.toLocaleString()} m²`
  } else {
    // For areas ≥ 10,000 m²: convert to hectares with 4 decimal places
    const hectares = area / 10000
    // Banker's rounding to 4 decimal places
    const rounded = Math.round(hectares * 10000) / 10000
    return `${rounded.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })} ha`
  }
}

// Area calculation data
const areaData = ref({
  project_id: 0,
  points: [
    { y: 0, x: 0 },
    { y: 0, x: 0 },
    { y: 0, x: 0 }
  ] as {y: number, x: number}[]
})

// Add a new point to the area calculation
const addAreaPoint = () => {
  areaData.value.points.push({ y: 0, x: 0 })
}

// Remove a point from the area calculation
const removeAreaPoint = (index: number) => {
  if (areaData.value.points.length > 3) {
    areaData.value.points.splice(index, 1)
  }
}

// Reset the area calculation form
const resetAreaForm = () => {
  areaData.value = {
    project_id: 0,
    points: [
      { y: 0, x: 0 },
      { y: 0, x: 0 },
      { y: 0, x: 0 }
    ]
  }
  areaResult.value = null
}

// Handle area calculation
const handleAreaCalculation = async () => {
  if (areaData.value.points.length < 3) return
  
  loading.value = true
  areaResult.value = null
  
  try {
    // Calculate area using the shoelace formula
    let area = 0
    const n = areaData.value.points.length
    
    // Apply shoelace formula
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      area += areaData.value.points[i].x * areaData.value.points[j].y
      area -= areaData.value.points[j].x * areaData.value.points[i].y
    }
    
    area = Math.abs(area) / 2
    
    // Calculate perimeter (optional)
    let perimeter = 0
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      const dx = areaData.value.points[j].x - areaData.value.points[i].x
      const dy = areaData.value.points[j].y - areaData.value.points[i].y
      perimeter += Math.sqrt(dx * dx + dy * dy)
    }
    
    // Apply banker's rounding
    area = Math.round(area)
    
    areaResult.value = {
      area,
      perimeter
    }
    
  } catch (error) {
    console.error('Area calculation failed:', error)
  } finally {
    loading.value = false
  }
}

const computationTypes = [
  { id: 'inverse', label: 'Inverse (Distance & Bearing)', description: 'Calculate distance and bearing between two points' },
  { id: 'forward', label: 'Forward (Coordinates)', description: 'Calculate coordinates from bearing and distance' },
  { id: 'area', label: 'Area Calculation', description: 'Calculate area of a polygon' },
  { id: 'traverse', label: 'Traverse Adjustment', description: 'Perform traverse closure calculations' }
]

// Note: In the P(Y,X) convention:
// - y is Westing (negative = east, positive = west of central meridian)
// - x is Southing (positive from equator, increasing southwards)
const inverseData = ref<InverseComputationInput>({
  project_id: 0,
  point1: { y: 0, x: 0 }, // Y (Westing), X (Southing)
  point2: { y: 0, x: 0 }  // Y (Westing), X (Southing)
})

const forwardData = ref<ForwardComputationInput>({
  project_id: 0,
  start_point: { y: 0, x: 0 }, // Y (Westing), X (Southing)
  distance: 0,
  bearing: 0
})

// Format bearing with proper direction and precision
const formatBearing = (bearing: number, distance: number): string => {
  if (bearing == null) return 'N/A'
  
  // Convert to survey bearing (0° = south, clockwise)
  const surveyBearing = toSurveyBearing(bearing, distance)
  
  // Format cardinal direction
  let direction = ''
  if (surveyBearing >= 0 && surveyBearing < 90) {
    direction = 'S ' + surveyBearing.toFixed(4) + '° E'
  } else if (surveyBearing >= 90 && surveyBearing < 180) {
    direction = 'N ' + (180 - surveyBearing).toFixed(4) + '° E'
  } else if (surveyBearing >= 180 && surveyBearing < 270) {
    direction = 'N ' + (surveyBearing - 180).toFixed(4) + '° W'
  } else {
    direction = 'S ' + (360 - surveyBearing).toFixed(4) + '° W'
  }
  
  // Get DMS representation with appropriate precision
  const dms = toDMS(surveyBearing, distance < 6000 ? '10s' : '1s')
  
  return `${direction} (${dms})`
}

const handleInverse = async () => {
  loading.value = true
  result.value = null
  try {
    const response = await api.post('/computations/inverse', inverseData.value)
    
    // Convert bearing to survey convention (0° = south, clockwise)
    if (response.data.bearing) {
      response.data.surveyBearing = toSurveyBearing(
        response.data.bearing,
        response.data.distance || 0
      )
    }
    
    result.value = response.data
  } catch (error) {
    console.error('Inverse computation failed:', error)
  } finally {
    loading.value = false
  }
}

const handleForward = async () => {
  loading.value = true
  result.value = null
  try {
    const response = await api.post('/computations/forward', forwardData.value)
    result.value = response.data
  } catch (error) {
    console.error('Forward computation failed:', error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  projectsStore.fetchProjects()
})
</script>
