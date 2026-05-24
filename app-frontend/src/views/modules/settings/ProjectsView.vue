<template>
  <div class="projects-management">
    <div class="mb-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Survey Projects</h1>
          <p class="mt-1 text-sm text-gray-600">
            Manage survey projects and link them to surveyors
          </p>
        </div>
        <button
          @click="showAddModal = true"
          class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <span class="text-lg">+</span>
          Add Project
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading && surveyProjects.length === 0" class="text-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
      <p class="mt-4 text-gray-600">Loading projects...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
      <p class="text-red-800">{{ error }}</p>
    </div>

    <!-- Empty State -->
    <div v-else-if="surveyProjects.length === 0" class="text-center py-12 bg-gray-50 rounded-lg">
      <div class="text-6xl mb-4">📁</div>
      <h3 class="text-lg font-semibold text-gray-900 mb-2">No Projects Yet</h3>
      <p class="text-gray-600 mb-6">Create your first survey project</p>
      <button
        @click="showAddModal = true"
        class="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
      >
        Add First Project
      </button>
    </div>

    <!-- Projects List -->
    <div v-else class="space-y-4">
      <div
        v-for="project in surveyProjects"
        :key="project.id"
        class="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-6"
      >
        <div class="flex items-start justify-between mb-4">
          <div class="flex-1">
            <h3 class="text-lg font-semibold text-gray-900">{{ project.name }}</h3>
            <p class="text-sm text-gray-600">
              Surveyor: {{ project.surveyor_name }} ({{ project.license_number }})
            </p>
          </div>
          <div class="flex gap-2">
            <button
              @click="editProject(project)"
              class="p-2 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
              title="Edit"
            >
              ✏️
            </button>
            <button
              @click="confirmArchive(project)"
              class="p-2 text-amber-600 hover:bg-amber-50 rounded-md transition-colors"
              title="Archive"
            >
              📦
            </button>
            <button
              @click="confirmDelete(project)"
              class="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
              title="Permanently Delete"
            >
              🗑️
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div v-if="project.client_name">
            <span class="font-medium text-gray-700">Client:</span>
            <span class="ml-2 text-gray-900">{{ project.client_name }}</span>
          </div>
          <div v-if="project.district">
            <span class="font-medium text-gray-700">District:</span>
            <span class="ml-2 text-gray-900">{{ project.district }}</span>
          </div>
          <div v-if="project.survey_type">
            <span class="font-medium text-gray-700">Type:</span>
            <span class="ml-2 text-gray-900">{{ project.survey_type }}</span>
          </div>
          <div v-if="project.survey_date">
            <span class="font-medium text-gray-700">Date:</span>
            <span class="ml-2 text-gray-900">{{ formatDate(project.survey_date) }}</span>
          </div>
          <div v-if="project.designation" class="md:col-span-2">
            <span class="font-medium text-gray-700">Designation:</span>
            <p class="mt-1 text-gray-900">{{ project.designation }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Add/Edit Modal -->
    <div v-if="showAddModal || editingProject" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-bold text-gray-900">
            {{ editingProject ? '✏️ Edit Project' : '➕ Add New Project' }}
          </h2>
          <span v-if="editingProject" class="px-3 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded-full">
            Editing ID: {{ editingProject.id }}
          </span>
        </div>
        
        <form @submit.prevent="handleSubmit" class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Project Name *</label>
              <input
                v-model="formData.name"
                type="text"
                required
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                placeholder="Enter project name"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Surveyor *</label>
              <select
                v-model="formData.surveyorId"
                required
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select surveyor</option>
                <option v-for="option in surveyorOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Client Name</label>
              <input
                v-model="formData.clientName"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                placeholder="Enter client name"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">District</label>
              <input
                v-model="formData.district"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                placeholder="Enter district (e.g., GWELO)"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Survey Type</label>
              <select
                v-model="formData.surveyType"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select type</option>
                <option value="Cadastral">Cadastral</option>
                <option value="Topographical">Topographical</option>
                <option value="Engineering">Engineering</option>
                <option value="Mining">Mining</option>
                <option value="Boundary">Boundary</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Survey Date</label>
              <input
                v-model="formData.surveyDate"
                type="date"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Instruments</label>
            <textarea
              v-model="formData.instruments"
              rows="2"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Trimble R6 GNSS Set"
            ></textarea>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Designation (Survey Of)</label>
            <textarea
              v-model="formData.designation"
              rows="3"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              placeholder="Enter survey designation (e.g., LOTS 1-12 OF LOT 84...)"
            ></textarea>
          </div>

          <!-- Working Directory -->
          <div>
            <WorkingDirectorySelector
              v-model="formData.workingDirectory"
              :project-name="formData.name || 'Project'"
              :district="formData.district || ''"
            />
          </div>

          <!-- Control Point Selection -->
          <div class="border-t border-gray-200 pt-4 mt-4">
            <h3 class="text-md font-semibold text-gray-900 mb-3">
              National Trig System Connection
            </h3>
            <p class="text-sm text-gray-600 mb-4">
              Connect this survey to the national trigonometric system by selecting a central meridian and at least 3 control points.
            </p>
            <ControlPointSelector 
              ref="controlPointSelectorRef"
              v-model="formData.controlPoints" 
              :project-id="editingProject?.id || null"
            />
          </div>

          <div class="flex gap-2 pt-2">
            <button
              type="submit"
              :disabled="loading"
              class="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
            >
              {{ loading ? 'Saving...' : (editingProject ? 'Update' : 'Add Project') }}
            </button>
            <button
              type="button"
              @click="closeModal"
              class="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Delete/Archive Confirmation Modal -->
    <div v-if="deletingProject" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-lg p-6 max-w-md w-full">
        <div class="flex items-center gap-3 mb-4">
          <div :class="deleteMode === 'permanent' ? 'text-4xl' : 'text-3xl'">
            {{ deleteMode === 'permanent' ? '⚠️' : '📦' }}
          </div>
          <h3 class="text-lg font-bold text-gray-900">
            {{ deleteMode === 'permanent' ? 'Permanently Delete Project?' : 'Archive Project?' }}
          </h3>
        </div>
        
        <div class="mb-6">
          <p class="text-gray-700 font-medium mb-2">
            {{ deletingProject.name }}
          </p>
          
          <div v-if="deleteMode === 'permanent'" class="bg-red-50 border border-red-200 rounded-lg p-4 space-y-2">
            <p class="text-red-800 font-semibold text-sm">⚠️ This action cannot be undone!</p>
            <p class="text-red-700 text-sm">The following data will be permanently deleted:</p>
            <ul class="text-red-700 text-sm list-disc list-inside space-y-1">
              <li>Project information</li>
              <li>Control point selections</li>
              <li>CSV imports</li>
              <li>Coordinate points</li>
              <li>Land parcels</li>
              <li>Workflow state and documents</li>
            </ul>
          </div>
          
          <div v-else class="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p class="text-amber-800 text-sm">
              📦 The project will be archived and hidden from the list. All data will be preserved and can be restored later if needed.
            </p>
          </div>
        </div>
        
        <div class="flex gap-2">
          <button
            @click="handleDelete"
            :disabled="loading"
            :class="[
              'flex-1 text-white px-4 py-2 rounded-md transition-colors',
              deleteMode === 'permanent' 
                ? 'bg-red-600 hover:bg-red-700 disabled:bg-gray-400' 
                : 'bg-amber-600 hover:bg-amber-700 disabled:bg-gray-400'
            ]"
          >
            {{ loading ? (deleteMode === 'permanent' ? 'Deleting...' : 'Archiving...') : (deleteMode === 'permanent' ? 'Delete Permanently' : 'Archive') }}
          </button>
          <button
            @click="deletingProject = null"
            class="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useSurveyors, type SurveyProject } from '../../../composables/useSurveyors'
