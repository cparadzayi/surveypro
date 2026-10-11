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

    <!-- The job the surveyor arrived with from the council system -->
    <section v-if="job" class="rounded-lg border border-indigo-200 bg-indigo-50 p-4 space-y-2" aria-labelledby="job-heading" data-test="job-banner">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 id="job-heading" class="text-sm font-semibold text-indigo-900">Your job from {{ job.authorityName }}</h3>
          <p class="text-sm text-indigo-900">
            {{ job.standNumber || job.projectName }}<span v-if="job.ward"> · {{ job.ward }}</span><span v-if="job.dueDate"> · due {{ job.dueDate }}</span><span v-if="job.engagement"> · {{ job.engagement }}</span>
          </p>
          <p v-if="job.instructions" class="text-sm text-indigo-800">{{ job.instructions }}</p>
        </div>
        <button type="button" class="text-xs text-indigo-700 hover:underline" @click="dismissJob">Dismiss</button>
      </div>
      <div class="flex flex-wrap gap-3 text-sm">
        <button type="button" class="px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700" @click="openJob">Open the project</button>
        <router-link :to="`/projects/${job.projectId}/delivery`" class="px-3 py-1.5 rounded-md border border-indigo-300 text-indigo-800 hover:bg-white">Deliver</router-link>
      </div>
    </section>

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
      <div v-else-if="projects.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="project in projects"
          :key="project.id"
          class="bg-white border border-gray-200 rounded-lg p-5 hover:shadow-lg hover:border-indigo-300 transition-all cursor-pointer group"
          @click="selectProject(project)"
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
              <span>📍</span>
              <span>{{ project.district }}</span>
            </div>
            <div v-if="project.survey_type" class="flex items-center gap-2 text-gray-600">
              <span>🔧</span>
              <span>{{ project.survey_type }}</span>
            </div>
            <div v-if="project.survey_date" class="flex items-center gap-2 text-gray-600">
              <span>📅</span>
              <span>{{ formatDateDDMMYYYY(new Date(project.survey_date)) }}</span>
            </div>
          </div>

          <div class="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
            <span class="text-xs text-gray-500">
              Created {{ formatDateDDMMYYYY(new Date(project.created_at)) }}
            </span>
            <span class="flex items-center gap-3">
              <router-link :to="`/projects/${project.id}/delivery`" class="text-xs text-gray-600 hover:text-indigo-700 hover:underline" @click.stop>Deliver</router-link>
              <span class="text-indigo-600 group-hover:text-indigo-700 text-sm font-medium">Open →</span>
            </span>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else class="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
        <div class="text-5xl mb-4">📁</div>
        <h3 class="text-lg font-semibold text-gray-900 mb-2">No Projects Yet</h3>
        <p class="text-gray-600 mb-4">Start the Cadastral Standard workflow to create your first project</p>
        <router-link
          to="/modules/cadastral-standard/workflow"
          class="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors inline-flex items-center gap-2 font-medium shadow-sm"
        >
          <span class="text-xl">🚀</span>
          Start Cadastral Workflow
        </router-link>
      </div>
    </section>

    <!-- Councils: shown to anyone appointed to one -->
    <section v-if="mine.length" class="space-y-3" aria-labelledby="councils-heading">
      <h3 id="councils-heading" class="text-sm font-semibold uppercase tracking-wide text-gray-700">Your councils</h3>
      <div class="flex flex-wrap items-center gap-3 text-sm">
        <span v-for="c in councilNames" :key="c" class="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-800 text-xs font-medium">{{ c }}</span>
        <router-link to="/council/appointments" class="text-indigo-600 hover:underline">Appointments</router-link>
        <router-link v-if="canReview" to="/council/reviews" class="text-indigo-600 hover:underline">Reviews</router-link>
      </div>
    </section>

    <!-- Quick Access Modules -->
    <section aria-labelledby="modules-heading" class="space-y-3">
      <div class="flex items-center justify-between">
        <h3 id="modules-heading" class="text-sm font-semibold uppercase tracking-wide text-gray-700">Quick Access</h3>
        <span class="text-[10px] text-gray-400">Tap a module to open</span>
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
import { mayReview, myAppointments, type MyAppointment } from '../services/council'
import { launchedJob, forgetLaunchedJob, type LaunchedJob } from '../services/launchedJob'
// @ts-ignore - SFC default export provided via shim
import ModuleCard from '../components/ModuleCard.vue'

const auth = useAuthStore()
const router = useRouter()
const modulesStore = useModulesStore()
const projectSelectionStore = useProjectSelectionStore()
const { surveyProjects: projects, loading: loadingProjects, fetchSurveyProjects } = useSurveyors()

const modules = computed(() => modulesStore.accessibleModules)

// councils the person is appointed to (empty for private practice: the section stays hidden)
const mine = ref<MyAppointment[]>([])
const councilNames = computed(() => [...new Set(mine.value.filter((a) => a.active).map((a) => a.name))])
const canReview = computed(() => mayReview(mine.value))
myAppointments().then((a) => { mine.value = a }).catch(() => { /* councils are optional: the dashboard works without them */ })

// the job this session was launched with (from the council system), until dismissed
const job = ref<LaunchedJob | null>(launchedJob())
function dismissJob() { forgetLaunchedJob(); job.value = null }
function openJob() {
  if (!job.value) return
  const p = (projects.value || []).find((x: any) => Number(x.id) === job.value!.projectId)
  if (p) projectSelectionStore.selectProject(p as any)   // the list's rows are the same projects, typed more loosely
  router.push('/modules/cadastral-standard/workflow')
}

async function loadProjects() {
  console.log('📊 Loading projects - Token:', auth.token ? '✅' : '❌', 'Surveyor:', auth.isSurveyor ? '✅' : '❌')
  // Don't pass ID - let backend auto-filter by authenticated user
  await fetchSurveyProjects()
}

function selectProject(project: any) {
  console.log('📂 [Dashboard] Selected project:', project.name, 'ID:', project.id)
  
  // ✅ NEW: Use Pinia store for centralized state management
  projectSelectionStore.selectProject(project)
  
  console.log('✅ [Dashboard] Project saved to store and localStorage')
  
  // Navigate to the most relevant module based on survey type
  if (project.survey_type?.toLowerCase().includes('cadastral')) {
    console.log('🚀 [Dashboard] Navigating to Cadastral workflow...')
    router.push('/modules/cadastral-standard/workflow')
  } else {
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
