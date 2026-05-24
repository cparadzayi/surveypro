<template>
  <Transition
    enter-active-class="transition ease-out duration-100"
    enter-from-class="transform opacity-0 scale-95"
    enter-to-class="transform opacity-100 scale-100"
    leave-active-class="transition ease-in duration-75"
    leave-from-class="transform opacity-100 scale-100"
    leave-to-class="transform opacity-0 scale-95"
  >
    <div
      v-if="show && suggestions.length > 0"
      class="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-80 overflow-y-auto"
      :style="{ top: position === 'below' ? '100%' : 'auto', bottom: position === 'above' ? '100%' : 'auto' }"
    >
      <!-- Header -->
      <div class="sticky top-0 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-2 border-b border-gray-200">
        <div class="flex items-center justify-between">
          <div class="flex items-center">
            <span class="text-lg">💡</span>
            <span class="ml-2 text-sm font-medium text-gray-900">Smart Suggestions</span>
            <span class="ml-2 text-xs text-gray-500">({{ suggestions.length }})</span>
          </div>
          <button
            @click="$emit('close')"
            class="text-gray-400 hover:text-gray-600 transition-colors"
            title="Close (Esc)"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Suggestions List -->
      <div class="py-1">
        <div
          v-for="(suggestion, index) in suggestions"
          :key="index"
          @mousedown.prevent="$emit('select', suggestion)"
          class="px-4 py-3 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors"
          :class="{ 'bg-blue-50': index === selectedIndex }"
        >
          <div class="flex items-start">
            <!-- Icon -->
            <div class="flex-shrink-0 mt-0.5">
              <span v-if="suggestion.category === 'template'" class="text-lg">📋</span>
              <span v-else-if="suggestion.category === 'phrase'" class="text-lg">💬</span>
              <span v-else class="text-lg">✨</span>
            </div>
            
            <!-- Content -->
            <div class="ml-3 flex-1 min-w-0">
              <div class="text-sm text-gray-900 leading-relaxed">
                {{ suggestion.text }}
              </div>
              
              <!-- Metadata -->
              <div class="flex items-center mt-2 space-x-2">
                <!-- Confidence Badge -->
                <span 
                  class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                  :class="{
                    'bg-green-100 text-green-800': suggestion.confidence >= 0.85,
                    'bg-blue-100 text-blue-800': suggestion.confidence >= 0.7 && suggestion.confidence < 0.85,
                    'bg-gray-100 text-gray-700': suggestion.confidence < 0.7
                  }"
                >
                  <svg class="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                  </svg>
                  {{ (suggestion.confidence * 100).toFixed(0) }}% match
                </span>
                
                <!-- Category Badge -->
                <span class="text-xs text-gray-500">
                  {{ getCategoryLabel(suggestion.category) }}
                </span>
              </div>
            </div>
            
            <!-- Click hint -->
            <div class="flex-shrink-0 ml-2 text-gray-400">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="sticky bottom-0 bg-gray-50 px-4 py-2 border-t border-gray-200">
        <div class="flex items-center justify-between text-xs text-gray-600">
          <span>Click to apply • Esc to close</span>
          <span class="text-blue-600">⌨️ Keyboard: ↑↓ Enter</span>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Suggestion {
  text: string
  category: 'template' | 'phrase' | 'auto'
  confidence: number
}

interface Props {
  suggestions: Suggestion[]
  show: boolean
  selectedIndex?: number
  position?: 'below' | 'above'
}

const props = withDefaults(defineProps<Props>(), {
  selectedIndex: -1,
  position: 'below'
})

defineEmits<{
  select: [suggestion: Suggestion]
  close: []
}>()

function getCategoryLabel(category: string): string {
  const labels = {
    template: '📋 Template',
    phrase: '💬 Common Phrase',
    auto: '✨ Auto-complete'
  }
  return labels[category as keyof typeof labels] || category
}
</script>

<style scoped>
/* Custom scrollbar */
.overflow-y-auto::-webkit-scrollbar {
  width: 8px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 4px;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background: #cbd5e0;
  border-radius: 4px;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: #a0aec0;
}
</style>
