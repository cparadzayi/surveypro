<template>
  <div class="flex flex-wrap items-end gap-3 text-xs text-gray-600">
    <div class="flex items-center gap-3" role="radiogroup" aria-label="Where the points come from">
      <span>Points from</span>
      <label class="inline-flex items-center gap-1">
        <input type="radio" value="survey" :checked="store.sourceKind === 'survey'" @change="store.setSourceKind('survey')" /> Survey project
      </label>
      <label class="inline-flex items-center gap-1">
        <input type="radio" value="layer" :checked="store.sourceKind === 'layer'" @change="store.setSourceKind('layer')" /> Spatial layer
      </label>
    </div>

    <label v-if="store.sourceKind === 'survey'" class="block">
      Survey project
      <select class="block rounded border px-2 py-1 text-sm min-w-[14rem]" :value="store.surveyProjectId ?? ''" @change="chooseProject(($event.target as HTMLSelectElement).value)">
        <option value="" disabled>{{ loadingProjects ? 'Loading projects…' : projects.length ? 'Select project…' : 'No survey projects' }}</option>
        <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
    </label>
    <span v-if="store.sourceKind === 'survey' && store.surveyProjectId" class="pb-1">
      <template v-if="store.loadingSurvey">Loading points…</template>
      <template v-else-if="store.surveyError"><span class="text-red-600">{{ store.surveyError }}</span></template>
      <template v-else>{{ store.surveyPoints.length }} point{{ store.surveyPoints.length === 1 ? '' : 's' }}</template>
      <button type="button" class="ml-1 underline text-gray-500 hover:text-gray-800" :disabled="store.loadingSurvey" @click="store.loadSurveyPoints(true)">Reload</button>
    </span>
    <span v-if="projectsError" class="text-red-600 pb-1">{{ projectsError }}</span>

    <label v-if="store.sourceKind === 'layer'" class="block">
      Points layer
      <LayerSelect :model-value="store.layerId" @update:model-value="store.setLayer" />
    </label>

    <span class="ml-auto pb-1">
      {{ store.points.length }} working point{{ store.points.length === 1 ? '' : 's' }} this session
      <button v-if="store.points.length" type="button" class="ml-2 underline text-gray-500 hover:text-red-600" @click="confirmClear">Clear</button>
    </span>
  </div>
</template>

<script setup lang="ts">
/**
 * Where the Lite modules' points come from: one of the surveyor's survey projects (its coordinate points, read
 * live) or a spatial points layer; and the size of the shared working-points list.
 */
import { ref, onMounted, watch } from 'vue'
import api from '../../services/api'
import LayerSelect from '../inputs/LayerSelect.vue'
import { useLiteWorkingPointsStore } from '../../stores/liteWorkingPoints'

const store = useLiteWorkingPointsStore()
const projects = ref<Array<{ id: number; name: string }>>([])
const loadingProjects = ref(false)
const projectsError = ref('')

async function loadProjects() {
  loadingProjects.value = true
  projectsError.value = ''
  try {
    const r = await api.get('/survey-projects')
    projects.value = ((r.data?.projects ?? []) as any[])
      .map((p) => ({ id: Number(p.id), name: String(p.name ?? p.project_name ?? `Project ${p.id}`) }))
      .filter((p) => Number.isFinite(p.id))
    // A project chosen earlier that is no longer listed (deleted or archived) is let go.
    if (store.surveyProjectId && !projects.value.some((p) => p.id === store.surveyProjectId)) store.setSurveyProject(undefined)
  } catch (e: any) {
    projects.value = []
    projectsError.value = e?.response?.status === 404 ? 'No surveyor profile: complete your profile first' : 'Could not load your survey projects'
  } finally {
    loadingProjects.value = false
  }
}

function chooseProject(value: string) {
  const id = Number(value)
  const p = projects.value.find((q) => q.id === id)
  store.setSurveyProject(p ? p.id : undefined, p?.name)
  if (p) void store.loadSurveyPoints()
}

function confirmClear() {
  if (window.confirm('Remove every working point from this session? Points saved to a layer or a project are not affected.')) store.clear()
}

onMounted(() => {
  void loadProjects()
  if (store.sourceKind === 'survey' && store.surveyProjectId) void store.loadSurveyPoints()
})
watch(() => store.sourceKind, (k) => { if (k === 'survey' && store.surveyProjectId) void store.loadSurveyPoints() })
</script>
