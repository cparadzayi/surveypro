<template>
  <div class="calculations-part1-generator">
    <div class="bg-white shadow-lg rounded-lg p-6">
      <div class="mb-6">
        <h2 class="text-2xl font-bold text-gray-800 mb-2">Calculations Part 1</h2>
        <p class="text-gray-600">Generate duplicate point analysis and mean coordinate calculations for cadastral surveys</p>
      </div>

      <!-- Survey Data Upload -->
      <div class="mb-6">
        <label class="block text-sm font-medium text-gray-700 mb-2">
          Upload Survey Data (CSV)
        </label>
        <input
          type="file"
          accept=".csv"
          @change="handleFileUpload"
          class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
        <p class="mt-1 text-sm text-gray-500">Upload CSV file with survey point observations</p>
      </div>

      <!-- Surveyor Information Form -->
      <form @submit.prevent="generateCalculations" class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Surveyor Name *
            </label>
            <input
              v-model="surveyorInfo.name"
              type="text"
              required
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter surveyor name"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              License Number *
            </label>
            <input
              v-model="surveyorInfo.licenseNumber"
              type="text"
              required
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter license number"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Survey Firm
            </label>
            <input
              v-model="surveyorInfo.firm"
              type="text"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter firm name"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Survey Date *
            </label>
            <input
              v-model="surveyorInfo.surveyDate"
              type="date"
              required
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">
            Project Title *
          </label>
          <input
            v-model="surveyorInfo.projectTitle"
            type="text"
            required
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Enter project title"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">
            Address
          </label>
          <textarea
            v-model="surveyorInfo.address"
            rows="3"
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Enter project address"
          ></textarea>
        </div>

        <!-- Survey Data Preview -->
        <div v-if="surveyPoints.length > 0" class="mt-6">
          <h3 class="text-lg font-semibold text-gray-800 mb-3">Survey Data Preview</h3>
          <div class="bg-gray-50 rounded-lg p-4">
            <p class="text-sm text-gray-600 mb-2">
              <strong>Total Points:</strong> {{ surveyPoints.length }}
            </p>
            <p class="text-sm text-gray-600 mb-2">
              <strong>Duplicate Points:</strong> {{ duplicateCount }}
            </p>
            
            <div v-if="duplicatePoints.length > 0" class="mt-3">
              <p class="text-sm font-medium text-gray-700 mb-2">Points with duplicate observations:</p>
              <div class="flex flex-wrap gap-2">
                <span 
                  v-for="pointId in duplicatePoints" 
                  :key="pointId"
                  class="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded"
                >
                  {{ pointId }}
                </span>
              </div>
            </div>
            
            <div v-else class="text-yellow-600 text-sm">
              ⚠️ No duplicate observations found in the uploaded data.
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex space-x-4 pt-4">
          <button
            type="submit"
            :disabled="!canGenerate || isGenerating"
            class="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-2 rounded-md font-medium transition-colors flex items-center"
          >
            <svg v-if="isGenerating" class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            {{ isGenerating ? 'Generating...' : 'Generate Calculations Part 1 PDF' }}
          </button>

          <button
            type="button"
            @click="resetForm"
            class="bg-gray-300 hover:bg-gray-400 text-gray-800 px-6 py-2 rounded-md font-medium transition-colors"
          >
            Reset
          </button>
        </div>
      </form>

      <!-- Error Display -->
      <div v-if="error" class="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
        <div class="flex">
          <div class="flex-shrink-0">
            <svg class="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
            </svg>
          </div>
          <div class="ml-3">
            <h3 class="text-sm font-medium text-red-800">Error</h3>
            <p class="text-sm text-red-700 mt-1">{{ error }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { CalculationsPart1Generator, type SurveyPoint } from '../utils/calculations-part1'

// Reactive data
const surveyPoints = ref<SurveyPoint[]>([])
const isGenerating = ref(false)
const error = ref('')

const surveyorInfo = ref({
  name: '',
  licenseNumber: '',
  firm: '',
  address: '',
  surveyDate: new Date().toISOString().split('T')[0],
  projectTitle: ''
})

// Computed properties
const duplicatePoints = computed(() => {
  const pointCounts = new Map<string, number>()
  surveyPoints.value.forEach(point => {
    pointCounts.set(point.pointId, (pointCounts.get(point.pointId) || 0) + 1)
  })
  return Array.from(pointCounts.entries())
    .filter(([_, count]) => count > 1)
    .map(([pointId, _]) => pointId)
})

const duplicateCount = computed(() => duplicatePoints.value.length)

const canGenerate = computed(() => {
  return surveyPoints.value.length > 0 && 
         surveyorInfo.value.name && 
         surveyorInfo.value.licenseNumber && 
         surveyorInfo.value.projectTitle &&
         !isGenerating.value
})

// Methods
const handleFileUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  
  if (!file) return
  
  try {
    error.value = ''
    const text = await file.text()
    const points = parseCSV(text)
    surveyPoints.value = points
    console.log(`Loaded ${points.length} survey points`)
  } catch (err) {
    error.value = `Error reading CSV file: ${err instanceof Error ? err.message : 'Unknown error'}`
    console.error('CSV parsing error:', err)
  }
}

