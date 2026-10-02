<template>
  <ModuleScaffold title="Lite • Data • Points" description="Single source of truth: view, search and filter points from DB on a table and Leaflet map." :breadcrumbs="breadcrumbs" :tabs="ribbonTabs" @action="runRibbonAction">
    <div class="flex flex-wrap items-end gap-3 mb-3">
      <label class="block">
        <span class="text-xs text-gray-600">Project / Layer</span>
        <LayerSelect v-model="layerId" />
      </label>
      <button class="ml-auto px-2 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700" @click="refresh" :disabled="!layerId">Refresh</button>
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
import { ref, watch, onMounted, defineAsyncComponent, computed } from 'vue'
import ModuleScaffold from '../../../../components/scaffold/ModuleScaffold.vue'
import { group, btn, type RibbonTab } from '../../../../components/ribbon/types'
import LayerSelect from '../../../../components/inputs/LayerSelect.vue'
const DataMap = defineAsyncComponent(() => import('../../../../components/maps/DataMap.vue'))
import PointsTable from '../../../../components/tables/PointsTable.vue'
import { useSpatialStore } from '../../../../stores/spatial'

const store = useSpatialStore()
const layerId = ref<number | undefined>(undefined)

const breadcrumbs = [
  { label: 'Lite', to: '/modules/lite' },
  { label: 'Data', to: '/modules/lite/points' },
  { label: 'Points' }
]

watch(layerId, async (v) => {
  store.setLayer(v)
  await store.fetch()
})

async function refresh() { await store.fetch() }

onMounted(async () => { if (layerId.value) await store.fetch() })

// ── Ribbon: Data / results toolbar ────────────────────────────────────────────
const pages = computed(() => Math.max(1, Math.ceil(store.total / store.limit)))

const ribbonTabs = computed<RibbonTab[]>(() => [
  {
    id: 'data',
    label: 'Data',
    icon: '🗂️',
    groups: [
      group('Load', [
        btn({ id: 'pts-refresh', icon: '🔄', label: 'Refresh', disabled: !layerId.value, title: 'Reload features for the selected layer' }),
      ], 'Reloads the selected layer from the database.'),
      group('Results', [
        btn({ id: 'pts-prev', icon: '⏮️', label: 'Prev', large: false, disabled: !layerId.value || store.page <= 1 }),
        btn({ id: 'pts-next', icon: '⏭️', label: 'Next', large: false, disabled: !layerId.value || store.page >= pages.value }),
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
