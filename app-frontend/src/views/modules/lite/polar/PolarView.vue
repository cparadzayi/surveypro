<template>
  <ModuleScaffold
    title="Lite • Polar"
    :breadcrumbs="[{ label: 'Home', to: '/' }, { label: 'Lite', to: '/modules/lite' }, { label: 'Polar' }]"
    description="Compute Q from P(Y,X), distance, bearing (south-oriented)."
  >
    <form class="grid grid-cols-1 sm:grid-cols-2 gap-4" @submit.prevent="onCompute">
      <fieldset class="space-y-2">
        <legend class="font-medium text-sm">Known Point P (Y, X)</legend>
        <!-- Known point: select layer and search by name -->
        <div class="flex flex-wrap items-end gap-2">
          <label class="text-xs text-gray-600">
            Points Layer
            <LayerSelect v-model="knownLayerId" />
          </label>
          <label class="text-xs text-gray-600">
            Search point
            <input
              ref="searchEl"
              v-model="q"
              @input="onInput"
              @keydown.down.prevent="highlightNext()"
              @keydown.up.prevent="highlightPrev()"
              @keydown.enter.prevent="enterUse()"
              @keydown.esc.prevent="clearSuggestions()"
              :disabled="!knownLayerId"
              class="rounded border px-2 py-1 text-sm w-56"
              placeholder="Beacon/Name" />
          </label>
          <button type="button" class="rounded border px-3 py-1 text-sm bg-slate-600 text-white disabled:opacity-50" :disabled="!selectedSuggestion" @click="useSelected">Use point</button>
          <span class="text-[11px] text-gray-500" v-if="loadingSearch">Searching…</span>
        </div>
        <ul v-if="suggestions.length" class="border rounded max-h-40 overflow-auto text-sm">
          <li
            v-for="(s, idx) in suggestions"
            :key="s.id"
            @mouseenter="hoverIndex = idx"
            @mouseleave="hoverIndex = -1"
            :class="['px-2 py-1 cursor-pointer', (selectedSuggestion && selectedSuggestion.id===s.id) || hoverIndex===idx ? 'bg-slate-100' : 'hover:bg-slate-50']"
            @click="useFromSuggestion(s)"
          >
            {{ displayName(s) }} — (Y: {{ coordFmt(s.geometry.coordinates[1]) }}, X: {{ coordFmt(s.geometry.coordinates[0]) }})
          </li>
        </ul>
        <div v-else-if="q.trim().length>=1 && !loadingSearch && !searchError" class="text-xs text-gray-500">No matching points</div>
        <div v-if="searchError" class="text-xs text-red-600">{{ searchError }}</div>

        <div class="grid grid-cols-2 gap-2 mt-2">
          <label class="text-xs text-gray-600">Name (optional)
            <input v-model="knownName" type="text" class="input" placeholder="e.g. P1" />
          </label>
          <div></div>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <label class="text-xs text-gray-600">Y (westing)
            <input v-model.number="form.y" type="number" step="0.001" class="input" placeholder="e.g. -3551.377" />
          </label>
          <label class="text-xs text-gray-600">X (southing)
            <input v-model.number="form.x" type="number" step="0.001" class="input" placeholder="e.g. 1965611.534" />
          </label>
        </div>
      </fieldset>
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
      </fieldset>
      <fieldset class="sm:col-span-2 space-y-2">
        <legend class="font-medium text-sm">Options</legend>
        <div class="flex items-center gap-3">
          <label class="inline-flex items-center gap-2 text-xs">
            <input v-model="form.save" type="checkbox" class="rounded border" /> Save to layer
          </label>
          <LayerSelect v-if="form.save" v-model="form.layer_id" />
          <label v-if="form.save" class="text-xs text-gray-600">Point Name (P)
            <input v-model="propName" type="text" class="rounded border px-2 py-1 text-sm w-40" placeholder="e.g. Q1" />
          </label>
        </div>
      </fieldset>
      <div class="sm:col-span-2 flex items-center gap-2">
  <button class="inline-flex items-center gap-1 rounded border px-3 py-1 text-sm bg-indigo-600 text-white hover:bg-indigo-700" :disabled="loading">Compute</button>
        <span class="text-xs text-gray-500">Convention: P(Y,X), Y +west, X +south, 0° = South, clockwise.</span>
      </div>
    </form>
    <div v-if="result" class="mt-4 p-3 rounded border bg-slate-50 text-sm">
      <div class="font-medium">Result Q(Y,X)</div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-1">
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
import { computePolar, type PolarRequest, type PolarResponse } from '../../../../services/compute'
import DMSBearingInput from '../../../../components/inputs/DMSBearingInput.vue'
import LayerSelect from '../../../../components/inputs/LayerSelect.vue'
import { searchFeatures, type Feature } from '../../../../services/spatial'

