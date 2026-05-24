<template>
  <div class="parcel-detection-panel">
    <!-- Header -->
    <div class="panel-header">
      <div class="flex items-center gap-3">
        <div class="icon-badge">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <div>
          <h3 class="text-lg font-semibold text-gray-900">AI/ML Parcel Detection</h3>
          <p class="text-sm text-gray-600">Automatically identify land parcels from survey points</p>
        </div>
      </div>
    </div>

    <!-- Detection Controls -->
    <div class="detection-controls">
      <button 
        @click="runDetection"
        :disabled="!canDetect || isDetecting"
        class="btn-primary"
      >
        <svg v-if="!isDetecting" class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <svg v-else class="animate-spin w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        {{ isDetecting ? 'Detecting...' : 'Run AI Detection' }}
      </button>

      <div v-if="!canDetect" class="text-sm text-amber-600 flex items-center gap-2">
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
        </svg>
        Need at least {{ minPoints }} survey points
      </div>
    </div>

    <!-- Detection Results -->
    <div v-if="result" class="detection-results">
      <!-- Summary Cards -->
      <div class="summary-grid">
        <div class="summary-card">
          <div class="summary-label">Parcels Detected</div>
          <div class="summary-value">{{ result.summary.parcelsDetected }}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Total Area</div>
          <div class="summary-value text-sm">{{ result.summary.totalAreaFormatted }}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">High Confidence</div>
          <div class="summary-value text-green-600">{{ result.summary.highConfidence }}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Medium Confidence</div>
          <div class="summary-value text-amber-600">{{ result.summary.mediumConfidence }}</div>
        </div>
      </div>

      <!-- Parcels List -->
      <div class="parcels-list">
        <div class="list-header">
          <h4 class="text-sm font-semibold text-gray-700">Detected Parcels</h4>
          <button @click="exportParcels" class="btn-secondary-sm">
            Export All
          </button>
        </div>

        <div class="parcel-items">
          <div 
            v-for="parcel in result.parcels" 
            :key="parcel.designation"
            class="parcel-item"
            :class="getConfidenceClass(parcel.confidence)"
          >
            <div class="parcel-header">
              <div class="flex items-center gap-2">
                <span class="parcel-designation">{{ parcel.designation }}</span>
                <span class="confidence-badge" :class="getConfidenceBadgeClass(parcel.confidence)">
                  {{ (parcel.confidence * 100).toFixed(0) }}%
                </span>
              </div>
              <button 
                @click="selectParcel(parcel)"
                class="btn-select"
              >
                Select
              </button>
            </div>

            <div class="parcel-details">
              <div class="detail-item">
                <span class="detail-label">Area:</span>
                <span class="detail-value">{{ parcel.areaFormatted }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Points:</span>
                <span class="detail-value">{{ parcel.boundaryPoints.length }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Perimeter:</span>
                <span class="detail-value">{{ parcel.perimeter.toFixed(2) }} m</span>
              </div>
            </div>

            <div v-if="parcel.warnings.length > 0" class="parcel-warnings">
              <div v-for="(warning, idx) in parcel.warnings" :key="idx" class="warning-item">
                ⚠️ {{ warning }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else-if="!isDetecting" class="empty-state">
      <svg class="w-16 h-16 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
              d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
      </svg>
      <p class="text-gray-600">No parcels detected yet</p>
      <p class="text-sm text-gray-500 mt-1">Click "Run AI Detection" to automatically identify parcels</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { parcelDetectionService, type ParcelDetectionResult } from '@/services/parcelDetection'
import type { DetectedParcel } from '@/utils/automatedParcelDetector'
import type { AdjustedCoordinate } from '@/types/adjusted-coordinates'

// Props
const props = defineProps<{
  coordinates: AdjustedCoordinate[]
  minPoints?: number
}>()

// Emits
const emit = defineEmits<{
  parcelSelected: [parcel: DetectedParcel]
  parcelsDetected: [result: ParcelDetectionResult]
}>()

// State
const isDetecting = ref(false)
const result = ref<ParcelDetectionResult | null>(null)

// Computed
const canDetect = computed(() => {
  return props.coordinates.length >= (props.minPoints || 3)
})

// Methods
async function runDetection() {
  if (!canDetect.value) return
  
  isDetecting.value = true
  try {
    result.value = await parcelDetectionService.detectParcels(props.coordinates)
    emit('parcelsDetected', result.value)
  } catch (error) {
    console.error('[ParcelDetectionPanel] Detection failed:', error)
    alert('Parcel detection failed. Please check the console for details.')
  } finally {
    isDetecting.value = false
  }
}

function selectParcel(parcel: DetectedParcel) {
  emit('parcelSelected', parcel)
}

function exportParcels() {
  if (!result.value) return
  
  const exported = parcelDetectionService.exportForAreasSystem(result.value.parcels)
  console.log('[ParcelDetectionPanel] Exported parcels:', exported)
  
  // TODO: Integrate with existing export system
  alert(`Exported ${exported.length} parcels. Check console for details.`)
}

function getConfidenceClass(confidence: number): string {
  if (confidence >= 0.9) return 'confidence-high'
  if (confidence >= 0.7) return 'confidence-medium'
  return 'confidence-low'
}

function getConfidenceBadgeClass(confidence: number): string {
  if (confidence >= 0.9) return 'badge-green'
  if (confidence >= 0.7) return 'badge-amber'
  return 'badge-red'
}
</script>

<style scoped>
.parcel-detection-panel {
  @apply bg-white rounded-lg border border-gray-200 shadow-sm;
}

.panel-header {
  @apply p-6 border-b border-gray-200;
}

.icon-badge {
  @apply w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600;
}

.detection-controls {
  @apply p-6 border-b border-gray-200 flex items-center gap-4;
}

.btn-primary {
  @apply px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium
         hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed
         flex items-center transition-colors;
}

.btn-secondary-sm {
  @apply px-3 py-1.5 bg-gray-100 text-gray-700 rounded text-sm font-medium
         hover:bg-gray-200 transition-colors;
}

.detection-results {
  @apply p-6 space-y-6;
}

.summary-grid {
  @apply grid grid-cols-4 gap-4;
}

.summary-card {
  @apply bg-gray-50 rounded-lg p-4 text-center;
}

.summary-label {
  @apply text-xs text-gray-600 mb-1;
}

.summary-value {
  @apply text-2xl font-bold text-gray-900;
}

.parcels-list {
  @apply space-y-4;
}

.list-header {
  @apply flex items-center justify-between mb-4;
}

.parcel-items {
  @apply space-y-3;
}

.parcel-item {
  @apply border rounded-lg p-4 transition-all;
}

.parcel-item.confidence-high {
  @apply border-green-200 bg-green-50;
}

.parcel-item.confidence-medium {
  @apply border-amber-200 bg-amber-50;
}

.parcel-item.confidence-low {
  @apply border-red-200 bg-red-50;
}

.parcel-header {
  @apply flex items-center justify-between mb-3;
}

.parcel-designation {
  @apply font-semibold text-gray-900;
}

.confidence-badge {
  @apply px-2 py-0.5 rounded text-xs font-medium;
}

.badge-green {
  @apply bg-green-100 text-green-800;
}

.badge-amber {
  @apply bg-amber-100 text-amber-800;
}

.badge-red {
  @apply bg-red-100 text-red-800;
}

.btn-select {
  @apply px-3 py-1 bg-indigo-600 text-white rounded text-sm font-medium
         hover:bg-indigo-700 transition-colors;
}

.parcel-details {
  @apply grid grid-cols-3 gap-4 text-sm;
}

.detail-item {
  @apply flex flex-col;
}

.detail-label {
  @apply text-gray-600 text-xs mb-1;
}

.detail-value {
  @apply text-gray-900 font-medium;
}

.parcel-warnings {
  @apply mt-3 pt-3 border-t border-gray-200 space-y-1;
}

.warning-item {
  @apply text-xs text-amber-700;
}

.empty-state {
  @apply p-12 text-center;
}
</style>
