<template>
  <div class="working-plan-view">
    <div class="plan-header">
      <h3 class="text-xl font-bold text-gray-900">Working Plan</h3>
      <p class="text-gray-600 mt-1">Preliminary plan for field work and calculations</p>
    </div>

    <!-- Use SurveyPlanMapView with working plan configuration -->
    <SurveyPlanMapView 
      v-if="projectId"
      :project-id="projectId"
      :project-info="projectInfoWithDefaults"
      :workflow-state="workflowState"
      @export-complete="handleExportComplete"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import SurveyPlanMapView from './SurveyPlanMapView.vue'

interface Props {
  projectId?: number
  projectInfo?: any
  /**
   * Forwarded to SurveyPlanMapView so the locality inset can find the imported
   * site calibration. SurveyPlanViewNew already passes this in; before this it
   * was dropped here and the Working Plan never saw a calibration.
   */
  workflowState?: any
}

const props = defineProps<Props>()
const emit = defineEmits(['export-complete'])

// Ensure plan type is set to working plan
const projectInfoWithDefaults = computed(() => ({
  ...props.projectInfo,
  planType: 'working-plan'
}))

function handleExportComplete(data: any) {
  console.log('✅ Working Plan export complete:', data)
  emit('export-complete', data)
}
</script>

<style scoped>
.working-plan-view {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.plan-header {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  border-left: 4px solid #10b981;
}
</style>
