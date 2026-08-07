<template>
  <div class="max-w-4xl mx-auto p-6">
    <div class="bg-white shadow-lg rounded-lg p-8">
      <h1 class="text-2xl font-bold text-gray-900 mb-2">
        ⚙️ Project Setup & Configuration
      </h1>
      <p class="text-gray-600 mb-6">
        Complete one-time setup - all information will auto-populate throughout the workflow.
      </p>

      <form @submit.prevent="completeSetup" class="space-y-6">
        <!-- SECTION 0: Surveyor & Project Selection -->
        <div class="border-b border-gray-200 pb-6">
          <h2 class="text-lg font-semibold text-gray-900 mb-4">
            👤 Surveyor & Project Selection
          </h2>
          
          <div class="space-y-4">
            <!-- Logged-in Surveyor Info (Read-only) -->
            <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div class="flex items-start gap-3">
                <div class="text-2xl">👤</div>
                <div class="flex-1">
                  <h3 class="text-sm font-semibold text-gray-900 mb-2">Logged-in Surveyor</h3>
                  <div v-if="selectedSurveyor" class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="block text-xs font-medium text-gray-600 mb-1">Name</label>
                      <div class="text-sm font-semibold text-gray-900">{{ selectedSurveyor.name }}</div>
                    </div>
                    <div>
                      <label class="block text-xs font-medium text-gray-600 mb-1">License Number</label>
                      <div class="text-sm font-semibold text-gray-900">{{ selectedSurveyor.license_number }}</div>
                    </div>
                    <div>
                      <label class="block text-xs font-medium text-gray-600 mb-1">Firm</label>
                      <div class="text-sm text-gray-700">{{ selectedSurveyor.firm || 'N/A' }}</div>
                    </div>
                    <div>
                      <label class="block text-xs font-medium text-gray-600 mb-1">Address</label>
                      <div class="text-sm text-gray-700">{{ selectedSurveyor.address || 'N/A' }}</div>
                    </div>
                  </div>
                  <div v-else class="text-sm text-gray-500">
                    Loading surveyor information...
                  </div>
                </div>
              </div>
            </div>

            <!-- Project Selector -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Select Project *
              </label>
              <div class="flex gap-2">
                <select
                  v-model="setupData.projectId"
                  @change="onProjectChange"
                  :required="!showAddProjectForm"
                  :disabled="showAddProjectForm"
                  class="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                  <option :value="null">-- Select project --</option>
                  <option v-for="project in filteredProjects" :key="project.id" :value="project.id">
                    {{ project.name }}
                  </option>
                </select>
                <button
                  type="button"
                  @click="toggleAddProjectForm"
                  class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors flex items-center"
                  :title="showAddProjectForm ? 'Cancel' : 'Create New Project'"
                >
                  <span class="text-lg">{{ showAddProjectForm ? '×' : '+' }}</span>
                </button>
              </div>
              <p v-if="filteredProjects.length === 0 && !showAddProjectForm" class="mt-1 text-sm text-amber-600">
                ⚠️ No projects found. Create a new project.
              </p>
              <p v-else-if="setupData.projectId && !showAddProjectForm" class="mt-1 text-sm text-green-600">
                ✅ Project selected: {{ selectedProject?.name }}
              </p>
              
              <!-- Inline Add Project Name Input -->
              <div v-if="showAddProjectForm" class="mt-4 p-4 bg-green-50 border-2 border-green-200 rounded-lg">
                <h3 class="text-sm font-semibold text-gray-900 mb-3">📁 New Project Name</h3>
                <div class="space-y-3">
                  <div>
                    <label class="block text-xs font-medium text-gray-700 mb-1">
                      Project Name *
                    </label>
                    <input
                      v-model="newProjectName"
                      @input="onNewProjectNameInput"
                      type="text"
                      required
                      class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      placeholder="e.g., Gweru Mining Lease"
                      @keyup.enter="addProjectToDropdown"
                    />
                  </div>
                  <div class="flex gap-2 pt-2">
                    <button
                      type="button"
                      @click="addProjectToDropdown"
                      :disabled="!newProjectName.trim()"
                      class="flex-1 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Add to List
                    </button>
                    <button
                      type="button"
                      @click="cancelAddProject"
                      class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                  <p class="text-xs text-gray-500 mt-2">
                    💡 Project will be created when you click "Complete Setup & Start Workflow"
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>
        <!-- SECTION 1: Survey Information -->
        <div class="border-b border-gray-200 pb-6">
          <h2 class="text-lg font-semibold text-gray-900 mb-4">
            🗺️ Survey Information
          </h2>
          
          <div class="space-y-4">
            <!-- Survey Type -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Survey Type *
              </label>
              <select
                v-model="setupData.surveyType"
                required
                class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select survey type...</option>
                <option value="subdivision">Subdivision</option>
                <option value="mining-lease">Mining Lease</option>
                <option value="state-land">State Land</option>
                <option value="municipal-land">Municipal Land</option>
                <option value="private-land">Private Land</option>
                <option value="servitude">Servitude</option>
                <option value="replacement">Replacement Diagram</option>
                <option value="other">Other</option>
              </select>
              <p class="mt-1 text-sm text-gray-500">
                Determines templates and ML predictions throughout the workflow
              </p>
            </div>
            
            <!-- Township (Optional) -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Township Name (Optional)
              </label>
              <input
                v-model="setupData.township"
                type="text"
                class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., Maglas Township, Widdicombe Township"
              />
              <p class="mt-1 text-sm text-gray-500">
                Appears in the General Plan title block: "[Township Name] Township comprising N stands"
              </p>
            </div>

            <!-- Parent Property -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Immediate Parent Property (Optional)
              </label>
              <input
                v-model="setupData.parentProperty"
                type="text"
                class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., Shabani Mine Surface Rights A, Subdivision A of Widdicombe"
              />
              <p class="mt-1 text-sm text-gray-500">
                Appears in title block: "being the whole/remainder/portion of [Parent Property]"
              </p>
            </div>

            <!-- Immediate parent diagram (SI 727 single-stand Diagram reference grid) -->
            <h3 class="text-sm font-semibold text-gray-700 pt-2">Immediate Parent Diagram</h3>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Immediate Parent Diagram No.
              </label>
              <input
                v-model="setupData.parentDiagramNo"
                type="text"
                class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g. 8057/77"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Type of Deed or Title
              </label>
              <select
                :value="deedTypeSelectValue(setupData.parentDiagramAnnexedTo, parentDeedTypeIsOther)"
                @change="onDeedTypeChange($event, 'parentDiagramAnnexedTo')"
                class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select type...</option>
                <option value="Deed of Transfer">Deed of Transfer</option>
                <option value="Certificate of Registered Title">Certificate of Registered Title</option>
                <option value="Other">Other</option>
              </select>
              <input
                v-if="deedTypeSelectValue(setupData.parentDiagramAnnexedTo, parentDeedTypeIsOther) === 'Other'"
                v-model="setupData.parentDiagramAnnexedTo"
                type="text"
                class="mt-2 w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g. Deed of Grant"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Deed / Certificate No.
              </label>
              <input
                v-model="setupData.deedOfTransferNo"
                type="text"
                class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g. 1166/77"
              />
            </div>

            <!-- Original title diagram -->
            <h3 class="text-sm font-semibold text-gray-700 pt-2">Original Title Diagram</h3>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Original Title Diagram No.
              </label>
              <input
                v-model="setupData.originalTitleDiagramNo"
                type="text"
                class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Type of Deed or Title
              </label>
              <select
                :value="deedTypeSelectValue(setupData.originalTitleAnnexedTo, originalTitleDeedTypeIsOther)"
                @change="onDeedTypeChange($event, 'originalTitleAnnexedTo')"
                class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select type...</option>
                <option value="Deed of Transfer">Deed of Transfer</option>
                <option value="Certificate of Registered Title">Certificate of Registered Title</option>
                <option value="Other">Other</option>
              </select>
              <input
                v-if="deedTypeSelectValue(setupData.originalTitleAnnexedTo, originalTitleDeedTypeIsOther) === 'Other'"
                v-model="setupData.originalTitleAnnexedTo"
                type="text"
                class="mt-2 w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g. Deed of Grant"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Deed / Certificate No.
              </label>
              <input
                v-model="setupData.originalTitleDeedNo"
                type="text"
                class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g. 2201/64"
              />
            </div>

            <!-- S.R. / File / G.P. -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                S.R. No.
              </label>
              <input
                v-model="setupData.srNo"
                type="text"
                class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g. 118/2023"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                File No.
              </label>
              <input
                v-model="setupData.fileNo"
                type="text"
                class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g. 8/2916"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                G.P. No.
              </label>
              <input
                v-model="setupData.gpNo"
                type="text"
                class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Compilation
              </label>
              <input
                v-model="setupData.compilation"
                type="text"
                class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g. J. Moyo"
              />
            </div>

            <!-- District -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                District *
              </label>
              <input
                v-model="setupData.district"
                type="text"
                required
                class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., Gwelo"
              />
            </div>
            
            <!-- Whole / Remainder / Portion (SI 727 Seventh Schedule (b)) -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Survey covers *
              </label>
              <select
                v-model="setupData.wholePortion"
                required
                class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="the whole">The whole</option>
                <option value="the remainder">The remainder</option>
                <option value="a portion">A portion</option>
              </select>
              <p class="mt-1 text-sm text-gray-500">
                Used in the general plan figure description (SI 727 Seventh Schedule)
              </p>
            </div>

            <!-- Survey Date -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Survey Date *
              </label>
              <input
                v-model="setupData.surveyDate"
                type="date"
                required
                class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <!-- Survey Of (Full Description) -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Survey Of (Full Description) *
              </label>
              <textarea
                v-model="setupData.surveyOf"
                rows="3"
                required
                class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., LOTS 1 - 12 OF LOT 84 OF SUBDIVISION B OF SUBDIVISION E OF GWELO SMALL HOLDING 34"
              ></textarea>
              <p class="mt-1 text-sm text-gray-500">
                This will appear on all reports and certificates
              </p>
            </div>
            
            <!-- Instruments Used -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Instruments Used *
              </label>
              <textarea
                v-model="setupData.instruments"
                rows="4"
                required
                class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., 1. Trimble R6GNSS Set&#10;Base Serial Number S/N 5016424521&#10;Rover Serial Number S/N 5146476624"
              ></textarea>
              <p class="mt-1 text-sm text-gray-500">
                List all survey equipment used
              </p>
            </div>
          </div>
        </div>

        <!-- SECTION 3: Coordinate System -->
        <div class="border-b border-gray-200 pb-6">
          <h2 class="text-lg font-semibold text-gray-900 mb-4">
            🌐 Coordinate System
          </h2>
          
          <div class="space-y-4">
            <!-- Lo Zone -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Lo Zone (Central Meridian) *
              </label>
              <select
                v-model="setupData.loZone"
                required
                class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option :value="null">-- Select Lo zone --</option>
                <option :value="25">Lo 25 (CM 25°E) - Western Zimbabwe</option>
                <option :value="27">Lo 27 (CM 27°E)</option>
                <option :value="29">Lo 29 (CM 29°E) - Central Zimbabwe</option>
                <option :value="31">Lo 31 (CM 31°E) - Eastern Zimbabwe</option>
                <option :value="33">Lo 33 (CM 33°E)</option>
              </select>
              <p class="mt-1 text-sm text-gray-500">
                Select based on project location
              </p>
            </div>
            
            <!-- Datum -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Datum *
              </label>
              <select
                v-model="setupData.datum"
                required
                class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="cape">Cape Datum (Modified Clarke 1880) - Recommended</option>
                <option value="hartebeesthoek94">Hartebeesthoek94 (WGS84)</option>
                <option value="wgs84">WGS84</option>
              </select>
              <p class="mt-1 text-sm text-gray-500">
                Cape Datum is Zimbabwe's standard for cadastral surveys
              </p>
            </div>
          </div>
        </div>

        <!-- SECTION 4: Working Directory -->
        <div>
          <h2 class="text-lg font-semibold text-gray-900 mb-4">
            📁 Working Directory
          </h2>
          <WorkingDirectorySelector
            v-model="setupData.workingDirectory"
            :project-name="selectedProject?.name || 'Project'"
            :district="setupData.district"
          />
        </div>

        <!-- Info Box -->
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div class="flex">
            <div class="flex-shrink-0">
              <svg class="h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
              </svg>
            </div>
            <div class="ml-3">
              <h3 class="text-sm font-medium text-blue-800">🎯 One-Time Setup</h3>
              <div class="mt-2 text-sm text-blue-700">
                <p class="mb-2">
                  <strong>Complete this form once</strong> - all information will automatically populate throughout the workflow:
                </p>
                <ul class="list-disc list-inside space-y-1">
                  <li>Field Book generation</li>
                  <li>Calculations sheets</li>
                  <li>Coordinate List</li>
                  <li>Report on Survey</li>
                  <li>DSG Certificate</li>
                </ul>
                <p class="mt-2">
                  ✅ <strong>Benefits:</strong> Consistency, time savings, error prevention, better ML predictions
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Submit Button -->
        <div class="flex justify-end space-x-4 pt-4">
          <button
            type="submit"
            :disabled="!isFormValid"
            :class="{
              'bg-blue-600 hover:bg-blue-700': isFormValid,
              'bg-gray-400 cursor-not-allowed': !isFormValid
            }"
            class="px-6 py-3 text-white rounded-md transition-colors font-medium"
          >
            ✅ Complete Setup & Start Workflow
          </button>
        </div>

        <!-- Validation Messages -->
        <div v-if="!isFormValid" class="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <h3 class="text-sm font-medium text-amber-800 mb-2">⚠️ Required Fields Missing:</h3>
          <ul class="text-sm text-amber-700 space-y-1">
            <li v-if="!setupData.surveyorId">• Surveyor must be selected</li>
            <li v-if="!setupData.projectId">• Project must be selected</li>
            <li v-if="!setupData.surveyType">• Survey type is required</li>
            <li v-if="!setupData.district">• District is required</li>
            <li v-if="!setupData.surveyDate">• Survey date is required</li>
            <li v-if="!setupData.surveyOf">• Survey Of description is required</li>
            <li v-if="!setupData.instruments">• Instruments used is required</li>
            <li v-if="!setupData.loZone">• Lo zone must be selected</li>
            <li v-if="!setupData.workingDirectory">• Working directory must be set</li>
          </ul>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { toDateInputFormat } from '@/utils/dateFormat'
