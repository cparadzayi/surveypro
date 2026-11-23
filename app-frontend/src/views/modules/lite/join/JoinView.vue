<template>
  <ModuleScaffold
    title="Lite • Join"
    :breadcrumbs="[{ label: 'Home', to: '/' }, { label: 'Lite', to: '/modules/lite' }, { label: 'Join' }]"
    description="Direction and distance between two points (reverse polar), P(Y,X), south-oriented."
    :tabs="ribbonTabs"
    @action="runRibbonAction"
  >
    <LiteLayerBar class="mb-3" />
    <form class="grid grid-cols-1 sm:grid-cols-2 gap-4" @submit.prevent="onCompute">
      <LitePointPicker v-model="from" label="From point A (Y, X)" />
      <LitePointPicker v-model="to" label="To point B (Y, X)" />
      <div class="sm:col-span-2 flex flex-wrap items-center gap-2">
        <button class="inline-flex items-center gap-1 rounded border px-3 py-1 text-sm bg-indigo-600 text-white hover:bg-indigo-700">Compute join</button>
        <button type="button" class="rounded border px-3 py-1 text-sm hover:bg-gray-50" @click="swap">Swap A and B</button>
        <span class="text-xs text-gray-500">Convention: Y +west, X +south, 0° = South, clockwise. Distance banker's-rounded to 0.01 m, direction to 1″.</span>
      </div>
    </form>

    <div v-if="error" class="mt-4 text-sm text-red-600">{{ error }}</div>

    <div v-if="result" class="mt-4 p-3 rounded border bg-slate-50 text-sm">
      <div class="font-medium">{{ nameOf(from, 'A') }} → {{ nameOf(to, 'B') }}</div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
        <div><div class="text-xs text-gray-500">Direction</div><div class="font-mono text-base">{{ result.directionDms }}</div></div>
        <div><div class="text-xs text-gray-500">Distance (m)</div><div class="font-mono text-base">{{ result.distanceRounded.toFixed(2) }}</div></div>
        <div><div class="text-xs text-gray-500">ΔY (m)</div><div class="font-mono">{{ signed(result.dy) }}</div></div>
        <div><div class="text-xs text-gray-500">ΔX (m)</div><div class="font-mono">{{ signed(result.dx) }}</div></div>
      </div>
      <div class="mt-2 text-xs text-gray-600">
        Reverse ({{ nameOf(to, 'B') }} → {{ nameOf(from, 'A') }}): <span class="font-mono">{{ result.reverseDirectionDms }}</span>
      </div>
    </div>

    <section v-if="joins.length" class="mt-6">
      <div class="flex items-center gap-2 mb-2">
        <h3 class="font-medium text-sm">Joins this session</h3>
        <button type="button" class="ml-auto rounded border px-2 py-1 text-xs hover:bg-gray-50" @click="downloadCsv">Download CSV</button>
        <button type="button" class="rounded border px-2 py-1 text-xs hover:bg-gray-50" @click="joins = []">Clear list</button>
      </div>
      <table class="w-full text-xs border">
        <thead class="bg-gray-50">
          <tr>
            <th class="text-left px-2 py-1 border-b">From</th><th class="text-left px-2 py-1 border-b">To</th>
            <th class="text-right px-2 py-1 border-b">Direction</th><th class="text-right px-2 py-1 border-b">Distance (m)</th>
            <th class="text-right px-2 py-1 border-b">ΔY (m)</th><th class="text-right px-2 py-1 border-b">ΔX (m)</th><th class="border-b"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(j, i) in joins" :key="i" class="odd:bg-white even:bg-slate-50">
            <td class="px-2 py-1">{{ j.from }}</td><td class="px-2 py-1">{{ j.to }}</td>
            <td class="px-2 py-1 text-right font-mono">{{ j.result.directionDms }}</td>
            <td class="px-2 py-1 text-right font-mono">{{ j.result.distanceRounded.toFixed(2) }}</td>
            <td class="px-2 py-1 text-right font-mono">{{ signed(j.result.dy) }}</td>
            <td class="px-2 py-1 text-right font-mono">{{ signed(j.result.dx) }}</td>
            <td class="px-2 py-1 text-right"><button type="button" class="text-gray-400 hover:text-red-600" title="Remove" @click="joins.splice(i, 1)">✕</button></td>
          </tr>
        </tbody>
      </table>
    </section>
  </ModuleScaffold>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import ModuleScaffold from '../../../../components/scaffold/ModuleScaffold.vue'
