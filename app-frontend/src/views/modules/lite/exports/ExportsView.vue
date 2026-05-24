<template>
  <ModuleScaffold title="Lite • Imports/Exports" description="Import CSV data (Points/Lines/Polygons) and prepare exports." :breadcrumbs="breadcrumbs">
    <div class="grid gap-6 lg:grid-cols-2">
      <div class="space-y-3 p-4 rounded border">
        <h3 class="font-semibold">One‑click CSV Import</h3>
        <p class="text-xs text-gray-600">Upload a CSV and choose target project/layer or create new. Supports Points, LineStrings, and Polygons.</p>
        <div class="space-y-2">
          <label class="block text-sm font-medium">Target</label>
          <LayerSelect v-model="layerId" />
          <div class="flex items-center gap-2 text-xs text-gray-500">
            <input id="createLayer" type="checkbox" v-model="createNew" />
            <label for="createLayer">Create new if none selected</label>
          </div>
          <div v-if="createNew" class="grid grid-cols-2 gap-2">
            <input v-model="projectName" placeholder="Project name" class="rounded border px-2 py-1 text-sm" />
            <input v-model="layerName" placeholder="Layer name" class="rounded border px-2 py-1 text-sm" />
            <select v-model="geometryType" class="rounded border px-2 py-1 text-sm">
              <option value="Point">Point</option>
              <option value="LineString">LineString</option>
              <option value="Polygon">Polygon</option>
            </select>
            <input v-model.number="srid" type="number" placeholder="SRID (optional)" class="rounded border px-2 py-1 text-sm" />
            <select v-model="centralMeridian" class="rounded border px-2 py-1 text-sm">
              <option :value="undefined">Central Meridian (Lo)…</option>
              <option value="Lo25">Lo25 (EPSG 22285)</option>
              <option value="Lo27">Lo27 (EPSG 22287)</option>
              <option value="Lo29">Lo29 (EPSG 22289)</option>
              <option value="Lo31">Lo31 (EPSG 22291)</option>
              <option value="Lo33">Lo33 (EPSG 22293)</option>
            </select>
          </div>
        </div>
        <div class="space-y-2">
          <label class="block text-sm font-medium">CSV File</label>
          <input type="file" accept=".csv,text/csv" @change="onPick" />
        </div>
        <div class="flex gap-2">
          <button :disabled="!file || busy" @click="doImport" class="px-3 py-1.5 rounded bg-emerald-600 text-white text-sm disabled:opacity-50">Import</button>
          <span v-if="busy" class="text-xs text-gray-500">Uploading…</span>
        </div>
        <div v-if="result" class="text-sm">
          <div class="font-medium">Result</div>
          <div v-if="result.error" class="text-red-600">Error: {{ result.error }} <span v-if="result.detail" class="text-gray-500">({{ result.detail }})</span></div>
          <div v-else class="text-gray-700">Inserted: {{ result.inserted }}, Skipped: {{ result.skipped }}</div>
          <div class="text-gray-700">Project: {{ result.project?.name }} • Layer: {{ result.layer?.name }} ({{ result.layer?.geom_type || 'n/a' }})</div>
        </div>

        <details class="mt-3 text-xs text-gray-600">
          <summary class="cursor-pointer font-medium">CSV formats</summary>
          <div class="mt-2 space-y-1">
            <div>
              <div class="font-semibold">Point</div>
              <div>Columns: POINT, Y, X, optional: F_P, DESCRIPTION</div>
            </div>
            <div>
              <div class="font-semibold">LineString</div>
              <div>Provide either WKT column (LINESTRING(y x, y x, …)) or COORDS column like: y1 x1; y2 x2; …</div>
            </div>
            <div>
              <div class="font-semibold">Polygon</div>
              <div>Provide either WKT column (POLYGON((y x, y x, …))) or RING column like: y1 x1; y2 x2; …; y1 x1 (closing pair optional)</div>
            </div>
            <div>All coordinates are planar P(Y,X) in Zimbabwe convention.</div>
          </div>
        </details>
      </div>

      <div class="p-4 rounded border">
        <h3 class="font-semibold">Exports</h3>
        <p class="text-xs text-gray-500">Coming soon: CSV/JSON exports for selected layers and computed outputs.</p>
      </div>
    </div>
  </ModuleScaffold>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import ModuleScaffold from '../../../../components/scaffold/ModuleScaffold.vue'
import LayerSelect from '../../../../components/inputs/LayerSelect.vue'
import { importCsv } from '../../../../services/spatial'

const breadcrumbs = [
  { label: 'Lite', to: '/modules/lite' },
  { label: 'Imports/Exports' }
]

const layerId = ref<number | undefined>()
const createNew = ref(false)
const projectName = ref('')
const layerName = ref('')
const geometryType = ref<'Point'|'LineString'|'Polygon'>('Point')
const srid = ref<number | undefined>(undefined)
const centralMeridian = ref<'Lo25'|'Lo27'|'Lo29'|'Lo31'|'Lo33'|undefined>(undefined)
const file = ref<File | null>(null)
const busy = ref(false)
const result = ref<any>(null)

function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  file.value = input.files && input.files[0] ? input.files[0] : null
}

async function doImport() {
  if (!file.value) return
  busy.value = true
  result.value = null
  try {
    const payload: any = { file: file.value }
    if (!createNew.value && layerId.value) {
      payload.layerId = layerId.value
    } else {
      if (projectName.value) payload.projectName = projectName.value
      if (layerName.value) payload.layerName = layerName.value
      if (geometryType.value) payload.geometryType = geometryType.value
  if (srid.value) payload.srid = srid.value
  if (centralMeridian.value) payload.centralMeridian = centralMeridian.value
    }
    const r = await importCsv(payload)
    result.value = r
  } catch (e: any) {
    const ax = e as any
    result.value = ax?.response?.data || { error: ax?.message || String(e) }
  } finally {
    busy.value = false
  }
}
</script>
