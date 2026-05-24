<template>
  <div class="p-4 space-y-4">
    <h1 class="text-xl font-semibold">Map (Spatial Phase 1)</h1>
    <div class="flex gap-4 flex-wrap">
      <div>
        <label class="text-sm font-medium">Project</label>
        <select v-model="selectedProjectId" class="border rounded px-2 py-1">
          <option :value="undefined">-- select --</option>
          <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </div>
      <div v-if="selectedProjectId">
        <label class="text-sm font-medium">Layer</label>
        <select v-model="selectedLayerId" class="border rounded px-2 py-1">
          <option :value="undefined">-- select --</option>
          <option v-for="l in layers" :key="l.id" :value="l.id">{{ l.name }}</option>
        </select>
      </div>
      <button @click="seedPoint" class="bg-blue-600 text-white px-3 py-1 rounded text-sm" :disabled="!selectedLayerId">Add Test Point</button>
      <button @click="runQuery" class="bg-indigo-600 text-white px-3 py-1 rounded text-sm" :disabled="!selectedLayerId">BBox Query</button>
    </div>
    <div class="border rounded p-3 bg-white shadow text-sm">
      <p class="font-medium mb-2">Results:</p>
      <div v-if="features.length === 0" class="text-gray-500">No features loaded.</div>
      <ul>
        <li v-for="f in features" :key="f.id">
          #{{ f.id }} {{ f.properties?.code || '' }} {{ f.geometry?.type }} {{ formatBBox(f.bbox) }}
        </li>
      </ul>
    </div>
    <div class="border rounded h-80 flex items-center justify-center text-gray-500 bg-gray-50">
      Map placeholder (Leaflet / OpenLayers to be integrated later)
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue'
import { listProjects, listLayers, createFeature, bboxQuery, createProject, createLayer } from '../services/spatial'

const projects = ref<any[]>([])
const layers = ref<any[]>([])
const features = ref<any[]>([])

const selectedProjectId = ref<number | undefined>()
const selectedLayerId = ref<number | undefined>()

async function loadProjects() {
  projects.value = await listProjects()
  if (projects.value.length === 0) {
    // auto seed a project & layer for convenience
    const p = await createProject({ name: 'Demo Project', code: 'DEMO' }).catch(()=>null)
    if (p) {
      const l = await createLayer(p.id, { name: 'Control Points', geom_type: 'Point' }).catch(()=>null)
    }
    projects.value = await listProjects()
  }
}

watch(selectedProjectId, async (val) => {
  layers.value = []
  selectedLayerId.value = undefined
  features.value = []
  if (val) {
    layers.value = await listLayers(val)
  }
})

async function seedPoint() {
  if (!selectedLayerId.value) return
  const lon = 30 + Math.random()
  const lat = -18 + Math.random()
  const f = await createFeature(selectedLayerId.value, { geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { code: 'P' + Math.floor(Math.random()*1000) } })
  features.value.push(f)
}

async function runQuery() {
  if (!selectedLayerId.value) return
  // broad bbox for demo
  const q = await bboxQuery(selectedLayerId.value, [29, -19, 32, -16])
  features.value = q
}

loadProjects()

function formatBBox(b: number[] | undefined) {
  if (!b) return ''
  return b.map(n => (typeof n === 'number' ? n.toFixed(3) : '')).join(', ')
}
</script>
