import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface Project {
  id: number
  name: string
  surveyor_profile_id: number
  client_name?: string
  district?: string
  survey_type?: string
  survey_date?: string
  working_directory?: string
  created_at?: string
  updated_at?: string
  last_used?: string
}

/**
 * Project Selection Store
 * 
 * Single source of truth for project selection across the application.
 * Manages project selection state, localStorage persistence, and workflow linking.
 * 
 * Usage:
 * - Dashboard: Select project and navigate
 * - Project Setup: Auto-load pre-selected project
 * - Workflow: Access current project context
 */
export const useProjectSelectionStore = defineStore('projectSelection', () => {
  // State
  const selectedProject = ref<Project | null>(null)
  const isLinkedToWorkflow = ref(false)
  
  // Computed
  const hasSelectedProject = computed(() => selectedProject.value !== null)
  const selectedProjectId = computed(() => selectedProject.value?.id || null)
  const selectedProjectName = computed(() => selectedProject.value?.name || '')
  
  /**
   * Select a project and persist to localStorage
   * @param project - The project to select
   */
  function selectProject(project: Project) {
    console.log('[ProjectSelection] Selecting project:', project.name, 'ID:', project.id)
    selectedProject.value = project
    
    // Persist to localStorage for cross-session persistence
    try {
      localStorage.setItem('selectedProject', JSON.stringify(project))
      console.log('[ProjectSelection] ✅ Saved to localStorage')
    } catch (error) {
      console.error('[ProjectSelection] ❌ Failed to save to localStorage:', error)
    }
  }
  
  /**
   * Clear the selected project
   */
  function clearSelection() {
    console.log('[ProjectSelection] Clearing project selection')
    selectedProject.value = null
    isLinkedToWorkflow.value = false
    
    try {
      localStorage.removeItem('selectedProject')
      console.log('[ProjectSelection] ✅ Cleared from localStorage')
    } catch (error) {
      console.error('[ProjectSelection] ❌ Failed to clear localStorage:', error)
    }
  }
  
  /**
   * Load project from localStorage (for app initialization)
   */
  function loadFromLocalStorage() {
    try {
      const stored = localStorage.getItem('selectedProject')
      if (stored) {
        const project = JSON.parse(stored) as Project
        selectedProject.value = project
        console.log('[ProjectSelection] ✅ Loaded from localStorage:', project.name)
        return true
      } else {
        console.log('[ProjectSelection] ℹ️ No project in localStorage')
        return false
      }
    } catch (error) {
      console.error('[ProjectSelection] ❌ Failed to load from localStorage:', error)
      return false
    }
  }
  
  /**
   * Mark project as linked to workflow (for database persistence)
   */
  function markAsLinked() {
    isLinkedToWorkflow.value = true
    console.log('[ProjectSelection] ✅ Project linked to workflow')
  }
  
  /**
   * Update the selected project (e.g., after editing)
   * @param updates - Partial project updates
   */
  function updateProject(updates: Partial<Project>) {
    if (selectedProject.value) {
      selectedProject.value = { ...selectedProject.value, ...updates }
      
      // Update localStorage
      try {
        localStorage.setItem('selectedProject', JSON.stringify(selectedProject.value))
        console.log('[ProjectSelection] ✅ Updated project in localStorage')
      } catch (error) {
        console.error('[ProjectSelection] ❌ Failed to update localStorage:', error)
      }
    }
  }
  
  return {
    // State
    selectedProject,
    isLinkedToWorkflow,
    
    // Computed
    hasSelectedProject,
    selectedProjectId,
    selectedProjectName,
    
    // Actions
    selectProject,
    clearSelection,
    loadFromLocalStorage,
    markAsLinked,
    updateProject
  }
})
