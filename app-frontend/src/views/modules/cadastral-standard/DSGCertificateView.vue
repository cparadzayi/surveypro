<template>
  <div class="dsg-certificate-view">
    <!-- Header -->
    <div class="bg-white border-b border-gray-200 px-6 py-4">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">DSG Certificate</h2>
          <p class="mt-1 text-sm text-gray-600">
            Final certification for Surveyor General submission
          </p>
        </div>
        <div class="flex items-center gap-2">
          <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
            ✨ AI Suggestions Available
          </span>
        </div>
      </div>
    </div>

    <!-- Instructions -->
    <div class="px-6 py-4 bg-blue-50 border-b border-blue-100">
      <div class="flex items-start space-x-3">
        <svg class="w-5 h-5 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <div class="flex-1">
          <h3 class="text-sm font-semibold text-blue-900">Certificate Instructions</h3>
          <p class="mt-1 text-sm text-blue-800">
            Complete the DSG Certificate with professional statements certifying the accuracy of your survey work.
            Click "Show Suggestions" for AI-powered templates based on your survey type.
          </p>
        </div>
      </div>
    </div>

    <!-- Main Form -->
    <div class="px-6 py-6 space-y-6">
      <!-- Survey Of Section -->
      <div class="bg-white border border-gray-200 rounded-lg p-6">
        <div class="flex items-center justify-between mb-4">
          <label class="block text-sm font-semibold text-gray-900">
            Survey Of
          </label>
          <button
            @click="showSurveyOfSuggestions"
            class="inline-flex items-center px-3 py-1 text-xs font-medium text-purple-700 bg-purple-100 rounded-md hover:bg-purple-200 transition-colors"
          >
            💡 Show Suggestions
          </button>
        </div>
        
        <div class="relative">
          <textarea
            ref="surveyOfTextarea"
            v-model="certificateData.surveyOf"
            @focus="onSurveyOfFocus"
            @blur="onSurveyOfBlur"
            rows="3"
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
            placeholder="e.g., STANDS 109-166, 257-267, 274, 278-281, 297-318 AD VALOREM TOWNSHIP OF SHABANI MINE SURFACE RIGHTS A, SHABANI DISTRICT"
          ></textarea>
          
          <!-- Survey Of Suggestions Dropdown -->
          <SmartSuggestionDropdown
            :show="showSurveyOfDropdown"
            :suggestions="surveyOfSuggestions"
            :selected-index="selectedSuggestionIndex"
            @select="applySurveyOfSuggestion"
            @close="hideSuggestions"
            class="mt-2"
          />
        </div>
      </div>

      <!-- Certification Statements -->
      <div class="bg-white border border-gray-200 rounded-lg p-6 space-y-6">
        <h3 class="text-lg font-semibold text-gray-900">Certification Statements</h3>
        
        <!-- Statement 1 -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="block text-sm font-medium text-gray-700">
              1. Data Consistency Check
            </label>
            <button
              @click="showStatement1Suggestions"
              class="text-xs text-purple-600 hover:text-purple-700"
            >
              💡 Suggestions
            </button>
          </div>
          <div class="relative">
            <textarea
              ref="statement1Textarea"
              v-model="certificateData.statement1"
              @focus="onStatement1Focus"
              @blur="onStatement1Blur"
              rows="2"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            ></textarea>
            
            <SmartSuggestionDropdown
              :show="showStatement1Dropdown"
              :suggestions="statement1Suggestions"
              :selected-index="selectedSuggestionIndex"
              @select="applyStatement1Suggestion"
              @close="hideSuggestions"
              class="mt-2"
            />
          </div>
        </div>

        <!-- Statement 2 -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="block text-sm font-medium text-gray-700">
              2. Coordinate Verification
            </label>
            <button
              @click="showStatement2Suggestions"
              class="text-xs text-purple-600 hover:text-purple-700"
            >
              💡 Suggestions
            </button>
          </div>
          <div class="relative">
            <textarea
              ref="statement2Textarea"
              v-model="certificateData.statement2"
              @focus="onStatement2Focus"
              @blur="onStatement2Blur"
              rows="3"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            ></textarea>
            
            <SmartSuggestionDropdown
              :show="showStatement2Dropdown"
              :suggestions="statement2Suggestions"
              :selected-index="selectedSuggestionIndex"
              @select="applyStatement2Suggestion"
              @close="hideSuggestions"
              class="mt-2"
            />
          </div>
        </div>

        <!-- Statement 3 -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="block text-sm font-medium text-gray-700">
              3. Beacon Placement Verification
            </label>
            <button
              @click="showStatement3Suggestions"
              class="text-xs text-purple-600 hover:text-purple-700"
            >
              💡 Suggestions
            </button>
          </div>
          <div class="relative">
            <textarea
              ref="statement3Textarea"
              v-model="certificateData.statement3"
              @focus="onStatement3Focus"
              @blur="onStatement3Blur"
              rows="2"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            ></textarea>
            
            <SmartSuggestionDropdown
              :show="showStatement3Dropdown"
              :suggestions="statement3Suggestions"
              :selected-index="selectedSuggestionIndex"
              @select="applyStatement3Suggestion"
              @close="hideSuggestions"
              class="mt-2"
            />
          </div>
        </div>

        <!-- Statement 4 -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="block text-sm font-medium text-gray-700">
              4. Overall Satisfaction
            </label>
            <button
              @click="showStatement4Suggestions"
              class="text-xs text-purple-600 hover:text-purple-700"
            >
              💡 Suggestions
            </button>
          </div>
          <div class="relative">
            <textarea
              ref="statement4Textarea"
              v-model="certificateData.statement4"
              @focus="onStatement4Focus"
              @blur="onStatement4Blur"
              rows="2"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            ></textarea>
            
            <SmartSuggestionDropdown
              :show="showStatement4Dropdown"
              :suggestions="statement4Suggestions"
              :selected-index="selectedSuggestionIndex"
              @select="applyStatement4Suggestion"
              @close="hideSuggestions"
              class="mt-2"
            />
          </div>
        </div>
      </div>

      <!-- Surveyor Information -->
      <div class="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
        <h3 class="text-lg font-semibold text-gray-900">Surveyor Information</h3>
        
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              Surveyor Name
            </label>
            <input
              v-model="certificateData.surveyorName"
              type="text"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., O. SAUNYAMA"
            />
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              License Number (Optional)
            </label>
            <input
              v-model="certificateData.licenseNumber"
              type="text"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., LS/2024/001"
            />
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Date
          </label>
          <input
            v-model="certificateData.date"
            type="date"
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="flex justify-between pt-6 border-t border-gray-200">
        <button
          @click="goBack"
          class="px-6 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
        >
          ← Back to Report on Survey
        </button>
        
        <div class="flex gap-3">
          <button
            @click="previewCertificate"
            :disabled="!isFormValid"
            class="px-6 py-2 text-sm font-medium text-blue-700 bg-blue-100 border border-blue-300 rounded-md hover:bg-blue-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            👁️ Preview PDF
          </button>
          
          <button
            @click="generateCertificate"
            :disabled="!isFormValid || isGenerating"
            class="px-6 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {{ isGenerating ? '⏳ Generating...' : '✅ Generate Certificate' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { toDateInputFormat } from '@/utils/dateFormat'
