<template>
  <ModuleScaffold
    title="Lite • Intersections"
    :breadcrumbs="[{ label: 'Home', to: '/' }, { label: 'Lite', to: '/modules/lite' }, { label: 'Intersections' }]"
    description="Bearing–Bearing intersection using P(Y,X) and south-oriented bearings."
    :tabs="ribbonTabs"
    @action="runRibbonAction"
  >
    <LiteLayerBar class="mb-3" />
    <form class="grid grid-cols-1 sm:grid-cols-2 gap-4" @submit.prevent="onCompute">
      <div class="space-y-2">
        <LitePointPicker v-model="p1" label="Point P1 (Y, X)" />
        <label class="text-xs text-gray-600">Bearing from P1
          <DMSBearingInput v-model="bearing1" />
        </label>
      </div>
      <div class="space-y-2">
        <LitePointPicker v-model="p2" label="Point P2 (Y, X)" />
        <label class="text-xs text-gray-600">Bearing from P2
          <DMSBearingInput v-model="bearing2" />
        </label>
      </div>
      <fieldset class="sm:col-span-2 space-y-2">
        <legend class="font-medium text-sm">Result and options</legend>
        <div class="flex flex-wrap items-center gap-3">
          <label class="text-xs text-gray-600">Name of the intersection
            <input v-model="iName" type="text" class="input w-40" :placeholder="nextName" />
          </label>
          <label class="inline-flex items-center gap-2 text-xs">
            <input v-model="save" type="checkbox" class="checkbox" /> Save to layer
          </label>
          <LayerSelect v-if="save" v-model="saveLayerId" />
        </div>
      </fieldset>
      <div class="sm:col-span-2 flex items-center gap-2">
        <button class="btn btn-primary" :disabled="loading">Compute</button>
        <span class="text-xs text-gray-500">Convention: P(Y,X), Y +west, X +south, 0° = South, clockwise.</span>
      </div>
    </form>
    <div v-if="result" class="mt-4 p-3 rounded border bg-slate-50 text-sm">
      <div class="font-medium">Intersection {{ resultName }} (Y, X)</div>
      <div v-if="result.error" class="text-red-600">{{ result.error }}</div>
      <template v-else-if="result.point">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-1">
          <div>Y = {{ result.point.y.toFixed(3) }}</div>
          <div>X = {{ result.point.x.toFixed(3) }}</div>
          <div v-if="result.saved" class="text-green-700">Saved feature id: {{ result.saved.id }}</div>
        </div>
        <div class="mt-1 text-xs text-gray-500">{{ resultName }} is in this session's working points: pick it in Join, Polar or Areas v2.</div>
      </template>
    </div>
  </ModuleScaffold>
</template>
<script setup lang="ts">
import { ref, computed } from 'vue'
import ModuleScaffold from '../../../../components/scaffold/ModuleScaffold.vue'
import { group, btn, type RibbonTab } from '../../../../components/ribbon/types'
import DMSBearingInput from '../../../../components/inputs/DMSBearingInput.vue'
import LayerSelect from '../../../../components/inputs/LayerSelect.vue'
import LitePointPicker, { type PickedPoint } from '../../../../components/lite/LitePointPicker.vue'
import LiteLayerBar from '../../../../components/lite/LiteLayerBar.vue'
import { useLiteWorkingPointsStore, nextFreeName } from '../../../../stores/liteWorkingPoints'
import { computeIntersectionBB, type BBIntersectionResponse } from '../../../../services/compute'

const store = useLiteWorkingPointsStore()
const blank = (): PickedPoint => ({ name: '', y: null, x: null })
const p1 = ref<PickedPoint>(blank())
const p2 = ref<PickedPoint>(blank())
const bearing1 = ref(0)
const bearing2 = ref(0)
const iName = ref('')
const save = ref(false)
const saveLayerId = ref<number | undefined>(undefined)
const loading = ref(false)
const result = ref<BBIntersectionResponse | null>(null)
const resultName = ref('')
const nextName = computed(() => nextFreeName(store.points, 'I'))

async function onCompute() {
  if (p1.value.y === null || p1.value.x === null || p2.value.y === null || p2.value.x === null) {
    result.value = { ok: false, error: 'Give P1 and P2 a Y and an X, or pick them from the list.' }
    return
  }
  loading.value = true
  const name = iName.value.trim() || nextName.value
  try {
    const res = await computeIntersectionBB({
      p1: { y: p1.value.y, x: p1.value.x, bearingDeg: bearing1.value },
      p2: { y: p2.value.y, x: p2.value.x, bearingDeg: bearing2.value },
      save: save.value,
      layer_id: saveLayerId.value,
      properties: { name },
    })
    result.value = res
    if (res.point) {
      resultName.value = name
      store.add({ name, y: res.point.y, x: res.point.x, source: 'intersection' })
      for (const p of [p1.value, p2.value]) {
        if (p.name.trim()) store.add({ name: p.name, y: p.y!, x: p.x!, source: 'typed' })
      }
      iName.value = ''
    }
  } catch (e: any) {
    result.value = { ok: false, error: e?.response?.data?.error || e.message }
  } finally {
    loading.value = false
  }
}

// ── Ribbon: Solve toolbar ─────────────────────────────────────────────────────
function resetAll() {
  p1.value = blank()
  p2.value = blank()
  bearing1.value = 0
  bearing2.value = 0
  iName.value = ''
  save.value = false
  saveLayerId.value = undefined
  result.value = null
}

const ribbonTabs = computed<RibbonTab[]>(() => [
  {
    id: 'solve',
    label: 'Solve',
    icon: '🧮',
    groups: [
      group('Compute', [
        btn({ id: 'inter-compute', icon: '🧮', label: 'Compute', tone: 'primary', disabled: loading.value }),
        btn({ id: 'inter-clear', icon: '🗑️', label: 'Clear', tone: 'danger' }),
      ], 'Intersection of two south-oriented bearing rays through P1 and P2.'),
      group('Options', [
        btn({ id: 'inter-save', icon: '💾', label: 'Save', active: save.value, title: 'Save the computed point to a layer' }),
      ]),
    ],
  },
])

async function runRibbonAction(id: string) {
  if (id === 'inter-compute') await onCompute()
  else if (id === 'inter-clear') resetAll()
  else if (id === 'inter-save') save.value = !save.value
}
</script>
