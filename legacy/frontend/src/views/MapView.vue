<template>
  <AppLayout>
    <div class="h-full flex flex-col">
      <!-- Map Controls -->
      <div class="bg-white border-b border-gray-200 p-4">
        <div class="flex items-center justify-between">
          <h1 class="text-xl font-bold text-gray-900">Map View</h1>
          <div class="flex gap-2">
            <select class="input py-2">
              <option value="">Select Project</option>
              <option v-for="project in projectsStore.projects" :key="project.id" :value="project.id">
                {{ project.name }}
              </option>
            </select>
            <button class="btn btn-primary">Add Layer</button>
          </div>
        </div>
      </div>

      <!-- Map Container -->
      <div class="flex-1 relative">
        <div ref="mapContainer" class="absolute inset-0 bg-gray-200">
          <div class="flex items-center justify-center h-full">
            <div class="text-center">
              <p class="text-gray-600 mb-2">Map integration with Leaflet</p>
              <p class="text-sm text-gray-500">Install Leaflet dependencies to enable map view</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useProjectsStore } from '@/stores/projects'
import AppLayout from '@/components/AppLayout.vue'

const projectsStore = useProjectsStore()
const mapContainer = ref<HTMLElement>()

onMounted(() => {
  projectsStore.fetchProjects()
  // TODO: Initialize Leaflet map here
  // import L from 'leaflet'
  // const map = L.map(mapContainer.value).setView([51.505, -0.09], 13)
  // L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)
})
</script>
