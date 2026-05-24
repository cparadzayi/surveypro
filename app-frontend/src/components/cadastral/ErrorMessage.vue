<template>
  <div
    v-if="error"
    class="error-message border-l-4 rounded-lg p-4 mb-4 transition-all duration-300"
    :class="[severityColorClass, { 'animate-shake': isNew }]"
    role="alert"
  >
    <div class="flex items-start">
      <!-- Icon -->
      <div class="flex-shrink-0 text-2xl mr-3">
        {{ severityIcon }}
      </div>

      <!-- Content -->
      <div class="flex-1 min-w-0">
        <!-- Title -->
        <h3 class="text-lg font-semibold mb-1">
          {{ error.title }}
        </h3>

        <!-- Message -->
        <p class="text-sm mb-2">
          {{ error.message }}
        </p>

        <!-- Suggestion -->
        <div
          v-if="error.suggestion"
          class="mt-2 p-3 rounded-md bg-white bg-opacity-50 border border-current border-opacity-20"
        >
          <div class="flex items-start gap-2">
            <span class="text-lg flex-shrink-0">💡</span>
            <div class="flex-1">
              <strong class="text-sm font-semibold">Suggestion:</strong>
              <p class="text-sm mt-1">{{ error.suggestion }}</p>
            </div>
          </div>
        </div>

        <!-- Help Link -->
        <div v-if="error.helpLink" class="mt-3">
          <a
            :href="error.helpLink"
            target="_blank"
            class="inline-flex items-center gap-1 text-sm font-medium hover:underline"
          >
            <span>📖</span>
            <span>Learn more</span>
            <span>→</span>
          </a>
        </div>

        <!-- Technical Details (Expandable) -->
        <div v-if="error.technicalDetails && showTechnicalDetails" class="mt-3">
          <button
            @click="toggleTechnicalDetails"
            class="text-sm font-medium hover:underline flex items-center gap-1"
          >
            <span>{{ technicalDetailsExpanded ? '▼' : '▶' }}</span>
            <span>Technical Details</span>
          </button>
          
          <div
            v-if="technicalDetailsExpanded"
            class="mt-2 p-3 bg-black bg-opacity-10 rounded-md overflow-x-auto"
          >
            <pre class="text-xs font-mono whitespace-pre-wrap">{{ error.technicalDetails }}</pre>
          </div>
        </div>

        <!-- Timestamp -->
        <div class="mt-2 text-xs opacity-75">
          {{ formatTimestamp(error.timestamp) }}
        </div>
      </div>

      <!-- Actions -->
      <div class="flex-shrink-0 ml-4 flex flex-col gap-2">
        <!-- Copy Button -->
        <button
          @click="copyError"
          class="p-2 rounded-md hover:bg-black hover:bg-opacity-10 transition-colors"
          title="Copy error details"
        >
          <span class="text-lg">{{ copied ? '✓' : '📋' }}</span>
        </button>

        <!-- Retry Button -->
        <button
          v-if="error.canRetry"
          @click="$emit('retry')"
          class="p-2 rounded-md hover:bg-black hover:bg-opacity-10 transition-colors"
          title="Retry action"
        >
          <span class="text-lg">🔄</span>
        </button>

        <!-- Report Button -->
        <button
          v-if="error.canReport"
          @click="$emit('report')"
          class="p-2 rounded-md hover:bg-black hover:bg-opacity-10 transition-colors"
          title="Report error"
        >
          <span class="text-lg">📧</span>
        </button>

        <!-- Dismiss Button -->
        <button
          v-if="dismissible"
          @click="$emit('dismiss')"
          class="p-2 rounded-md hover:bg-black hover:bg-opacity-10 transition-colors"
          title="Dismiss"
        >
          <span class="text-lg">✕</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  type FormattedError,
  getSeverityIcon,
  getSeverityColorClass,
  copyErrorToClipboard
} from '../../utils/errorFormatter';

const props = defineProps<{
  error: FormattedError | null;
  dismissible?: boolean;
  showTechnicalDetails?: boolean;
}>();

defineEmits<{
  dismiss: [];
  retry: [];
  report: [];
}>();

const isNew = ref(true);
const copied = ref(false);
const technicalDetailsExpanded = ref(false);

const severityIcon = computed(() => 
  props.error ? getSeverityIcon(props.error.severity) : ''
);

const severityColorClass = computed(() => 
  props.error ? getSeverityColorClass(props.error.severity) : ''
);

function formatTimestamp(timestamp: Date): string {
  const now = new Date();
  const diff = now.getTime() - new Date(timestamp).getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  
  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  
  return new Date(timestamp).toLocaleString();
}

async function copyError() {
  if (!props.error) return;
  
  const success = await copyErrorToClipboard(props.error);
  if (success) {
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  }
}

function toggleTechnicalDetails() {
  technicalDetailsExpanded.value = !technicalDetailsExpanded.value;
}

onMounted(() => {
  // Remove "new" animation after 500ms
  setTimeout(() => {
    isNew.value = false;
  }, 500);
});
</script>

<style scoped>
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
  20%, 40%, 60%, 80% { transform: translateX(5px); }
}

.animate-shake {
  animation: shake 0.5s ease-in-out;
}

.error-message {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
</style>
