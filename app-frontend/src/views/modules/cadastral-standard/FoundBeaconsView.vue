<template>
  <div class="space-y-6">
    <div class="bg-white shadow rounded-lg p-6">
      <div class="flex items-center justify-between mb-2">
        <div>
          <h2 class="text-xl font-semibold text-gray-900">Found Beacons Assessment</h2>
          <p class="text-sm text-gray-600 mt-1">
            SI 727 Section 67(5) — upload a comparison CSV
            (<code>Beacon, Hist_Y, Hist_X, Survey_Y, Survey_X</code>) and run the Helmert / W-test comparison.
          </p>
        </div>
      </div>
    </div>

    <!-- Shared comparison engine, embedded (no lite scaffold chrome) -->
    <CompareView embedded />

    <div v-if="saveError" class="p-4 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
      {{ saveError }}
    </div>

    <div class="flex justify-between pt-2">
      <button
        @click="emit('back')"
        class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
      >
        ← Back
      </button>
      <button
        @click="saveAssessment"
        :disabled="!canSave || saving"
        class="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        {{ saving ? 'Saving…' : 'Save beacon assessment & continue' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import type { FoundBeacon } from '../../../types/cadastral'
import { importHistoricalSurveyPoints } from '../../../services/historicalSurveyPoints'
import { useSurveyAdjustmentStore } from '../../../stores/surveyAdjustmentStore'
import {
  buildFoundBeacons, buildComparisonConfig, toHistoricalRows, pointsFromExistingBeacons,
} from '../../../composables/useFoundBeaconsComparison'
import CompareView from '../lite/compare/CompareView.vue'

interface Props {
  fixedPoints?: Array<{ id: string; original: { y: number; x: number }; description: string }>
  existingBeacons?: FoundBeacon[]
  projectId?: number
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'save', data: { beacons: FoundBeacon[]; comparisonConfig: any }): void
  (e: 'back'): void
}>()

const store = useSurveyAdjustmentStore()
const { points, result } = storeToRefs(store)

const saving = ref(false)
const saveError = ref<string | null>(null)
const canSave = computed(() => !!result.value && points.value.length >= 3)

// Reset the shared singleton store on entry so lite-tool state cannot bleed in:
// reload the prior comparison from saved beacons, else start empty (user uploads a CSV).
onMounted(() => {
  const rows = pointsFromExistingBeacons(props.existingBeacons)
  store.setPoints(rows) // rows may be [] → empty table, awaiting CSV upload
})

async function saveAssessment() {
  if (!canSave.value) return
  saving.value = true
  saveError.value = null
  try {
    const pts = points.value as any
    const res = result.value as any
    const beacons = buildFoundBeacons(pts, res)
    const comparisonConfig = buildComparisonConfig(pts, res)

    if (props.projectId) {
      try {
        await importHistoricalSurveyPoints(props.projectId, toHistoricalRows(pts), 'beacon-comparison.csv')
      } catch (e: any) {
        // Non-fatal: the Report on Survey data (emit below) is the primary output.
        console.warn('[FoundBeacons] historical-points DB import failed:', e?.message)
      }
    }
    emit('save', { beacons, comparisonConfig })
  } catch (e: any) {
    saveError.value = e?.message || 'Failed to save beacon assessment'
  } finally {
    saving.value = false
  }
}
</script>