import { useCadastralWorkflow } from '@/composables/useCadastralWorkflow'
import SmartSuggestionDropdown from '@/components/SmartSuggestionDropdown.vue'
import {
  getSurveyOfSuggestions,
  getStatement1Suggestions,
  getStatement2Suggestions,
  getStatement3Suggestions,
  getStatement4Suggestions,
  type DSGSuggestion
} from '@/composables/useDSGCertificateSuggestions'
import { generateDSGCertificatePDF, previewDSGCertificate as previewPDF } from '@/utils/dsgCertificateGenerator'

const { workflowState } = useCadastralWorkflow()

// Certificate data
const certificateData = ref({
  surveyOf: '',
  surveyorName: '',
  licenseNumber: '',
  statement1: 'The consistency of data has been checked directly from the General Plan.',
  statement2: 'The coordinates of beacons appearing on the diagrams have been checked against the coordinate list and calculations of the fixes of beacons.',
  statement3: 'All beacons shown on the diagrams have been placed and checked.',
  statement4: 'I have satisfied myself of the correctness of the checks mentioned in subparagraphs 1, 2 and 3 above.',
  surveyorTitle: 'LAND SURVEYOR',
  additionalNotes: '',
  date: toDateInputFormat(new Date())
})

// Suggestion state
const surveyOfSuggestions = ref<DSGSuggestion[]>([])
const statement1Suggestions = ref<DSGSuggestion[]>([])
const statement2Suggestions = ref<DSGSuggestion[]>([])
const statement3Suggestions = ref<DSGSuggestion[]>([])
const statement4Suggestions = ref<DSGSuggestion[]>([])

