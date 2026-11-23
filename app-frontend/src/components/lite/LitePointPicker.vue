<template>
  <fieldset class="space-y-2">
    <legend class="font-medium text-sm">{{ label }}</legend>
    <div class="relative">
      <input
        v-model="q"
        @input="onInput"
        @focus="onInput"
        @keydown.down.prevent="move(1)"
        @keydown.up.prevent="move(-1)"
        @keydown.enter.prevent="pickHighlighted()"
        @keydown.esc.prevent="close()"
        @blur="closeSoon()"
        class="rounded border px-2 py-1 text-sm w-full"
        :placeholder="store.layerId ? 'Find a point: this session or the layer' : 'Find a point from this session (choose a layer to search it too)'"
        :aria-label="`${label}: find point`" />
      <ul v-if="open && options.length" class="absolute z-20 mt-1 w-full border rounded bg-white shadow max-h-56 overflow-auto text-sm">
        <li
          v-for="(o, i) in options"
          :key="o.key"
          @mousedown.prevent="pick(o)"
          @mouseenter="highlight = i"
          :class="['px-2 py-1 cursor-pointer flex justify-between gap-2', i === highlight ? 'bg-slate-100' : '']">
          <span><span class="font-medium">{{ o.name }}</span> <span class="text-gray-500">Y {{ fmt(o.y) }}, X {{ fmt(o.x) }}</span></span>
          <span :class="['text-[10px] rounded px-1', o.fromLayer ? 'bg-slate-200 text-slate-700' : 'bg-indigo-100 text-indigo-700']">{{ o.tag }}</span>
        </li>
      </ul>
      <div v-if="searching" class="text-xs text-gray-500 mt-1">Searching the layer…</div>
      <div v-if="searchError" class="text-xs text-red-600 mt-1">{{ searchError }}</div>
    </div>
    <div class="grid grid-cols-3 gap-2">
      <label class="text-xs text-gray-600">Name
        <input :value="modelValue.name" @input="set('name', ($event.target as HTMLInputElement).value)" type="text" class="input w-full" placeholder="e.g. 87C" />
      </label>
      <label class="text-xs text-gray-600">Y (westing)
        <input :value="numText(modelValue.y)" @input="setNum('y', ($event.target as HTMLInputElement).value)" type="number" step="0.001" class="input w-full" />
      </label>
      <label class="text-xs text-gray-600">X (southing)
        <input :value="numText(modelValue.x)" @input="setNum('x', ($event.target as HTMLInputElement).value)" type="number" step="0.001" class="input w-full" />
      </label>
    </div>
  </fieldset>
</template>

<script setup lang="ts">
/**
 * One point of a Lite computation: find it among this session's working points (anything picked, typed or
 * computed in any Lite module) or in the shared points layer, or type its name, Y and X. Layer points are read
 * with featureYX, which copes with both co-ordinate orders the layers hold.
 */
import { ref, computed } from 'vue'
import { useLiteWorkingPointsStore } from '../../stores/liteWorkingPoints'
import { searchFeatures, type Feature } from '../../services/spatial'
import { featureYX } from '../../utils/join'

export interface PickedPoint { name: string; y: number | null; x: number | null }

const props = defineProps<{ label: string; modelValue: PickedPoint }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: PickedPoint): void }>()

const store = useLiteWorkingPointsStore()
const q = ref('')
const open = ref(false)
const highlight = ref(0)
const layerHits = ref<Feature[]>([])
const searching = ref(false)
const searchError = ref('')
let timer: ReturnType<typeof setTimeout> | null = null

interface Option { key: string; name: string; y: number; x: number; tag: string; fromLayer: boolean }

const options = computed<Option[]>(() => {
  const session: Option[] = store.matching(q.value, 8).map((p) => ({
    key: `s:${p.name}`, name: p.name, y: p.y, x: p.x, tag: p.source === 'layer' ? 'recent' : p.source, fromLayer: false,
  }))
  const seen = new Set(session.map((o) => o.name.toLowerCase()))
  const layer: Option[] = []
  for (const f of layerHits.value) {
    const yx = featureYX(f)
    const name = String(f.properties?.name ?? f.properties?.beacon ?? f.properties?.point_name ?? f.id)
    if (!yx || seen.has(name.toLowerCase())) continue
    layer.push({ key: `l:${f.id}`, name, y: yx.y, x: yx.x, tag: 'layer', fromLayer: true })
  }
  return [...session, ...layer]
})

function onInput() {
  open.value = true
  highlight.value = 0
  searchError.value = ''
  if (timer) clearTimeout(timer)
  const text = q.value.trim()
  if (!store.layerId || !text) { layerHits.value = []; return }
  timer = setTimeout(async () => {
    searching.value = true
    try {
      const rows = await searchFeatures(store.layerId!, text, 20)
      const t = text.toLowerCase()
      layerHits.value = rows.filter((r) => String(r.properties?.name ?? r.properties?.beacon ?? r.properties?.point_name ?? r.id).toLowerCase().includes(t))
    } catch {
      layerHits.value = []
      searchError.value = 'The layer search failed'
    } finally {
      searching.value = false
    }
  }, 250)
}

function move(step: number) {
  if (!options.value.length) return
  open.value = true
  highlight.value = (highlight.value + step + options.value.length) % options.value.length
}
function pickHighlighted() { const o = options.value[highlight.value]; if (o) pick(o) }
function pick(o: Option) {
  emit('update:modelValue', { name: o.name, y: o.y, x: o.x })
  if (o.fromLayer) store.add({ name: o.name, y: o.y, x: o.x, source: 'layer' })
  q.value = ''
  layerHits.value = []
  close()
}
function close() { open.value = false }
function closeSoon() { setTimeout(close, 150) }

function set(field: 'name', v: string) { emit('update:modelValue', { ...props.modelValue, [field]: v }) }
function setNum(field: 'y' | 'x', v: string) {
  const n = v.trim() === '' ? null : Number(v)
  emit('update:modelValue', { ...props.modelValue, [field]: n !== null && Number.isFinite(n) ? n : null })
}
const numText = (v: number | null) => (v === null || v === undefined ? '' : String(v))
const fmt = (v: number) => v.toFixed(2)
</script>
