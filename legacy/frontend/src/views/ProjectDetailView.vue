<template>
  <AppLayout>
    <div class="p-4 md:p-8">
      <div v-if="projectsStore.loading" class="text-center py-12">
        <p class="text-gray-600">Loading project...</p>
      </div>

      <div v-else-if="!projectsStore.currentProject" class="text-center py-12">
        <p class="text-error">Project not found</p>
        <RouterLink to="/projects" class="btn btn-primary mt-4">
          Back to Projects
        </RouterLink>
      </div>

      <div v-else>
        <div class="mb-6">
          <RouterLink to="/projects" class="text-primary-600 hover:text-primary-700 mb-2 inline-block">
            ← Back to Projects
          </RouterLink>
          <h1 class="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
            {{ projectsStore.currentProject.name }}
          </h1>
          <p class="text-gray-600">{{ projectsStore.currentProject.description || 'No description' }}</p>
        </div>

        <!-- Project Info -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div class="card">
            <h3 class="text-sm font-medium text-gray-600 mb-1">Coordinate System</h3>
            <p class="text-lg font-bold text-gray-900">{{ projectsStore.currentProject.coordinate_system }}</p>
          </div>

          <div class="card">
            <h3 class="text-sm font-medium text-gray-600 mb-1">Status</h3>
            <p class="text-lg font-bold" :class="projectsStore.currentProject.is_active ? 'text-success' : 'text-gray-600'">
              {{ projectsStore.currentProject.is_active ? 'Active' : 'Inactive' }}
            </p>
          </div>

          <div class="card">
            <h3 class="text-sm font-medium text-gray-600 mb-1">Created</h3>
            <p class="text-lg font-bold text-gray-900">{{ formatDate(projectsStore.currentProject.created_at) }}</p>
          </div>
        </div>

        <!-- Tabs -->
        <div class="card">
          <div class="border-b border-gray-200 mb-4">
            <nav class="flex space-x-4">
              <button
                v-for="tab in tabs"
                :key="tab.id"
                @click="activeTab = tab.id"
                class="px-4 py-2 font-medium transition-colors"
                :class="activeTab === tab.id
                  ? 'text-primary-700 border-b-2 border-primary-700'
                  : 'text-gray-600 hover:text-gray-900'"
              >
                {{ tab.label }}
              </button>
            </nav>
          </div>

          <!-- Survey Points Tab -->
          <div v-if="activeTab === 'points'" class="space-y-4">
            <div class="flex justify-between items-center">
              <h3 class="text-lg font-bold text-gray-900">Survey Points</h3>
              <button class="btn btn-primary">Add Point</button>
            </div>
            <p class="text-gray-600">No survey points yet. Add your first point to get started.</p>
          </div>

          <!-- CAD Entities Tab -->
          <div v-if="activeTab === 'cad'" class="space-y-4">
            <div class="flex justify-between items-center">
              <h3 class="text-lg font-bold text-gray-900">CAD Entities</h3>
              <button class="btn btn-primary">Draw Entity</button>
            </div>
            <p class="text-gray-600">No CAD entities yet. Start drawing to create entities.</p>
          </div>

          <!-- Field Book Tab -->
          <div v-if="activeTab === 'fieldbook'" class="space-y-4">
            <div class="flex justify-between items-center">
              <h3 class="text-lg font-bold text-gray-900">Field Book</h3>
              <RouterLink 
                :to="`/projects/${projectsStore.currentProject.id}/field-book`" 
                class="btn btn-primary"
              >
                Open Field Book
              </RouterLink>
            </div>
            <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 class="font-semibold text-blue-900 mb-2">📋 Field Book Management</h4>
              <p class="text-blue-800 text-sm mb-3">
                Import and manage your survey field book data. Upload CSV files with survey points including:
              </p>
              <ul class="text-blue-800 text-sm list-disc list-inside space-y-1 mb-3">
                <li>Point names and coordinates (Y Westing, X Southing)</li>
                <li>Monument status (Found/Placed)</li>
                <li>Descriptions and survey dates</li>
                <li>Calculation page references</li>
              </ul>
              <p class="text-blue-800 text-sm font-medium">
                Click "Open Field Book" to upload data, view entries, and generate field book documents.
              </p>
            </div>
          </div>

          <!-- Computations Tab -->
          <div v-if="activeTab === 'computations'" class="space-y-4">
            <div class="flex justify-between items-center">
              <h3 class="text-lg font-bold text-gray-900">Computations</h3>
              <RouterLink to="/computations" class="btn btn-primary">New Computation</RouterLink>
            </div>
            <p class="text-gray-600">No computations yet. Run your first computation.</p>
          </div>

          <!-- Settings Tab -->
          <div v-if="activeTab === 'settings'" class="space-y-4">
            <h3 class="text-lg font-bold text-gray-900">Project Settings</h3>
            <form class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Project Name</label>
                <input type="text" :value="projectsStore.currentProject.name" class="input" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea :value="projectsStore.currentProject.description" rows="3" class="input"></textarea>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Coordinate System</label>
                <input type="text" :value="projectsStore.currentProject.coordinate_system" class="input" />
              </div>
              <div class="flex gap-3">
                <button type="button" class="btn btn-secondary">Cancel</button>
                <button type="submit" class="btn btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { useProjectsStore } from '@/stores/projects'
import AppLayout from '@/components/AppLayout.vue'

const route = useRoute()
const projectsStore = useProjectsStore()
const activeTab = ref('points')

const tabs = [
  { id: 'points', label: 'Survey Points' },
  { id: 'cad', label: 'CAD Entities' },
  { id: 'fieldbook', label: 'Field Book' },
  { id: 'computations', label: 'Computations' },
  { id: 'settings', label: 'Settings' }
]

function formatDate(dateString: string) {
  const date = new Date(dateString)
  return date.toLocaleDateString()
}

onMounted(() => {
  const projectId = parseInt(route.params.id as string)
  projectsStore.fetchProject(projectId)
})
</script>
