<!--
  Cadastral CSV Import Component
  
  Handles upload, validation, and preview of cadastral coordinate CSV files
  for the SurveyPro Cadastral Standard module workflow.
-->

<template>
  <div class="cadastral-csv-import">
    <!-- Header -->
    <div class="bg-white shadow-sm border-b border-gray-200 px-6 py-4">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-semibold text-gray-900">Import Cadastral Coordinates</h2>
          <p class="text-sm text-gray-600 mt-1">
            Upload CSV file with final adjusted coordinates for cadastral record generation
          </p>
        </div>
        
        <button
          @click="downloadTemplate"
          class="flex items-center px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors"
        >
          📥 Download Template
        </button>
      </div>
    </div>

    <div class="p-6 space-y-6">
      <!-- File Upload Section -->
      <div 
        class="bg-white border-2 border-dashed border-gray-300 rounded-lg p-6 hover:border-gray-400 transition-colors"
        @dragover="handleDragOver"
        @dragenter="handleDragEnter" 
        @dragleave="handleDragLeave"
        @drop="handleDrop"
      >
        <div v-if="!file" class="text-center">
          <div class="mx-auto h-12 w-12 text-gray-400 flex items-center justify-center text-2xl">☁️</div>
          <div class="mt-4 space-y-3">
            <!-- Primary Upload Button -->
            <div>
              <button
                @click="triggerFileInput"
                class="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              >
                📤 Choose CSV File
              </button>
              <input
                ref="fileInput"
                id="file-upload"
                name="file-upload"
                type="file"
                accept=".csv"
                class="sr-only"
                @change="handleFileSelect"
              />
            </div>
            
            <!-- Alternative: Label for click anywhere -->
            <div>
              <label for="file-upload" class="cursor-pointer text-sm text-gray-600 hover:text-gray-800 transition-colors">
                or click anywhere in this area
              </label>
            </div>
            
            <p class="text-sm text-gray-600">
              You can also drag and drop your CSV file here
            </p>
            <p class="text-xs text-gray-500">
              Expected format: Point,Y,X,Status,Description,Date of survey
            </p>
          </div>
        </div>

        <div v-else class="flex items-center justify-between">
          <div class="flex items-center">
            <div class="h-8 w-8 text-blue-500 mr-3 flex items-center justify-center text-xl">📄</div>
            <div>
              <p class="text-sm font-medium text-gray-900">{{ file.name }}</p>
              <p class="text-xs text-gray-500">{{ formatFileSize(file.size) }}</p>
            </div>
          </div>
          
          <button
            @click="clearFile"
            class="text-gray-400 hover:text-gray-600 transition-colors text-lg"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- Processing Status -->
      <div v-if="isProcessing" class="bg-blue-50 border border-blue-200 rounded-md p-4">
        <div class="flex items-center">
          <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-3"></div>
          <span class="text-sm text-blue-800">Processing CSV file...</span>
        </div>
      </div>

      <!-- Validation Results -->
      <div v-if="validationResult" class="space-y-4">
        <!-- Summary -->
        <div class="bg-gray-50 rounded-lg p-4">
          <h3 class="text-lg font-medium text-gray-900 mb-3">Import Summary</h3>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div class="text-center">
              <div class="text-2xl font-bold text-blue-600">{{ validationResult.summary.totalPoints }}</div>
              <div class="text-sm text-gray-600">Total Points</div>
            </div>
            <div class="text-center">
              <div class="text-2xl font-bold text-green-600">{{ validationResult.summary.fixedPoints }}</div>
              <div class="text-sm text-gray-600">Found Points</div>
            </div>
            <div class="text-center">
              <div class="text-2xl font-bold text-orange-600">{{ validationResult.summary.pegPoints }}</div>
              <div class="text-sm text-gray-600">Peg Points</div>
            </div>
            <div class="text-center">
              <div class="text-2xl font-bold text-gray-600">{{ validationResult.summary.otherPoints }}</div>
              <div class="text-sm text-gray-600">Other Points</div>
            </div>
          </div>
        </div>

        <!-- Errors -->
        <div v-if="validationResult.errors.length > 0" class="bg-red-50 border border-red-200 rounded-md p-4">
          <div class="flex items-center mb-3">
            <span class="text-red-500 mr-2 text-lg">⚠️</span>
            <h3 class="text-sm font-medium text-red-800">
              {{ validationResult.errors.length }} Error(s) Found
            </h3>
          </div>
          <div class="space-y-2 max-h-40 overflow-y-auto">
            <div
              v-for="error in validationResult.errors"
              :key="`error-${error.row}-${error.field}`"
              class="text-sm text-red-700 bg-red-100 rounded px-3 py-2"
            >
              <span class="font-medium">Row {{ error.row }}, {{ error.field }}:</span> {{ error.message }}
            </div>
          </div>
        </div>

        <!-- Warnings -->
        <div v-if="validationResult.warnings.length > 0" class="bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <div class="flex items-center mb-3">
            <span class="text-yellow-500 mr-2 text-lg">⚠️</span>
            <h3 class="text-sm font-medium text-yellow-800">
              {{ validationResult.warnings.length }} Warning(s)
            </h3>
          </div>
          <div class="space-y-2 max-h-40 overflow-y-auto">
            <div
              v-for="warning in validationResult.warnings"
              :key="`warning-${warning.row}-${warning.field}`"
              class="text-sm text-yellow-700 bg-yellow-100 rounded px-3 py-2"
            >
              <span class="font-medium">Row {{ warning.row }}, {{ warning.field }}:</span> {{ warning.message }}
              <span v-if="warning.suggestion" class="block mt-1 text-xs text-yellow-600">
                Suggestion: {{ warning.suggestion }}
              </span>
            </div>
          </div>
        </div>

        <!-- Preview Table -->
        <div v-if="validationResult.preview.length > 0" class="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div class="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h3 class="text-sm font-medium text-gray-900">Data Preview ({{ Math.min(10, validationResult.preview.length) }} of {{ validationResult.preview.length }} points)</h3>
          </div>
          
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Point</th>
                  <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Field Book Y</th>
                  <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Field Book X</th>
                  <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Coord List Y</th>
                  <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Coord List X</th>
                  <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200">
                <tr
                  v-for="point in validationResult.preview.slice(0, 10)"
                  :key="point.id"
                  class="hover:bg-gray-50"
                >
                  <td class="px-4 py-2 text-sm font-medium text-gray-900">{{ point.id }}</td>
                  <td class="px-4 py-2 text-sm text-gray-600 font-mono">{{ point.fieldBook.y }}</td>
                  <td class="px-4 py-2 text-sm text-gray-600 font-mono">{{ point.fieldBook.x }}</td>
                  <td class="px-4 py-2 text-sm text-gray-600 font-mono">{{ point.coordinateList.y }}</td>
                  <td class="px-4 py-2 text-sm text-gray-600 font-mono">{{ point.coordinateList.x }}</td>
                  <td class="px-4 py-2 text-sm">
                    <span
                      v-if="point.status"
                      :class="statusBadgeClass(point.status)"
                      class="inline-flex items-center px-2 py-1 rounded text-xs font-medium"
                    >
                      {{ statusLabel(point.status) }}
                    </span>
                    <span v-else class="text-gray-400 text-xs">-</span>
                  </td>
                  <td class="px-4 py-2 text-sm text-gray-600 max-w-xs truncate" :title="point.description">
                    {{ point.description }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div v-if="validationResult" class="flex items-center justify-between pt-4 border-t border-gray-200">
        <div class="text-sm text-gray-600">
          <span v-if="validationResult.isValid" class="text-green-600 font-medium">
            ✓ Ready to import {{ validationResult.preview.length }} points
          </span>
          <span v-else class="text-red-600 font-medium">
            ✗ Cannot import due to validation errors
          </span>
        </div>

        <div class="flex space-x-3">
          <button
            @click="clearAll"
            class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          
          <button
            v-if="validationResult.isValid"
            @click="importData"
            :disabled="isImporting"
            class="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <span v-if="isImporting" class="flex items-center">
              <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Importing...
            </span>
            <span v-else>Import Data</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Status codes name what the beacon IS, and the working plan draws its symbol
 * from them. Previously anything that was not F displayed as "Peg", which would
 * have mislabelled every reference mark and working station.
 */
const STATUS_LABELS: Record<string, string> = {
  F: 'Found', FIXED: 'Found',
  P: 'Placed', PEG: 'Placed',
  TRIG: 'Trig station',
  RM: 'Reference mark',
  WS: 'Working station',
}

const STATUS_CLASSES: Record<string, string> = {
  F: 'bg-green-100 text-green-800', FIXED: 'bg-green-100 text-green-800',
  P: 'bg-orange-100 text-orange-800', PEG: 'bg-orange-100 text-orange-800',
  TRIG: 'bg-purple-100 text-purple-800',
  RM: 'bg-blue-100 text-blue-800',
  WS: 'bg-teal-100 text-teal-800',
}

function statusKey(status: string): string {
  return String(status ?? '').trim().toUpperCase()
}

function statusLabel(status: string): string {
  // Unknown codes show verbatim rather than being relabelled as something else.
  return STATUS_LABELS[statusKey(status)] ?? status
}

function statusBadgeClass(status: string): string {
  return STATUS_CLASSES[statusKey(status)] ?? 'bg-gray-100 text-gray-800'
}

import { ref, computed } from 'vue';

import { validateAndParseCSV, generateCSVTemplate } from '../../utils/cadastral-csv';
import type { CSVValidationResult, CadastralPoint } from '../../types/cadastral';

// Component props
interface Props {
  // No props currently needed
}

// Component state
const file = ref<File | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const isProcessing = ref(false);
const isImporting = ref(false);
const validationResult = ref<CSVValidationResult | null>(null);

// Events
const emit = defineEmits<{
  imported: [points: CadastralPoint[]];
  cancelled: [];
}>();

/**
 * Trigger file input programmatically
 */
function triggerFileInput() {
  fileInput.value?.click();
}

/**
 * Handle file selection from input
 */
async function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement;
  const selectedFile = target.files?.[0];
  
  if (selectedFile) {
    await processFile(selectedFile);
  }
}

