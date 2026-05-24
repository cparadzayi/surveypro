<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75"
    @click.self="close"
  >
    <div class="relative w-full h-full max-w-7xl max-h-screen p-4 flex flex-col">
      <!-- Header -->
      <div class="bg-white rounded-t-lg px-6 py-4 flex items-center justify-between shadow-lg">
        <div class="flex-1">
          <h2 class="text-xl font-bold text-gray-900">{{ title }}</h2>
          <p v-if="metadata" class="text-sm text-gray-600 mt-1">
            {{ metadata.pages }} {{ metadata.pages === 1 ? 'page' : 'pages' }}
            • {{ formatFileSize(metadata.size) }}
            • {{ formatDate(metadata.date) }}
          </p>
        </div>

        <!-- Zoom Controls -->
        <div class="flex items-center gap-2 mx-4">
          <button
            @click="zoomOut"
            :disabled="zoomLevel <= 50"
            class="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Zoom Out"
          >
            <span class="text-lg">−</span>
          </button>
          
          <span class="text-sm font-medium text-gray-700 min-w-[60px] text-center">
            {{ zoomLevel }}%
          </span>
          
          <button
            @click="zoomIn"
            :disabled="zoomLevel >= 200"
            class="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Zoom In"
          >
            <span class="text-lg">+</span>
          </button>
          
          <button
            @click="fitToWidth"
            class="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
            title="Fit to Width"
          >
            <span class="text-sm">Fit</span>
          </button>
        </div>

        <!-- Close Button -->
        <button
          @click="close"
          class="px-4 py-2 text-gray-500 hover:text-gray-700 transition-colors"
          title="Close (Esc)"
        >
          <span class="text-2xl">✕</span>
        </button>
      </div>

      <!-- PDF Viewer -->
      <div class="flex-1 bg-gray-900 overflow-auto" ref="viewerContainer">
        <div class="flex items-center justify-center min-h-full p-8">
          <div
            class="bg-white shadow-2xl"
            :style="{
              transform: `scale(${zoomLevel / 100})`,
              transformOrigin: 'top center',
              transition: 'transform 0.2s ease'
            }"
          >
            <iframe
              v-if="pdfUrl"
              :src="pdfUrl"
              class="w-full border-0"
              :style="{ height: iframeHeight }"
              @load="onIframeLoad"
            />
            <div v-else class="flex items-center justify-center p-12">
              <div class="text-center">
                <div class="text-6xl mb-4">📄</div>
                <p class="text-gray-600">Loading document...</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="bg-white rounded-b-lg px-6 py-4 shadow-lg">
        <div class="flex items-center justify-between">
          <!-- Page Navigation -->
          <div v-if="metadata && metadata.pages > 1" class="flex items-center gap-3">
            <button
              @click="prevPage"
              :disabled="currentPage === 1"
              class="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              ← Previous
            </button>
            
            <div class="flex items-center gap-2">
              <span class="text-sm text-gray-600">Page</span>
              <input
                v-model.number="currentPage"
                type="number"
                min="1"
                :max="metadata.pages"
                class="w-16 px-2 py-1 text-center border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                @change="goToPage"
              />
              <span class="text-sm text-gray-600">of {{ metadata.pages }}</span>
            </div>
            
            <button
              @click="nextPage"
              :disabled="currentPage === metadata.pages"
              class="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
          </div>

          <div v-else class="flex-1"></div>

          <!-- Action Buttons -->
          <div class="flex items-center gap-3">
            <button
              @click="print"
              class="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors flex items-center gap-2"
            >
              <span>🖨️</span>
              <span>Print</span>
            </button>
            
            <button
              @click="download"
              class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <span>📥</span>
              <span>Download</span>
            </button>
            
            <button
              v-if="showSaveButton"
              @click="saveToProject"
              :disabled="isSaving"
              class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              <span v-if="isSaving">⏳</span>
              <span v-else>💾</span>
              <span>{{ isSaving ? 'Saving...' : 'Save to Project' }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Thumbnail Navigation (Optional) -->
      <div
        v-if="showThumbnails && metadata && metadata.pages > 1"
        class="absolute left-4 top-24 bottom-24 w-32 bg-white rounded-lg shadow-lg overflow-y-auto p-2"
      >
        <div class="space-y-2">
          <div
            v-for="page in metadata.pages"
            :key="page"
            @click="goToPage(page)"
            class="relative cursor-pointer border-2 rounded overflow-hidden transition-all"
            :class="{
              'border-blue-500': page === currentPage,
              'border-gray-200 hover:border-gray-400': page !== currentPage
            }"
          >
            <div class="aspect-[8.5/11] bg-gray-100 flex items-center justify-center text-gray-400 text-xs">
              Page {{ page }}
            </div>
            <div
              v-if="page === currentPage"
              class="absolute inset-0 bg-blue-500 bg-opacity-10"
            ></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';