const showSurveyOfDropdown = ref(false)
const showStatement1Dropdown = ref(false)
const showStatement2Dropdown = ref(false)
const showStatement3Dropdown = ref(false)
const showStatement4Dropdown = ref(false)

const selectedSuggestionIndex = ref(-1)
const isGenerating = ref(false)

// Template refs
const surveyOfTextarea = ref<HTMLTextAreaElement | null>(null)
const statement1Textarea = ref<HTMLTextAreaElement | null>(null)
const statement2Textarea = ref<HTMLTextAreaElement | null>(null)
const statement3Textarea = ref<HTMLTextAreaElement | null>(null)
const statement4Textarea = ref<HTMLTextAreaElement | null>(null)

// Computed
const isFormValid = computed(() => {
  return certificateData.value.surveyOf.trim() !== '' &&
         certificateData.value.surveyorName.trim() !== '' &&
         certificateData.value.statement1.trim() !== '' &&
         certificateData.value.statement2.trim() !== '' &&
         certificateData.value.statement3.trim() !== '' &&
         certificateData.value.statement4.trim() !== ''
})

const surveyType = computed(() => {
  return workflowState.reportOnSurvey?.purpose?.type || 'subdivision'
})

// Initialize from workflow data
onMounted(() => {
  // Auto-populate surveyor information
  if (workflowState.surveyorInfo?.landSurveyor) {
    certificateData.value.surveyorName = workflowState.surveyorInfo.landSurveyor
  }
  if (workflowState.surveyorInfo?.licenseNumber) {
    certificateData.value.licenseNumber = workflowState.surveyorInfo.licenseNumber
  }
  
  // Auto-populate Survey Of from persistent project information
  // Priority: Project Setup (persistent) > Report on Survey (contextual)
  const projectData = {
    // PERSISTENT: From Project Setup (Step 0)
    name: workflowState.projectInfo?.name || '',
    district: workflowState.projectInfo?.district || '',
    surveyType: workflowState.projectInfo?.surveyType || surveyType.value,
    standReference: workflowState.projectInfo?.standReference || '',
    township: workflowState.projectInfo?.township || '',
    
    // CONTEXTUAL: From Report on Survey (Step 8) - fallback only
    description: workflowState.reportOnSurvey?.purpose?.description || workflowState.projectInfo?.surveyDescription || '',
    standNumbers: workflowState.projectInfo?.standReference || workflowState.reportOnSurvey?.purpose?.reference || ''
  }
  
  // Generate Survey Of text from persistent project data
  const suggestions = getSurveyOfSuggestions(projectData.surveyType || surveyType.value, projectData)
  if (suggestions.length > 0) {
    certificateData.value.surveyOf = suggestions[0].text
  } else if (projectData.standReference && projectData.name && projectData.district) {
    // Fallback: Use stand reference, project name and district directly
    certificateData.value.surveyOf = `${projectData.standReference.toUpperCase()}, ${projectData.name.toUpperCase()}, ${projectData.district.toUpperCase()} DISTRICT`
  } else if (projectData.name && projectData.district) {
    // Fallback: Use project name and district only
    certificateData.value.surveyOf = `${projectData.name.toUpperCase()}, ${projectData.district.toUpperCase()} DISTRICT`
  }
  
  console.log('[DSG Certificate] Auto-populated from persistent project data:', {
    surveyType: projectData.surveyType,
    standReference: projectData.standReference,
    projectName: projectData.name,
    district: projectData.district,
    township: projectData.township,
    surveyOf: certificateData.value.surveyOf
  })
})

// Suggestion handlers
function showSurveyOfSuggestions() {
  const projectData = {
    standNumbers: workflowState.reportOnSurvey?.purpose?.standNumbers,
    township: workflowState.reportOnSurvey?.purpose?.township,
    district: workflowState.projectInfo?.district,
    name: workflowState.projectInfo?.name,
    description: workflowState.reportOnSurvey?.purpose?.description
  }
  
  surveyOfSuggestions.value = getSurveyOfSuggestions(surveyType.value, projectData)
  showSurveyOfDropdown.value = true
  selectedSuggestionIndex.value = 0
}

