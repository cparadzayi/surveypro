<template>
  <div class="space-y-6">
    <!-- Welcome Header -->
    <header class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
      <div>
        <h2 class="text-2xl font-semibold tracking-tight">Dashboard</h2>
        <p class="text-sm text-gray-600" v-if="auth.currentSurveyor">
          Welcome back, {{ auth.currentSurveyor.name }}
        </p>
        <p class="text-sm text-gray-500" v-else>Loading profile…</p>
      </div>
      <div v-if="auth.profile" class="text-xs text-gray-500">
        Joined: {{ formatDateDDMMYYYY(new Date(auth.profile.created_at)) }}
      </div>
    </header>

    <!-- Projects Section -->
    <section v-if="auth.isSurveyor" class="space-y-4">
      <div>
        <h3 class="text-lg font-semibold text-gray-900">Your Projects</h3>
        <p class="text-sm text-gray-600">Select a project to work in</p>
      </div>

      <!-- Loading State -->
      <div v-if="loadingProjects" class="flex items-center justify-center py-12">
        <svg class="animate-spin h-8 w-8 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>

      <!-- Projects Grid -->
      <template v-else-if="projects.length > 0">
      <!-- Find and order projects once there are enough to need it -->
      <div v-if="projects.length > 3" class="flex flex-col sm:flex-row gap-3" role="search">
        <div class="flex-1">
          <label for="project-search" class="sr-only">Search projects</label>
          <input
            id="project-search"
            v-model="projectQuery"
            type="search"
            placeholder="Search by name, client, district or type…"
            class="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
        <div>
          <label for="project-sort" class="sr-only">Sort projects</label>
          <select id="project-sort" v-model="projectSort" class="px-3 py-2 border border-gray-300 rounded-lg text-sm">
            <option v-for="(label, key) in PROJECT_SORT_LABELS" :key="key" :value="key">{{ label }}</option>
          </select>
        </div>
      </div>
      <p v-if="visibleProjects.length === 0" class="text-sm text-gray-600" role="status">No project matches “{{ projectQuery }}”.</p>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="project in visibleProjects"
          :key="project.id"
          role="button"
          tabindex="0"
          :aria-label="`Open project ${project.name}`"
          class="bg-white border border-gray-200 rounded-lg p-5 hover:shadow-lg hover:border-indigo-300 transition-all cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          @click="selectProject(project)"
          @keydown.enter.prevent="selectProject(project)"
          @keydown.space.prevent="selectProject(project)"
        >
          <div class="flex items-start justify-between mb-3">
            <div class="flex-1">
              <h4 class="font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">{{ project.name }}</h4>
              <p v-if="project.client_name" class="text-sm text-gray-600 mt-1">{{ project.client_name }}</p>
            </div>
            <span class="text-2xl" title="Survey Project">📋</span>
          </div>
          
          <div class="space-y-1.5 text-sm">
            <div v-if="project.district" class="flex items-center gap-2 text-gray-600">
              <span aria-hidden="true">📍</span>
              <span>{{ project.district }}</span>
            </div>
            <div v-if="project.survey_type" class="flex items-center gap-2 text-gray-600">
              <span aria-hidden="true">🔧</span>
              <span>{{ project.survey_type }}</span>
            </div>
            <div v-if="project.survey_date" class="flex items-center gap-2 text-gray-600">
              <span aria-hidden="true">📅</span>
              <span>{{ formatDateDDMMYYYY(new Date(project.survey_date)) }}</span>
            </div>
          </div>

          <!-- How far through the workflow: a bar for the eye, words for everyone -->
          <div class="mt-3" data-testid="project-progress">
            <div
              class="h-1.5 rounded-full bg-gray-100 overflow-hidden"
              role="progressbar"
              :aria-valuenow="progressOf(project).done"
              aria-valuemin="0"
              :aria-valuemax="progressOf(project).total"
              :aria-label="`Workflow progress for ${project.name}`"
            >
              <div class="h-full bg-indigo-500" :style="{ width: (progressOf(project).done / progressOf(project).total * 100) + '%' }"></div>
            </div>
            <p class="mt-1 text-xs text-gray-600">
              {{ progressOf(project).done }} of {{ progressOf(project).total }} steps done<template v-if="progressOf(project).next"> · Next: {{ progressOf(project).next }}</template><template v-else> · Complete</template>
            </p>
          </div>

          <div class="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
            <span class="text-xs text-gray-500">
              <template v-if="project.last_used">Last opened {{ formatDateDDMMYYYY(new Date(project.last_used)) }}</template>
              <template v-else>Created {{ formatDateDDMMYYYY(new Date(project.created_at)) }}</template>
            </span>
            <span class="text-indigo-600 group-hover:text-indigo-700 text-sm font-medium">
              Open →
            </span>
          </div>
        </div>
      </div>
      </template>

      <!-- Empty State -->
      <div v-else-if="canUseCadastral" class="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
        <div aria-hidden="true" class="text-5xl mb-4">📁</div>
        <h3 class="text-lg font-semibold text-gray-900 mb-2">No Projects Yet</h3>
        <p class="text-gray-600 mb-4">Start the Cadastral Standard workflow to create your first project</p>
        <router-link
          to="/modules/cadastral-standard/workflow"
          class="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors inline-flex items-center gap-2 font-medium shadow-sm"
        >
          <span aria-hidden="true" class="text-xl">🚀</span>
          Start Cadastral Workflow
        </router-link>
      </div>
      <div v-else class="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
        <div aria-hidden="true" class="text-5xl mb-4">📁</div>
        <h3 class="text-lg font-semibold text-gray-900 mb-2">No Projects Yet</h3>
        <p class="text-gray-600">Projects are created in the Cadastral workflow, which your account type cannot open. Use the modules below, or ask a registered surveyor to set a project up for you.</p>
      </div>
    </section>

    <!-- Quick Access Modules -->
    <section aria-labelledby="modules-heading" class="space-y-3">
      <div class="flex items-center justify-between">
        <h3 id="modules-heading" class="text-sm font-semibold uppercase tracking-wide text-gray-700">Quick Access</h3>
        <span class="text-xs text-gray-500">Tap a module to open</span>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <ModuleCard v-for="m in modules.slice(0, 4)" :key="m.slug" :module="m" />
      </div>
    </section>

  </div>