import ControlPointSelector from '../../../components/ControlPointSelector.vue'
import WorkingDirectorySelector from '../../../components/cadastral/WorkingDirectorySelector.vue'

const { surveyProjects, surveyorOptions, loading, error, fetchSurveyors, fetchSurveyProjects, createSurveyProject, updateSurveyProject, archiveSurveyProject, deleteSurveyProject } = useSurveyors()

const showAddModal = ref(false)
const editingProject = ref<SurveyProject | null>(null)
const deletingProject = ref<SurveyProject | null>(null)
const deleteMode = ref<'archive' | 'permanent'>('archive') // Track deletion mode
const controlPointSelectorRef = ref<InstanceType<typeof ControlPointSelector> | null>(null)

const formData = ref({
  name: '',
  surveyorId: null as number | null,
  clientName: '',
  district: '',
  surveyType: '',
  surveyDate: '',
  instruments: '',
  designation: '',
  workingDirectory: '',
  controlPoints: {
    meridian: 31 as number | null, // Default to Lo31
    points: [] as number[]
  }
})

const resetForm = () => {
  formData.value = {
    name: '',
    surveyorId: null,
    clientName: '',
    district: '',
    surveyType: '',
    surveyDate: '',
    instruments: '',
    designation: '',
    workingDirectory: '',
    controlPoints: {
      meridian: 31, // Default to Lo31
      points: []
    }
  }
}

