<template>
  <div class="space-y-2">
    <div class="flex flex-wrap items-center gap-3">
      <button type="button" :disabled="busy || disabled"
        class="px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        @click="run">
        {{ busy ? 'Checking…' : report ? 'Check again' : 'Check against the register' }}
      </button>
      <span class="text-xs text-gray-500">Asks the council system whether the register would take these parcels. It changes nothing.</span>
    </div>

    <p v-if="error" class="text-sm text-amber-800 bg-amber-50 border-l-2 border-amber-500 pl-3 py-2" role="status">{{ error }}</p>

    <div v-if="report" role="status" aria-live="polite" class="text-sm space-y-2">
      <p v-if="report.ok && !report.checked" class="text-gray-700">There are no finalized parcels to check yet.</p>
      <p v-else-if="report.ok" class="text-green-800">
        The register would take {{ report.checked }} parcel{{ report.checked === 1 ? '' : 's' }}: no stand number is taken and nothing overlaps.
      </p>
      <template v-else>
        <p class="text-red-800 font-medium">{{ report.errors.length }} problem{{ report.errors.length === 1 ? '' : 's' }} the register would refuse the layout for:</p>
        <ul class="list-disc pl-5 space-y-0.5 text-red-800">
          <li v-for="(e, n) in report.errors" :key="n">{{ describeIssue(e) }}</li>
        </ul>
      </template>
      <template v-if="report.warnings.length">
        <p class="text-amber-800 font-medium">Worth a look (the register would still take it):</p>
        <ul class="list-disc pl-5 space-y-0.5 text-amber-800">
          <li v-for="(w, n) in report.warnings" :key="n">{{ describeIssue(w) }}</li>
        </ul>
      </template>
      <p class="text-xs text-gray-500">This is advice from the register as it stands now; it is checked again when the council accepts the work.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { describeIssue, errorMessage, type RegisterCheckReport } from '../../services/council'

// The caller says what to check (the surveyor's own project, or a reviewer's delivered one); this shows the answer.
const props = defineProps<{ check: () => Promise<RegisterCheckReport>; disabled?: boolean }>()

const report = ref<RegisterCheckReport | null>(null)
const error = ref('')
const busy = ref(false)

async function run() {
  busy.value = true; error.value = ''
  try { report.value = await props.check() }
  catch (e) { report.value = null; error.value = errorMessage(e, 'The register could not be checked just now.') }
  finally { busy.value = false }
}
</script>
