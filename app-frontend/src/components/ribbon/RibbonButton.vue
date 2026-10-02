<template>
  <button
    type="button"
    :disabled="disabled"
    :title="title || label"
    :aria-pressed="active ? 'true' : 'false'"
    class="rb-btn"
    :class="[
      large ? 'rb-btn-lg' : 'rb-btn-sm',
      active ? toneClass : 'rb-idle',
      disabled ? 'rb-disabled' : ''
    ]"
    @click="$emit('click')"
  >
    <span class="rb-icon" aria-hidden="true">{{ icon }}</span>
    <span class="rb-label">{{ label }}</span>
    <span v-if="badge !== null && badge !== undefined" class="rb-badge">{{ badge }}</span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { RibbonTone } from './types'

/**
 * One tile in a ribbon group. Big glyph over a caption, like the QGIS /
 * ArcGIS Pro ribbon. Purely presentational — the parent owns the behaviour.
 */
const props = withDefaults(defineProps<{
  icon: string
  label: string
  title?: string
  disabled?: boolean
  active?: boolean
  large?: boolean
  badge?: string | number | null
  tone?: RibbonTone
}>(), {
  title: '',
  disabled: false,
  active: false,
  large: true,
  badge: null,
  tone: 'default',
})

const TONE_CLASS: Record<RibbonTone, string> = {
  default: 'rb-on-primary',
  primary: 'rb-on-primary',
  success: 'rb-on-success',
  danger: 'rb-on-danger',
  warn: 'rb-on-warn',
  accent: 'rb-on-accent',
}

// computed, not a const: a tile can change tone as the view's mode changes
// (e.g. the basemap button flips between "Satellite" and "Street Map").
const toneClass = computed(() => TONE_CLASS[props.tone])

defineEmits<{ (e: 'click'): void }>()
</script>

<style scoped>
.rb-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 2px;
  border: 1px solid transparent;
  border-radius: 0.375rem;
  padding: 6px 8px;
  line-height: 1.1;
  text-align: center;
  transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
  user-select: none;
}

.rb-btn-lg {
  min-width: 4.25rem;
  min-height: 3.5rem;
}

.rb-btn-sm {
  min-width: 3rem;
  min-height: 2.25rem;
  padding: 4px 6px;
}

.rb-btn-sm .rb-icon { font-size: 0.95rem; }
.rb-btn-sm .rb-label { font-size: 0.6rem; }

.rb-icon { font-size: 1.25rem; line-height: 1.1; }
.rb-label { font-size: 0.65rem; font-weight: 500; }

.rb-idle {
  background-color: #ffffff;
  border-color: #d1d5db;
  color: #374151;
}
.rb-idle:hover:not(.rb-disabled) {
  background-color: #f3f4f6;
  border-color: #9ca3af;
}

.rb-on-primary  { background-color: #2563eb; border-color: #1d4ed8; color: #ffffff; }
.rb-on-success  { background-color: #16a34a; border-color: #15803d; color: #ffffff; }
.rb-on-danger   { background-color: #dc2626; border-color: #b91c1c; color: #ffffff; }
.rb-on-warn     { background-color: #ca8a04; border-color: #a16207; color: #ffffff; }
.rb-on-accent   { background-color: #7c3aed; border-color: #6d28d9; color: #ffffff; }
.rb-on-primary:hover:not(.rb-disabled),
.rb-on-success:hover:not(.rb-disabled),
.rb-on-danger:hover:not(.rb-disabled),
.rb-on-warn:hover:not(.rb-disabled),
.rb-on-accent:hover:not(.rb-disabled) {
  filter: brightness(1.08);
}

.rb-disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.rb-badge {
  font-size: 0.6rem;
  font-weight: 700;
  padding: 0 4px;
  border-radius: 9999px;
  background-color: rgba(17, 24, 39, 0.12);
}
</style>
