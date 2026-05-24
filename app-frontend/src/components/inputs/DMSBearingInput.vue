<template>
  <div class="flex flex-col">
    <div class="flex items-center gap-1">
      <input
        v-model="d"
        type="number"
        min="0"
        max="359"
        :class="['input w-16', invalid ? 'border-red-500' : '']"
        aria-label="Degrees" />
    <span class="text-xs">°</span>
      <input
        v-model="m"
        type="number"
        min="0"
        max="59"
        :class="['input w-14', invalid ? 'border-red-500' : '']"
        aria-label="Minutes" />
    <span class="text-xs">′</span>
      <input
        v-model="s"
        type="number"
        step="0.01"
        min="0"
        max="59.9999"
        :class="['input w-20', invalid ? 'border-red-500' : '']"
        aria-label="Seconds" />
    <span class="text-xs">″</span>
    <span class="text-[11px] text-gray-500">(D:M:S, min/sec &lt; 60; 0°=S)</span>
    </div>
    <div v-if="invalid" class="text-[11px] text-red-600 mt-0.5">Invalid DMS: 0 ≤ D &lt; 360, 0 ≤ M,S &lt; 60</div>
  </div>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue'
import { decimalToDMS, dmsToDecimalStrict } from '../../utils/dms'

const props = defineProps<{ modelValue: number }>()
const emit = defineEmits<{ (e:'update:modelValue', v:number):void }>()

const invalid = ref(false)
const d = ref<string>('0')
const m = ref<string>('0')
const s = ref<string>('0')

function syncFromModel() {
  const { D, M, S } = decimalToDMS(props.modelValue)
  d.value = String(D)
  m.value = String(M)
  // Preserve decimals in seconds to two places by default for a stable view
  s.value = String(Number(S.toFixed(2)))
}

// Initialize local fields
syncFromModel()

// When modelValue changes externally (or via a valid emit), refresh local fields
watch(() => props.modelValue, () => {
  if (!invalid.value) syncFromModel()
})

// Validate and emit on any local change
watch([d, m, s], () => {
  const D = Number(d.value)
  const M = Number(m.value)
  const S = Number(s.value)
  // Empty inputs should not blow up; treat as invalid until filled
  if (d.value === '' || m.value === '' || s.value === '' || !Number.isFinite(D) || !Number.isFinite(M) || !Number.isFinite(S)) {
    invalid.value = true
    return
  }
  const next = dmsToDecimalStrict({ D, M, S })
  invalid.value = next === null
  if (next !== null) emit('update:modelValue', next)
})
</script>

<script lang="ts">
export default { name: 'DMSBearingInput' }
</script>

<style scoped>
/* Using utility classes inline in template */
</style>