import WorkingDirectorySelector from '../../../components/cadastral/WorkingDirectorySelector.vue'
import { useAuthStore } from '../../../stores/auth'
import { useProjectSelectionStore } from '../../../stores/projectSelection'

const emit = defineEmits<{
  complete: [setupData: {
    surveyorId: number
    projectId: number
    surveyType: string
    township?: string
    parentProperty?: string
    deedOfTransferNo?: string
    parentDiagramNo?: string
    parentDiagramAnnexedTo?: string
    originalTitleDiagramNo?: string
    originalTitleAnnexedTo?: string
    originalTitleDeedNo?: string
    srNo?: string
    fileNo?: string
    gpNo?: string
    compilation?: string
    district: string
    surveyDate: string
    surveyOf: string
    instruments: string
    loZone: number
    datum: string
    workingDirectory: string
    wholePortion: string
  }]
}>()

// Stores
const authStore = useAuthStore()
const projectSelectionStore = useProjectSelectionStore()

// State
const setupData = ref({
  surveyorId: null as number | null,
  projectId: null as number | null,
  district: '',
  surveyType: '',
  township: '',
  parentProperty: '',
  deedOfTransferNo: '',
  parentDiagramNo: '',
  parentDiagramAnnexedTo: '',
  originalTitleDiagramNo: '',
  originalTitleAnnexedTo: '',
  originalTitleDeedNo: '',
  srNo: '',
  fileNo: '',
  gpNo: '',
  compilation: '',
  surveyDate: '',
  surveyOf: '',
  instruments: '',
  loZone: null as number | null,
  datum: 'cape',
  workingDirectory: '',
  wholePortion: 'the whole'
})

