<template>
  <div class="undeveloped-township-gp-view">
    <div class="plan-header">
      <h3 class="text-xl font-bold text-gray-900">Undeveloped Township General Plan</h3>
      <p class="text-gray-600 mt-1">SI 727 compliant general plan with Vector GeoPDF support</p>
    </div>

    <!-- This is the current SurveyPlanMapView implementation -->
    <!-- Import and use the full SurveyPlanMapView component -->
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
  workflowState?: any
}

const props = defineProps<Props>()
const emit = defineEmits(['export-complete'])

// Ensure plan type is set to undeveloped
const projectInfoWithDefaults = computed(() => ({
  ...props.projectInfo,
  planType: 'general-undeveloped'
}))

function handleExportComplete(data: any) {
  console.log('✅ Undeveloped Township GP export complete:', data)
  emit('export-complete', data)
}
</script>

<style scoped>
.undeveloped-township-gp-view {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.plan-header {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  border-left: 4px solid #6366f1;
}
</style>
