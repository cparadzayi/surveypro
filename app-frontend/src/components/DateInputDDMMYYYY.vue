<template>
  <input
    type="text"
    inputmode="numeric"
    :value="text"
    :placeholder="placeholder"
    :maxlength="10"
    @input="onInput"
    @blur="commit"
    @keydown.enter="commit"
    @focus="selectAll"
  />
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { parseSurveyDate, formatSurveyDate, toISODate } from '../utils/surveyDate'

const props = withDefaults(
  defineProps<{
    modelValue?: string
    placeholder?: string
  }>(),
  {
    modelValue: '',
    placeholder: 'dd/mm/yyyy',
  },
)

const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

const text = ref<string>(display(props.modelValue))
let editing = false

/**
 * The dd/mm/yyyy form of a value that a Zimbabwean surveyor wrote.
 * Anything that cannot be read renders blank -- as the native date input did.
 */
function display(value: string): string {
  const date = parseSurveyDate(value)
  return date ? formatSurveyDate(date) : ''
}

watch(
  () => props.modelValue,
  (next) => {
    if (editing) return
    text.value = display(next)
  },
)

/** Mask as dd/mm/yyyy while typing; only the digits are kept. */
function onInput(e: Event) {
  editing = true
  const input = e.target as HTMLInputElement
  const digits = input.value.replace(/\D/g, '').slice(0, 8)
  if (!digits) {
    text.value = ''
    return
  }
  const dd = digits.slice(0, 2)
  const mm = digits.slice(2, 4)
  const yyyy = digits.slice(4, 8)
  let masked = dd
  if (mm) masked += '/' + mm
  if (yyyy) masked += '/' + yyyy
  text.value = masked
}

/** A date leaves the field as yyyy-mm-dd for storage; never in the middle. */
function commit() {
  editing = false
  const value = text.value.trim()
  if (!value) {
    text.value = ''
    if (props.modelValue !== '') emit('update:modelValue', '')
    return
  }
  const date = parseSurveyDate(value)
  if (date) {
    text.value = formatSurveyDate(date)
    const iso = toISODate(date)
    if (iso !== props.modelValue) emit('update:modelValue', iso)
  } else {
    text.value = display(props.modelValue)
  }
}

function selectAll(e: Event) {
  ;(e.target as HTMLInputElement).select()
}
</script>