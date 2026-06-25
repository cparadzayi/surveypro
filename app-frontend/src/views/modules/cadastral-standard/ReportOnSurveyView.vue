<template>
  <div class="report-on-survey-view">
    <!-- Header -->
    <div class="bg-white border-b border-gray-200 px-6 py-4">
      <h2 class="text-2xl font-bold text-gray-900">Report on Survey</h2>
      <p class="mt-1 text-sm text-gray-600">
        SI 727 of 1979 - Surveyor General's Regulations
      </p>
    </div>

    <!-- Instructions -->
    <div class="px-6 py-4 bg-blue-50 border-b border-blue-100">
      <div class="flex items-start space-x-3">
        <svg class="w-5 h-5 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <div class="flex-1">
          <h3 class="text-sm font-semibold text-blue-900">Report Instructions</h3>
          <p class="mt-1 text-sm text-blue-800">
            Complete the Report on Survey as required by SI 727. This report will be included in your final submission package.
          </p>
        </div>
      </div>
    </div>

    <!-- Form Content -->
    <div class="px-6 py-6 space-y-6 max-w-5xl mx-auto">
      
      <!-- Format Selection -->
      <div class="bg-blue-50 rounded-lg border border-blue-200 p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">
          📄 Report Format
        </h3>
        
        <div class="space-y-3">
          <label class="flex items-start p-4 border-2 rounded-lg cursor-pointer transition-all"
                 :class="reportFormat === 'narrative' ? 'border-blue-600 bg-white' : 'border-gray-200 hover:border-blue-300 bg-white'">
            <input 
              type="radio" 
              v-model="reportFormat" 
              value="narrative"
              class="mt-1 h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
            />
            <div class="ml-3">
              <div class="text-sm font-medium text-gray-900">
                📝 Narrative Format (Recommended)
              </div>
              <div class="text-sm text-gray-600 mt-1">
                Professional narrative style with label-value pairs. Example: "Survey of: Maligreen Mining Lease No.44"
              </div>
            </div>
          </label>
          
          <label class="flex items-start p-4 border-2 rounded-lg cursor-pointer transition-all"
                 :class="reportFormat === 'structured' ? 'border-blue-600 bg-white' : 'border-gray-200 hover:border-blue-300 bg-white'">
            <input 
              type="radio" 
              v-model="reportFormat" 
              value="structured"
              class="mt-1 h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
            />
            <div class="ml-3">
              <div class="text-sm font-medium text-gray-900">
                📋 Structured Format
              </div>
              <div class="text-sm text-gray-600 mt-1">
                Traditional structured format with numbered sections and bullet points.
              </div>
            </div>
          </label>
        </div>
      </div>

      <!-- Additional Project Details -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">
          Project Details
        </h3>
        
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              District
            </label>
            <input
              v-model="projectDistrict"
              type="text"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g., Que Que District"
            />
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              Assistant Surveyor
            </label>
            <input
              v-model="assistantSurveyor"
              type="text"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g., N/A or Assistant Name"
            />
          </div>
        </div>
      </div>
      
      <!-- Section 1: Purpose -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-gray-900">
            1. Purpose of Survey
          </h3>
          <div class="flex items-center space-x-2 text-xs text-gray-500">
            <span class="inline-flex items-center px-2 py-1 rounded-full bg-blue-50 text-blue-700">
              <svg class="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              AI Suggestions Available
            </span>
          </div>
        </div>
        
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              Survey Type <span class="text-red-500">*</span>
            </label>
            <select 
              v-model="reportData.purpose.type"
              @change="onSurveyTypeChange"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select survey type...</option>
              <option value="mining-lease">Mining Lease</option>
              <option value="subdivision">Subdivision</option>
              <option value="state-land">State Land</option>
              <option value="municipal-land">Municipal Land</option>
              <option value="private-land">Private Land</option>
              <option value="amended-title">Amended Title</option>
              <option value="servitude">Servitude</option>
              <option value="replacement">Replacement Diagram</option>
              <option value="other">Other</option>
            </select>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              Permit/Approval Reference <span class="text-red-500">*</span>
            </label>
            <input
              v-model="reportData.purpose.reference"
              type="text"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g., Permit No. 123/2025"
            />
          </div>
          
          <!-- Purpose Description with Smart Suggestions -->
          <div class="relative">
            <div class="flex items-center justify-between mb-2">
              <label class="block text-sm font-medium text-gray-700">
                Purpose Description
              </label>
              <button
                v-if="reportData.purpose.type"
                @click="showPurposeSuggestions"
                type="button"
                class="inline-flex items-center px-3 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors"
              >
                <svg class="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
                </svg>
                Show Suggestions
              </button>
            </div>
            <textarea
              ref="purposeTextarea"
              v-model="purposeDescription"
              @focus="onPurposeFocus"
              @blur="onPurposeBlur"
              @keydown="handleKeyDown($event, 'purpose')"
              rows="3"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter the purpose of the survey or click 'Show Suggestions' for templates..."
            ></textarea>
            
            <!-- Smart Suggestion Dropdown -->
            <SmartSuggestionDropdown
              :suggestions="purposeSuggestions"
              :show="showPurposeSuggestionsDropdown"
              :selectedIndex="selectedSuggestionIndex"
              @select="applyPurposeSuggestion"
              @close="hideSuggestions"
            />
          </div>
          
          <div v-if="reportData.purpose.type === 'other'">
            <label class="block text-sm font-medium text-gray-700 mb-2">
              Other Description <span class="text-red-500">*</span>
            </label>
            <textarea
              v-model="reportData.purpose.otherDescription"
              rows="2"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              placeholder="Describe the purpose of the survey"
            ></textarea>
          </div>
        </div>
      </div>

      <!-- Section 2: Survey Based On -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">
          2. Survey Based On
        </h3>
        
        <div class="space-y-4">
          <!-- Trig Stations -->
          <label class="flex items-start p-3 border rounded-md cursor-pointer hover:bg-gray-50">
            <input 
              type="checkbox" 
              v-model="reportData.surveyBasis.trigStations"
              class="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <div class="ml-3 flex-1">
              <div class="text-sm font-medium text-gray-900">Trig Stations</div>
              <div v-if="reportData.surveyBasis.trigStations" class="mt-2">
                <input
                  v-model="trigStationNamesInput"
                  type="text"
                  class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
                  placeholder="e.g., MGWANI, VOMGWE"
                  @input="updateTrigStationNames"
                />
                <p class="mt-1 text-xs text-gray-500">Comma-separated list of trig station names</p>
              </div>
            </div>
          </label>

          <!-- Town Survey Marks -->
          <label class="flex items-start p-3 border rounded-md cursor-pointer hover:bg-gray-50">
            <input 
              type="checkbox" 
              v-model="reportData.surveyBasis.townSurveyMarks"
              class="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <div class="ml-3 flex-1">
              <div class="text-sm font-medium text-gray-900">Town Survey Marks</div>
              <div v-if="reportData.surveyBasis.townSurveyMarks" class="mt-2">
                <input
                  v-model="townSurveyMarkNamesInput"
                  type="text"
                  class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
                  placeholder="e.g., TSM1, TSM2"
                  @input="updateTownSurveyMarkNames"
                />
              </div>
            </div>
          </label>

          <!-- Official Control Points -->
          <label class="flex items-start p-3 border rounded-md cursor-pointer hover:bg-gray-50">
            <input 
              type="checkbox" 
              v-model="reportData.surveyBasis.officialControlPoints"
              class="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <div class="ml-3 flex-1">
              <div class="text-sm font-medium text-gray-900">Official Control Points</div>
              <div v-if="reportData.surveyBasis.officialControlPoints" class="mt-2">
                <input
                  v-model="controlPointNamesInput"
                  type="text"
                  class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
                  placeholder="e.g., CP1, CP2"
                  @input="updateControlPointNames"
                />
              </div>
            </div>
          </label>

          <!-- Previous Survey -->
          <label class="flex items-start p-3 border rounded-md cursor-pointer hover:bg-gray-50">
            <input 
              type="checkbox" 
              v-model="reportData.surveyBasis.previousSurvey"
              class="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <div class="ml-3 flex-1">
              <div class="text-sm font-medium text-gray-900">Previous Survey</div>
              <div v-if="reportData.surveyBasis.previousSurvey" class="mt-2">
                <input
                  v-model="reportData.surveyBasis.previousSurveySRNumber"
                  type="text"
                  class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
                  placeholder="e.g., SR 21/2016"
                />
              </div>
            </div>
          </label>

          <!-- Local System -->
          <label class="flex items-start p-3 border rounded-md cursor-pointer hover:bg-gray-50">
            <input 
              type="checkbox" 
              v-model="reportData.surveyBasis.localSystem"
              class="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <div class="ml-3 flex-1">
              <div class="text-sm font-medium text-gray-900">Local System</div>
              <div v-if="reportData.surveyBasis.localSystem" class="mt-2 space-y-2">
                <input
                  v-model="reportData.surveyBasis.localSystemDetails.baseMeasurementComparison"
                  type="text"
                  class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
                  placeholder="Base measurement comparison"
                />
                <input
                  v-model="reportData.surveyBasis.localSystemDetails.trueNorthMethod"
                  type="text"
                  class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
                  placeholder="Method of determining true north"
                />
              </div>
            </div>
          </label>
        </div>
      </div>

      <!-- Section 3 & 4: Beacons (Auto-populated) -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">
          3 & 4. Found and Replaced Beacons
        </h3>
        
        <div v-if="beaconCount > 0" class="bg-green-50 border border-green-200 rounded-md p-4">
          <div class="flex items-center space-x-2">
            <svg class="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
            </svg>
            <div class="text-sm text-green-800">
              <strong>{{ beaconCount }} beacon(s)</strong> automatically included from Found Beacons Assessment step.
            </div>
          </div>
        </div>
        
        <div v-else class="bg-amber-50 border border-amber-200 rounded-md p-4">
          <div class="flex items-center space-x-2">
            <svg class="w-5 h-5 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
            </svg>
            <div class="text-sm text-amber-800">
              No beacons found. Complete the Found Beacons Assessment step first.
            </div>
          </div>
        </div>
      </div>

      <!-- Section 5: Curvilinear Boundaries -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">
          5. Curvilinear Boundaries
        </h3>
        
        <div class="space-y-4">
          <label class="flex items-center">
            <input 
              type="checkbox" 
              v-model="reportData.curvilinearBoundaries.applicable"
              class="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span class="ml-2 text-sm text-gray-700">This survey includes curvilinear boundaries</span>
          </label>
          
          <div v-if="reportData.curvilinearBoundaries.applicable" class="space-y-4 pl-6">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Method</label>
              <select 
                v-model="reportData.curvilinearBoundaries.method"
                class="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">Select method...</option>
                <option value="previous-survey">Previous Survey</option>
                <option value="taped-traverse">Taped Traverse</option>
                <option value="tacheometric-traverse">Tacheometric Traverse</option>
                <option value="aerial-photography">Aerial Photography</option>
                <option value="various">Various Methods</option>
              </select>
            </div>
            
            <div v-if="reportData.curvilinearBoundaries.method === 'previous-survey'">
              <label class="block text-sm font-medium text-gray-700 mb-2">Previous Survey S.R. Number</label>
              <input
                v-model="reportData.curvilinearBoundaries.previousSurveySRNumber"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="e.g., SR 21/2016"
              />
            </div>
            
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Details</label>
              <textarea
                v-model="reportData.curvilinearBoundaries.details"
                rows="3"
                class="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="Describe curve details (radius, arc length, etc.)"
              ></textarea>
            </div>
          </div>
        </div>
      </div>

      <!-- Section 6: Unusual Occurrences -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">
          6. Unusual Occurrences and Comments
        </h3>
        
        <textarea
          v-model="reportData.unusualOccurrences"
          rows="6"
          class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          placeholder="Describe any unusual occurrences, difficulties encountered, or additional comments..."
        ></textarea>
        
        <p class="mt-2 text-xs text-gray-500">
          Include any relevant information about the survey that doesn't fit in other sections.
        </p>
      </div>

      <!-- Actions -->
      <div class="flex items-center justify-between pt-6 border-t border-gray-200">
        <button
          @click="saveDraft"
          class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          💾 Save Draft
        </button>
        
        <div class="flex items-center space-x-3">
          <button
            @click="goBack"
            class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            ← Back
          </button>
          
          <button
            @click="generateReport"
            :disabled="!isFormValid || isGenerating"
            :class="[
              'px-6 py-2 text-sm font-medium text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500',
              isFormValid && !isGenerating
                ? 'bg-blue-600 hover:bg-blue-700' 
                : 'bg-gray-400 cursor-not-allowed'
            ]"
          >
            <span v-if="isGenerating">⏳ Generating...</span>
            <span v-else>📄 Generate Report</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useCadastralWorkflow } from '../../../composables/useCadastralWorkflow'
