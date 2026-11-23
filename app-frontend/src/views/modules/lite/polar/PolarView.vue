<template>
  <ModuleScaffold
    title="Lite • Polar"
    :breadcrumbs="[{ label: 'Home', to: '/' }, { label: 'Lite', to: '/modules/lite' }, { label: 'Polar' }]"
    description="Compute Q from P(Y,X), distance, bearing (south-oriented)."
    :tabs="ribbonTabs"
    @action="runRibbonAction"
  >
    <LiteLayerBar class="mb-3" />
    <form class="grid grid-cols-1 sm:grid-cols-2 gap-4" @submit.prevent="onCompute">
      <LitePointPicker v-model="known" label="Known Point P (Y, X)" />
      <fieldset class="space-y-2">
        <legend class="font-medium text-sm">Observation</legend>
        <div class="grid grid-cols-2 gap-2">
          <label class="text-xs text-gray-600">Distance (m)
            <input v-model.number="form.distance" type="number" step="0.001" min="0" class="rounded border px-2 py-1 text-sm w-full" placeholder="e.g. 125.35" />
          </label>
          <div class="text-xs text-gray-600">
            Bearing (0°=South)
            <DMSBearingInput v-model="form.bearingDeg" />
          </div>
        </div>
        <label class="text-xs text-gray-600 block">Name of Q
          <input v-model="qName" type="text" class="rounded border px-2 py-1 text-sm w-40" :placeholder="nextName" />
        </label>
      </fieldset>
      <fieldset class="sm:col-span-2 space-y-2">
        <legend class="font-medium text-sm">Options</legend>
        <div class="flex items-center gap-3">
          <label class="inline-flex items-center gap-2 text-xs">
            <input v-model="form.save" type="checkbox" class="rounded border" /> Save to layer
          </label>
          <LayerSelect v-if="form.save" v-model="form.layer_id" />
        </div>
      </fieldset>
      <div class="sm:col-span-2 flex items-center gap-2">
        <button class="inline-flex items-center gap-1 rounded border px-3 py-1 text-sm bg-indigo-600 text-white hover:bg-indigo-700" :disabled="loading">Compute</button>
        <span class="text-xs text-gray-500">Convention: P(Y,X), Y +west, X +south, 0° = South, clockwise.</span>
      </div>
    </form>
    <div v-if="error" class="mt-4 text-sm text-red-600">{{ error }}</div>
    <div v-if="result?.point" class="mt-4 p-3 rounded border bg-slate-50 text-sm">
      <div class="font-medium">Result {{ resultName }} (Y, X)</div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-1">
        <div>Y = {{ result.point.y.toFixed(3) }}</div>
        <div>X = {{ result.point.x.toFixed(3) }}</div>
        <div v-if="result.saved" class="text-green-700">Saved feature id: {{ result.saved.id }}</div>
      </div>
      <div class="mt-1 text-xs text-gray-500">{{ resultName }} is in this session's working points: pick it in Join, Intersections or Areas v2.</div>
    </div>
  </ModuleScaffold>
</template>
<script setup lang="ts">
import { reactive, ref, computed } from 'vue'
import ModuleScaffold from '../../../../components/scaffold/ModuleScaffold.vue'
import { group, btn, type RibbonTab } from '../../../../components/ribbon/types'
import { computePolar, type PolarRequest, type PolarResponse } from '../../../../services/compute'
import DMSBearingInput from '../../../../components/inputs/DMSBearingInput.vue'
import LayerSelect from '../../../../components/inputs/LayerSelect.vue'
import LitePointPicker, { type PickedPoint } from '../../../../components/lite/LitePointPicker.vue'
import LiteLayerBar from '../../../../components/lite/LiteLayerBar.vue'
import { useLiteWorkingPointsStore, nextFreeName } from '../../../../stores/liteWorkingPoints'

const store = useLiteWorkingPointsStore()
const known = ref<PickedPoint>({ name: '', y: null, x: null })
const form = reactive<Omit<PolarRequest, 'y' | 'x'>>({ distance: 0, bearingDeg: 0, save: false, properties: {} })
const qName = ref('')
const loading = ref(false)
const error = ref('')
const result = ref<PolarResponse | null>(null)
const resultName = ref('')
const nextName = computed(() => nextFreeName(store.points, 'Q'))

async function onCompute() {
  error.value = ''
  if (known.value.y === null || known.value.x === null) { error.value = 'Give P a Y and an X, or pick it from the list.'; return }
  loading.value = true
  const name = qName.value.trim() || nextName.value
  try {
    const res = await computePolar({ ...form, y: known.value.y, x: known.value.x, properties: { ...(form.properties || {}), name } })
    result.value = res
    if (res.point) {
      resultName.value = name
      store.add({ name, y: res.point.y, x: res.point.x, source: 'polar' })
      if (known.value.name.trim()) store.add({ name: known.value.name, y: known.value.y, x: known.value.x, source: 'typed' })
      qName.value = ''
    }
  } catch (e: any) {
    result.value = null
    error.value = e?.response?.data?.error || e.message
  } finally {
    loading.value = false
  }
}

// ── Ribbon: Solve toolbar ─────────────────────────────────────────────────────
function resetAll() {
  known.value = { name: '', y: null, x: null }
  form.distance = 0
  form.bearingDeg = 0
  form.save = false
  form.layer_id = undefined
  form.properties = {}
  qName.value = ''
  error.value = ''
  result.value = null
}

const ribbonTabs = computed<RibbonTab[]>(() => [
  {
    id: 'solve',
    label: 'Solve',
    icon: '🧮',
    groups: [
      group('Compute', [
        btn({ id: 'polar-compute', icon: '🧮', label: 'Compute', tone: 'primary', disabled: loading.value }),
        btn({ id: 'polar-clear', icon: '🗑️', label: 'Clear', tone: 'danger' }),
      ], 'P(Y,X) → Q(Y,X) from distance and south-oriented bearing.'),
      group('Options', [
        btn({ id: 'polar-save', icon: '💾', label: 'Save', active: form.save, title: 'Save the computed point to a layer' }),
      ]),
    ],
  },
])

async function runRibbonAction(id: string) {
  if (id === 'polar-compute') await onCompute()
  else if (id === 'polar-clear') resetAll()
  else if (id === 'polar-save') form.save = !form.save
}
</script>
