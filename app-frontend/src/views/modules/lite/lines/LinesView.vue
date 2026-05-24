<template>
  <ModuleScaffold title="Lite • Lines & Bearings" description="Bearing & distance computations." :breadcrumbs="breadcrumbs">
    <template #actions>
      <button class="px-2 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700">New Line</button>
    </template>
    <div class="text-xs text-gray-500">(Placeholder) Line/bearing tools will appear here.</div>
  </ModuleScaffold>
</template>
<script setup lang="ts">
import ModuleScaffold from '../../../../components/scaffold/ModuleScaffold.vue'
const breadcrumbs = [
  { label: 'Lite', to: '/modules/lite' },
  { label: 'Lines & Bearings' }
]
</script>