import { useSmartSuggestions } from '../../../composables/useSmartSuggestions'
import SmartSuggestionDropdown from '../../../components/SmartSuggestionDropdown.vue'
import type { ReportOnSurveyData } from '../../../types/cadastral'

const { workflowState } = useCadastralWorkflow()

// Smart Suggestions
const {
  getPurposeSuggestions,
  getSurveyBasisSuggestions,
  getPlacedBeaconsSuggestions,
  getCommentSuggestions
} = useSmartSuggestions()

// Report format selection
const reportFormat = ref<'narrative' | 'structured'>('narrative')

// Additional project details
const projectDistrict = ref(workflowState.projectInfo.district || '')
const assistantSurveyor = ref('N/A')

// Smart Suggestions State
const purposeDescription = ref('')
const purposeSuggestions = ref<any[]>([])
const showPurposeSuggestionsDropdown = ref(false)
const selectedSuggestionIndex = ref(-1)
const purposeTextarea = ref<HTMLTextAreaElement | null>(null)

// Initialize report data
const reportData = ref<ReportOnSurveyData>({
  srNumber: workflowState.projectInfo.srNumber || '',
  purpose: {
    type: '',
    reference: ''
  },
  surveyBasis: {
    trigStations: false,
    townSurveyMarks: false,
    officialControlPoints: false,
    previousSurvey: false,
    localSystem: false,
    localSystemDetails: {
      baseMeasurementComparison: '',
      trueNorthMethod: ''
    }
  },
  beacons: workflowState.reportOnSurvey?.beacons || [],
  beaconComparison: workflowState.reportOnSurvey?.beaconComparison,
  curvilinearBoundaries: {
    applicable: false
  },
  unusualOccurrences: ''
})

