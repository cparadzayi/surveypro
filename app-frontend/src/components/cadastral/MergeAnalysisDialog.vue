<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
    <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
      <!-- Background overlay -->
      <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true"></div>

      <!-- Center modal -->
      <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

      <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
        <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
          <div class="sm:flex sm:items-start">
            <div class="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 sm:mx-0 sm:h-10 sm:w-10">
              <svg class="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div class="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left flex-1">
              <h3 class="text-lg leading-6 font-medium text-gray-900" id="modal-title">
                📊 CSV Merge Analysis
              </h3>
              
              <div class="mt-4 space-y-4">
                <!-- Duplicate Point Tolerance Selector -->
                <div class="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <h4 class="font-semibold text-gray-900 mb-2">
                    🎯 Duplicate Point Handling
                  </h4>
                  <p class="text-sm text-gray-600 mb-3">
                    When multiple observations of the same point exist, coordinates will be averaged if within tolerance:
                  </p>
                  <div class="flex items-center space-x-4">
                    <label class="flex items-center cursor-pointer">
                      <input 
                        type="radio" 
                        v-model="duplicateTolerance" 
                        value="0.05"
                        class="mr-2 text-purple-600 focus:ring-purple-500"
                      />
                      <span class="text-sm">
                        <span class="font-medium">High precision</span> (0.05m / 50mm)
                      </span>
                    </label>
                    <label class="flex items-center cursor-pointer">
                      <input 
                        type="radio" 
                        v-model="duplicateTolerance" 
                        value="0.1"
                        class="mr-2 text-purple-600 focus:ring-purple-500"
                      />
                      <span class="text-sm">
                        <span class="font-medium">Standard</span> (0.1m / 100mm)
                      </span>
                    </label>
                    <label class="flex items-center cursor-pointer">
                      <input 
                        type="radio" 
                        v-model="duplicateTolerance" 
                        value="0.2"
                        class="mr-2 text-purple-600 focus:ring-purple-500"
                      />
                      <span class="text-sm">
                        <span class="font-medium">Lower precision</span> (0.2m / 200mm)
                      </span>
                    </label>
                  </div>
                </div>

                <!-- Point Matching Summary -->
                <div class="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 class="font-semibold text-gray-900 mb-3">
                    Point Matching (tolerance: {{ tolerance }}m)
                  </h4>
                  <div class="grid grid-cols-3 gap-4">
                    <div class="text-center">
                      <div class="text-2xl font-bold text-green-600">{{ analysis.summary.matchedCount }}</div>
                      <div class="text-sm text-gray-600">✅ Matched</div>
                    </div>
                    <div class="text-center">
                      <div class="text-2xl font-bold text-blue-600">{{ analysis.summary.newCount }}</div>
                      <div class="text-sm text-gray-600">➕ New</div>
                    </div>
                    <div class="text-center">
                      <div class="text-2xl font-bold text-red-600">{{ analysis.summary.removedCount }}</div>
                      <div class="text-sm text-gray-600">❌ Removed</div>
                    </div>
                  </div>
                </div>

                <!-- Land Parcel Impact -->
                <div class="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 class="font-semibold text-gray-900 mb-3">Land Parcel Impact</h4>
                  <div class="space-y-2">
                    <div class="flex items-center justify-between p-2 bg-green-50 border border-green-200 rounded">
                      <div class="flex items-center">
                        <span class="text-green-600 mr-2">✅</span>
                        <span class="text-sm font-medium">Fully Matched</span>
                      </div>
                      <span class="text-sm font-bold text-green-600">
                        {{ analysis.parcelAnalysis.fullyMatched.length }} parcels (will be retained)
                      </span>
                    </div>
                    
                    <div v-if="analysis.parcelAnalysis.partiallyMatched.length > 0" 
                         class="flex items-center justify-between p-2 bg-amber-50 border border-amber-200 rounded">
                      <div class="flex items-center">
                        <span class="text-amber-600 mr-2">⚠️</span>
                        <span class="text-sm font-medium">Partially Matched</span>
                      </div>
                      <span class="text-sm font-bold text-amber-600">
                        {{ analysis.parcelAnalysis.partiallyMatched.length }} parcels (need review)
                      </span>
                    </div>
                    
                    <div v-if="analysis.parcelAnalysis.orphaned.length > 0" 
                         class="flex items-center justify-between p-2 bg-red-50 border border-red-200 rounded">
                      <div class="flex items-center">
                        <span class="text-red-600 mr-2">❌</span>
                        <span class="text-sm font-medium">Orphaned</span>
                      </div>
                      <span class="text-sm font-bold text-red-600">
                        {{ analysis.parcelAnalysis.orphaned.length }} parcels (will be deleted)
                      </span>
                    </div>
                  </div>
                </div>

                <!-- Partially Matched Parcels Details -->
                <div v-if="analysis.parcelAnalysis.partiallyMatched.length > 0" 
                     class="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <h4 class="font-semibold text-gray-900 mb-3">⚠️ Partially Matched Parcels - Action Required</h4>
                  <div class="space-y-3 max-h-60 overflow-y-auto">
                    <div v-for="parcel in analysis.parcelAnalysis.partiallyMatched" 
                         :key="parcel.id"
                         class="bg-white border border-amber-300 rounded p-3">
                      <div class="flex items-start justify-between mb-2">
                        <div>
                          <div class="font-semibold text-gray-900">{{ parcel.designation }}</div>
                          <div class="text-sm text-gray-600">
                            {{ parcel.matchedCount }}/{{ parcel.vertexCount }} vertices matched ({{ parcel.matchRatio }}%)
                          </div>
                        </div>
                        <select 
                          v-model="partialParcelActions[parcel.id]"
                          class="text-sm border border-gray-300 rounded px-2 py-1">
                          <option value="delete">Delete</option>
                          <option value="keep">Keep as-is</option>
                          <option value="review">Mark for review</option>
                        </select>
                      </div>
                      <div v-if="parcel.missingVertices && parcel.missingVertices.length > 0" 
                           class="text-xs text-gray-600">
                        Missing vertices: {{ parcel.missingVertices.length }}
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Workflow Impact Warning -->
                <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 class="font-semibold text-gray-900 mb-2">⚠️ Workflow Impact</h4>
                  <ul class="text-sm text-gray-700 space-y-1">
                    <li>• Field Book will be regenerated</li>
                    <li>• Calculations Part 1 will be regenerated</li>
                    <li>• Coordinate List will be regenerated</li>
                    <li>• Adjusted coordinates will be recalculated</li>
                  </ul>
                </div>

                <!-- Removed Points Warning -->
                <div v-if="analysis.removedPoints.some(p => p.usedInParcels.length > 0)" 
                     class="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h4 class="font-semibold text-red-900 mb-2">⚠️ Points Used in Parcels Will Be Removed</h4>
                  <div class="text-sm text-red-700 space-y-1 max-h-40 overflow-y-auto">
                    <div v-for="point in analysis.removedPoints.filter(p => p.usedInParcels.length > 0)" 
                         :key="point.id"
                         class="flex items-start">
                      <span class="mr-2">•</span>
                      <span>
                        Point <strong>{{ point.id }}</strong> used in: {{ point.usedInParcels.join(', ') }}
                      </span>
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
            @click="handleProceed"
            class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm transition-colors"
          >
            Proceed with Merge
          </button>
          <button
            type="button"
            @click="handleViewDetails"
            class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm transition-colors"
          >
            View Details
          </button>
          <button
            type="button"
            @click="handleCancel"
            class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:w-auto sm:text-sm transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import type { MergeAnalysis } from '../../services/csvImports';

interface Props {
  isOpen: boolean;
  analysis: MergeAnalysis;
  tolerance: number;
}

interface Emits {
  (e: 'close'): void;
  (e: 'proceed', partialParcelActions: Record<number, 'delete' | 'keep' | 'review'>, duplicateTolerance: number): void;
  (e: 'view-details'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const partialParcelActions = reactive<Record<number, 'delete' | 'keep' | 'review'>>({});
const duplicateTolerance = ref<string>('0.1'); // Default to standard precision

// Initialize default actions for partial parcels
if (props.analysis?.parcelAnalysis?.partiallyMatched) {
  props.analysis.parcelAnalysis.partiallyMatched.forEach(parcel => {
    partialParcelActions[parcel.id] = 'review'; // Default to review
  });
}

function handleCancel() {
  emit('close');
}

function handleProceed() {
  emit('proceed', partialParcelActions, parseFloat(duplicateTolerance.value));
}

function handleViewDetails() {
  emit('view-details');
}
</script>
