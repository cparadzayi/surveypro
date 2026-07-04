<template>
  <div class="working-directory-selector">
    <!-- Main Input Section -->
    <div class="space-y-3">
      <label class="block text-sm font-medium text-gray-700">
        Working Directory *
      </label>
      
      <!-- Quick Action Buttons -->
      <div class="flex gap-2">
        <button
          @click="useDefaultPath"
          type="button"
          class="flex-1 px-4 py-3 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium"
          title="Use recommended default path"
        >
          <div class="flex items-center justify-center gap-2">
            <span class="text-lg">✨</span>
            <span>Use Recommended Path</span>
          </div>
        </button>
        
        <button
          @click="toggleCustomPath"
          type="button"
          class="flex-1 px-4 py-3 bg-gray-50 text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors text-sm font-medium"
          :class="{ 'bg-gray-100 border-gray-300': showCustomPath }"
        >
          <div class="flex items-center justify-center gap-2">
            <span class="text-lg">✏️</span>
            <span>{{ showCustomPath ? 'Hide' : 'Custom Path' }}</span>
          </div>
        </button>
      </div>
      
      <!-- Custom Path Input (Collapsible) -->
      <div v-if="showCustomPath" class="space-y-2 animate-fadeIn">
        <div class="flex gap-2">
          <input
            v-model="localPath"
            @input="handlePathChange"
            @blur="validatePath"
            type="text"
            placeholder="e.g., Documents/SurveyPro/Projects/MyProject_2025"
            class="flex-1 px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            :class="{
              'border-gray-300': !validationError,
              'border-red-300 focus:ring-red-500 focus:border-red-500': validationError
            }"
          />
        </div>
        
        <div class="text-xs text-gray-500 flex items-start gap-1">
          <span>💡</span>
          <span>Tip: Use forward slashes (/) or backslashes (\\) for paths. Relative paths start from your user folder.</span>
        </div>
      </div>
      
      <!-- Validation Error -->
      <div v-if="validationError" class="p-3 bg-red-50 border border-red-200 rounded-lg">
        <div class="flex items-start gap-2 text-sm text-red-700">
          <span class="text-lg">⚠️</span>
          <span>{{ validationError }}</span>
        </div>
      </div>
      
      <!-- Current Path Display -->
      <div v-else-if="localPath" class="p-3 bg-green-50 border border-green-200 rounded-lg">
        <div class="flex items-start gap-2">
          <span class="text-lg">✅</span>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-green-800 mb-1">Directory will be created:</div>
            <div class="text-xs text-green-700 font-mono break-all">{{ absolutePath }}</div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Collapsible Details Section -->
    <div v-if="localPath && !validationError" class="mt-4">
      <button
        @click="showDetails = !showDetails"
        type="button"
        class="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
      >
        <span class="transform transition-transform" :class="{ 'rotate-90': showDetails }">▶</span>
        <span>{{ showDetails ? 'Hide' : 'Show' }} folder structure & guidelines</span>
      </button>
      
      <div v-if="showDetails" class="mt-3 space-y-3 animate-fadeIn">
        <!-- Directory Structure Preview -->
        <div class="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div class="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
            <span>📋</span>
            <span>Folder Structure</span>
          </div>
          <pre class="text-xs text-gray-600 font-mono whitespace-pre overflow-x-auto">{{ structurePreview }}</pre>
        </div>
        
        <!-- Help Text -->
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div class="text-sm text-blue-800">
            <div class="font-semibold mb-2 flex items-center gap-2">
              <span>💡</span>
              <span>How to use this directory</span>
            </div>
            <ul class="space-y-2 text-xs">
              <li class="flex items-start gap-2">
                <span class="text-blue-600 mt-0.5">•</span>
                <span><strong>Input files:</strong> Place CSV files in <code class="bg-blue-100 px-1 rounded">input/</code></span>
              </li>
              <li class="flex items-start gap-2">
                <span class="text-blue-600 mt-0.5">•</span>
                <span><strong>Output files:</strong> Generated PDFs saved to <code class="bg-blue-100 px-1 rounded">output/</code> subfolders</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="text-blue-600 mt-0.5">•</span>
                <span><strong>Organization:</strong> Each document type has its own subfolder</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="text-blue-600 mt-0.5">•</span>
                <span><strong>Backup:</strong> Keep this directory backed up regularly</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useAuthStore } from '../../stores/auth';
import {
  generateDefaultWorkingDirectory,
  validateWorkingDirectory,
  getDirectoryStructureDescription,
  formatDirectoryPath,
  isAbsolutePath,
  makeAbsolutePath,
  getSystemHomeDirectory
} from '../../utils/project-directory';

interface Props {
  modelValue: string;
  projectName: string;
  district?: string;
}

interface Emits {
  (e: 'update:modelValue', value: string): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const auth = useAuthStore()

const localPath = ref(props.modelValue || '');
const validationError = ref<string | null>(null);
const showCustomPath = ref(false);
const showDetails = ref(false);

// Check if browser supports directory picker API
const supportsDirectoryPicker = computed(() => {
  return 'showDirectoryPicker' in window;
});

// Check if path is absolute
const isAbsolute = computed(() => isAbsolutePath(localPath.value));

// Get absolute path for display
const absolutePath = computed(() => makeAbsolutePath(localPath.value));

// Display path (shortened if too long)
const displayPath = computed(() => formatDirectoryPath(localPath.value, 60));

// Directory structure preview
const structurePreview = computed(() => {
  if (!localPath.value) return '';
  return getDirectoryStructureDescription(localPath.value);
});

// Watch for external changes
watch(() => props.modelValue, (newValue) => {
  if (newValue !== localPath.value) {
    localPath.value = newValue;
  }
});

// Handle path input change
function handlePathChange() {
  validationError.value = null;
  emit('update:modelValue', localPath.value);
}

// Validate path
function validatePath() {
  const result = validateWorkingDirectory(localPath.value);
  if (!result.valid) {
    validationError.value = result.error || 'Invalid path';
  } else {
    validationError.value = null;
  }
}

// Use default path
function useDefaultPath() {
  localPath.value = generateDefaultWorkingDirectory(props.projectName, props.district, auth.surveyorName);
  validationError.value = null;
  emit('update:modelValue', localPath.value);
}

// Toggle custom path input
function toggleCustomPath() {
  showCustomPath.value = !showCustomPath.value;
  if (!showCustomPath.value && !localPath.value) {
    useDefaultPath();
  }
}

// Fetch system home directory on mount
onMounted(async () => {
  await getSystemHomeDirectory();
});

// Initialize with default if empty
if (!localPath.value && props.projectName) {
  useDefaultPath();
}
</script>

<style scoped>
code {
  font-family: 'Courier New', Courier, monospace;
}

pre {
  line-height: 1.4;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fadeIn {
  animation: fadeIn 0.2s ease-out;
}
</style>
