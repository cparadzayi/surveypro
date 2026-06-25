<template>
  <div class="control-point-selection-view">
    <div class="max-w-6xl mx-auto p-6">
      <!-- Header -->
      <div class="bg-white shadow-lg rounded-lg p-8 mb-6">
        <div class="flex items-start justify-between mb-4">
          <div>
            <h1 class="text-3xl font-bold text-gray-900 mb-2">
              🔺 Control Point Selection
            </h1>
            <p class="text-gray-600">
              Select trig beacons and control points to connect your survey to the national trig system.
              These control points will be included in the Coordinate List and PDF reports.
            </p>
          </div>
          <div class="text-right">
            <div class="text-sm text-gray-500">Step 2 of 9</div>
            <div class="text-lg font-semibold text-blue-600">
              {{ selectedCount }} point{{ selectedCount !== 1 ? 's' : '' }} selected
            </div>
          </div>
        </div>

        <!-- Project Info Banner -->
        <div class="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-lg p-4 mb-6">
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <h3 class="text-sm font-semibold text-blue-900 mb-2">📍 Project Configuration</h3>
              <div class="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span class="text-blue-700 font-medium">Central Meridian:</span>
                  <span class="ml-2 px-3 py-1 bg-blue-600 text-white rounded-md font-bold">Lo {{ workflowState.projectInfo.centralMeridian || '?' }}</span>
                </div>
                <div>
                  <span class="text-blue-700 font-medium">Survey Points:</span>
                  <span class="ml-2 text-blue-900 font-semibold">{{ workflowState.importedPoints?.length || 0 }} points</span>
                </div>
              </div>
              <p class="mt-2 text-xs text-blue-600" v-if="surveyCenter">
                ✓ Survey center calculated: [{{ surveyCenter.lat.toFixed(6) }}, {{ surveyCenter.lng.toFixed(6) }}]
              </p>
            </div>
          </div>
        </div>

        <!-- Auto-Selection Configuration -->
        <div class="bg-green-50 border-2 border-green-300 rounded-lg p-4 mb-6" v-if="surveyCenter">
          <div class="flex items-start gap-3">
            <div class="flex-shrink-0">
              <span class="text-3xl">🎯</span>
            </div>
            <div class="flex-1">
              <h3 class="text-sm font-semibold text-green-900 mb-2">Auto-Selection Active</h3>
              <p class="text-sm text-green-800 mb-3">
                Control points will be automatically selected within a specified radius from your survey center.
              </p>
              <div class="flex items-center gap-3">
                <label class="text-sm font-medium text-green-900">Search Radius:</label>
                <input
                  v-model.number="searchRadius"
                  type="number"
                  min="5"
                  max="100"
                  step="5"
                  class="w-24 px-3 py-2 border-2 border-green-400 rounded-md focus:ring-2 focus:ring-green-500 font-semibold text-center"
                />
                <span class="text-sm text-green-800">km</span>
                <button
                  @click="autoSelectNearbyPoints"
                  class="ml-4 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors font-medium text-sm"
                >
                  🔄 Re-run Auto-Selection
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Info Banner -->
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div class="flex">
            <div class="flex-shrink-0">
              <svg class="h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
              </svg>
            </div>
            <div class="ml-3">
              <h3 class="text-sm font-medium text-blue-800">Why Control Points Matter</h3>
              <div class="mt-2 text-sm text-blue-700">
                <ul class="list-disc list-inside space-y-1">
                  <li>Connect your survey to the national coordinate system</li>
                  <li>Required for Coordinate List generation (Step 6)</li>
                  <li>Included in the Comprehensive PDF report</li>
                  <li>Displayed in the Area Computation inset map</li>
                  <li>Minimum 3 control points required for triangulation</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <!-- Skip Option Banner -->
        <div class="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <div class="flex">
            <div class="flex-shrink-0">
              <span class="text-2xl">💡</span>
            </div>
            <div class="ml-3">
              <h3 class="text-sm font-medium text-amber-800">Not Sure Which Points to Select?</h3>
              <p class="mt-1 text-sm text-amber-700">
                You can <strong>skip this step for now</strong> and select control points later after importing your CSV data. 
                This way, you'll know your survey location and can choose the nearest control points.
              </p>
            </div>
          </div>
        </div>

        <!-- Map-Based Selector (if survey center available) -->
        <ControlPointMapView
          v-if="useMapView"
          :points="controlPointsForMap"
          :selected-ids="controlPointsSelection.points"
          :survey-center="surveyCenter"
          :project-id="projectId"
          @update:selectedIds="handleSelectionUpdate"
          @meridianSuggested="handleMeridianSuggestion"
        />
        
        <!-- Map Statistics -->
        <div v-if="useMapView" class="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div class="flex items-center justify-between text-sm">
            <div class="flex items-center gap-4">
              <div class="flex items-center gap-2">
                <span class="text-gray-600">📍 Visible on map:</span>
                <span class="font-semibold text-blue-600">{{ controlPointsForMap.length }}</span>
                <span class="text-gray-500">/ {{ controlPoints.length }} total</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-gray-600">✅ Selected:</span>
                <span class="font-semibold text-green-600">{{ controlPointsSelection.points.length }}</span>
              </div>
            </div>
            <div class="text-xs text-gray-500">
              Within {{ searchRadius }}km radius
            </div>
          </div>
        </div>

        <!-- Fallback to Traditional Selector -->
        <ControlPointSelector
          v-else
          ref="controlPointSelectorRef"
          v-model="controlPointsSelection"
          :project-id="projectId"
        />
        
        <!-- Info about map view -->
        <div v-if="useMapView" class="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p class="text-sm text-blue-800">
            🗺️ <strong>Map-based selection active!</strong> Your survey center has been calculated from imported CSV data.
            The map shows distances and suggests the best control points for your location.
          </p>
        </div>
        <div v-else class="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-3">
          <p class="text-sm text-gray-700">
            💡 <strong>Tip:</strong> Import your CSV data first to enable map-based selection with distance calculations and smart recommendations.
          </p>
        </div>

        <!-- Action Buttons -->
        <div class="flex justify-between items-center pt-6 mt-6 border-t border-gray-200">
          <button
            type="button"
            @click="goBack"
            class="px-6 py-3 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition-colors font-medium"
          >
            ← Back to Project Setup
          </button>

          <div class="flex gap-3">
            <!-- Skip for Now Button (always visible) -->
            <button
              type="button"
              @click="skipForNow"
              class="px-6 py-3 bg-amber-100 text-amber-800 border-2 border-amber-300 rounded-md hover:bg-amber-200 transition-colors font-medium flex items-center gap-2"
              title="Skip and select control points later"
            >
              <span>⏭️</span>
              <span>Skip for Now</span>
            </button>
            
            <!-- Save & Continue Button -->
            <button
              type="button"
              @click="saveAndContinue"
              :disabled="!canProceed"
              :class="{
                'bg-blue-600 hover:bg-blue-700': canProceed,
                'bg-gray-400 cursor-not-allowed': !canProceed
              }"
              class="px-6 py-3 text-white rounded-md transition-colors font-medium flex items-center gap-2"
            >
              <span>{{ isStepComplete ? 'Update & Continue' : 'Save & Continue' }}</span>
              <span>→</span>
            </button>
          </div>
        </div>

        <!-- Validation Messages -->
        <div v-if="!canProceed && !showSkipMessage" class="mt-4 text-sm text-amber-600">
          <p v-if="!controlPointsSelection.meridian">⚠️ Please select a central meridian to continue, or click "Skip for Now"</p>
          <p v-if="controlPointsSelection.meridian && controlPointsSelection.points.length < 3">
            ⚠️ Please select at least 3 control points ({{ controlPointsSelection.points.length }} selected), or click "Skip for Now"
          </p>
        </div>

        <!-- Skip Confirmation Message -->
        <div v-if="showSkipMessage" class="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p class="text-sm text-amber-800">
            ℹ️ You can select control points later in the Coordinate List step (Step 6) after importing your survey data.
          </p>
        </div>

        <!-- Success Message -->
        <div v-if="showSuccessMessage" class="mt-4 bg-green-50 border-2 border-green-400 rounded-lg p-4">
          <div class="flex items-start gap-3">
            <span class="text-2xl">✅</span>
            <div>
              <p class="text-sm text-green-900 font-semibold mb-1">
                Auto-Selection Complete!
              </p>
              <p class="text-sm text-green-800">
                {{ controlPointsSelection.points.length }} control points selected within {{ searchRadius }}km radius.
              </p>
              <p class="text-xs text-green-700 mt-1">
                You can adjust the radius above and re-run, or manually select/deselect points on the map.
              </p>
            </div>
          </div>
        </div>
        
        <!-- Loading Message -->
        <div v-if="isLoadingControlPoints" class="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p class="text-sm text-blue-800">
            🔄 Loading control points for Lo{{ workflowState.projectInfo.centralMeridian }}...
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import ControlPointSelector from '@/components/ControlPointSelector.vue'
import ControlPointMapView from '@/components/cadastral/ControlPointMapView.vue'
import { useCadastralWorkflow } from '@/composables/useCadastralWorkflow'
import { useSurveyors } from '@/composables/useSurveyors'
import { capeLoToWGS84 } from '@/utils/coordinateTransform'
import axios from 'axios'

