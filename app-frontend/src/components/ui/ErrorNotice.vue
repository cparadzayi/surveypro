<template>
  <div class="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-700" role="alert">
    <div class="font-semibold mb-1">Error</div>
    <p><slot>An unexpected error occurred.</slot></p>
    <button v-if="retry" @click="retry" class="mt-2 inline-flex items-center rounded bg-red-600 px-2 py-1 text-white text-xs hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-red-500">Retry</button>
  </div>
</template>
<script setup lang="ts">
interface Props { retry?: () => void }
const props = defineProps<Props>()
// Expose retry for template
const retry = props.retry
defineOptions({ name: 'ErrorNotice' })
</script>

<script lang="ts">
export default { name: 'ErrorNotice' }
</script>