/**
 * Handle drag and drop events
 */
function handleDragOver(event: DragEvent) {
  event.preventDefault();
  event.stopPropagation();
}

function handleDragEnter(event: DragEvent) {
  event.preventDefault();
  event.stopPropagation();
}

function handleDragLeave(event: DragEvent) {
  event.preventDefault();
  event.stopPropagation();
}

async function handleDrop(event: DragEvent) {
  event.preventDefault();
  event.stopPropagation();
  
  const files = event.dataTransfer?.files;
  if (files && files.length > 0) {
    const droppedFile = files[0];
    
    // Check if it's a CSV file
    if (droppedFile.type === 'text/csv' || droppedFile.name.toLowerCase().endsWith('.csv')) {
      await processFile(droppedFile);
    } else {
      alert('Please upload a CSV file only.');
    }
  }
}

/**
 * Process uploaded CSV file
 */
async function processFile(selectedFile: File) {
  console.log('Processing file:', selectedFile.name, selectedFile.size);
  
  file.value = selectedFile;
  isProcessing.value = true;
  validationResult.value = null;
  
  try {
    console.log('Reading file content...');
    // Read file content
    const content = await readFileContent(selectedFile);
    console.log('File content length:', content.length);
    
    console.log('Validating CSV...');
    // Validate and parse CSV
    const result = validateAndParseCSV(content);
    console.log('Validation result:', result);
    validationResult.value = result;
    
  } catch (error) {
    console.error('Error processing file:', error);
    validationResult.value = {
      isValid: false,
      errors: [{
        row: 0,
        field: 'file',
        message: `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'error'
      }],
      warnings: [],
      preview: [],
      summary: { totalPoints: 0, fixedPoints: 0, pegPoints: 0, otherPoints: 0 }
    };
  } finally {
    isProcessing.value = false;
  }
}

/**
 * Read file content as text
 */
function readFileContent(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      resolve(content);
    };
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    reader.readAsText(file);
  });
}

/**
 * Clear selected file and reset state
 */
function clearFile() {
  file.value = null;
  validationResult.value = null;
}

/**
 * Clear all data and reset component
 */
function clearAll() {
  clearFile();
  emit('cancelled');
}

/**
 * Import validated data
 */
async function importData() {
  if (!validationResult.value?.isValid || !validationResult.value.preview) {
    return;
  }
  
  isImporting.value = true;
  
  try {
    // Emit the imported data
    emit('imported', validationResult.value.preview);
  } finally {
    isImporting.value = false;
  }
}

/**
 * Download CSV template
 */
function downloadTemplate() {
  const template = generateCSVTemplate();
  const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'cadastral-coordinates-template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
</script>

<style scoped>
.cadastral-csv-import {
  background-color: #f9fafb;
  min-height: 100vh;
}

/* Custom scrollbar for error/warning lists */
.overflow-y-auto::-webkit-scrollbar {
  width: 6px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background-color: #f3f4f6;
  border-radius: 4px;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background-color: #9ca3af;
  border-radius: 4px;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background-color: #6b7280;
}
</style>