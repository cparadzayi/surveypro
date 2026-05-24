<template>
  <ModuleScaffold title="Topographical • DTM" description="Digital terrain modeling tools (planned)." :breadcrumbs="breadcrumbs">
    <p class="text-xs text-gray-600">(Placeholder) Triangulation & surface interpolation pipeline coming.</p>
  </ModuleScaffold>
</template>
<script setup lang="ts">
import ModuleScaffold from '../../../../components/scaffold/ModuleScaffold.vue'
const breadcrumbs = [
  { label: 'Topographical', to: '/modules/topographical' },
  { label: 'DTM' }
]
</script>