const { workflowState, saveWorkflowState, completeCurrentStep } = useCadastralWorkflow()

// Component refs
const controlPointSelectorRef = ref<InstanceType<typeof ControlPointSelector> | null>(null)

// Control points selection state
const controlPointsSelection = ref<{
  meridian: number | null
  points: number[]
}>({
  meridian: null,
  points: []
})

const showSuccessMessage = ref(false)
const showSkipMessage = ref(false)
const controlPoints = ref<any[]>([])
const isLoadingControlPoints = ref(false)
const autoSelectionApplied = ref(false)
const searchRadius = ref(20) // Default 20km radius

// Computed properties
const projectId = computed(() => workflowState.projectInfo.projectId)

const selectedCount = computed(() => controlPointsSelection.value.points.length)

// Calculate survey center from imported CSV data (in GAUSS coordinates)
const surveyCenter = computed(() => {
  // Need both imported points and central meridian
  if (!workflowState.importedPoints || workflowState.importedPoints.length === 0) {
    console.log('[ControlPointSelection] No imported points available for survey center calculation')
    return null
  }
  
  const loZone = workflowState.projectInfo.centralMeridian
  if (!loZone) {
    console.log('[ControlPointSelection] No central meridian set for survey center calculation')
    return null
  }
  
  try {
    const points = workflowState.importedPoints
    
    // Calculate centroid from Gauss coordinates (Y=westing, X=southing)
    // Points are stored as { original: { y, x } } in the workflow state
    const avgY = points.reduce((sum: number, p: any) => {
      const y = p.original?.y || p.y || 0
      return sum + y
    }, 0) / points.length
    
    const avgX = points.reduce((sum: number, p: any) => {
      const x = p.original?.x || p.x || 0
      return sum + x
    }, 0) / points.length
    
    console.log(`[ControlPointSelection] Survey centroid (Gauss): Y=${avgY.toFixed(2)}, X=${avgX.toFixed(2)}`)
    console.log('[ControlPointSelection] 🔍 DEBUG - Number of imported points:', points.length)
    console.log('[ControlPointSelection] 🔍 DEBUG - First imported point:', points[0])
    console.log('[ControlPointSelection] 🔍 DEBUG - Lo Zone:', loZone)
    
    // Transform to WGS84 for map display only
    const wgs84Center = capeLoToWGS84({ id: 'center', y: avgY, x: avgX }, loZone)
    
    console.log(`[ControlPointSelection] Survey center (WGS84 for map): [${wgs84Center.lat.toFixed(6)}, ${wgs84Center.lng.toFixed(6)}]`)
    console.log('[ControlPointSelection] 🔍 DEBUG - WGS84 object:', wgs84Center)
    
    // Return BOTH Gauss (for distance calc) and WGS84 (for map display)
    return { 
      y: avgY,        // Gauss Y (westing) - PRIMARY for distance calc
      x: avgX,        // Gauss X (southing) - PRIMARY for distance calc
      lat: wgs84Center.lat,  // WGS84 lat - for map display only
      lng: wgs84Center.lng   // WGS84 lng - for map display only
    }
  } catch (error) {
    console.error('[ControlPointSelection] Error calculating survey center:', error)
    return null
  }
})

