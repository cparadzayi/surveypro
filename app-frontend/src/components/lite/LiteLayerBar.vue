<template>
  <div class="flex flex-wrap items-end gap-3 text-xs text-gray-600">
    <label class="block">
      Points layer (shared by the Lite modules)
      <LayerSelect :model-value="store.layerId" @update:model-value="store.setLayer" />
    </label>
    <span class="ml-auto">
      {{ store.points.length }} working point{{ store.points.length === 1 ? '' : 's' }} this session
      <button v-if="store.points.length" type="button" class="ml-2 underline text-gray-500 hover:text-red-600" @click="confirmClear">Clear</button>
    </span>
  </div>
</template>

<script setup lang="ts">
/** The points layer the Lite modules share, and the size of the shared working-points list. */
import LayerSelect from '../inputs/LayerSelect.vue'
import { useLiteWorkingPointsStore } from '../../stores/liteWorkingPoints'

const store = useLiteWorkingPointsStore()
function confirmClear() {
  if (window.confirm('Remove every working point from this session? Points saved to a layer are not affected.')) store.clear()
}
</script>