const surveyors = ref<any[]>([])
const projects = ref<any[]>([])
const surveyorsLoading = ref(false)
const surveyorsError = ref('')

// Add project form state
const showAddProjectForm = ref(false)
const newProjectName = ref('')
const pendingNewProject = ref<{ name: string; tempId: string } | null>(null)

// Computed
const selectedSurveyor = computed(() => {
  return surveyors.value.find(s => s.id === setupData.value.surveyorId)
})

const selectedProject = computed(() => {
  if (!Array.isArray(projects.value)) return null
  return projects.value.find(p => p.id === setupData.value.projectId)
})

const filteredProjects = computed(() => {
  // With schema-per-surveyor, all projects from API already belong to logged-in user
  // No need to filter by surveyor_profile_id (column doesn't exist in surveyor schemas)
  if (!Array.isArray(projects.value)) return []
  return projects.value
})

// Check if we have a pending new project
const hasPendingProject = computed(() => {
  return pendingNewProject.value !== null
})

// Form validation
const isFormValid = computed(() => {
  return (
    setupData.value.surveyorId !== null &&
    setupData.value.projectId !== null &&
    setupData.value.district.trim() !== '' &&
    setupData.value.surveyType.trim() !== '' &&
    setupData.value.surveyDate.trim() !== '' &&
    setupData.value.surveyOf.trim() !== '' &&
    setupData.value.instruments.trim() !== '' &&
    setupData.value.loZone !== null &&
    setupData.value.workingDirectory.trim() !== ''
  )
})

