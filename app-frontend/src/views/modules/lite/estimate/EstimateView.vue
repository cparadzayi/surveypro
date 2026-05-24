<script setup lang="ts">
// Thin loader re-exporting the shared EstimateView
</script>
<template>
  <SharedEstimateView />
</template>
<script lang="ts">
import SharedEstimateView from '../finance/EstimateView.vue'
export default { name: 'EstimateView', components: { SharedEstimateView } }
</script>