// Input fields for comma-separated lists
const trigStationNamesInput = ref('')
const townSurveyMarkNamesInput = ref('')
const controlPointNamesInput = ref('')

// Update arrays from comma-separated input
const updateTrigStationNames = () => {
  reportData.value.surveyBasis.trigStationNames = trigStationNamesInput.value
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0)
}

const updateTownSurveyMarkNames = () => {
  reportData.value.surveyBasis.townSurveyMarkNames = townSurveyMarkNamesInput.value
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0)
}

const updateControlPointNames = () => {
  reportData.value.surveyBasis.controlPointNames = controlPointNamesInput.value
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0)
}

// Computed properties
const beaconCount = computed(() => reportData.value.beacons?.length || 0)

const isFormValid = computed(() => {
  return (
    reportData.value.purpose.type !== '' &&
    reportData.value.purpose.reference !== '' &&
    (reportData.value.purpose.type !== 'other' || reportData.value.purpose.otherDescription) &&
    (reportData.value.surveyBasis.trigStations ||
     reportData.value.surveyBasis.townSurveyMarks ||
     reportData.value.surveyBasis.officialControlPoints ||
     reportData.value.surveyBasis.previousSurvey ||
     reportData.value.surveyBasis.localSystem)
  )
})

// Load existing data on mount
onMounted(() => {
  if (workflowState.reportOnSurvey) {
    reportData.value = { ...workflowState.reportOnSurvey }
    
    // Populate input fields
    if (reportData.value.surveyBasis.trigStationNames) {
      trigStationNamesInput.value = reportData.value.surveyBasis.trigStationNames.join(', ')
    }
    if (reportData.value.surveyBasis.townSurveyMarkNames) {
      townSurveyMarkNamesInput.value = reportData.value.surveyBasis.townSurveyMarkNames.join(', ')
    }
    if (reportData.value.surveyBasis.controlPointNames) {
      controlPointNamesInput.value = reportData.value.surveyBasis.controlPointNames.join(', ')
    }
  }
  
  console.log('[ReportOnSurvey] Loaded with', beaconCount.value, 'beacons')
})