// Event handlers
function onSurveyorChange() {
  console.log('[ProjectSetup] Surveyor changed:', setupData.value.surveyorId)
  // Reset project when surveyor changes
  setupData.value.projectId = null
}

// Helper function to format date for HTML5 date input (yyyy-MM-dd)
function formatDateForInput(dateString: string | null | undefined): string {
  if (!dateString) return ''
  try {
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return ''
    // Format as yyyy-MM-dd
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  } catch (error) {
    console.error('[ProjectSetup] Error formatting date:', error)
    return ''
  }
}

const DEED_TYPE_PRESETS = ['Deed of Transfer', 'Certificate of Registered Title']

// Tracks an in-progress "Other" selection whose text field is still empty, so the
// dropdown can distinguish "nothing chosen yet" from "user picked Other and hasn't
// typed a custom value yet" — both states share an empty setupData field.
const parentDeedTypeIsOther = ref(false)
const originalTitleDeedTypeIsOther = ref(false)

function deedTypeSelectValue(current: string, otherChosen: boolean): string {
  if (current === '') return otherChosen ? 'Other' : ''
  if (DEED_TYPE_PRESETS.includes(current)) return current
  return 'Other'
}

function onDeedTypeChange(event: Event, field: 'parentDiagramAnnexedTo' | 'originalTitleAnnexedTo') {
  const value = (event.target as HTMLSelectElement).value
  setupData.value[field] = value === 'Other' ? '' : value
  const flag = field === 'parentDiagramAnnexedTo' ? parentDeedTypeIsOther : originalTitleDeedTypeIsOther
  flag.value = value === 'Other'
}

