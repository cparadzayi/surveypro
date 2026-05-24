<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
      @click.self="close"
    >
      <div class="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] flex flex-col">
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div class="flex items-center gap-3">
            <span class="text-2xl">📄</span>
            <div>
              <h2 class="text-xl font-semibold text-gray-900">{{ title }}</h2>
              <p v-if="subtitle" class="text-sm text-gray-600">{{ subtitle }}</p>
            </div>
          </div>
          
          <div class="flex items-center gap-2">
            <!-- Download Button -->
            <button
              @click="downloadPDF"
              class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
              title="Download PDF"
            >
              💾 Download
            </button>
            
            <!-- Save to Project Button -->
            <button
              v-if="workingDirectory"
              @click="saveToProject"
              :disabled="isSaving"
              class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 transition-colors text-sm font-medium"
              title="Save to project folder"
            >
              <span v-if="isSaving">💾 Saving...</span>
              <span v-else-if="savedPath">✅ Saved</span>
              <span v-else>💾 Save to Project</span>
            </button>
            
            <!-- Close Button -->
            <button
              @click="close"
              class="p-2 text-gray-400 hover:text-gray-600 transition-colors"
              title="Close"
            >
              <span class="text-2xl">✕</span>
            </button>
          </div>
        </div>
        
        <!-- PDF Viewer -->
        <div class="flex-1 overflow-auto p-6 bg-gray-50">
          <div v-if="isLoading" class="flex items-center justify-center h-full">
            <div class="text-center">
              <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p class="text-gray-600">Loading PDF...</p>
            </div>
          </div>
          
          <div v-else-if="error" class="flex items-center justify-center h-full">
            <div class="text-center text-red-600">
              <span class="text-4xl mb-4 block">⚠️</span>
              <p class="font-medium">{{ error }}</p>
            </div>
          </div>
          
          <iframe
            v-else
            :src="pdfUrl"
            class="w-full h-full min-h-[600px] border-0 rounded-lg shadow-inner"
            title="PDF Preview"
          ></iframe>
        </div>
        
        <!-- Footer -->
        <div v-if="savedPath" class="px-6 py-3 bg-green-50 border-t border-green-200">
          <div class="flex items-center gap-2 text-sm text-green-800">
            <span>✅</span>
            <span>Saved to: <code class="bg-green-100 px-2 py-1 rounded text-xs">{{ savedPath }}</code></span>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { saveDocument } from '../../services/documentStorage'
import type { SaveDocumentOptions } from '../../services/documentStorage'

interface Props {
  isOpen: boolean
  title: string
  subtitle?: string
  pdfBlob: Blob | null
  workingDirectory?: string
  documentType?: SaveDocumentOptions['documentType']
  fileName?: string
}

interface Emits {
  (e: 'close'): void
  (e: 'saved', filePath: string): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const pdfUrl = ref<string>('')
const isLoading = ref(false)
const error = ref<string>('')
const isSaving = ref(false)
const savedPath = ref<string>('')

// Watch for PDF blob changes
watch(() => props.pdfBlob, (newBlob) => {
  if (newBlob) {
    loadPDF(newBlob)
  } else {
    pdfUrl.value = ''
  }
}, { immediate: true })

// Watch for modal open/close
watch(() => props.isOpen, (isOpen) => {
  if (!isOpen) {
    // Reset state when closing
    savedPath.value = ''
  }
})

function loadPDF(blob: Blob) {
  isLoading.value = true
  error.value = ''
  
  try {
    // Validate blob
    if (!blob || !(blob instanceof Blob)) {
      console.error('Invalid blob provided:', blob)
      error.value = 'Invalid PDF data provided'
      isLoading.value = false
      return
    }
    
    // Revoke previous URL to prevent memory leaks
    if (pdfUrl.value) {
      URL.revokeObjectURL(pdfUrl.value)
    }
    
    // Create new object URL
    pdfUrl.value = URL.createObjectURL(blob)
    console.log('PDF loaded successfully, size:', blob.size, 'bytes')
    isLoading.value = false
  } catch (err) {
    console.error('Error loading PDF:', err)
    error.value = 'Failed to load PDF'
    isLoading.value = false
  }
}

function close() {
  // Revoke object URL to free memory
  if (pdfUrl.value) {
    URL.revokeObjectURL(pdfUrl.value)
    pdfUrl.value = ''
  }
  emit('close')
}

function downloadPDF() {
  if (!props.pdfBlob) return
  
  const url = URL.createObjectURL(props.pdfBlob)
  const a = document.createElement('a')
  a.href = url
  a.download = props.fileName || 'document.pdf'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

async function saveToProject() {
  if (!props.pdfBlob || !props.workingDirectory || !props.documentType || !props.fileName) {
    console.error('Missing required props for saving')
    return
  }
  
  isSaving.value = true
  
  try {
    const result = await saveDocument({
      workingDirectory: props.workingDirectory,
      documentType: props.documentType,
      fileName: props.fileName,
      pdfBlob: props.pdfBlob
    })
    
    if (result.success && result.filePath) {
      savedPath.value = result.filePath
      emit('saved', result.filePath)
    } else {
      alert(`Failed to save document: ${result.error}`)
    }
  } catch (error) {
    console.error('Error saving document:', error)
    alert('Failed to save document')
  } finally {
    isSaving.value = false
  }
}
</script>

<style scoped>
/* Ensure iframe is properly sized */
iframe {
  display: block;
}
</style>