import { group, btn, type RibbonTab } from '../../../../components/ribbon/types'
import LitePointPicker, { type PickedPoint } from '../../../../components/lite/LitePointPicker.vue'
import LiteLayerBar from '../../../../components/lite/LiteLayerBar.vue'
import { useLiteWorkingPointsStore } from '../../../../stores/liteWorkingPoints'
import { joinPoints, type JoinResult } from '../../../../utils/join'
import { bankersRound } from '../../../../utils/dms'
import { joinsCsv } from './joinsCsv'

const store = useLiteWorkingPointsStore()
const blank = (): PickedPoint => ({ name: '', y: null, x: null })
const from = ref<PickedPoint>(blank())
const to = ref<PickedPoint>(blank())
const result = ref<JoinResult | null>(null)
const error = ref('')
const joins = ref<Array<{ from: string; to: string; result: JoinResult }>>([])

const nameOf = (p: PickedPoint, fallback: string) => p.name.trim() || fallback
const signed = (v: number) => { const r = bankersRound(v, 2); return (r > 0 ? '+' : '') + r.toFixed(2) }

function onCompute() {
  error.value = ''
  result.value = null
  const a = from.value, b = to.value
  if (a.y === null || a.x === null || b.y === null || b.x === null) {
    error.value = 'Give both points a Y and an X, or pick them from the list.'
    return
  }
  const j = joinPoints({ y: a.y, x: a.x }, { y: b.y, x: b.x })
  if (!j) { error.value = 'The two points are the same: there is no direction between them.'; return }
  result.value = j
  joins.value.unshift({ from: nameOf(a, 'A'), to: nameOf(b, 'B'), result: j })
  // Named points typed in here become working points for the other Lite modules.
  for (const p of [a, b]) {
    if (p.name.trim() && !store.points.some((q) => q.name.toLowerCase() === p.name.trim().toLowerCase())) {
      store.add({ name: p.name, y: p.y!, x: p.x!, source: 'typed' })
    }
  }
}

function swap() {
  const t = from.value
  from.value = to.value
  to.value = t
  if (result.value) onCompute()
}

function resetAll() { from.value = blank(); to.value = blank(); result.value = null; error.value = '' }

function downloadCsv() {
  const blob = new Blob([joinsCsv(joins.value)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'joins.csv'
  a.click()
  URL.revokeObjectURL(url)
}

const ribbonTabs = computed<RibbonTab[]>(() => [
  {
    id: 'solve',
    label: 'Solve',
    icon: '🧮',
    groups: [
      group('Compute', [
        btn({ id: 'join-compute', icon: '🧮', label: 'Compute', tone: 'primary' }),
        btn({ id: 'join-swap', icon: '🔁', label: 'Swap' }),
        btn({ id: 'join-clear', icon: '🗑️', label: 'Clear', tone: 'danger' }),
      ], 'Direction and distance from A to B, south-oriented.'),
      group('Results', [
        btn({ id: 'join-csv', icon: '⬇️', label: 'CSV', disabled: !joins.value.length, title: 'Download the joins of this session' }),
      ]),
    ],
  },
])

function runRibbonAction(id: string) {
  if (id === 'join-compute') onCompute()
  else if (id === 'join-swap') swap()
  else if (id === 'join-clear') resetAll()
  else if (id === 'join-csv' && joins.value.length) downloadCsv()
}
</script>
