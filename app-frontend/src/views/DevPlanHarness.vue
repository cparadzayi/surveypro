<template>
  <div class="dev-plan">
    <p class="dev-note">Dev only: opens the Working Plan for project {{ projectId }} without walking the workflow.</p>
    <p v-if="error" class="dev-error">{{ error }}</p>
    <WorkingPlanView v-else-if="info" :project-id="projectId" :project-info="info" :workflow-state="{ projectInfo: info }" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/services/api'
import WorkingPlanView from './modules/cadastral-standard/WorkingPlanView.vue'

const route = useRoute()
const projectId = computed(() => Number(route.params.projectId))
const info = ref<any>(null)
const error = ref('')

onMounted(async () => {
  try {
    const { data } = await api.get(`/survey-projects/${projectId.value}`)
    const p = data.project
    info.value = {
      name: p.name,
      district: p.district,
      surveyType: p.survey_type ?? p.surveyType,
      surveyDate: p.survey_date ?? p.surveyDate,
      workingDirectory: p.working_directory ?? p.workingDirectory,
      centralMeridian: Number(p.control_points?.meridian ?? p.controlPoints?.meridian ?? 31),
      township: 'Walkthrough',
    }
  } catch (e: any) {
    error.value = e?.response?.data?.error ?? e?.message ?? 'Could not load the project'
  }
})
</script>