function onProjectChange() {
  console.log('[ProjectSetup] Project changed:', setupData.value.projectId)
  
  // Auto-populate ALL fields from project if available
  if (selectedProject.value) {
    const project = selectedProject.value
    
    console.log('[ProjectSetup] 🔄 Auto-loading project data:', project.name)
    console.log('[ProjectSetup] Project data:', project)
    
    // Survey Information
    setupData.value.surveyType = project.survey_type || ''
    setupData.value.township = project.township || ''
    setupData.value.parentProperty = project.parent_property || ''
    setupData.value.deedOfTransferNo = project.deed_of_transfer_no || ''
    setupData.value.parentDiagramNo = project.parent_diagram_no || ''
    setupData.value.parentDiagramAnnexedTo = project.parent_diagram_annexed_to || ''
    setupData.value.originalTitleDiagramNo = project.original_title_diagram_no || ''
    setupData.value.originalTitleAnnexedTo = project.original_title_annexed_to || ''
    parentDeedTypeIsOther.value = false
    originalTitleDeedTypeIsOther.value = false
    setupData.value.originalTitleDeedNo = project.original_title_deed_no || ''
    setupData.value.srNo = project.sr_no || ''
    setupData.value.fileNo = project.file_no || ''
    setupData.value.gpNo = project.gp_no || ''
    setupData.value.compilation = project.compilation || ''
    setupData.value.district = project.district || ''
    setupData.value.wholePortion = project.whole_portion || 'the whole'
    setupData.value.surveyDate = formatDateForInput(project.survey_date)
    setupData.value.surveyOf = project.designation || ''
    setupData.value.instruments = project.instruments || ''
    
    // Coordinate System
    setupData.value.loZone = project.central_meridian || null
    setupData.value.datum = project.datum || 'cape'
    setupData.value.workingDirectory = project.working_directory || ''
    
    console.log('[ProjectSetup] ✅ Auto-populated all fields:')
    console.log('[ProjectSetup]   - Survey Type:', setupData.value.surveyType)
    console.log('[ProjectSetup]   - Township:', setupData.value.township)
    console.log('[ProjectSetup]   - District:', setupData.value.district)
    console.log('[ProjectSetup]   - Survey Date:', setupData.value.surveyDate)
    console.log('[ProjectSetup]   - Survey Of:', setupData.value.surveyOf)
    console.log('[ProjectSetup]   - Instruments:', setupData.value.instruments)
    console.log('[ProjectSetup]   - Lo Zone:', setupData.value.loZone)
    console.log('[ProjectSetup]   - Working Directory:', setupData.value.workingDirectory)
  } else {
    parentDeedTypeIsOther.value = false
    originalTitleDeedTypeIsOther.value = false
  }
}

