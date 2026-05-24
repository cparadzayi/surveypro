<template>
  <div class="space-y-4">
    <nav class="text-[11px] text-gray-500 flex items-center gap-1" aria-label="Breadcrumb">
      <span v-for="(bc,i) in breadcrumbs" :key="i" class="flex items-center gap-1">
        <RouterLink v-if="bc.to" :to="bc.to" class="hover:text-indigo-600">{{ bc.label }}</RouterLink>
        <span v-else>{{ bc.label }}</span>
        <span v-if="i < breadcrumbs.length - 1" class="opacity-50">/</span>
      </span>
    </nav>
    <header class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
      <div>
        <h2 class="text-xl font-semibold tracking-tight">{{ title }}</h2>
        <p v-if="description" class="text-xs text-gray-600 max-w-prose">{{ description }}</p>
      </div>
      <div class="flex items-center gap-2" v-if="$slots.actions">
        <slot name="actions" />
      </div>
    </header>
    <div class="rounded border bg-white p-4 shadow-sm min-h-[160px]">
      <template v-if="loading">
        <slot name="loading">
          <div class="py-8 text-sm text-gray-600">Loading…</div>
        </slot>
      </template>
      <template v-else-if="error">
        <slot name="error">
          <div class="rounded border border-red-300 bg-red-50 p-3 text-red-700 text-sm">{{ errorMessage }}</div>
        </slot>
      </template>
      <template v-else-if="empty">
        <slot name="empty">
          <div class="py-8 text-center text-sm text-gray-500">No data</div>
        </slot>
      </template>
      <template v-else>
        <slot />
      </template>
    </div>
  </div>
</template>
<script lang="ts" setup>
import { computed, useSlots, withDefaults } from 'vue'

interface Crumb { label: string; to?: string }
interface Props {
  title: string;
  description?: string;
  breadcrumbs?: Crumb[];
  loading?: boolean;
  error?: boolean | string;
  empty?: boolean;
}
const props = withDefaults(defineProps<Props>(), { breadcrumbs: () => [] })
const errorMessage = computed(() => typeof props.error === 'string' ? props.error : 'An unexpected error occurred.')
// Declare named slots for TS template inference
defineSlots<{
  actions?: () => any
  loading?: () => any
  error?: () => any
  empty?: () => any
  default?: () => any
}>()
</script>
<script lang="ts">
export default { name: 'ModuleScaffold' }
</script>
