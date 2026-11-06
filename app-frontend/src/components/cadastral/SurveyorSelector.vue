<template>
  <div class="surveyor-selector">
    <div class="mb-4">
      <label class="block text-sm font-medium text-gray-700 mb-2">
        Select Surveyor *
      </label>
      <div class="flex gap-2">
        <select
          v-model="selectedSurveyorId"
          @change="onSurveyorChange"
          class="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          :disabled="loading"
        >
          <option value="">-- Select a surveyor --</option>
          <option v-for="option in surveyorOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
        <button
          v-if="authStore.isAdmin"
          type="button"
          @click="showAddModal = true"
          class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
          title="Add New Surveyor"
        >
          <span class="text-lg">+</span>
        </button>
      </div>
      <p v-if="error" class="mt-1 text-sm text-red-600">{{ error }}</p>
    </div>

    <!-- Surveyor Information Display -->
    <div v-if="selectedSurveyor" class="bg-gray-50 rounded-lg p-4 mb-4">
      <h3 class="text-sm font-semibold text-gray-700 mb-2">Surveyor Information</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        <div>
          <span class="font-medium text-gray-600">Name:</span>
          <span class="ml-2 text-gray-900">{{ selectedSurveyor.name }}</span>
        </div>
        <div>
          <span class="font-medium text-gray-600">License:</span>
          <span class="ml-2 text-gray-900">{{ selectedSurveyor.license_number }}</span>
        </div>
        <div v-if="selectedSurveyor.firm">
          <span class="font-medium text-gray-600">Firm:</span>
          <span class="ml-2 text-gray-900">{{ selectedSurveyor.firm }}</span>
        </div>
        <div v-if="selectedSurveyor.phone">
          <span class="font-medium text-gray-600">Phone:</span>
          <span class="ml-2 text-gray-900">{{ selectedSurveyor.phone }}</span>
        </div>
        <div v-if="selectedSurveyor.address" class="md:col-span-2">
          <span class="font-medium text-gray-600">Address:</span>
          <span class="ml-2 text-gray-900">{{ selectedSurveyor.address }}</span>
        </div>
      </div>
    </div>

    <!-- Add Surveyor: creates the account and shows the administrator a set-password link -->
    <AddSurveyorModal v-if="showAddModal" @close="showAddModal = false" @created="onSurveyorCreated" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useSurveyors, type Surveyor, type CreatedSurveyor } from '../../composables/useSurveyors'
import { useAuthStore } from '../../stores/auth'
import AddSurveyorModal from './AddSurveyorModal.vue'

const props = defineProps<{
  modelValue?: number | null
  autoSelectCurrentUser?: boolean // New prop to control auto-selection
}>()

const emit = defineEmits<{
  'update:modelValue': [value: number | null]
  'surveyor-selected': [surveyor: Surveyor | null]
}>()

const authStore = useAuthStore()
const { surveyors, surveyorOptions, loading, error, fetchSurveyors } = useSurveyors()

const selectedSurveyorId = ref<number | string>(props.modelValue || '')
const showAddModal = ref(false)
const selectedSurveyor = computed(() => {
  if (!selectedSurveyorId.value) return null
  return surveyors.value.find(s => s.id === Number(selectedSurveyorId.value)) || null
})

const onSurveyorChange = () => {
  const id = selectedSurveyorId.value ? Number(selectedSurveyorId.value) : null
  emit('update:modelValue', id)
  emit('surveyor-selected', selectedSurveyor.value)
}

const autoSelectCurrentSurveyor = () => {
  // Only auto-select if enabled (default true) and not already selected
  if (props.autoSelectCurrentUser === false) return
  if (selectedSurveyorId.value) return // Don't override existing selection
  
  const currentSurveyor = authStore.currentSurveyor
  if (currentSurveyor && currentSurveyor.id) {
    console.log('🔄 Auto-selecting logged-in surveyor:', currentSurveyor.name)
    selectedSurveyorId.value = currentSurveyor.id
    onSurveyorChange()
  }
}

const onSurveyorCreated = ({ surveyor }: CreatedSurveyor) => {
  selectedSurveyorId.value = surveyor.id
  onSurveyorChange()
  showAddModal.value = false
}

watch(() => props.modelValue, (newVal) => {
  selectedSurveyorId.value = newVal || ''
})

// Watch surveyors list and auto-select when loaded
watch(() => surveyors.value.length, () => {
  if (surveyors.value.length > 0) {
    autoSelectCurrentSurveyor()
  }
})

onMounted(async () => {
  await fetchSurveyors()
  // Auto-select current surveyor after fetching the list
  autoSelectCurrentSurveyor()
})
</script>

<style scoped>
/* Add any custom styles here */
</style>