// Smart Suggestions Event Handlers

// Survey type change - auto-show suggestions
function onSurveyTypeChange() {
  if (reportData.value.purpose.type && !purposeDescription.value) {
    nextTick(() => {
      showPurposeSuggestions()
    })
  }
}

// Show purpose suggestions
function showPurposeSuggestions() {
  if (!reportData.value.purpose.type) return
  
  purposeSuggestions.value = getPurposeSuggestions(
    reportData.value.purpose.type,
    reportData.value.purpose.reference,
    workflowState.surveyorInfo.surveyDate
  )
  
  showPurposeSuggestionsDropdown.value = true
  selectedSuggestionIndex.value = 0
}

// Purpose field focus
function onPurposeFocus() {
  if (reportData.value.purpose.type && purposeSuggestions.value.length === 0) {
    showPurposeSuggestions()
  }
}

// Purpose field blur (with delay to allow click on suggestion)
let blurTimeout: number | null = null
function onPurposeBlur() {
  blurTimeout = window.setTimeout(() => {
    showPurposeSuggestionsDropdown.value = false
  }, 200)
}

// Apply purpose suggestion
function applyPurposeSuggestion(suggestion: any) {
  if (blurTimeout) {
    clearTimeout(blurTimeout)
    blurTimeout = null
  }
  
  purposeDescription.value = suggestion.text
  showPurposeSuggestionsDropdown.value = false
  
  // Focus back on textarea
  nextTick(() => {
    purposeTextarea.value?.focus()
  })
}

