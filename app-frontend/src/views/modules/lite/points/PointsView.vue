<template>
  <ModuleScaffold title="Lite • Data • Points" description="View, search and filter the points of a survey project or a points layer, on a table and a map." :breadcrumbs="breadcrumbs" :tabs="ribbonTabs" @action="runRibbonAction">
    <div class="flex flex-wrap items-end gap-3 mb-3">
      <LiteLayerBar class="flex-1" />
      <button class="px-2 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700" @click="refresh" :disabled="!hasSource">Refresh</button>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div>
        <DataMap :layer-id="layerId" :items="store.items" />
      </div>
      <div>
        <PointsTable />
      </div>
    </div>
  </ModuleScaffold>
</template>
<script setup lang="ts">
import { watch, onMounted, defineAsyncComponent, computed } from 'vue'
import ModuleScaffold from '../../../../components/scaffold/ModuleScaffold.vue'
import { group, btn, type RibbonTab } from '../../../../components/ribbon/types'
import LiteLayerBar from '../../../../components/lite/LiteLayerBar.vue'
const DataMap = defineAsyncComponent(() => import('../../../../components/maps/DataMap.vue'))
import PointsTable from '../../../../components/tables/PointsTable.vue'
import { useSpatialStore } from '../../../../stores/spatial'
import { useLiteWorkingPointsStore } from '../../../../stores/liteWorkingPoints'

const store = useSpatialStore()
// The source the Lite modules share (a survey project or a points layer): chosen here, Join, Polar,
// Intersections and Areas v2 search it too.
const lite = useLiteWorkingPointsStore()
const layerId = computed(() => lite.activeLayerId)
const hasSource = computed(() => !!(lite.activeLayerId || lite.activeSurveyProjectId))

/** A survey project's coordinate points as point features, [Y, X] as the server stores layer points. */
function surveyFeatures() {
  return lite.surveyPoints.map((p, i) => ({
    id: i + 1, layer_id: 0, project_id: lite.surveyProjectId ?? 0,
    geometry: { type: 'Point', coordinates: [p.y, p.x] },
    properties: { name: p.name, description: p.description ?? '' },
  }))
}

async function show() {
  if (lite.activeSurveyProjectId) {
    await lite.loadSurveyPoints()
    store.setStaticFeatures(surveyFeatures())
  } else {
    store.setLayer(lite.activeLayerId)
  }
  await store.fetch()
}

const breadcrumbs = [
  { label: 'Lite', to: '/modules/lite' },
  { label: 'Data', to: '/modules/lite/points' },
  { label: 'Points' }
]

watch(() => [lite.sourceKind, lite.surveyProjectId, lite.layerId], () => { void show() })
// A reload of the survey project's points (Reload, or the first load) shows them.
watch(() => lite.surveyPoints, () => { if (lite.activeSurveyProjectId) { store.setStaticFeatures(surveyFeatures()); void store.fetch() } })

async function refresh() {
  if (lite.activeSurveyProjectId) await lite.loadSurveyPoints(true)
  await show()
}

onMounted(() => { void show() })

// ── Ribbon: Data / results toolbar ────────────────────────────────────────────
const pages = computed(() => Math.max(1, Math.ceil(store.total / store.limit)))

const ribbonTabs = computed<RibbonTab[]>(() => [
  {
    id: 'data',
    label: 'Data',
    icon: '🗂️',
    groups: [
      group('Load', [
        btn({ id: 'pts-refresh', icon: '🔄', label: 'Refresh', disabled: !hasSource.value, title: 'Reload the points of the chosen project or layer' }),
      ], 'Reloads the chosen survey project or layer from the database.'),
      group('Results', [
        btn({ id: 'pts-prev', icon: '⏮️', label: 'Prev', large: false, disabled: !hasSource.value || store.page <= 1 }),
        btn({ id: 'pts-next', icon: '⏭️', label: 'Next', large: false, disabled: !hasSource.value || store.page >= pages.value }),
      ], `${store.total} results · page ${store.page} of ${pages.value}`),
    ],
  },
])

async function runRibbonAction(id: string) {
  if (id === 'pts-refresh') {
    await refresh()
  } else if (id === 'pts-prev') {
    if (store.page > 1) { store.page--; await store.fetch() }
  } else if (id === 'pts-next') {
    if (store.page < pages.value) { store.page++; await store.fetch() }
  }
}
</script>