function toggleAddProjectForm() {
  showAddProjectForm.value = !showAddProjectForm.value
  if (showAddProjectForm.value) {
    // Reset form when opening
    newProjectName.value = ''
  }
}

function onNewProjectNameInput() {
  // Real-time feedback as user types
  console.log('[ProjectSetup] New project name:', newProjectName.value)
}

function cancelAddProject() {
  showAddProjectForm.value = false
  newProjectName.value = ''
}

function addProjectToDropdown() {
  if (!newProjectName.value.trim()) return
  
  console.log('[ProjectSetup] Adding project to dropdown:', newProjectName.value)
  
  // Create a temporary project object with a temp ID
  const tempId = `temp_${Date.now()}`
  pendingNewProject.value = {
    name: newProjectName.value.trim(),
    tempId: tempId
  }
  
  // Add to projects list as a temporary entry
  projects.value.push({
    id: tempId as any, // Temporary ID until project is created
    name: newProjectName.value.trim(),
    type: 'pending',
    is_temporary: true
  } as any)
  
  // Auto-select the new project
  setupData.value.projectId = tempId as any
  
  // Close the form
  showAddProjectForm.value = false
  newProjectName.value = ''
  
  console.log('[ProjectSetup] ✅ Project added to dropdown (will be created on Complete Setup)')
}

async function createPendingProject() {
  if (!pendingNewProject.value) return null
  
  try {
    console.log('[ProjectSetup] Creating pending project:', pendingNewProject.value.name)
    
    const response = await fetch('/api/survey-projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authStore.token}`
      },
      body: JSON.stringify({
        name: pendingNewProject.value.name,
        surveyor_profile_id: setupData.value.surveyorId,
        type: setupData.value.surveyType || 'Cadastral',
        district: setupData.value.district,
        survey_date: setupData.value.surveyDate
      })
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Failed to create project' }))
      throw new Error(errorData.message || 'Failed to create project')
    }
    
    const data = await response.json()
    console.log('[ProjectSetup] ✅ Project created:', data)
    
    // Remove temporary project from list
    projects.value = projects.value.filter(p => p.id !== pendingNewProject.value?.tempId)
    
    // Add real project to list
    if (data.project) {
      projects.value.push(data.project)
      // Update setupData with real project ID
      setupData.value.projectId = data.project.id
    }
    
    // Clear pending project
    const createdProjectId = data.project?.id
    pendingNewProject.value = null
    
    return createdProjectId
  } catch (error) {
    console.error('[ProjectSetup] Error creating project:', error)
    throw error
  }
}

// Load data
async function loadSurveyors() {
  surveyorsLoading.value = true
  surveyorsError.value = ''
  
  try {
    const response = await fetch('/api/surveyors', {
      headers: {
        'Authorization': `Bearer ${authStore.token}`
      }
    })
    
    if (!response.ok) throw new Error('Failed to load surveyors')
    
    const data = await response.json()
    // Backend returns { ok: true, surveyors: [...] }
    surveyors.value = Array.isArray(data.surveyors) ? data.surveyors : (Array.isArray(data) ? data : [])
    console.log('[ProjectSetup] Loaded surveyors:', surveyors.value.length)
    
    // Auto-select logged-in user's surveyor profile
    if (authStore.profile?.profile?.id) {
      setupData.value.surveyorId = authStore.profile.profile.id
      await loadProjects()
    }
  } catch (error) {
    console.error('[ProjectSetup] Error loading surveyors:', error)
    surveyorsError.value = 'Failed to load surveyors'
    surveyors.value = [] // Ensure it's always an array
  } finally {
    surveyorsLoading.value = false
  }
}