function showStatement1Suggestions() {
  statement1Suggestions.value = getStatement1Suggestions(surveyType.value)
  showStatement1Dropdown.value = true
  selectedSuggestionIndex.value = 0
}

function showStatement2Suggestions() {
  statement2Suggestions.value = getStatement2Suggestions(surveyType.value)
  showStatement2Dropdown.value = true
  selectedSuggestionIndex.value = 0
}

function showStatement3Suggestions() {
  statement3Suggestions.value = getStatement3Suggestions(surveyType.value)
  showStatement3Dropdown.value = true
  selectedSuggestionIndex.value = 0
}

function showStatement4Suggestions() {
  statement4Suggestions.value = getStatement4Suggestions(surveyType.value)
  showStatement4Dropdown.value = true
  selectedSuggestionIndex.value = 0
}

// Focus/Blur handlers
function onSurveyOfFocus() {
  if (!certificateData.value.surveyOf) {
    showSurveyOfSuggestions()
  }
}

function onSurveyOfBlur() {
  setTimeout(() => {
    showSurveyOfDropdown.value = false
  }, 200)
}

function onStatement1Focus() {}
function onStatement1Blur() {
  setTimeout(() => { showStatement1Dropdown.value = false }, 200)
}

function onStatement2Focus() {}
function onStatement2Blur() {
  setTimeout(() => { showStatement2Dropdown.value = false }, 200)
}

function onStatement3Focus() {}
function onStatement3Blur() {
  setTimeout(() => { showStatement3Dropdown.value = false }, 200)
}

function onStatement4Focus() {}
function onStatement4Blur() {
  setTimeout(() => { showStatement4Dropdown.value = false }, 200)
}

// Apply suggestion handlers
function applySurveyOfSuggestion(suggestion: DSGSuggestion) {
  certificateData.value.surveyOf = suggestion.text
  showSurveyOfDropdown.value = false
  surveyOfTextarea.value?.focus()
}

function applyStatement1Suggestion(suggestion: DSGSuggestion) {
  certificateData.value.statement1 = suggestion.text
  showStatement1Dropdown.value = false
  statement1Textarea.value?.focus()
}

function applyStatement2Suggestion(suggestion: DSGSuggestion) {
  certificateData.value.statement2 = suggestion.text
  showStatement2Dropdown.value = false
  statement2Textarea.value?.focus()
}

function applyStatement3Suggestion(suggestion: DSGSuggestion) {
  certificateData.value.statement3 = suggestion.text
  showStatement3Dropdown.value = false
  statement3Textarea.value?.focus()
}

function applyStatement4Suggestion(suggestion: DSGSuggestion) {
  certificateData.value.statement4 = suggestion.text
  showStatement4Dropdown.value = false
  statement4Textarea.value?.focus()
}

function hideSuggestions() {
  showSurveyOfDropdown.value = false
  showStatement1Dropdown.value = false
  showStatement2Dropdown.value = false
  showStatement3Dropdown.value = false
  showStatement4Dropdown.value = false
}

// Actions
function goBack() {
  workflowState.currentStep = 'report-on-survey'
}

async function previewCertificate() {
  try {
    await previewPDF(certificateData.value)
  } catch (error) {
    console.error('Error previewing certificate:', error)
    alert('Error previewing certificate. Please check the console.')
  }
}

async function generateCertificate() {
  isGenerating.value = true
  
  try {
    const { blob, pageCount } = await generateDSGCertificatePDF(certificateData.value)
    
    // Store in workflow state
    workflowState.documents.dsgCertificate = blob
    
    console.log(`✅ DSG Certificate generated successfully! (${pageCount} page)`)
    alert(`✅ DSG Certificate generated successfully!`)
    
    // Mark workflow as complete
    console.log('🎉 Cadastral workflow complete!')
    
  } catch (error) {
    console.error('Error generating certificate:', error)
    alert('Error generating certificate. Please check the console.')
  } finally {
    isGenerating.value = false
  }
}
</script>

<style scoped>
.dsg-certificate-view {
  min-height: 100vh;
  background-color: #f9fafb;
}
</style>
