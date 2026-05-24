<template>
  <div class="border rounded">
    <div class="flex items-center gap-2 p-2 border-b bg-gray-50 text-sm">
      <input v-model="q" @input="onInput" placeholder="Search points" class="border rounded px-2 py-1 w-64" />
      <span class="ml-auto text-xs text-gray-500" v-if="!store.loading">{{ store.total }} results</span>
      <span class="ml-auto text-xs text-gray-500" v-else>Loading…</span>
    </div>
    <div class="overflow-auto">
      <table class="min-w-full text-sm">
        <thead>
          <tr class="text-left text-gray-600">
            <th class="p-2">#</th>
            <th class="p-2">Name</th>
            <th class="p-2">Y</th>
            <th class="p-2">X</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="f in store.items" :key="f.id" class="border-t">
            <td class="p-2">{{ f.id }}</td>
            <td class="p-2">{{ nameOf(f) }}</td>
            <td class="p-2">{{ yOf(f) }}</td>
            <td class="p-2">{{ xOf(f) }}</td>
          </tr>
          <tr v-if="!store.items.length && !store.loading"><td colspan="4" class="p-3 text-center text-xs text-gray-500">No results</td></tr>
        </tbody>
      </table>
    </div>
    <div class="flex items-center gap-2 p-2 border-t text-sm">
      <button class="px-2 py-1 border rounded" :disabled="store.page<=1" @click="prev">Prev</button>
      <span>Page {{ store.page }}</span>
      <button class="px-2 py-1 border rounded" :disabled="store.page>=pages" @click="next">Next</button>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useSpatialStore } from '../../stores/spatial'

const store = useSpatialStore()
const q = ref(store.search)
let timer: any
function onInput() {
  clearTimeout(timer)
  timer = setTimeout(async () => {
    store.setSearch(q.value)
    await store.fetch()
  }, 300)
}
const pages = computed(() => Math.max(1, Math.ceil(store.total / store.limit)))
async function prev() { if (store.page>1) { store.page--; await store.fetch() } }
async function next() { if (store.page<pages.value) { store.page++; await store.fetch() } }
function nameOf(f:any){ return f.properties?.name || f.properties?.beacon || f.properties?.point_name || '' }
// GeoJSON coordinates are [x, y] order; Cape Lo: Y=Westing(~97k), X=Southing(~2.2M)
function yOf(f:any){ return Array.isArray(f.geometry?.coordinates) ? f.geometry.coordinates[1] : '' }
function xOf(f:any){ return Array.isArray(f.geometry?.coordinates) ? f.geometry.coordinates[0] : '' }
</script>
<script lang="ts">
export default { name: 'PointsTable' }
</script>
