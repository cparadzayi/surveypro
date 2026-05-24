import { ref, computed } from 'vue'
import type { SurveyProject } from '../composables/useSurveyors'

/**
 * Shared project context store for cross-module integration
 * Allows cadastral workflow to share selected project with other modules
 */

const currentProject = ref<SurveyProject | null>(null)
const currentProjectId = ref<number | null>(null)

export function useProjectContext() {
  const setCurrentProject = (project: SurveyProject | null) => {
    currentProject.value = project
    currentProjectId.value = project?.id || null
    console.log('[ProjectContext] Project set:', project?.name || 'None')
  }

  const clearCurrentProject = () => {
    currentProject.value = null
    currentProjectId.value = null
    console.log('[ProjectContext] Project cleared')
  }

  const hasProject = computed(() => !!currentProject.value)

  return {
    currentProject: computed(() => currentProject.value),
    currentProjectId: computed(() => currentProjectId.value),
    hasProject,
    setCurrentProject,
    clearCurrentProject
  }
}