interface DocumentMetadata {
  pages: number;
  size: number;
  date: Date;
}

const props = defineProps<{
  isOpen: boolean;
  title: string;
  pdfUrl?: string;
  pdfBlob?: Blob;
  metadata?: DocumentMetadata;
  showSaveButton?: boolean;
  showThumbnails?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  download: [];
  save: [];
  print: [];
}>();

// State
const zoomLevel = ref(100);
const currentPage = ref(1);
const isSaving = ref(false);
const viewerContainer = ref<HTMLElement | null>(null);
const iframeHeight = ref('800px');

// Computed
const pdfUrl = computed(() => {
  if (props.pdfUrl) return props.pdfUrl;
  if (props.pdfBlob) return URL.createObjectURL(props.pdfBlob);
  return null;
});

// Methods
function zoomIn() {
  if (zoomLevel.value < 200) {
    zoomLevel.value = Math.min(200, zoomLevel.value + 25);
  }
}

function zoomOut() {
  if (zoomLevel.value > 50) {
    zoomLevel.value = Math.max(50, zoomLevel.value - 25);
  }
}

function fitToWidth() {
  zoomLevel.value = 100;
  if (viewerContainer.value) {
    viewerContainer.value.scrollTop = 0;
  }
}

function prevPage() {
  if (currentPage.value > 1) {
    currentPage.value--;
  }
}

function nextPage() {
  if (props.metadata && currentPage.value < props.metadata.pages) {
    currentPage.value++;
  }
}

function goToPage(page?: number) {
  if (page !== undefined) {
    currentPage.value = page;
  }
  // In a real implementation, this would scroll to the specific page
  console.log(`Navigate to page ${currentPage.value}`);
}

function close() {
  emit('close');
}

function download() {
  emit('download');
}

async function saveToProject() {
  isSaving.value = true;
  try {
    emit('save');
    await new Promise(resolve => setTimeout(resolve, 500)); // Simulate save delay
  } finally {
    isSaving.value = false;
  }
}

function print() {
  emit('print');
  // Trigger browser print dialog
  if (pdfUrl.value) {
    const printWindow = window.open(pdfUrl.value, '_blank');
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString();
}

function onIframeLoad() {
  // Adjust iframe height based on content
  console.log('PDF loaded');
}

// Keyboard shortcuts
function handleKeyPress(event: KeyboardEvent) {
  if (!props.isOpen) return;

  if (event.key === 'Escape') {
    close();
  } else if (event.key === 'ArrowLeft') {
    prevPage();
  } else if (event.key === 'ArrowRight') {
    nextPage();
  } else if (event.key === '+' || event.key === '=') {
    zoomIn();
  } else if (event.key === '-') {
    zoomOut();
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeyPress);
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyPress);
  // Clean up blob URL
  if (props.pdfBlob && pdfUrl.value) {
    URL.revokeObjectURL(pdfUrl.value);
  }
});

// Watch for open state changes
watch(() => props.isOpen, (isOpen) => {
  if (isOpen) {
    currentPage.value = 1;
    zoomLevel.value = 100;
  }
});
</script>

<style scoped>
/* Custom scrollbar for viewer */
.overflow-auto::-webkit-scrollbar {
  width: 12px;
  height: 12px;
}

.overflow-auto::-webkit-scrollbar-track {
  background: #1f2937;
}

.overflow-auto::-webkit-scrollbar-thumb {
  background: #4b5563;
  border-radius: 6px;
}

.overflow-auto::-webkit-scrollbar-thumb:hover {
  background: #6b7280;
}
</style>
