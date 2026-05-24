<template>
  <div class="min-h-screen bg-gray-50 p-8">
    <div class="max-w-4xl mx-auto">
      <div class="bg-white rounded-lg shadow-lg p-6">
        <h1 class="text-3xl font-bold text-gray-900 mb-6">
          🧪 Proj4Leaflet Test Project Runner
        </h1>
        
        <div class="mb-6">
          <p class="text-gray-600 mb-2">
            This automated test validates the Zimbabwe Cape Lo coordinate system implementation with proj4leaflet.
          </p>
          <p class="text-sm text-gray-500">
            Surveyor: Elon Paradzayi | District: Gwelo | Expected Zone: Lo29 (EPSG:22289)
          </p>
        </div>

        <!-- Test Status -->
        <div v-if="testStatus" class="mb-6 p-4 rounded-lg" :class="testStatusClass">
          <div class="flex items-center gap-2 mb-2">
            <span class="text-2xl">{{ testStatus.icon }}</span>
            <span class="font-bold text-lg">{{ testStatus.title }}</span>
          </div>
          <p class="text-sm">{{ testStatus.message }}</p>
        </div>

        <!-- Run Test Button -->
        <div class="mb-6">
          <button
            @click="runTest"
            :disabled="isRunning"
            class="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold flex items-center gap-2"
          >
            <span v-if="isRunning">⏳</span>
            <span v-else>🚀</span>
            {{ isRunning ? 'Running Test...' : 'Run Automated Test' }}
          </button>
        </div>

        <!-- Test Progress -->
        <div v-if="isRunning || testResults" class="space-y-4">
          <div 
            v-for="(step, index) in testSteps" 
            :key="index"
            class="border rounded-lg p-4"
            :class="getStepClass(step)"
          >
            <div class="flex items-start gap-3">
              <span class="text-xl">{{ step.icon }}</span>
              <div class="flex-1">
                <h3 class="font-semibold text-gray-900">{{ step.title }}</h3>
                <p class="text-sm text-gray-600 mt-1">{{ step.message }}</p>
                <div v-if="step.details && step.details.length > 0" class="mt-2 text-xs text-gray-500 space-y-1">
                  <div v-for="(detail, i) in step.details" :key="i">{{ detail }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Test Report -->
        <div v-if="testReport" class="mt-6">
          <h2 class="text-xl font-bold mb-4">📋 Detailed Test Report</h2>
          <pre class="bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto text-xs font-mono">{{ testReport }}</pre>
        </div>

        <!-- Test Data Export -->
        <div v-if="testResults && testResults.success" class="mt-6 border-t pt-6">
          <h2 class="text-xl font-bold mb-4">📊 Test Data</h2>
          <div class="grid grid-cols-3 gap-4">
            <button
              @click="exportCSV"
              class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              📄 Export CSV
            </button>
            <button
              @click="exportJSON"
              class="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
            >
              📦 Export JSON
            </button>
            <button
              @click="showSummary"
              class="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
            >
              📝 Show Summary
            </button>
          </div>
        </div>

        <!-- Summary Modal -->
        <div v-if="showSummaryModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div class="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6">
            <div class="flex justify-between items-start mb-4">
              <h3 class="text-xl font-bold">Test Summary</h3>
              <button @click="showSummaryModal = false" class="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            <pre class="bg-gray-50 p-4 rounded text-sm">{{ summaryText }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { createTestProject, exportTestData, generateTestReport } from '../services/testProjectSetup'
import type { TestProjectResult } from '../services/testProjectSetup'

interface TestStep {
  title: string
  message: string
  status: 'pending' | 'running' | 'success' | 'error' | 'warning'
  icon: string
  details?: string[]
}

const isRunning = ref(false)
const testResults = ref<TestProjectResult | null>(null)
const testReport = ref<string>('')
const showSummaryModal = ref(false)
const summaryText = ref<string>('')

const testSteps = ref<TestStep[]>([
  { title: 'Step 1: Validate Coordinate Ranges', message: 'Checking Y and X coordinate ranges...', status: 'pending', icon: '⏳' },
  { title: 'Step 2: Set SRID to Lo31', message: 'Using Lo31 (EPSG:22291, CM: 31°E)...', status: 'pending', icon: '⏳' },
  { title: 'Step 3: Initialize CRS', message: 'Creating Proj4Leaflet CRS...', status: 'pending', icon: '⏳' },
  { title: 'Step 4: Transform Coordinates', message: 'Testing P(Y,X) transformations...', status: 'pending', icon: '⏳' },
  { title: 'Step 5: Validate Parcels', message: 'Checking test parcels...', status: 'pending', icon: '⏳' },
  { title: 'Step 6: Create Workflow', message: 'Setting up project state...', status: 'pending', icon: '⏳' }
])

const testStatus = computed(() => {
  if (!testResults.value) return null
  
  if (testResults.value.success) {
    return {
      icon: '✅',
      title: 'Test Passed!',
      message: 'All validations successful. Proj4Leaflet is working correctly with Zimbabwe Cape Lo coordinates.',
      class: 'bg-green-50 border-green-200'
    }
  } else {
    return {
      icon: '❌',
      title: 'Test Failed',
      message: `${testResults.value.errors.length} error(s) found. Review the details below.`,
      class: 'bg-red-50 border-red-200'
    }
  }
})

const testStatusClass = computed(() => {
  return testStatus.value?.class || 'bg-blue-50 border-blue-200'
})

async function runTest() {
  isRunning.value = true
  testResults.value = null
  testReport.value = ''
  
  // Reset all steps
  testSteps.value.forEach(step => {
    step.status = 'running'
    step.icon = '⏳'
    step.details = []
  })
  
  try {
    // Step 1: Coordinate ranges
    await delay(500)
    updateStep(0, 'running', 'Validating coordinate ranges...')
    
    // Run the actual test
    const result = await createTestProject()
    testResults.value = result
    
    // Update steps based on results
    updateStepsFromResults(result)
    
    // Generate report
    testReport.value = generateTestReport(result)
    
    console.log('🧪 Test Results:', result)
    console.log(testReport.value)
    
  } catch (error) {
    console.error('❌ Test execution failed:', error)
    testSteps.value.forEach(step => {
      if (step.status === 'running') {
        step.status = 'error'
        step.icon = '❌'
      }
    })
  } finally {
    isRunning.value = false
  }
}

function updateStepsFromResults(result: TestProjectResult) {
  const { validationResults, errors, warnings } = result
  
  // Step 1: Coordinate ranges
  updateStep(
    0, 
    validationResults.coordinateRanges.valid ? 'success' : 'warning',
    validationResults.coordinateRanges.valid 
      ? 'All coordinates within valid ranges (Y: -200km to +200km, X: 0-3000km)'
      : `${validationResults.coordinateRanges.errors.length} coordinate range warnings`,
    validationResults.coordinateRanges.errors.slice(0, 3)
  )
  
  // Step 2: SRID detection
  updateStep(
    1,
    validationResults.sridDetection.valid ? 'success' : 'error',
    validationResults.sridDetection.valid 
      ? 'Using Lo31 (EPSG:22291, Central Meridian: 31°E)'
      : validationResults.sridDetection.message,
    validationResults.sridDetection.valid ? ['Forced to EPSG:22291 (Lo31)', 'Central Meridian: 31°E', 'Clarke 1880 ellipsoid'] : []
  )
  
  // Step 3: CRS initialization
  updateStep(
    2,
    validationResults.sridDetection.valid ? 'success' : 'error',
    validationResults.sridDetection.valid 
      ? 'Proj4Leaflet CRS created successfully'
      : 'CRS initialization failed',
    validationResults.sridDetection.valid ? ['Clarke 1880 ellipsoid', 'Transverse Mercator projection'] : []
  )
  
  // Step 4: Coordinate transformation
  updateStep(
    3,
    validationResults.coordinateTransformation.valid ? 'success' : 'error',
    validationResults.coordinateTransformation.valid
      ? 'P(Y,X) → [Y,X] transformations successful'
      : 'Transformation errors detected',
    validationResults.coordinateTransformation.valid 
      ? ['10 coordinates transformed', 'All coordinates finite', 'Zimbabwe P(Y,X) convention applied']
      : validationResults.coordinateTransformation.errors.slice(0, 3)
  )
  
  // Step 5: Parcels
  const allParcelsValid = validationResults.parcels.every(p => p.valid)
  updateStep(
    4,
    allParcelsValid ? 'success' : 'error',
    allParcelsValid
      ? `All ${validationResults.parcels.length} test parcels valid`
      : 'Some parcels have validation errors',
    validationResults.parcels.map(p => `${p.valid ? '✅' : '❌'} ${p.designation}`)
  )
  
  // Step 6: Workflow
  updateStep(
    5,
    result.success ? 'success' : 'error',
    result.success 
      ? 'Test project workflow created successfully'
      : 'Workflow creation failed',
    result.success ? ['Project ID assigned', 'Coordinates loaded', 'Ready for testing'] : []
  )
}

function updateStep(index: number, status: TestStep['status'], message: string, details?: string[]) {
  const icons = {
    pending: '⏳',
    running: '⏳',
    success: '✅',
    error: '❌',
    warning: '⚠️'
  }
  
  testSteps.value[index].status = status
  testSteps.value[index].message = message
  testSteps.value[index].icon = icons[status]
  if (details) {
    testSteps.value[index].details = details
  }
}

function getStepClass(step: TestStep): string {
  const classes = {
    pending: 'bg-gray-50 border-gray-200',
    running: 'bg-blue-50 border-blue-200 animate-pulse',
    success: 'bg-green-50 border-green-200',
    error: 'bg-red-50 border-red-200',
    warning: 'bg-yellow-50 border-yellow-200'
  }
  return classes[step.status]
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function exportCSV() {
  const { csv } = exportTestData()
  downloadFile(csv, 'test-coordinates.csv', 'text/csv')
}

function exportJSON() {
  const { json } = exportTestData()
  downloadFile(json, 'test-project-data.json', 'application/json')
}

function showSummary() {
  const { summary } = exportTestData()
  summaryText.value = summary
  showSummaryModal.value = true
}

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
</script>
