<template>
  <div class="text-[11px] bg-white/95 border rounded shadow-sm max-w-[260px]" role="region" aria-label="The register around this survey">
    <button type="button" class="w-full flex items-center justify-between gap-2 px-2 py-1.5 font-medium text-gray-800 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded"
      :aria-pressed="ctx.enabled.value" @click="ctx.toggle()">
      <span>Register around this survey</span>
      <span :class="ctx.enabled.value ? 'text-indigo-700' : 'text-gray-500'">{{ ctx.loading.value ? 'Loading…' : ctx.enabled.value ? 'On' : 'Off' }}</span>
    </button>

    <div v-if="ctx.enabled.value" class="px-2 pb-2 space-y-1.5 border-t">
      <p v-if="ctx.error.value" class="pt-1.5 text-amber-800" role="status">{{ ctx.error.value }}</p>
      <template v-else-if="ctx.loaded.value">
        <ul class="pt-1.5 space-y-1">
          <li v-for="k in KINDS" :key="k.q" class="flex items-center gap-2">
            <svg width="26" height="8" aria-hidden="true"><line x1="1" y1="4" x2="25" y2="4" :stroke="QUALITY_COLOUR[k.q]" stroke-width="2" :stroke-dasharray="k.dash" /></svg>
            <span class="flex-1">{{ k.label }}</span>
            <span class="text-gray-500">{{ ctx.counts.value[k.q] }}</span>
          </li>
        </ul>
        <p v-if="ctx.counts.value.indicative" class="text-orange-800">
          Dotted outlines are digitised from maps and can be tens of metres out. Never set out from them.
        </p>
        <p v-if="ctx.loaded.value.context.truncated" class="text-amber-800">There is more here than can be shown; zoom in on the part you need.</p>
        <p class="text-gray-500">
          {{ ctx.loaded.value.offline ? 'Offline copy' : ctx.loaded.value.fromCache ? 'Copy kept on this device' : 'From the register' }}, taken {{ taken }}.
          <button type="button" class="text-indigo-700 hover:underline disabled:opacity-50" :disabled="ctx.loading.value" @click="ctx.refresh(true)">Refresh</button>
        </p>
        <p class="text-gray-400">Placed with this survey's own transformation: compare coordinates, not the picture.</p>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { QUALITY_COLOUR, type useRegisterContext } from '../../composables/useRegisterContext'
import type { Quality } from '../../services/registerContext'

const props = defineProps<{ ctx: ReturnType<typeof useRegisterContext> }>()
const KINDS: { q: Quality; label: string; dash: string }[] = [
  { q: 'approved', label: 'Approved stands', dash: '' },
  { q: 'council_survey', label: "Council's survey, awaiting approval", dash: '5 3' },
  { q: 'indicative', label: 'Indicative (digitised)', dash: '1 3' },
]
const taken = computed(() => {
  const d = props.ctx.asOf.value ? new Date(props.ctx.asOf.value) : null
  return d ? d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'at an unknown time'
})
</script>
