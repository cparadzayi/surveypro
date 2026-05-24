<template>
  <AppLayout>
    <div class="p-4 md:p-8">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl md:text-3xl font-bold text-gray-900 mb-2">Projects</h1>
          <p class="text-gray-600">Manage your survey projects</p>
        </div>
        <button @click="openCreateModal" class="btn btn-primary">
          <PlusIcon />
          <span>New Project</span>
        </button>
      </div>

      <!-- Projects Grid -->
      <div v-if="projectsStore.loading" class="text-center py-12">
        <p class="text-gray-600">Loading projects...</p>
      </div>

      <div v-else-if="projectsStore.projects.length === 0" class="card text-center py-12">
        <p class="text-gray-600 mb-4">No projects yet. Create your first project!</p>
        <button @click="openCreateModal" class="btn btn-primary">
          <PlusIcon />
          <span>Create Project</span>
        </button>
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="project in projectsStore.projects"
          :key="project.id"
          class="card hover:shadow-lg transition-shadow cursor-pointer"
          @click="router.push(`/projects/${project.id}`)"
        >
          <h3 class="text-lg font-bold text-gray-900 mb-2">{{ project.name }}</h3>
          <p class="text-sm text-gray-600 mb-4 line-clamp-2">
            {{ project.description || 'No description' }}
          </p>
          <div class="flex items-center justify-between text-xs text-gray-500">
            <span>{{ project.coordinate_system }}</span>
            <span class="px-2 py-1 rounded-full" :class="project.is_active ? 'bg-success/10 text-success' : 'bg-gray-200 text-gray-600'">
              {{ project.is_active ? 'Active' : 'Inactive' }}
            </span>
          </div>
          <div class="mt-2 text-xs text-gray-500">
            Created {{ formatDate(project.created_at) }}
          </div>
        </div>
      </div>

      <!-- Create Project Modal -->
      <div
        v-if="showCreateModal"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
        @click="closeModal"
      >
        <div class="w-full max-w-lg card" @click.stop>
          <h2 class="text-2xl font-bold text-gray-900 mb-4">Create New Project</h2>

          <form @submit.prevent="handleCreateProject" class="space-y-4">
            <div>
              <label for="name" class="block text-sm font-medium text-gray-700 mb-1">
                Project Name *
              </label>
              <input
                id="name"
                v-model="newProject.name"
                type="text"
                required
                class="input"
                placeholder="e.g., Highway Survey 2024"
              />
            </div>

            <div>
              <label for="description" class="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                id="description"
                v-model="newProject.description"
                rows="3"
                class="input"
                placeholder="Brief description of the project..."
              ></textarea>
            </div>

            <div>
              <label for="coordinate_system" class="block text-sm font-medium text-gray-700 mb-1">
                Coordinate System
              </label>
              <input
                id="coordinate_system"
                v-model="newProject.coordinate_system"
                type="text"
                class="input"
                placeholder="e.g., WGS84, UTM Zone 34S"
              />
            </div>

            <div v-if="projectsStore.error" class="p-3 bg-error/10 border border-error rounded-lg">
              <p class="text-error text-sm">{{ projectsStore.error }}</p>
            </div>

            <div class="flex gap-3">
              <button type="button" @click="closeModal" class="btn btn-secondary flex-1">
                Cancel
              </button>
              <button type="submit" class="btn btn-primary flex-1" :disabled="projectsStore.loading">
                <span v-if="!projectsStore.loading">Create Project</span>
                <span v-else>Creating...</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectsStore } from '@/stores/projects'
import AppLayout from '@/components/AppLayout.vue'
import { PlusIcon } from '@/components/icons'
import type { CreateProjectData } from '@/types'

const router = useRouter()
const projectsStore = useProjectsStore()
const showCreateModal = ref(false)

const newProject = ref<CreateProjectData>({
  name: '',
  description: '',
  coordinate_system: 'WGS84'
})

function formatDate(dateString: string) {
  const date = new Date(dateString)
  return date.toLocaleDateString()
}

function openCreateModal() {
  // Clear any previous errors when opening the modal
  projectsStore.error = null
  showCreateModal.value = true
}

function closeModal() {
  showCreateModal.value = false
  // Clear the form
  newProject.value = {
    name: '',
    description: '',
    coordinate_system: 'WGS84'
  }
  // Clear any errors
  projectsStore.error = null
}

async function handleCreateProject() {
  const project = await projectsStore.createProject(newProject.value)
  if (project) {
    closeModal()
    router.push(`/projects/${project.id}`)
  }
}

onMounted(() => {
  projectsStore.fetchProjects()
})
</script>
