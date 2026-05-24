<template>
  <div class="live-csv-validator">
    <!-- Validation Status Banner -->
    <div 
      v-if="validationResult"
      class="mb-4 rounded-lg border-2 p-4 transition-all duration-300"
      :class="statusClasses"
    >
      <div class="flex items-start justify-between">
        <div class="flex items-start gap-3">
          <div class="text-3xl">{{ statusIcon }}</div>
          <div>
            <h3 class="text-lg font-semibold" :class="statusTextClass">
              {{ statusTitle }}
            </h3>
            <p class="text-sm mt-1" :class="statusTextClass">
              {{ validationSummary }}
            </p>
          </div>
        </div>
        
        <!-- Quick Stats -->
        <div class="flex gap-4 text-sm">
          <div class="text-center">
            <div class="text-2xl font-bold text-gray-700">{{ validationResult.stats.totalRows }}</div>
            <div class="text-gray-500">Total</div>
          </div>
          <div v-if="validationResult.stats.validRows > 0" class="text-center">
            <div class="text-2xl font-bold text-green-600">{{ validationResult.stats.validRows }}</div>
            <div class="text-gray-500">Valid</div>
          </div>
          <div v-if="validationResult.stats.errorRows > 0" class="text-center">
            <div class="text-2xl font-bold text-red-600">{{ validationResult.stats.errorRows }}</div>
            <div class="text-gray-500">Errors</div>
          </div>
          <div v-if="validationResult.stats.warningRows > 0" class="text-center">
            <div class="text-2xl font-bold text-yellow-600">{{ validationResult.stats.warningRows }}</div>
            <div class="text-gray-500">Warnings</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Validation Details -->
    <div v-if="validationResult && (hasErrors || hasWarnings)" class="space-y-4">
      <!-- Errors -->
      <div v-if="hasErrors" class="bg-red-50 border border-red-200 rounded-lg p-4">
        <div class="flex items-center justify-between mb-3">
          <h4 class="font-semibold text-red-900 flex items-center gap-2">
            <span class="text-xl">❌</span>
            Errors ({{ validationResult.errors.length }})
          </h4>
          <button
            @click="showAllErrors = !showAllErrors"
            class="text-sm text-red-700 hover:text-red-900 underline"
          >
            {{ showAllErrors ? 'Show Less' : 'Show All' }}
          </button>
        </div>
        
        <div class="space-y-2 max-h-64 overflow-y-auto">
          <div
            v-for="(error, index) in displayedErrors"
            :key="`error-${index}`"
            class="bg-white border border-red-300 rounded p-3 text-sm"
          >
            <div class="flex items-start justify-between">
              <div class="flex-1">
                <div class="font-medium text-red-900">
                  Row {{ error.row }}
                  <span v-if="error.column !== 'row' && error.column !== 'file'" class="text-red-700">
                    • Column: {{ error.column }}
                  </span>
                </div>
                <div class="text-red-800 mt-1">{{ error.error }}</div>
                <div v-if="error.suggestion" class="text-red-600 mt-1 italic">
                  💡 {{ error.suggestion }}
                </div>
              </div>
              <div class="ml-3 text-xs text-red-500 font-mono bg-red-100 px-2 py-1 rounded">
                {{ error.value || '(empty)' }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Warnings -->
      <div v-if="hasWarnings" class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div class="flex items-center justify-between mb-3">
          <h4 class="font-semibold text-yellow-900 flex items-center gap-2">
            <span class="text-xl">⚠️</span>
            Warnings ({{ validationResult.warnings.length }})
          </h4>
          <button
            @click="showAllWarnings = !showAllWarnings"
            class="text-sm text-yellow-700 hover:text-yellow-900 underline"
          >
            {{ showAllWarnings ? 'Show Less' : 'Show All' }}
          </button>
        </div>
        
        <div class="space-y-2 max-h-64 overflow-y-auto">
          <div
            v-for="(warning, index) in displayedWarnings"
            :key="`warning-${index}`"
            class="bg-white border border-yellow-300 rounded p-3 text-sm"
          >
            <div class="flex items-start justify-between">
              <div class="flex-1">
                <div class="font-medium text-yellow-900">
                  Row {{ warning.row }}
                  <span v-if="warning.column !== 'row'" class="text-yellow-700">
                    • Column: {{ warning.column }}
                  </span>
                </div>
                <div class="text-yellow-800 mt-1">{{ warning.error }}</div>
                <div v-if="warning.suggestion" class="text-yellow-600 mt-1 italic">
                  💡 {{ warning.suggestion }}
                </div>
              </div>
              <div class="ml-3 text-xs text-yellow-600 font-mono bg-yellow-100 px-2 py-1 rounded">
                {{ warning.value || '(empty)' }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Info Messages -->
      <div v-if="hasInfo && showInfo" class="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div class="flex items-center justify-between mb-3">
          <h4 class="font-semibold text-blue-900 flex items-center gap-2">
            <span class="text-xl">ℹ️</span>
            Information ({{ validationResult.info.length }})
          </h4>
          <button
            @click="showInfo = false"
            class="text-sm text-blue-700 hover:text-blue-900 underline"
          >
            Hide
          </button>
        </div>
        
        <div class="space-y-2 max-h-48 overflow-y-auto">
          <div
            v-for="(info, index) in validationResult.info.slice(0, 5)"
            :key="`info-${index}`"
            class="bg-white border border-blue-200 rounded p-2 text-sm text-blue-800"
          >
            Row {{ info.row }} • {{ info.error }}
          </div>
        </div>
      </div>
    </div>

    <!-- Success State -->
    <div v-if="validationResult && validationResult.isValid && !hasWarnings" class="text-center py-8">
      <div class="text-6xl mb-4">✅</div>
      <h3 class="text-2xl font-bold text-green-700 mb-2">Perfect!</h3>
      <p class="text-gray-600">All {{ validationResult.stats.totalRows }} rows are valid and ready to import.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { validateCSVContent, getValidationSummary, type ValidationResult } from '../../utils/csvValidator';

const props = defineProps<{
  csvContent: string;
  autoValidate?: boolean;
}>();

const emit = defineEmits<{
  validated: [result: ValidationResult];
}>();

const validationResult = ref<ValidationResult | null>(null);
const showAllErrors = ref(false);
const showAllWarnings = ref(false);
const showInfo = ref(true);

// Computed properties
const hasErrors = computed(() => validationResult.value && validationResult.value.errors.length > 0);
const hasWarnings = computed(() => validationResult.value && validationResult.value.warnings.length > 0);
const hasInfo = computed(() => validationResult.value && validationResult.value.info.length > 0);

const displayedErrors = computed(() => {
  if (!validationResult.value) return [];
  return showAllErrors.value 
    ? validationResult.value.errors 
    : validationResult.value.errors.slice(0, 5);
});

const displayedWarnings = computed(() => {
  if (!validationResult.value) return [];
  return showAllWarnings.value 
    ? validationResult.value.warnings 
    : validationResult.value.warnings.slice(0, 5);
});

const validationSummary = computed(() => {
  if (!validationResult.value) return '';
  return getValidationSummary(validationResult.value);
});

const statusIcon = computed(() => {
  if (!validationResult.value) return '📄';
  if (hasErrors.value) return '❌';
  if (hasWarnings.value) return '⚠️';
  return '✅';
});

const statusTitle = computed(() => {
  if (!validationResult.value) return 'No validation performed';
  if (hasErrors.value) return 'Validation Failed';
  if (hasWarnings.value) return 'Validation Passed with Warnings';
  return 'Validation Passed';
});

const statusClasses = computed(() => {
  if (!validationResult.value) return 'bg-gray-50 border-gray-200';
  if (hasErrors.value) return 'bg-red-50 border-red-300';
  if (hasWarnings.value) return 'bg-yellow-50 border-yellow-300';
  return 'bg-green-50 border-green-300';
});

const statusTextClass = computed(() => {
  if (!validationResult.value) return 'text-gray-700';
  if (hasErrors.value) return 'text-red-900';
  if (hasWarnings.value) return 'text-yellow-900';
  return 'text-green-900';
});

// Validate CSV content
function validate() {
  if (!props.csvContent || props.csvContent.trim() === '') {
    validationResult.value = null;
    return;
  }

  const result = validateCSVContent(props.csvContent);
  validationResult.value = result;
  emit('validated', result);
}

// Watch for content changes
watch(() => props.csvContent, () => {
  if (props.autoValidate !== false) {
    validate();
  }
}, { immediate: true });

// Expose validate method
defineExpose({
  validate
});
</script>

<style scoped>
.live-csv-validator {
  @apply w-full;
}
</style>
