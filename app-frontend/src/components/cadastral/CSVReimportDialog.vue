<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
    <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
      <!-- Background overlay -->
      <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" @click="handleCancel"></div>

      <!-- Center modal -->
      <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

      <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
        <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
          <div class="sm:flex sm:items-start">
            <div class="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-amber-100 sm:mx-0 sm:h-10 sm:w-10">
              <svg class="h-6 w-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div class="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left flex-1">
              <h3 class="text-lg leading-6 font-medium text-gray-900" id="modal-title">
                ⚠️ CSV Data Already Exists for This Project
              </h3>
              <div class="mt-4">
                <!-- Previous Import Info -->
                <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <h4 class="font-semibold text-gray-900 mb-2">Previous Import:</h4>
                  <div class="text-sm text-gray-700 space-y-1">
                    <p><strong>Date:</strong> {{ formatDate(existingImport.import_date) }}</p>
                    <p><strong>Points:</strong> {{ existingImport.point_count }}</p>
                    <p v-if="existingImport.filename"><strong>File:</strong> {{ existingImport.filename }}</p>
                    <p>
                      <strong>Documents Generated:</strong> 
                      <span :class="existingImport.has_generated_documents ? 'text-green-600' : 'text-gray-500'">
                        {{ existingImport.has_generated_documents ? '✅ Yes (Field Book, Calculations, etc.)' : '❌ No' }}
                      </span>
                    </p>
                    <p>
                      <strong>Land Parcels:</strong> 
                      <span :class="existingImport.has_land_parcels ? 'text-green-600' : 'text-gray-500'">
                        {{ existingImport.has_land_parcels ? `✅ ${existingImport.parcel_count || 0} parcels digitized` : '❌ None' }}
                      </span>
                    </p>
                  </div>
                </div>

                <!-- Options -->
                <div class="space-y-3">
                  <label class="flex items-start p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                         :class="{ 'border-blue-500 bg-blue-50': selectedOption === 'use-previous' }">
                    <input type="radio" v-model="selectedOption" value="use-previous" class="mt-1 mr-3" />
                    <div class="flex-1">
                      <div class="font-semibold text-gray-900">Use Previous Import</div>
                      <div class="text-sm text-gray-600">Continue working with existing data (recommended)</div>
                    </div>
                  </label>

                  <label class="flex items-start p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                         :class="{ 'border-blue-500 bg-blue-50': selectedOption === 'append' }">
                    <input type="radio" v-model="selectedOption" value="append" class="mt-1 mr-3" />
                    <div class="flex-1">
                      <div class="font-semibold text-gray-900">Append New Points</div>
                      <div class="text-sm text-gray-600">Add new points to existing data without removing anything</div>
                    </div>
                  </label>

                  <label class="flex items-start p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                         :class="{ 'border-blue-500 bg-blue-50': selectedOption === 'smart-merge' }">
                    <input type="radio" v-model="selectedOption" value="smart-merge" class="mt-1 mr-3" />
                    <div class="flex-1">
                      <div class="font-semibold text-gray-900">Replace with Smart Merge</div>
                      <div class="text-sm text-gray-600">Match coordinates and retain compatible parcels (recommended for updated surveys)</div>
                    </div>
                  </label>

                  <label class="flex items-start p-3 border border-red-300 rounded-lg cursor-pointer hover:bg-red-50 transition-colors"
                         :class="{ 'border-red-500 bg-red-50': selectedOption === 'complete-replace' }">
                    <input type="radio" v-model="selectedOption" value="complete-replace" class="mt-1 mr-3" />
                    <div class="flex-1">
                      <div class="font-semibold text-red-900">Complete Replacement</div>
                      <div class="text-sm text-red-600">⚠️ Delete all existing data and start fresh (cannot be undone)</div>
                    </div>
                  </label>
                </div>

                <!-- Warning for complete replacement -->
                <div v-if="selectedOption === 'complete-replace'" class="mt-4 bg-red-50 border border-red-300 rounded-lg p-4">
                  <div class="flex items-start">
                    <svg class="h-5 w-5 text-red-600 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                    </svg>
                    <div class="flex-1">
                      <h4 class="font-semibold text-red-900">Warning: Data Loss</h4>
                      <p class="text-sm text-red-700 mt-1">
                        This will permanently delete:
                      </p>
                      <ul class="text-sm text-red-700 mt-2 list-disc list-inside">
                        <li>All {{ existingImport.point_count }} coordinate points</li>
                        <li v-if="existingImport.has_land_parcels">All {{ existingImport.parcel_count || 0 }} land parcels</li>
                        <li v-if="existingImport.has_generated_documents">All generated documents (Field Book, Calculations, etc.)</li>
                      </ul>
                      <p class="text-sm text-red-700 mt-2 font-semibold">
                        This action cannot be undone!
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
          <button
            type="button"
            @click="handleContinue"
            :disabled="!selectedOption"
            class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            Continue
          </button>
          <button
            type="button"
            @click="handleCancel"
            class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { CSVImport } from '@/services/csvImports';

interface Props {
  isOpen: boolean;
  existingImport: CSVImport;
}

interface Emits {
  (e: 'close'): void;
  (e: 'continue', option: 'use-previous' | 'append' | 'smart-merge' | 'complete-replace'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const selectedOption = ref<'use-previous' | 'append' | 'smart-merge' | 'complete-replace' | null>(null);

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function handleCancel() {
  selectedOption.value = null;
  emit('close');
}

function handleContinue() {
  if (selectedOption.value) {
    emit('continue', selectedOption.value);
    selectedOption.value = null;
  }
}
</script>