// Use map view if survey center is available
const useMapView = computed(() => {
  return surveyCenter.value !== null
})

// Filter control points by search radius and map to format expected by map component
const controlPointsForMap = computed(() => {
  console.log('[ControlPointSelection] 🔍 Computing controlPointsForMap...')
  console.log('[ControlPointSelection] 🔍 Total control points:', controlPoints.value.length)
  console.log('[ControlPointSelection] 🔍 Survey center:', surveyCenter.value)
  
  if (!surveyCenter.value) {
    // No survey center, return all points with valid Gauss coordinates
    const mappedPoints = controlPoints.value
      .filter((point: any) => {
        // Check for valid Gauss coordinates (primary)
        const hasValidGauss = typeof point.y === 'number' && 
                              typeof point.x === 'number' &&
                              !isNaN(point.y) && 
                              !isNaN(point.x)
        if (!hasValidGauss) {
          console.warn('[ControlPointSelection] ⚠️ Point missing Gauss coordinates:', point.id, point.y, point.x)
        }
        return hasValidGauss
      })
      .map((point: any) => ({
        ...point,
        central_meridian: point.gauss_lo,
        description: point.monu_name || point.area_nm
      }))
    
    console.log('[ControlPointSelection] 🗺️ No survey center - returning all valid points:', mappedPoints.length)
    return mappedPoints
  }
  
  // Filter points within search radius using GAUSS COORDINATES (planar distance)
  const centerY = surveyCenter.value.y
  const centerX = surveyCenter.value.x
  const radiusMeters = searchRadius.value * 1000 // Convert km to meters
  
  console.log('[ControlPointSelection] 🎯 Filtering by radius:', searchRadius.value, 'km (', radiusMeters, 'm)')
  console.log('[ControlPointSelection] 🎯 Center (Gauss):', [centerY, centerX])
  console.log('[ControlPointSelection] 🔍 DEBUG - Full survey center object:', surveyCenter.value)
  console.log('[ControlPointSelection] 🔍 DEBUG - Total control points before filter:', controlPoints.value.length)
  console.log('[ControlPointSelection] 🔍 DEBUG - First control point:', controlPoints.value[0])
  
  const pointsWithDistance = controlPoints.value
    .filter((point: any) => {
      // Need Gauss coordinates for distance calculation
      const hasValidGauss = typeof point.y === 'number' && 
                            typeof point.x === 'number' &&
                            !isNaN(point.y) && 
                            !isNaN(point.x)
      if (!hasValidGauss) {
        console.warn('[ControlPointSelection] ⚠️ Skipping point missing Gauss coords:', point.id)
      }
      return hasValidGauss
    })
    .map((point: any) => {
      // Calculate planar distance using Gauss coordinates (Euclidean)
      const dy = point.y - centerY
      const dx = point.x - centerX
      const distanceMeters = Math.sqrt(dy * dy + dx * dx)
      const distanceKm = distanceMeters / 1000
      
      return {
        ...point,
        distance: distanceKm,
        central_meridian: point.gauss_lo,
        description: point.monu_name || point.area_nm
      }
    })
    .filter((point: any) => {
      const withinRadius = point.distance <= searchRadius.value
      if (!withinRadius) {
        console.log('[ControlPointSelection] 🔍 Point outside radius:', point.id, point.distance.toFixed(1), 'km')
      }
      return withinRadius
    })
  
  console.log(`[ControlPointSelection] 🗺️ Final: ${pointsWithDistance.length} control points within ${searchRadius.value}km radius`)
  
  if (pointsWithDistance.length > 0) {
    const sample = pointsWithDistance[0]
    console.log('[ControlPointSelection] 🔍 Sample point for map:', {
      id: sample.id,
      monu_num: sample.monu_num,
      y: sample.y,
      x: sample.x,
      y_type: typeof sample.y,
      x_type: typeof sample.x,
      distance: sample.distance
    })
  }
  
  return pointsWithDistance
})