const parseCSV = (csvText: string): SurveyPoint[] => {
  const lines = csvText.trim().split('\n')
  if (lines.length < 2) {
    throw new Error('CSV file must contain at least a header and one data row')
  }
  
  const header = lines[0].split(',').map(h => h.trim())
  const points: SurveyPoint[] = []
  
  // Expected columns: Point, Y, X, Status, Description, Date of survey
  const requiredColumns = ['Point', 'Y', 'X', 'Status', 'Description']
  const missingColumns = requiredColumns.filter(col => !header.includes(col))
  
  if (missingColumns.length > 0) {
    throw new Error(`Missing required columns: ${missingColumns.join(', ')}`)
  }
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim())
    
    if (values.length !== header.length) {
      console.warn(`Row ${i + 1} has ${values.length} values but header has ${header.length} columns`)
      continue
    }
    
    try {
      const point: SurveyPoint = {
        pointId: values[header.indexOf('Point')],
        y: parseFloat(values[header.indexOf('Y')]),
        x: parseFloat(values[header.indexOf('X')]),
        status: values[header.indexOf('Status')],
        description: values[header.indexOf('Description')],
        surveyDate: values[header.indexOf('Date of survey')] || ''
      }
      
      // Validate numeric values
      if (isNaN(point.y) || isNaN(point.x)) {
        console.warn(`Row ${i + 1}: Invalid coordinates - Y: ${values[header.indexOf('Y')]}, X: ${values[header.indexOf('X')]}`)
        continue
      }
      
      points.push(point)
    } catch (err) {
      console.warn(`Error parsing row ${i + 1}:`, err)
    }
  }
  
  return points
}

const generateCalculations = async () => {
  if (!canGenerate.value) return
  
  try {
    isGenerating.value = true
    error.value = ''
    
    console.log('Generating Calculations Part 1...')
    
    const generator = new CalculationsPart1Generator()
    const pdfBlob = await generator.generateCalculationsPart1PDF(
      surveyPoints.value,
      surveyorInfo.value
    )
    
    // Download the PDF
    const url = URL.createObjectURL(pdfBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `Calculations_Part1_${surveyorInfo.value.projectTitle.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    
    console.log('Calculations Part 1 PDF generated successfully')
    
  } catch (err) {
    error.value = `Error generating PDF: ${err instanceof Error ? err.message : 'Unknown error'}`
    console.error('PDF generation error:', err)
  } finally {
    isGenerating.value = false
  }
}

const resetForm = () => {
  surveyPoints.value = []
  error.value = ''
  surveyorInfo.value = {
    name: '',
    licenseNumber: '',
    firm: '',
    address: '',
    surveyDate: new Date().toISOString().split('T')[0],
    projectTitle: ''
  }
}
</script>

<style scoped>
/* Additional custom styles if needed */
</style>