async function loadProjects() {
  try {
    const response = await fetch('/api/survey-projects', {
      headers: {
        'Authorization': `Bearer ${authStore.token}`
      }
    })
    
    if (!response.ok) throw new Error('Failed to load projects')
    
    const data = await response.json()
    // Backend returns { ok: true, projects: [...] }
    projects.value = Array.isArray(data.projects) ? data.projects : (Array.isArray(data) ? data : [])
    console.log('[ProjectSetup] Loaded projects:', projects.value.length)
  } catch (error) {
    console.error('[ProjectSetup] Error loading projects:', error)
    projects.value = [] // Ensure it's always an array
  }
}

async function completeSetup() {
  // Validate all required fields
  if (!isFormValid.value) {
    alert('Please fill in all required fields')
    return
  }
  
  try {
    // If there's a pending new project, create it first
    let finalProjectId = setupData.value.projectId
    
    if (pendingNewProject.value) {
      console.log('[ProjectSetup] 🔄 Creating pending project before completing setup...')
      finalProjectId = await createPendingProject()
      
      if (!finalProjectId) {
        throw new Error('Failed to create project')
      }
    }
    
    console.log('✅ Project setup complete:', setupData.value)
    console.log('📋 Survey Type:', setupData.value.surveyType)
    console.log('📝 Survey Of:', setupData.value.surveyOf)
    console.log('🌐 Lo Zone:', setupData.value.loZone)
    
    // Emit completion event with all data
    emit('complete', {
      surveyorId: setupData.value.surveyorId!,
      projectId: finalProjectId!,
      surveyType: setupData.value.surveyType,
      township: setupData.value.township || undefined,
      parentProperty: setupData.value.parentProperty || undefined,
      deedOfTransferNo: setupData.value.deedOfTransferNo || undefined,
      parentDiagramNo: setupData.value.parentDiagramNo || undefined,
      parentDiagramAnnexedTo: setupData.value.parentDiagramAnnexedTo || undefined,
      originalTitleDiagramNo: setupData.value.originalTitleDiagramNo || undefined,
      originalTitleAnnexedTo: setupData.value.originalTitleAnnexedTo || undefined,
      originalTitleDeedNo: setupData.value.originalTitleDeedNo || undefined,
      srNo: setupData.value.srNo || undefined,
      fileNo: setupData.value.fileNo || undefined,
      gpNo: setupData.value.gpNo || undefined,
      compilation: setupData.value.compilation || undefined,
      district: setupData.value.district,
      surveyDate: setupData.value.surveyDate,
      surveyOf: setupData.value.surveyOf,
      instruments: setupData.value.instruments,
      loZone: setupData.value.loZone!,
      datum: setupData.value.datum,
      workingDirectory: setupData.value.workingDirectory,
      wholePortion: setupData.value.wholePortion
    })
  } catch (error) {
    console.error('[ProjectSetup] Error completing setup:', error)
    alert('Error creating project: ' + (error instanceof Error ? error.message : 'Unknown error'))
  }
}

// Initialize
onMounted(async () => {
  console.log('[ProjectSetup] Component mounted')
  
  // Load surveyors (which also calls loadProjects internally after setting surveyorId)
  await loadSurveyors()
  
  // ✅ NEW: Check for pre-selected project from Dashboard or previous session
  console.log('[ProjectSetup] Checking for pre-selected project...')
  
  // First, try to load from Pinia store (most recent)
  if (projectSelectionStore.selectedProject) {
    console.log('[ProjectSetup] ✅ Found project in Pinia store:', projectSelectionStore.selectedProject.name)
    setupData.value.projectId = projectSelectionStore.selectedProject.id
    // Trigger full field population from the loaded projects list
    onProjectChange()
    console.log('[ProjectSetup] ✅ Auto-selected project from store')
  } else {
    // Fallback: Try to load from localStorage
    const loaded = projectSelectionStore.loadFromLocalStorage()
    if (loaded && projectSelectionStore.selectedProject) {
      console.log('[ProjectSetup] ✅ Found project in localStorage:', projectSelectionStore.selectedProject.name)
      setupData.value.projectId = projectSelectionStore.selectedProject.id
      // Trigger full field population from the loaded projects list
      onProjectChange()
      console.log('[ProjectSetup] ✅ Auto-selected project from localStorage')
    } else {
      console.log('[ProjectSetup] ℹ️ No pre-selected project found')
    }
  }
})
</script>
