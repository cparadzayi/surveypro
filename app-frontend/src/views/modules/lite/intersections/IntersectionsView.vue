<template>
  <ModuleScaffold
    title="Lite • Intersections"
    :breadcrumbs="[{ label: 'Home', to: '/' }, { label: 'Lite', to: '/modules/lite' }, { label: 'Intersections' }]"
    description="Bearing–Bearing intersection using P(Y,X) and south-oriented bearings."
  >
    <form class="grid grid-cols-1 sm:grid-cols-2 gap-4" @submit.prevent="onCompute">
      <fieldset class="space-y-2">
        <legend class="font-medium text-sm">Point P1 (Y, X)</legend>
        <div class="grid grid-cols-2 gap-2">
          <label class="text-xs text-gray-600">Y (westing)
            <input v-model.number="form.p1.y" type="number" step="0.001" class="input" />
          </label>
          <label class="text-xs text-gray-600">X (southing)
            <input v-model.number="form.p1.x" type="number" step="0.001" class="input" />
          </label>
        </div>
        <label class="text-xs text-gray-600">Bearing from P1
          <DMSBearingInput v-model="form.p1.bearingDeg" />
        </label>
      </fieldset>
      <fieldset class="space-y-2">
        <legend class="font-medium text-sm">Point P2 (Y, X)</legend>
        <div class="grid grid-cols-2 gap-2">
          <label class="text-xs text-gray-600">Y (westing)
            <input v-model.number="form.p2.y" type="number" step="0.001" class="input" />
          </label>
          <label class="text-xs text-gray-600">X (southing)
            <input v-model.number="form.p2.x" type="number" step="0.001" class="input" />
          </label>
        </div>
        <label class="text-xs text-gray-600">Bearing from P2
          <DMSBearingInput v-model="form.p2.bearingDeg" />
        </label>
      </fieldset>
      <fieldset class="sm:col-span-2 space-y-2">
        <legend class="font-medium text-sm">Options</legend>
        <div class="flex items-center gap-3">
          <label class="inline-flex items-center gap-2 text-xs">
            <input v-model="form.save" type="checkbox" class="checkbox" /> Save to layer
          </label>
          <LayerSelect v-if="form.save" v-model="form.layer_id" />
          <label v-if="form.save" class="text-xs text-gray-600">Point Name (P)
            <input v-model="propName" type="text" class="input w-40" />
          </label>
        </div>
      </fieldset>
      <div class="sm:col-span-2 flex items-center gap-2">
        <button class="btn btn-primary" :disabled="loading">Compute</button>
        <span class="text-xs text-gray-500">Convention: P(Y,X), Y +west, X +south, 0° = South, clockwise.</span>
      </div>
    </form>
    <div v-if="result" class="mt-4 p-3 rounded border bg-slate-50 text-sm">
      <div class="font-medium">Intersection (Y, X)</div>
      <div v-if="result.error" class="text-red-600">{{ result.error }}</div>
      <div v-else class="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-1">
        <div>Y = {{ result.point?.y?.toFixed(3) }}</div>
        <div>X = {{ result.point?.x?.toFixed(3) }}</div>
        <div v-if="result.saved" class="text-green-700">Saved feature id: {{ result.saved.id }}</div>
      </div>
    </div>
  </ModuleScaffold>
</template>
<script setup lang="ts">
import { reactive, ref, computed } from 'vue'
import ModuleScaffold from '../../../../components/scaffold/ModuleScaffold.vue'
import DMSBearingInput from '../../../../components/inputs/DMSBearingInput.vue'
import LayerSelect from '../../../../components/inputs/LayerSelect.vue'
import { computeIntersectionBB, type BBIntersectionRequest, type BBIntersectionResponse } from '../../../../services/compute'

const form = reactive<BBIntersectionRequest>({
  p1: { y: 0, x: 0, bearingDeg: 0 },
  p2: { y: 0, x: 0, bearingDeg: 0 },
  save: false,
  properties: {}
})
const loading = ref(false)
const result = ref<BBIntersectionResponse | null>(null)

const propName = computed({
  get: () => (form.properties?.name as string) || '',
  set: (v: string) => {
    if (!form.properties) form.properties = {}
    ;(form.properties as any).name = v
  }
})

async function onCompute() {
  loading.value = true
  try {
    const res = await computeIntersectionBB(form)
    result.value = res
  } catch (e: any) {
    result.value = { ok: false, error: e?.response?.data?.error || e.message }
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
/* Using utility classes directly */
</style>
