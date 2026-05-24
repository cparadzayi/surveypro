<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
    <div class="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
      <!-- Background overlay -->
      <div class="fixed inset-0 bg-gray-500 bg-opacity-75 backdrop-blur-sm transition-opacity" aria-hidden="true" @click="handleCancel"></div>

      <!-- Center modal -->
      <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

      <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
        <!-- Header -->
        <div class="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4">
          <h3 class="text-xl font-bold text-white flex items-center gap-2">
            <span>🚀</span>
            <span>Quick Start - Cadastral Project</span>
          </h3>
          <p class="text-blue-100 text-sm mt-1">Select an existing project or create a new one</p>
        </div>

        <!-- Tabs -->
        <div class="border-b border-gray-200 bg-gray-50">
          <nav class="flex -mb-px">
            <button
              @click="activeTab = 'select'"
              :class="{
                'border-blue-500 text-blue-600 bg-white': activeTab === 'select',
                'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300': activeTab !== 'select'
              }"
              class="flex-1 py-4 px-6 text-center border-b-2 font-medium text-sm transition-colors"
            >
              📁 Select Existing
              <span v-if="recentProjects.length > 0" class="ml-2 px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-600">
                {{ recentProjects.length }}
              </span>
            </button>
            <button
              @click="activeTab = 'create'"
              :class="{
                'border-blue-500 text-blue-600 bg-white': activeTab === 'create',
                'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300': activeTab !== 'create'
              }"
              class="flex-1 py-4 px-6 text-center border-b-2 font-medium text-sm transition-colors"
            >
              ✨ Create New
            </button>
          </nav>
        </div>

        <!-- Tab Content -->
        <div class="bg-white px-6 py-6 max-h-96 overflow-y-auto">
          <!-- Tab 1: Select Existing -->
          <div v-if="activeTab === 'select'" class="space-y-4">
            <div v-if="loading" class="text-center py-8">
              <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p class="mt-4 text-gray-600">Loading projects...</p>
            </div>

            <div v-else-if="recentProjects.length === 0" class="text-center py-8">
              <div class="text-6xl mb-4">📂</div>
              <h4 class="text-lg font-semibold text-gray-900 mb-2">No Projects Yet</h4>
              <p class="text-gray-600 mb-4">Create your first cadastral project to get started</p>
              <button
                @click="activeTab = 'create'"
                class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Create First Project
              </button>
            </div>

            <div v-else class="space-y-3">
              <label
                v-for="project in recentProjects"
                :key="project.id"
                class="flex items-start p-4 border-2 rounded-lg cursor-pointer hover:bg-blue-50 transition-all"
                :class="{
                  'border-blue-500 bg-blue-50': selectedProjectId === project.id,
                  'border-gray-200': selectedProjectId !== project.id
                }"
              >
                <input
                  type="radio"
                  :value="project.id"
                  v-model="selectedProjectId"
                  class="mt-1 mr-3"
                />
                <div class="flex-1">
                  <div class="font-semibold text-gray-900">{{ project.name }}</div>
                  <div class="text-sm text-gray-600 mt-1 space-y-0.5">
                    <div v-if="project.client_name">Client: {{ project.client_name }}</div>
                    <div v-if="project.district">District: {{ project.district }}</div>
                    <div v-if="project.survey_type">Type: {{ project.survey_type }}</div>
                    <div v-if="project.last_used" class="text-xs text-gray-500 mt-1">
                      Last used: {{ formatRelativeTime(project.last_used) }}
                    </div>
                  </div>
                </div>
              </label>

              <button
                v-if="!showAllProjects && allProjects.length > recentProjects.length"
                @click="loadAllProjects"
                class="w-full py-2 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors"
              >
                Show All Projects ({{ allProjects.length }})
              </button>
            </div>
          </div>

          <!-- Tab 2: Create New -->
          <div v-if="activeTab === 'create'" class="space-y-4">
            <!-- Project Name -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Project Name <span class="text-red-500">*</span>
              </label>
              <input
                v-model="createForm.name"
                type="text"
                required
                class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                :class="{ 'border-red-500': validationErrors.name }"
                placeholder="e.g., Elon Estates Gwelo"
                @input="clearValidationError('name')"
              />
              <p v-if="validationErrors.name" class="mt-1 text-sm text-red-600">{{ validationErrors.name }}</p>
            </div>

            <!-- Client Name -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Client Name
              </label>
              <input
                v-model="createForm.client_name"
                type="text"
                class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., Elon Musk"
              />
            </div>

            <!-- District and Survey Type -->
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  District
                </label>
                <input
                  v-model="createForm.district"
                  type="text"
                  class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., Gwelo"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  Survey Type
                </label>
                <select
                  v-model="createForm.survey_type"
                  class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="Cadastral">Cadastral</option>
                  <option value="Topographical">Topographical</option>
                  <option value="Engineering">Engineering</option>
                  <option value="Mining">Mining</option>
                  <option value="Control Survey">Control Survey</option>
                  <option value="Subdivision">Subdivision</option>
                </select>
              </div>
            </div>

            <!-- Survey Date -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Survey Date
              </label>
              <input
                v-model="createForm.survey_date"
                type="date"
                class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <!-- Advanced Configuration (Collapsible) -->
            <div class="border-t border-gray-200 pt-4">
              <button
                @click="showAdvanced = !showAdvanced"
                class="flex items-center justify-between w-full text-left text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                <span>⚙️ Advanced Configuration</span>
                <span class="text-gray-400">{{ showAdvanced ? '▼' : '▶' }}</span>
              </button>

              <div v-if="showAdvanced" class="mt-4 space-y-4">
                <!-- Info about Control Points -->
                <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div class="flex items-start gap-3">
                    <span class="text-2xl">ℹ️</span>
                    <div>
                      <h4 class="text-sm font-semibold text-blue-900 mb-1">Control Points & Meridian</h4>
                      <p class="text-sm text-blue-700">
                        You'll select control points and central meridian <strong>after importing your CSV data</strong>. 
                        The system will auto-detect the correct Lo zone based on your survey coordinates and show distances to all control points.
                      </p>
                    </div>
                  </div>
                </div>

                <!-- Working Directory -->
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">
                    Working Directory (auto-generated)
                  </label>
                  <div class="px-4 py-2 bg-gray-50 border border-gray-300 rounded-md text-sm text-gray-600">
                    {{ autoGeneratedWorkingDirectory }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="bg-gray-50 px-6 py-4 flex justify-between items-center">
          <button
            type="button"
            @click="handleCancel"
            class="px-4 py-2 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
          >
            Cancel
          </button>

          <button
            v-if="activeTab === 'select'"
            @click="handleContinueWithSelected"
            :disabled="!selectedProjectId"
            :class="{
              'bg-blue-600 hover:bg-blue-700': selectedProjectId,
              'bg-gray-400 cursor-not-allowed': !selectedProjectId
            }"
            class="px-6 py-2 rounded-md text-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
          >
            Continue →
          </button>

          <button
            v-if="activeTab === 'create'"
            @click="handleCreateProject"
            :disabled="isCreating || !isCreateFormValid"
            :class="{
              'bg-blue-600 hover:bg-blue-700': !isCreating && isCreateFormValid,
              'bg-gray-400 cursor-not-allowed': isCreating || !isCreateFormValid
            }"
            class="px-6 py-2 rounded-md text-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors flex items-center gap-2"
          >
            <span v-if="isCreating" class="animate-spin">⏳</span>
            <span>{{ isCreating ? 'Creating...' : 'Create & Continue →' }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import api from '../../services/api';

interface SurveyProject {
  id: number;
  name: string;
  client_name?: string;
  district?: string;
  survey_type?: string;
  survey_date?: string;
  last_used?: string;
  working_directory?: string;
  central_meridian?: number;
  control_point_ids?: number[];
}

interface Props {
  isOpen: boolean;
  surveyorProfileId?: number;
  lastProjectId?: number;
}

interface Emits {
  (e: 'project-selected', project: SurveyProject): void;
  (e: 'project-created', project: SurveyProject): void;
  (e: 'cancel'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// State
const activeTab = ref<'select' | 'create'>('select');
const loading = ref(false);
const recentProjects = ref<SurveyProject[]>([]);
const allProjects = ref<SurveyProject[]>([]);
const showAllProjects = ref(false);
const selectedProjectId = ref<number | null>(props.lastProjectId || null);

// Create form
const createForm = ref({
  name: '',
  client_name: '',
  district: '',
  survey_type: 'Cadastral',
  survey_date: new Date().toISOString().split('T')[0],
  designation: '',
  working_directory: '',
  instruments: ''
});

const showAdvanced = ref(false);
const isCreating = ref(false);
const validationErrors = ref<Record<string, string>>({});

// Computed
const autoGeneratedWorkingDirectory = computed(() => {
  if (!createForm.value.name) return 'Documents/SurveyPro/Projects/...';
  
  const slug = createForm.value.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  
  const date = createForm.value.survey_date || new Date().toISOString().split('T')[0];
  
  return `Documents/SurveyPro/Projects/${slug}_${date}`;
});

const isCreateFormValid = computed(() => {
  return createForm.value.name.trim() !== '';
});

// Methods
async function loadRecentProjects() {
  if (!props.surveyorProfileId) return;
  
  loading.value = true;
  try {
    const response = await api.get(`/survey-projects/recent?limit=5`);
    recentProjects.value = response.data.data || [];
    
    // Auto-select last used project if provided
    if (props.lastProjectId && recentProjects.value.some(p => p.id === props.lastProjectId)) {
      selectedProjectId.value = props.lastProjectId;
    }
  } catch (error) {
    console.error('Failed to load recent projects:', error);
  } finally {
    loading.value = false;
  }
}

async function loadAllProjects() {
  if (!props.surveyorProfileId) return;
  
  try {
    const response = await api.get('/survey-projects');
    allProjects.value = response.data.projects || [];
    showAllProjects.value = true;
  } catch (error) {
    console.error('Failed to load all projects:', error);
  }
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

function clearValidationError(field: string) {
  delete validationErrors.value[field];
}

function validateCreateForm(): boolean {
  validationErrors.value = {};
  
  if (!createForm.value.name.trim()) {
    validationErrors.value.name = 'Project name is required';
  }
  
  return Object.keys(validationErrors.value).length === 0;
}

async function handleCreateProject() {
  if (!validateCreateForm()) return;
  
  isCreating.value = true;
  
  try {
    const response = await api.post('/survey-projects', {
      name: createForm.value.name,
      clientName: createForm.value.client_name,
      district: createForm.value.district,
      surveyType: createForm.value.survey_type,
      surveyDate: createForm.value.survey_date,
      designation: createForm.value.designation,
      workingDirectory: autoGeneratedWorkingDirectory.value,
      instruments: createForm.value.instruments
    });
    
    const newProject = response.data.project;
    emit('project-created', newProject);
  } catch (error: any) {
    console.error('Failed to create project:', error);
    alert(`Failed to create project: ${error.response?.data?.error || error.message}`);
  } finally {
    isCreating.value = false;
  }
}

function handleContinueWithSelected() {
  const project = recentProjects.value.find(p => p.id === selectedProjectId.value)
    || allProjects.value.find(p => p.id === selectedProjectId.value);
  
  if (project) {
    emit('project-selected', project);
  }
}

function handleCancel() {
  emit('cancel');
}

// Load projects when modal opens
watch(() => props.isOpen, (isOpen) => {
  if (isOpen) {
    loadRecentProjects();
  }
});

onMounted(() => {
  if (props.isOpen) {
    loadRecentProjects();
  }
});
</script>