</template>

<script setup lang="ts">
import { onMounted, computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useModulesStore } from '../stores/modules'
import { useProjectSelectionStore } from '../stores/projectSelection'
import { useSurveyors } from '../composables/useSurveyors'
import { formatDateDDMMYYYY } from '../utils/dateFormat'
import { notifyInfo } from '../composables/useNotifications'
import api from '../services/api'
import { projectProgress } from '../utils/projectProgress'
import { filterAndSortProjects, PROJECT_SORT_LABELS, type ProjectSort } from '../utils/projectList'
// @ts-ignore - SFC default export provided via shim
import ModuleCard from '../components/ModuleCard.vue'

const auth = useAuthStore()
const router = useRouter()
const modulesStore = useModulesStore()
const projectSelectionStore = useProjectSelectionStore()
const { surveyProjects: projects, loading: loadingProjects, fetchSurveyProjects } = useSurveyors()

const modules = computed(() => modulesStore.accessibleModules)
const progressOf = (p: { workflow_state?: unknown }) => projectProgress(p.workflow_state)
const projectQuery = ref('')
const projectSort = ref<ProjectSort>('recent')
const visibleProjects = computed(() => filterAndSortProjects([...projects.value], projectQuery.value, projectSort.value))
// The cadastral workflow is limited by account type; a technician or student has no way into it.
const canUseCadastral = computed(() => modules.value.some(m => m.slug === 'cadastral-standard'))

async function loadProjects() {
  console.log('📊 Loading projects - Token:', auth.token ? '✅' : '❌', 'Surveyor:', auth.isSurveyor ? '✅' : '❌')
  // Don't pass ID - let backend auto-filter by authenticated user
  await fetchSurveyProjects()
}

function selectProject(project: any) {
  console.log('📂 [Dashboard] Selected project:', project.name, 'ID:', project.id)
  
  // ✅ NEW: Use Pinia store for centralized state management
  projectSelectionStore.selectProject(project)
  // Remember that it was opened, so "Recently opened" and "Last opened" mean something. Best effort.
  void api.post(`/survey-projects/${project.id}/touch`).catch(() => {})
  
  console.log('✅ [Dashboard] Project saved to store and localStorage')
  
  // Navigate to the most relevant module based on survey type
  if (project.survey_type?.toLowerCase().includes('cadastral') && canUseCadastral.value) {
    console.log('🚀 [Dashboard] Navigating to Cadastral workflow...')
    router.push('/modules/cadastral-standard/workflow')
  } else {
    if (project.survey_type?.toLowerCase().includes('cadastral')) {
      notifyInfo('Your account type does not include the Cadastral workflow, so this project opened in Lite.', { title: project.name })
    }
    console.log('🚀 [Dashboard] Navigating to Lite module...')
    router.push('/modules/lite')
  }
}

// Watch for auth token to become available and load projects
// Don't use immediate: true to avoid race condition with session restoration
watch(() => auth.token, async (newToken, oldToken) => {
  // Only load when token becomes available (not null -> has value)
  if (newToken && !oldToken && auth.isSurveyor && projects.value.length === 0) {
    console.log('🔑 Token became available, loading projects...')
    await loadProjects()
  }
})

onMounted(async () => {
  // If token is already available on mount (after router guard restored session)
  if (auth.token && auth.isSurveyor) {
    console.log('🔑 Token already available on mount, loading projects...')
    await loadProjects()
  } else {
    console.log('⏳ Waiting for token to be restored...')
  }
})
</script>
