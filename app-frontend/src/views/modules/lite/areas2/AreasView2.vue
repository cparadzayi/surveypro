<script setup lang="ts">
// Simple alias wrapper so both filenames exist; actual content lives in Areas2View.vue
</script>

<template>
  <Areas2View />
  <!-- This wrapper keeps compatibility with the requested filename. -->
  <!-- The router will resolve Areas2View.vue for slug `areas2`. -->
</template>

<script lang="ts">
import Areas2View from './Areas2View.vue'
export default { name: 'AreasView2', components: { Areas2View } }
</script>
