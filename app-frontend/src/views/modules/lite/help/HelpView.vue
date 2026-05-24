<template>
  <div class="space-y-4">
    <header>
      <h2 class="text-xl font-semibold">Help & Manual</h2>
      <p class="text-sm text-gray-600">Quick start tips and links to the full user manual.</p>
    </header>

  <section class="bg-white border rounded p-4 space-y-3">
      <h3 class="text-sm font-semibold">Getting Started</h3>
      <ol class="list-decimal list-inside text-sm text-gray-700 space-y-1">
        <li>Go to Lite → Imports/Exports to upload your CSVs (Points, LineStrings, Polygons).</li>
        <li>Optionally set SRID or choose a Zimbabwe central meridian (Lo25/27/29/31/33) on upload.</li>
        <li>Open Lite → Areas to compute polygon areas. Load points or a line/polygon from DB.</li>
        <li>Use the Export CSV button in Areas to download your current points list.</li>
      </ol>
      <div class="pt-2 flex items-center gap-2">
        <a
          class="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-700"
          href="/help/user-manual.pdf" target="_blank" rel="noopener noreferrer"
        >
          Open User Manual (PDF)
        </a>
        <button
          type="button"
          class="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded border border-indigo-200 text-indigo-700 hover:bg-indigo-50"
          @click="showModal = true"
        >
          Show Getting Started
        </button>
      </div>
    </section>

    <section class="bg-white border rounded p-4 space-y-2">
      <h3 class="text-sm font-semibold">Zimbabwe Conventions Recap</h3>
      <ul class="list-disc list-inside text-sm text-gray-700 space-y-1">
        <li>Coordinates use P(Y, X): Westing (Y), Southing (X).</li>
        <li>DMS uses colons (D:M:S) with carry/normalization.</li>
        <li>Banker’s rounding for numeric displays.</li>
  <li>Area display: m² for values &lt; 10,000; otherwise hectares with 4 decimals.</li>
      </ul>
    </section>
    <!-- Getting Started Modal -->
    <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/40" @click="closeModal" aria-hidden="true"></div>
      <div class="relative bg-white rounded-lg shadow-lg w-[95vw] max-w-lg p-4">
        <div class="flex items-start justify-between">
          <h3 class="text-lg font-semibold">Getting Started</h3>
          <button class="p-1 text-gray-500 hover:text-gray-800" @click="closeModal" aria-label="Close">×</button>
        </div>
        <div class="mt-2 text-sm text-gray-700 space-y-2">
          <p>Follow these quick steps to import data and compute areas:</p>
          <ol class="list-decimal list-inside space-y-1">
            <li>Prepare CSVs using P(Y, X) order. See the manual for examples.</li>
            <li>Open <strong>Lite → Imports/Exports</strong> and upload your CSVs.</li>
            <li>Set SRID or select central meridian (Lo belts) if needed.</li>
            <li>Open <strong>Lite → Areas</strong> and load points or a line/polygon from DB.</li>
            <li>Click <strong>Compute Area</strong>, review results, optionally export CSV.</li>
          </ol>
        </div>
        <div class="mt-3 flex items-center justify-end gap-2">
          <a href="/help/user-manual.pdf" target="_blank" rel="noopener noreferrer"
             class="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-700">
            Open Manual (PDF)
          </a>
          <button type="button" @click="closeModal" class="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded border hover:bg-gray-50">
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const showModal = ref(false)
function closeModal() { showModal.value = false }

onMounted(() => {
  const key = 'help-modal-shown'
  try {
    const seen = sessionStorage.getItem(key)
    if (!seen) {
      showModal.value = true
      sessionStorage.setItem(key, '1')
    }
  } catch {
    // ignore
  }
})
</script>

<script lang="ts">
export default { name: 'HelpView' }
</script>
