<template>
  <AppLayout>
    <div class="p-4 md:p-8">
      <div class="mb-6">
        <h1 class="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
          Welcome to SurveyPro Dashboard
        </h1>
        <p class="text-gray-600">Here's what's happening with your projects today.</p>
      </div>

      <!-- Quick Stats -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div class="card">
          <h3 class="text-sm font-medium text-gray-600 mb-1">Total Projects</h3>
          <p class="text-3xl font-bold text-primary-700">{{ projectsStore.projects.length }}</p>
        </div>

        <div class="card">
          <h3 class="text-sm font-medium text-gray-600 mb-1">Active Projects</h3>
          <p class="text-3xl font-bold text-success">{{ activeProjectsCount }}</p>
        </div>

        <div class="card">
          <h3 class="text-sm font-medium text-gray-600 mb-1">Recent Computations</h3>
          <p class="text-3xl font-bold text-warning">0</p>
        </div>

        <div class="card">
          <h3 class="text-sm font-medium text-gray-600 mb-1">Survey Points</h3>
          <p class="text-3xl font-bold text-gray-900">0</p>
        </div>
      </div>

      <!-- Recent Projects -->
      <div class="card">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-bold text-gray-900">Recent Projects</h2>
          <RouterLink to="/projects" class="btn btn-primary">
            <PlusIcon />
            <span>New Project</span>
          </RouterLink>
        </div>

        <div v-if="projectsStore.loading" class="text-center py-8">
          <p class="text-gray-600">Loading projects...</p>
        </div>

        <div v-else-if="projectsStore.projects.length === 0" class="text-center py-8">
          <p class="text-gray-600 mb-4">No projects yet. Create your first project to get started!</p>
          <RouterLink to="/projects" class="btn btn-primary">
            <PlusIcon />
            <span>Create Project</span>
          </RouterLink>
        </div>

        <div v-else class="space-y-3">
          <div
            v-for="project in recentProjects"
            :key="project.id"
            class="p-4 border border-gray-200 rounded-lg hover:border-primary-300 hover:bg-primary-50/30 transition-colors cursor-pointer"
            @click="goToProject(project.id)"
          >
            <h3 class="font-medium text-gray-900 mb-1">{{ project.name }}</h3>
            <p class="text-sm text-gray-600 mb-2">{{ project.description || 'No description' }}</p>
            <div class="flex items-center justify-between text-xs text-gray-500">
              <span>{{ project.coordinate_system }}</span>
              <span>{{ formatDate(project.created_at) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import { useProjectsStore } from '@/stores/projects'
import AppLayout from '@/components/AppLayout.vue'
import { PlusIcon } from '@/components/icons'

const router = useRouter()
const projectsStore = useProjectsStore()

const activeProjectsCount = computed(() => {
  return projectsStore.projects.filter(p => p.is_active).length
})

const recentProjects = computed(() => {
  return projectsStore.projects.slice(0, 5)
})

function formatDate(dateString: string) {
  const date = new Date(dateString)
  return date.toLocaleDateString()
}

function goToProject(id: number) {
  router.push(`/projects/${id}`)
}

onMounted(() => {
  projectsStore.fetchProjects()
})
</script>
