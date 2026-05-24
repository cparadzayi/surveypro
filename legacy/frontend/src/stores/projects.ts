import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/services/api'
import type { Project, CreateProjectData } from '@/types'

export const useProjectsStore = defineStore('projects', () => {
  const projects = ref<Project[]>([])
  const currentProject = ref<Project | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchProjects() {
    loading.value = true
    error.value = null
    try {
      const response = await api.get('/api/projects')
      projects.value = response.data
    } catch (err: any) {
      error.value = err.response?.data?.error || 'Failed to fetch projects'
    } finally {
      loading.value = false
    }
  }

  async function fetchProject(id: number) {
    loading.value = true
    error.value = null
    try {
      const response = await api.get(`/api/projects/${id}`)
      currentProject.value = response.data
      return response.data
    } catch (err: any) {
      error.value = err.response?.data?.error || 'Failed to fetch project'
      return null
    } finally {
      loading.value = false
    }
  }

  async function createProject(data: CreateProjectData) {
    loading.value = true
    error.value = null
    try {
      const response = await api.post('/api/projects', data)
      projects.value.push(response.data)
      return response.data
    } catch (err: any) {
      error.value = err.response?.data?.error || 'Failed to create project'
      return null
    } finally {
      loading.value = false
    }
  }

  async function updateProject(id: number, data: Partial<Project>) {
    loading.value = true
    error.value = null
    try {
      const response = await api.put(`/api/projects/${id}`, data)
      const index = projects.value.findIndex(p => p.id === id)
      if (index !== -1) {
        projects.value[index] = response.data
      }
      if (currentProject.value?.id === id) {
        currentProject.value = response.data
      }
      return response.data
    } catch (err: any) {
      error.value = err.response?.data?.error || 'Failed to update project'
      return null
    } finally {
      loading.value = false
    }
  }

  async function deleteProject(id: number) {
    loading.value = true
    error.value = null
    try {
      await api.delete(`/api/projects/${id}`)
      projects.value = projects.value.filter(p => p.id !== id)
      if (currentProject.value?.id === id) {
        currentProject.value = null
      }
      return true
    } catch (err: any) {
      error.value = err.response?.data?.error || 'Failed to delete project'
      return false
    } finally {
      loading.value = false
    }
  }

  return {
    projects,
    currentProject,
    loading,
    error,
    fetchProjects,
    fetchProject,
    createProject,
    updateProject,
    deleteProject
  }
})
