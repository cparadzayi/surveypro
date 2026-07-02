<template>
  <div class="parcel-select" @keydown.esc.prevent="close">
    <input
      ref="inputEl"
      type="text"
      class="parcel-select__input"
      :placeholder="placeholder"
      :disabled="disabled"
      v-model="query"
      @focus="onFocus"
      @input="onInput"
      @keydown.down.prevent="move(1)"
      @keydown.up.prevent="move(-1)"
      @keydown.enter.prevent="pickHighlighted"
    />
    <ul v-if="isOpen" class="parcel-select__list">
      <li v-if="filtered.length === 0" class="parcel-select__empty">No parcels</li>
      <li
        v-for="(opt, i) in filtered"
        :key="opt.id"
        class="parcel-select__row"
        :class="{ 'is-active': i === highlight }"
        @mousedown.prevent="pick(opt)"
        @mousemove="highlight = i"
      >
        <span class="parcel-select__primary">{{ labelForOption(opt).primary }}</span>
        <span v-if="labelForOption(opt).secondary" class="parcel-select__secondary">
          {{ labelForOption(opt).secondary }}
        </span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  filterParcelOptions, nextHighlightIndex, labelForOption, type ParcelOption,
} from './parcelSelect'

const props = withDefaults(defineProps<{
  options: ParcelOption[]
  modelValue: string | number | null
  disabled?: boolean
  placeholder?: string
}>(), {
  disabled: false,
  placeholder: 'Search stand or designation…',
})

const emit = defineEmits<{
  (e: 'update:modelValue', v: string | number | null): void
  (e: 'select', option: ParcelOption): void
}>()

const inputEl = ref<HTMLInputElement | null>(null)
const query = ref('')
const isOpen = ref(false)
const highlight = ref(-1)

const filtered = computed(() => filterParcelOptions(props.options, query.value))
const selectedOption = computed(() =>
  props.options.find(o => String(o.id) === String(props.modelValue)) ?? null)

// When closed, keep the input text showing the current external selection.
watch([selectedOption, isOpen], ([opt, open]) => {
  if (!open) query.value = opt ? labelForOption(opt).primary : ''
}, { immediate: true })

function onFocus() {
  if (props.disabled) return
  isOpen.value = true
  query.value = ''          // fresh search on focus
  highlight.value = -1
}
function close() {
  isOpen.value = false
  query.value = selectedOption.value ? labelForOption(selectedOption.value).primary : ''
}
function onInput() {
  isOpen.value = true
  highlight.value = filtered.value.length ? 0 : -1
}
function move(direction: 1 | -1) {
  isOpen.value = true
  highlight.value = nextHighlightIndex(highlight.value, filtered.value.length, direction)
}
function pickHighlighted() {
  const opt = filtered.value[highlight.value]
  if (opt) pick(opt)
}
function pick(opt: ParcelOption) {
  emit('update:modelValue', opt.id)
  emit('select', opt)
  isOpen.value = false
  query.value = labelForOption(opt).primary
  inputEl.value?.blur()
}
</script>

<style scoped>
.parcel-select { position: relative; }
.parcel-select__input {
  width: 100%; padding: 0.4rem 0.6rem; border: 1px solid #cbd5e1;
  border-radius: 0.375rem; font-size: 0.8rem;
}
.parcel-select__input:disabled { background: #f1f5f9; cursor: not-allowed; }
.parcel-select__list {
  position: absolute; z-index: 50; top: 100%; left: 0; right: 0; margin-top: 2px;
  max-height: 16rem; overflow-y: auto; background: #fff; list-style: none;
  border: 1px solid #cbd5e1; border-radius: 0.375rem; padding: 0.25rem 0;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}
.parcel-select__row { display: flex; flex-direction: column; padding: 0.35rem 0.6rem; cursor: pointer; }
.parcel-select__row.is-active { background: #eff6ff; }
.parcel-select__primary { font-size: 0.8rem; color: #0f172a; }
.parcel-select__secondary { font-size: 0.7rem; color: #64748b; }
.parcel-select__empty { padding: 0.5rem 0.6rem; font-size: 0.8rem; color: #94a3b8; }
</style>