const form = reactive<PolarRequest>({ y: 0, x: 0, distance: 0, bearingDeg: 0, save: false, properties: {} })
const loading = ref(false)
const result = ref<PolarResponse | null>(null)

const propName = computed({
  get: () => (form.properties?.name as string) || '',
  set: (v: string) => {
    if (!form.properties) form.properties = {}
    ;(form.properties as any).name = v
  }
})

// Known point selection: layer + search with autocomplete (mirrors Areas2View behavior)
const knownLayerId = ref<number | undefined>(undefined)
const knownName = ref<string>('')
const q = ref('')
const suggestions = ref<Feature[]>([])
const selectedSuggestion = ref<Feature | null>(null)
const hoverIndex = ref<number>(-1)
const searchEl = ref<HTMLInputElement | null>(null)
const loadingSearch = ref(false)
const searchError = ref('')
let debounceTimer: any = null

function displayName(f: Feature) {
  const props: any = f?.properties || {}
  return props.name || props.beacon || props.point_name || f.id
}
function coordFmt(v: number) { return Number(v).toFixed(2) }

async function onInput() {
  selectedSuggestion.value = null
  hoverIndex.value = -1
  searchError.value = ''
  if (!knownLayerId.value || q.value.trim().length < 1) { suggestions.value = []; return }
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(async () => {
    loadingSearch.value = true
    try {
      const query = q.value.trim()
      const rows = await searchFeatures(knownLayerId.value!, query, 20)
      const qLower = query.toLowerCase()
      suggestions.value = rows.filter(r => String(displayName(r)).toLowerCase().includes(qLower))
      if (suggestions.value && suggestions.value.length) {
        hoverIndex.value = 0
        selectedSuggestion.value = suggestions.value[0]
      } else {
        hoverIndex.value = -1
        selectedSuggestion.value = null
      }
    } catch (e:any) {
      searchError.value = 'Search failed'
      suggestions.value = []
    } finally {
      loadingSearch.value = false
    }
  }, 250)
}
function clearSuggestions() { suggestions.value = []; selectedSuggestion.value = null; hoverIndex.value = -1 }
function highlightNext() {
  if (!suggestions.value.length) return
  if (hoverIndex.value < suggestions.value.length - 1) hoverIndex.value++
  else hoverIndex.value = 0
  selectedSuggestion.value = suggestions.value[hoverIndex.value]
}
function highlightPrev() {
  if (!suggestions.value.length) return
  if (hoverIndex.value > 0) hoverIndex.value--
  else hoverIndex.value = suggestions.value.length - 1
  selectedSuggestion.value = suggestions.value[hoverIndex.value]
}
function useFromSuggestion(f: Feature) { selectedSuggestion.value = f; useSelected() }
function enterUse() { if (selectedSuggestion.value) useSelected() }
function useSelected() {
  if (!selectedSuggestion.value) return
  const f = selectedSuggestion.value
  // GeoJSON coordinates are [x, y] order; Cape Lo: Y=Westing(~97k), X=Southing(~2.2M)
  const [x, y] = f.geometry?.coordinates || []
  if (typeof y === 'number' && typeof x === 'number') {
    form.y = y
    form.x = x
  }
  knownName.value = String(displayName(f) || '')
  q.value = ''
  suggestions.value = []
  selectedSuggestion.value = null
  // Focus distance field for next step
  // Leave as is; the user can continue entering observation
}

async function onCompute() {
  loading.value = true
  try {
    const res = await computePolar(form)
    result.value = res
  } catch (e: any) {
    result.value = { ok: false, error: e?.response?.data?.error || e.message }
  } finally {
    loading.value = false
  }
}
</script>

<style scoped></style>
