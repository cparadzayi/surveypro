<template>
  <div class="undo-redo-controls">
    <!-- Compact Controls -->
    <div class="flex items-center gap-2">
      <button
        @click="$emit('undo')"
        :disabled="!canUndo"
        class="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
        title="Undo last action (Ctrl+Z)"
      >
        <span class="text-lg">↶</span>
        <span>Undo</span>
      </button>
      
      <button
        @click="$emit('redo')"
        :disabled="!canRedo"
        class="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
        title="Redo undone action (Ctrl+Y)"
      >
        <span class="text-lg">↷</span>
        <span>Redo</span>
      </button>
      
      <div v-if="historySize > 0" class="text-sm text-gray-500 ml-2 flex items-center gap-1">
        <span>📝</span>
        <span>{{ historySize }} {{ historySize === 1 ? 'action' : 'actions' }}</span>
      </div>

      <!-- History Panel Toggle -->
      <button
        v-if="showHistoryToggle && historySize > 0"
        @click="toggleHistory"
        class="ml-2 px-2 py-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        title="Show action history"
      >
        {{ showHistory ? '▼' : '▶' }} History
      </button>
    </div>

    <!-- History Panel -->
    <div
      v-if="showHistory && history.length > 0"
      class="mt-3 border border-gray-200 rounded-lg overflow-hidden bg-white"
    >
      <div class="bg-gray-50 px-3 py-2 border-b border-gray-200">
        <div class="flex items-center justify-between">
          <h4 class="text-sm font-semibold text-gray-700">Action History</h4>
          <button
            @click="$emit('clearHistory')"
            class="text-xs text-red-600 hover:text-red-700"
          >
            Clear All
          </button>
        </div>
      </div>

      <div class="max-h-64 overflow-y-auto">
        <div
          v-for="(action, index) in history"
          :key="index"
          @click="$emit('jumpTo', index)"
          class="px-3 py-2 border-b border-gray-100 last:border-b-0 hover:bg-blue-50 cursor-pointer transition-colors"
          :class="{
            'bg-blue-100': index === currentIndex,
            'opacity-50': action.isFuture
          }"
        >
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <div class="text-sm font-medium text-gray-900">
                {{ action.description }}
              </div>
              <div class="text-xs text-gray-500 mt-0.5">
                {{ formatTimestamp(action.timestamp) }}
              </div>
            </div>
            
            <div class="ml-2">
              <span
                v-if="index === currentIndex"
                class="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full"
              >
                Current
              </span>
              <span
                v-else-if="action.isFuture"
                class="text-xs bg-gray-300 text-gray-600 px-2 py-0.5 rounded-full"
              >
                Future
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Keyboard Shortcuts Help -->
    <div v-if="showShortcuts" class="mt-2 text-xs text-gray-500 flex items-center gap-3">
      <span>⌨️ Shortcuts:</span>
      <span class="bg-gray-100 px-1.5 py-0.5 rounded">Ctrl+Z</span>
      <span>Undo</span>
      <span class="bg-gray-100 px-1.5 py-0.5 rounded">Ctrl+Y</span>
      <span>Redo</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

interface ActionRecord {
  timestamp: Date;
  description: string;
  state: any;
  isFuture?: boolean;
}

const props = defineProps<{
  canUndo: boolean;
  canRedo: boolean;
  historySize: number;
  history?: ActionRecord[];
  currentIndex?: number;
  showHistoryToggle?: boolean;
  showShortcuts?: boolean;
}>();

defineEmits<{
  undo: [];
  redo: [];
  clearHistory: [];
  jumpTo: [index: number];
}>();

const showHistory = ref(false);

function toggleHistory() {
  showHistory.value = !showHistory.value;
}

function formatTimestamp(timestamp: Date): string {
  const now = new Date();
  const diff = now.getTime() - new Date(timestamp).getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  
  return new Date(timestamp).toLocaleString();
}
</script>

<style scoped>
.undo-redo-controls {
  @apply w-full;
}
</style>
