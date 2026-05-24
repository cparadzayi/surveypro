<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
    <div class="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 animate-scale-in">
      <!-- Header -->
      <div class="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-4 rounded-t-xl">
        <div class="flex items-center gap-3">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 class="text-xl font-semibold">Coordinate List Detected</h3>
        </div>
      </div>

      <!-- Content -->
      <div class="px-6 py-5 space-y-4">
        <div class="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <svg class="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
          </svg>
          <div>
            <p class="text-sm font-medium text-blue-900">
              A coordinate list already exists for this project.
            </p>
            <p class="text-xs text-blue-700 mt-1">
              Generated {{ generatedDate }} with {{ pointCount }} points
            </p>
          </div>
        </div>

        <div class="space-y-3">
          <p class="text-sm text-gray-700">
            Would you like to:
          </p>

          <!-- Option 1: Use Existing -->
          <button
            @click="handleUseExisting"
            class="w-full flex items-center gap-3 p-4 bg-green-50 hover:bg-green-100 border-2 border-green-200 hover:border-green-400 rounded-lg transition-all group"
          >
            <div class="flex-shrink-0 w-10 h-10 bg-green-500 text-white rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div class="text-left flex-1">
              <p class="font-semibold text-green-900">Use Existing Coordinate List</p>
              <p class="text-xs text-green-700">Proceed to area computation with current data</p>
            </div>
          </button>

          <!-- Option 2: Regenerate -->
          <button
            @click="handleRegenerate"
            class="w-full flex items-center gap-3 p-4 bg-amber-50 hover:bg-amber-100 border-2 border-amber-200 hover:border-amber-400 rounded-lg transition-all group"
          >
            <div class="flex-shrink-0 w-10 h-10 bg-amber-500 text-white rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <div class="text-left flex-1">
              <p class="font-semibold text-amber-900">Regenerate Coordinate List</p>
              <p class="text-xs text-amber-700">Create a new coordinate list with updated data</p>
            </div>
          </button>
        </div>

        <!-- Warning for regeneration -->
        <div class="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
          <svg class="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
          </svg>
          <span><strong>Note:</strong> Regenerating will update calculations and may affect downstream documents.</span>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-6 py-4 bg-gray-50 rounded-b-xl">
        <button
          @click="handleCancel"
          class="text-sm text-gray-600 hover:text-gray-800 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

interface Props {
  isOpen: boolean;
  pointCount?: number;
  generatedAt?: string | Date;
}

const props = withDefaults(defineProps<Props>(), {
  isOpen: false,
  pointCount: 0
});

const emit = defineEmits<{
  (e: 'use-existing'): void;
  (e: 'regenerate'): void;
  (e: 'cancel'): void;
}>();

const generatedDate = computed(() => {
  if (!props.generatedAt) return 'recently';
  
  const date = new Date(props.generatedAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  
  return date.toLocaleDateString();
});

function handleUseExisting() {
  emit('use-existing');
}

function handleRegenerate() {
  emit('regenerate');
}

function handleCancel() {
  emit('cancel');
}
</script>

<style scoped>
@keyframes scale-in {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.animate-scale-in {
  animation: scale-in 0.2s ease-out;
}
</style>
