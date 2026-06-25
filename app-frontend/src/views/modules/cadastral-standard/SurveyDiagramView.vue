<template>
  <div class="survey-diagram-view">
    <div class="plan-header">
      <h3 class="text-xl font-bold text-gray-900">Survey Diagram</h3>
      <p class="text-gray-600 mt-1">Technical diagram with measurements and traverse lines</p>
    </div>

    <!-- Use SurveyPlanMapView with diagram configuration -->
    <SurveyPlanMapView 
      v-if="projectId"
      :project-id="projectId"
      :project-info="projectInfoWithDefaults"
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
}

const props = defineProps<Props>()
const emit = defineEmits(['export-complete'])

// Ensure plan type is set to diagram
const projectInfoWithDefaults = computed(() => ({
  ...props.projectInfo,
  planType: 'diagram'
}))

function handleExportComplete(data: any) {
  console.log('✅ Survey Diagram export complete:', data)
  emit('export-complete', data)
}
</script>

<style scoped>
.survey-diagram-view {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.plan-header {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  border-left: 4px solid #8b5cf6;
}
</style>
