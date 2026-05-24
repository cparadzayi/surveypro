<template>
  <div class="text-center py-10">
    <div class="text-4xl mb-3" aria-hidden="true">🗂️</div>
    <h3 class="text-sm font-semibold text-gray-800 tracking-wide uppercase"><slot name="title">No Data</slot></h3>
    <p class="mt-2 text-sm text-gray-500"><slot name="description">There is nothing to display yet.</slot></p>
    <div class="mt-4"><slot name="actions" /></div>
  </div>
</template>
<script setup lang="ts">
// Stateless component
defineOptions({ name: 'EmptyState' })
</script>

<script lang="ts">
export default { name: 'EmptyState' }
</script>
