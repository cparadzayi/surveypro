<template>
  <AppLayout>
    <div class="container mx-auto p-4">
      <div class="mb-4">
        <RouterLink to="/projects" class="text-primary-600 hover:text-primary-700">
          ← Back to Projects
        </RouterLink>
      </div>
      
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-2xl font-bold">
          Field Book: {{ project?.name || 'Loading...' }}
        </h1>
        <div class="tabs tabs-boxed">
          <button 
            v-for="tab in tabs" 
            :key="tab.id"
            class="tab" 
            :class="{ 'tab-active': activeTab === tab.id }"
            @click="activeTab = tab.id"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>

    <div
      v-if="isLoading"
      class="flex justify-center my-8"
    >
      <span class="loading loading-spinner loading-lg" />
    </div>

    <div v-else>
      <!-- Upload Tab -->
      <div v-if="activeTab === 'upload'">
        <FieldBookUpload 
          :project-id="Number($route.params.projectId)" 
          @uploaded="loadFieldData" 
        />
      </div>

      <!-- View Tab -->
      <div v-else-if="activeTab === 'view'">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-xl font-semibold">
            Field Data
          </h2>
          <div class="join">
            <button 
              class="join-item btn" 
              :disabled="currentPage === 1" 
              @click="currentPage--"
            >
              «
            </button>
            <button class="join-item btn">
              Page {{ currentPage }}
            </button>
            <button 
              class="join-item btn" 
              :disabled="currentPage >= totalPages" 
              @click="currentPage++"
            >
              »
            </button>
          </div>
        </div>

        <div v-if="fieldData.length === 0" class="alert alert-info">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          <span>No field data available. Please upload a CSV file first.</span>
        </div>

        <div v-else class="overflow-x-auto">
          <table class="table table-zebra w-full">
            <thead>
              <tr>
                <th>Point</th>
                <th>Y (Westing)</th>
                <th>X (Southing)</th>
                <th>Status</th>
                <th>Calcs Page</th>
                <th>Description</th>
                <th>Date of Survey</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in paginatedData"
                :key="item.id"
              >
                <td>{{ item.point || '-' }}</td>
                <td>{{ item.y ? item.y.toFixed(3) : '-' }}</td>
                <td>{{ item.x ? item.x.toFixed(3) : '-' }}</td>
                <td>
                  <span
                    v-if="item.status"
                    :class="{
                      'badge badge-success': item.status === 'F',
                      'badge badge-warning': item.status === 'P'
                    }"
                  >
                    {{ item.status === 'F' ? 'Found' : 'Placed' }}
                  </span>
                  <span v-else>-</span>
                </td>
                <td>{{ item.calcs_page || '-' }}</td>
                <td>{{ item.description || '-' }}</td>
                <td>{{ item.date_of_survey ? new Date(item.date_of_survey).toLocaleDateString() : '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Generate Tab -->
      <div v-else-if="activeTab === 'generate'">
        <div class="card bg-base-100 shadow-xl">
          <div class="card-body">
            <h2 class="card-title">
              Generate Field Book
            </h2>
            <p>Generate and download the field book in your preferred format.</p>
            
            <div class="form-control w-full max-w-xs mb-4">
              <label class="label">
                <span class="label-text">Select Format</span>
              </label>
              <select v-model="selectedFormat" class="select select-bordered">
                <option value="json">JSON (Data)</option>
                <option value="pdf">PDF (Printable)</option>
                <option value="geojson">GeoJSON (GIS)</option>
              </select>
            </div>

            <div class="alert alert-info mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              <div>
                <h3 class="font-bold">Format Information</h3>
                <div class="text-xs">
                  <p v-if="selectedFormat === 'json'">JSON format contains structured data for further processing.</p>
                  <p v-if="selectedFormat === 'pdf'">PDF format creates a printable field book with cover page and survey data table.</p>
                  <p v-if="selectedFormat === 'geojson'">GeoJSON format is compatible with GIS software like QGIS and ArcGIS.</p>
                </div>
              </div>
            </div>

            <div class="card-actions justify-end mt-4">
              <button 
                class="btn btn-primary" 
                :class="{ 'loading': isGenerating }"
                :disabled="fieldData.length === 0 || isGenerating"
                @click="generateFieldBook"
              >
                <svg v-if="!isGenerating" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download {{ selectedFormat.toUpperCase() }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { useSurveyStore } from '@/stores/survey'
import AppLayout from '@/components/AppLayout.vue'
import FieldBookUpload from '@/components/fieldbook/FieldBookUpload.vue'

const route = useRoute()
const surveyStore = useSurveyStore()

const activeTab = ref('upload')
const currentPage = ref(1)
const itemsPerPage = 20
const selectedFormat = ref<'json' | 'pdf' | 'geojson'>('pdf')
const isGenerating = ref(false)

const tabs = [
  { id: 'upload', label: 'Upload Data' },
  { id: 'view', label: 'View Data' },
  { id: 'generate', label: 'Generate Field Book' }
]

// Computed properties
const project = computed(() => surveyStore.currentProject)
const fieldData = computed(() => surveyStore.fieldData)
const isLoading = computed(() => surveyStore.isLoading)
const totalPages = computed(() => Math.ceil(fieldData.value.length / itemsPerPage))

const paginatedData = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage
  const end = start + itemsPerPage
  return fieldData.value.slice(start, end)
})

// Methods
const loadFieldData = async () => {
  try {
    await surveyStore.loadProject(Number(route.params.projectId))
    activeTab.value = 'view'
  } catch (error) {
    console.error('Failed to load project data:', error)
  }
}

const generateFieldBook = async () => {
  try {
    isGenerating.value = true
    const projectId = Number(route.params.projectId)
    const projectName = project.value?.name || 'survey'
    
    if (selectedFormat.value === 'json') {
      // Generate JSON format
      const response = await surveyStore.generateFieldBook(projectId, 'json')
      const url = window.URL.createObjectURL(new Blob([JSON.stringify(response, null, 2)], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `fieldbook_${projectName}.json`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } else {
      // Generate PDF or GeoJSON format
      await surveyStore.downloadFieldBook(projectId, selectedFormat.value, `fieldbook_${projectName}.${selectedFormat.value}`)
    }
  } catch (error) {
    console.error('Failed to generate field book:', error)
    alert('Failed to generate field book. Please try again.')
  } finally {
    isGenerating.value = false
  }
}

// Lifecycle hooks
onMounted(() => {
  if (route.query.tab && tabs.some(tab => tab.id === route.query.tab)) {
    activeTab.value = route.query.tab as string
  }
  loadFieldData()
})
</script>