const canProceed = computed(() => {
  return controlPointsSelection.value.meridian !== null && 
         controlPointsSelection.value.points.length >= 3
})

const isStepComplete = computed(() => {
  // Check if step is complete by looking at step data
  return workflowState.projectInfo.controlPointIds && 
         workflowState.projectInfo.controlPointIds.length >= 3
})

// Planar distance calculation using Gauss coordinates (Euclidean)
// Returns distance in kilometers
function calculateGaussDistance(y1: number, x1: number, y2: number, x2: number): number {
  const dy = y2 - y1
  const dx = x2 - x1
  const distanceMeters = Math.sqrt(dy * dy + dx * dx)
  return distanceMeters / 1000 // Convert to km
}

// Fetch control points from API
async function fetchControlPoints() {
  const loZone = workflowState.projectInfo.centralMeridian
  
  if (!loZone) {
    console.log('[ControlPointSelection] No central meridian set, skipping control point fetch')
    return
  }
  
  isLoadingControlPoints.value = true
  
  try {
    const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3050/api'
    console.log(`[ControlPointSelection] Fetching control points for Lo${loZone}...`)
    
    const response = await axios.get(`${API_BASE}/control-points`, {
      params: { 
        gauss_lo: loZone,
        limit: 5000
      }
    })
    
    if (response.data && Array.isArray(response.data.data)) {
      // Convert coordinates from strings to numbers (PostgreSQL returns numeric as string)
      // Use Gauss coordinates as primary (y, x), WGS84 for display only
      controlPoints.value = response.data.data.map((point: any) => {
        const gaussY = point.y_gauss ? parseFloat(point.y_gauss) : null
        const gaussX = point.x_gauss ? parseFloat(point.x_gauss) : null
        let lat_wgs84 = point.lat_wgs84 ? parseFloat(point.lat_wgs84) : null
        let lng_wgs84 = point.lng_wgs84 ? parseFloat(point.lng_wgs84) : null
        
        // If WGS84 coordinates are missing but we have Gauss coordinates, transform them
        if ((!lat_wgs84 || !lng_wgs84) && gaussY !== null && gaussX !== null && loZone) {
          try {
            const transformed = capeLoToWGS84({ id: point.id, y: gaussY, x: gaussX }, loZone)
            lat_wgs84 = transformed.lat
            lng_wgs84 = transformed.lng
            console.log(`[ControlPointSelection] 🔄 Transformed point ${point.id} to WGS84: [${lat_wgs84.toFixed(6)}, ${lng_wgs84.toFixed(6)}]`)
          } catch (error) {
            console.error(`[ControlPointSelection] ❌ Failed to transform point ${point.id}:`, error)
          }
        }
        
        return {
          ...point,
          gauss_lo: point.gauss_lo ? parseInt(point.gauss_lo) : null,
          y: gaussY, // Primary: Gauss Westing
          x: gaussX, // Primary: Gauss Southing
          lat_wgs84,
          lng_wgs84
        }
      })
      
      console.log(`[ControlPointSelection] ✅ Loaded ${controlPoints.value.length} control points for Lo${loZone}`)
      
      // 🔍 DEBUG: Check what coordinates we have
      const pointsWithWGS84 = controlPoints.value.filter(p => p.lat_wgs84 && p.lng_wgs84).length
      console.log(`[ControlPointSelection] 📊 WGS84 Coverage: ${pointsWithWGS84}/${controlPoints.value.length} points have WGS84 coordinates`)
      
      if (controlPoints.value.length > 0) {
        const firstPoint = controlPoints.value[0]
        console.log('[ControlPointSelection] 🔍 DEBUG - First control point:', {
          id: firstPoint.id,
          monu_num: firstPoint.monu_num,
          gauss: `Y=${firstPoint.y}, X=${firstPoint.x}`,
          wgs84: firstPoint.lat_wgs84 && firstPoint.lng_wgs84 
            ? `[${firstPoint.lat_wgs84.toFixed(6)}, ${firstPoint.lng_wgs84.toFixed(6)}]`
            : 'MISSING'
        })
        
        // Check if coordinates are in expected range for Zimbabwe
        if (firstPoint.lat_wgs84 && firstPoint.lng_wgs84) {
          const inZimbabwe = firstPoint.lng_wgs84 >= 25 && firstPoint.lng_wgs84 <= 33 && 
                            firstPoint.lat_wgs84 >= -23 && firstPoint.lat_wgs84 <= -15
          console.log(`[ControlPointSelection] 🌍 Point location check: ${inZimbabwe ? '✅ In Zimbabwe' : '❌ Outside Zimbabwe'}`)
        }
      }
      
      // Auto-select points within 20km if survey center exists and no previous selection
      if (surveyCenter.value && !autoSelectionApplied.value && controlPointsSelection.value.points.length === 0) {
        autoSelectNearbyPoints()
      }
    }
  } catch (error) {
    console.error('[ControlPointSelection] Error fetching control points:', error)
  } finally {
    isLoadingControlPoints.value = false
  }
}