const closeModal = () => {
  showAddModal.value = false
  editingProject.value = null
  resetForm()
}

const editProject = (project: SurveyProject) => {
  editingProject.value = project
  formData.value = {
    name: project.name,
    surveyorId: project.surveyor_id,
    clientName: project.client_name || '',
    district: project.district || '',
    surveyType: project.survey_type || '',
    surveyDate: project.survey_date || '',
    instruments: project.instruments || '',
    designation: project.designation || '',
    workingDirectory: (project as any).working_directory || '',
    controlPoints: {
      meridian: project.central_meridian || 31, // Default to Lo31 if not set
      points: project.control_point_ids || []
    }
  }
}

const confirmArchive = (project: SurveyProject) => {
  deletingProject.value = project
  deleteMode.value = 'archive'
}

const confirmDelete = (project: SurveyProject) => {
  deletingProject.value = project
  deleteMode.value = 'permanent'
}

const handleSubmit = async () => {
  let success
  
  try {
    // Save current meridian cache before submitting (important for preserving selections)
    if (editingProject.value) {
      if (controlPointSelectorRef.value) {
        console.log('[ProjectsView] Saving current meridian cache before submit')
        await controlPointSelectorRef.value.saveCurrentCache()
        console.log('[ProjectsView] Cache saved successfully')
      } else {
        console.warn('[ProjectsView] controlPointSelectorRef is null, cannot save cache')
      }
    }
    
    if (editingProject.value) {
      // Update existing project
      console.log('[ProjectsView] Updating project:', editingProject.value.id)
      success = await updateSurveyProject(editingProject.value.id, formData.value)
    } else {
      // Create new project
      console.log('[ProjectsView] Creating new project')
      success = await createSurveyProject(formData.value)
    }
    
    if (success) {
      console.log('[ProjectsView] Operation successful, closing modal')
      closeModal()
      // fetchSurveyProjects is now called inside create/update functions
    } else {
      console.error('[ProjectsView] Operation failed')
    }
  } catch (error) {
    console.error('[ProjectsView] Error in handleSubmit:', error)
  }
}

const handleDelete = async () => {
  if (!deletingProject.value) return
  
  const projectId = deletingProject.value.id
  const projectName = deletingProject.value.name
  
  let success = false
  
  if (deleteMode.value === 'permanent') {
    console.log(`[ProjectsView] Permanently deleting project ${projectId}: ${projectName}`)
    success = await deleteSurveyProject(projectId)
  } else {
    console.log(`[ProjectsView] Archiving project ${projectId}: ${projectName}`)
    success = await archiveSurveyProject(projectId)
  }
  
  if (success) {
    console.log(`[ProjectsView] Project ${deleteMode.value === 'permanent' ? 'deleted' : 'archived'} successfully`)
  } else {
    console.error(`[ProjectsView] Failed to ${deleteMode.value === 'permanent' ? 'delete' : 'archive'} project`)
  }
  
  deletingProject.value = null
}

const formatDate = (dateString: string) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleDateString()
}

onMounted(async () => {
  await fetchSurveyors()
  await fetchSurveyProjects()
})
</script>