// Hide suggestions
function hideSuggestions() {
  showPurposeSuggestionsDropdown.value = false
  selectedSuggestionIndex.value = -1
}

// Keyboard navigation
function handleKeyDown(event: KeyboardEvent, field: string) {
  if (field === 'purpose' && showPurposeSuggestionsDropdown.value) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      selectedSuggestionIndex.value = Math.min(
        selectedSuggestionIndex.value + 1,
        purposeSuggestions.value.length - 1
      )
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      selectedSuggestionIndex.value = Math.max(selectedSuggestionIndex.value - 1, 0)
    } else if (event.key === 'Enter' && selectedSuggestionIndex.value >= 0) {
      event.preventDefault()
      applyPurposeSuggestion(purposeSuggestions.value[selectedSuggestionIndex.value])
    } else if (event.key === 'Escape') {
      event.preventDefault()
      hideSuggestions()
    }
  }
}

// Save draft
const saveDraft = () => {
  workflowState.reportOnSurvey = { ...reportData.value }
  console.log('[ReportOnSurvey] Draft saved')
  alert('✅ Draft saved successfully!')
}

// Go back to previous step
const goBack = () => {
  workflowState.currentStep = 'area-computation'
}

// Generate report
const isGenerating = ref(false)

const generateReport = async () => {
  if (!isFormValid.value) {
    alert('Please complete all required fields before generating the report.')
    return
  }
  
  if (isGenerating.value) return
  
  try {
    isGenerating.value = true
    
    // Save to workflow state
    workflowState.reportOnSurvey = { ...reportData.value }
    
    console.log('[ReportOnSurvey] Generating PDF...', reportData.value, 'Format:', reportFormat.value)
    
    // Prepare generation options
    const options = {
      surveyorName: workflowState.surveyorInfo.landSurveyor,
      licenseNumber: workflowState.surveyorInfo.licenseNumber,
      firm: workflowState.surveyorInfo.firm,
      address: workflowState.surveyorInfo.address,
      surveyDate: workflowState.surveyorInfo.surveyDate,
      surveyOf: workflowState.surveyorInfo.surveyOf,
      district: projectDistrict.value,
      assistant: assistantSurveyor.value
    }
    
    // Generate PDF based on selected format
    let pdf: Blob
    let pageCount: number
    
    if (reportFormat.value === 'narrative') {
      const { generateNarrativeReportOnSurveyPDF } = await import('../../../utils/reportOnSurveyNarrativeGenerator')
      const result = await generateNarrativeReportOnSurveyPDF(reportData.value, options)
      pdf = result.pdf
      pageCount = result.pageCount
    } else {
      const { generateReportOnSurveyPDF } = await import('../../../utils/reportOnSurveyGenerator')
      const result = await generateReportOnSurveyPDF(reportData.value, options)
      pdf = result.pdf
      pageCount = result.pageCount
    }
    
    console.log('[ReportOnSurvey] PDF generated:', pageCount, 'pages')
    
    // Save to workflow state
    workflowState.documents.reportOnSurvey = {
      pdf,
      pageCount
    }
    
    // Save to file system if working directory is set
    if (workflowState.projectInfo.workingDirectory) {
      try {
        const { saveDocument } = await import('../../../services/documentStorage')
        const fileName = `${reportData.value.srNumber || 'Report'}_ReportOnSurvey.pdf`
        
        const result = await saveDocument({
          workingDirectory: workflowState.projectInfo.workingDirectory,
          documentType: 'report-on-survey',
          fileName,
          pdfBlob: pdf
        })
        
        if (result.success) {
          console.log('[ReportOnSurvey] PDF saved to:', result.filePath)
        } else {
          console.warn('[ReportOnSurvey] Failed to save PDF:', result.error)
        }
      } catch (saveError) {
        console.error('[ReportOnSurvey] Error saving PDF:', saveError)
        // Continue even if save fails
      }
    }
    
    alert(`✅ Report on Survey generated successfully! (${pageCount} pages)`)
    
    // Move to next step
    workflowState.currentStep = 'dsg-certificate'
    
  } catch (error) {
    console.error('[ReportOnSurvey] Error generating report:', error)
    alert('❌ Error generating report. Please check the console for details.')
  } finally {
    isGenerating.value = false
  }
}
</script>

<style scoped>
.report-on-survey-view {
  @apply min-h-screen bg-gray-50;
}
</style>