// Auto-select control points within specified radius using GAUSS COORDINATES
function autoSelectNearbyPoints() {
  if (!surveyCenter.value || controlPoints.value.length === 0) {
    console.warn('[ControlPointSelection] Cannot auto-select: missing survey center or control points')
    return
  }
  
  const RADIUS_KM = searchRadius.value
  const RADIUS_METERS = RADIUS_KM * 1000
  const centerY = surveyCenter.value.y
  const centerX = surveyCenter.value.x
  
  console.log(`[ControlPointSelection] 🎯 Auto-selecting control points within ${RADIUS_KM}km of survey center...`)
  console.log(`[ControlPointSelection] Survey center (Gauss): Y=${centerY.toFixed(2)}, X=${centerX.toFixed(2)}`)
  console.log(`[ControlPointSelection] Total control points available: ${controlPoints.value.length}`)
  
  // Calculate planar distances using Gauss coordinates
  const pointsWithDistance = controlPoints.value
    .filter(point => point.y && point.x) // Only use points with Gauss coordinates
    .map(point => {
      const dy = point.y - centerY
      const dx = point.x - centerX
      const distanceMeters = Math.sqrt(dy * dy + dx * dx)
      const distanceKm = distanceMeters / 1000
      
      return {
        ...point,
        distance: distanceKm
      }
    })
  
  const pointsWithoutGauss = controlPoints.value.length - pointsWithDistance.length
  if (pointsWithoutGauss > 0) {
    console.warn(`[ControlPointSelection] ⚠️ ${pointsWithoutGauss} control points skipped (missing Gauss coordinates)`)
  }
  console.log(`[ControlPointSelection] Points with Gauss coordinates: ${pointsWithDistance.length}`)
  
  // Filter by radius
  const nearbyPoints = pointsWithDistance.filter(p => p.distance <= RADIUS_KM)
  
  // Sort by distance (nearest first)
  nearbyPoints.sort((a, b) => a.distance - b.distance)
  
  if (nearbyPoints.length > 0) {
    controlPointsSelection.value.points = nearbyPoints.map(p => p.id)
    autoSelectionApplied.value = true
    
    console.log(`[ControlPointSelection] ✅ Auto-selected ${nearbyPoints.length} control points within ${RADIUS_KM}km`)
    console.log('[ControlPointSelection] Nearest 5 points:')
    nearbyPoints.slice(0, 5).forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.monu_num} (Y=${p.y?.toFixed(2)}, X=${p.x?.toFixed(2)}) - ${p.distance.toFixed(2)}km away`)
    })
    
    // Show success message with details
    showSuccessMessage.value = true
    setTimeout(() => {
      showSuccessMessage.value = false
    }, 5000)
  } else {
    console.log(`[ControlPointSelection] ⚠️ No control points found within ${RADIUS_KM}km radius`)
    alert(`No control points found within ${RADIUS_KM}km of your survey center.\n\nTry increasing the search radius or select points manually.`)
  }
}

// Watch for changes in central meridian or survey center
watch(
  () => [workflowState.projectInfo.centralMeridian, surveyCenter.value],
  ([newMeridian, newCenter]) => {
    if (newMeridian && newCenter) {
      fetchControlPoints()
    }
  },
  { immediate: false }
)

// Initialize from workflow state
onMounted(() => {
  console.log('[ControlPointSelection] Component mounted')
  console.log('[ControlPointSelection] Project ID:', projectId.value)
  console.log('[ControlPointSelection] Current central meridian:', workflowState.projectInfo.centralMeridian)
  console.log('[ControlPointSelection] Current control point IDs:', workflowState.projectInfo.controlPointIds)
  console.log('[ControlPointSelection] Survey center:', surveyCenter.value)
  
  // Load existing selection from workflow state
  if (workflowState.projectInfo.centralMeridian) {
    controlPointsSelection.value.meridian = workflowState.projectInfo.centralMeridian
  }
  
  if (workflowState.projectInfo.controlPointIds && workflowState.projectInfo.controlPointIds.length > 0) {
    controlPointsSelection.value.points = [...workflowState.projectInfo.controlPointIds]
    autoSelectionApplied.value = true // Don't auto-select if user already has a selection
  }
  
  // Fetch control points if we have a central meridian
  if (workflowState.projectInfo.centralMeridian) {
    fetchControlPoints()
  }
})

// Actions
// Handle meridian suggestion from map
function handleMeridianSuggestion(meridian: number) {
  console.log('[ControlPointSelection] Meridian suggested:', meridian)
  controlPointsSelection.value.meridian = meridian
}

// Handle selection update from map
function handleSelectionUpdate(ids: number[]) {
  console.log('[ControlPointSelection] Selection updated:', ids)
  controlPointsSelection.value.points = ids
}

const goBack = () => {
  workflowState.currentStep = 'project-setup'
}

const skipForNow = () => {
  console.log('[ControlPointSelection] User chose to skip for now')
  
  // Show skip message
  showSkipMessage.value = true
  
  // Mark step as skipped in workflow state
  workflowState.projectInfo.controlPointsSkipped = true
  
  // Navigate to Found Beacons step after brief delay (next in workflow)
  setTimeout(() => {
    workflowState.currentStep = 'found-beacons'
  }, 1500)
}

const saveAndContinue = async () => {
  if (!canProceed.value) {
    alert('Please select a central meridian and at least 3 control points.')
    return
  }

  try {
    console.log('[ControlPointSelection] Saving control points...')
    console.log('  - Meridian:', controlPointsSelection.value.meridian)
    console.log('  - Point IDs:', controlPointsSelection.value.points)
    
    // Save current cache before proceeding (for multi-meridian support)
    if (controlPointSelectorRef.value) {
      await controlPointSelectorRef.value.saveCurrentCache()
    }
    
    // Update workflow state
    workflowState.projectInfo.centralMeridian = controlPointsSelection.value.meridian!
    workflowState.projectInfo.controlPointIds = [...controlPointsSelection.value.points]
    
    // Set current step and mark as complete with metadata
    workflowState.currentStep = 'control-point-selection'
    await completeCurrentStep({
      central_meridian: controlPointsSelection.value.meridian,
      control_point_ids: controlPointsSelection.value.points
    })
    
    console.log('[ControlPointSelection] ✅ Saved to workflow state')
    
    // CRITICAL: Also update the project record in database to persist control points
    // This ensures control points are available when loading the project later
    if (projectId.value) {
      console.log('[ControlPointSelection] 💾 Updating project record in database...')
      console.log('[ControlPointSelection] - Project ID:', projectId.value)
      console.log('[ControlPointSelection] - Control Point IDs:', controlPointsSelection.value.points)
      console.log('[ControlPointSelection] - Central Meridian:', controlPointsSelection.value.meridian)
      
      const { updateSurveyProject } = useSurveyors()
      const success = await updateSurveyProject(projectId.value, {
        controlPoints: {
          meridian: controlPointsSelection.value.meridian,
          points: controlPointsSelection.value.points
        }
      })
      
      if (success) {
        console.log('[ControlPointSelection] ✅ Control points saved to database')
      } else {
        console.error('[ControlPointSelection] ❌ Failed to save control points to database')
        alert('Warning: Control points saved to workflow but failed to update project record. Please try again.')
        return
      }
    }
    
    console.log('[ControlPointSelection] ✅ Control points fully persisted')
    
    // Show success message
    showSuccessMessage.value = true
    setTimeout(() => {
      showSuccessMessage.value = false
    }, 2000)
    
    // Navigate to Found Beacons step (next in workflow)
    setTimeout(() => {
      workflowState.currentStep = 'found-beacons'
    }, 500)
    
  } catch (error) {
    console.error('[ControlPointSelection] Error saving:', error)
    alert('Failed to save control points. Please try again.')
  }
}
</script>

<style scoped>
.control-point-selection-view {
  min-height: 100vh;
  background: linear-gradient(to bottom, #f9fafb, #ffffff);
}
</style>
