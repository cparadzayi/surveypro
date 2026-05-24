<template>
  <div class="p-4 space-y-4">
    <!-- Letterhead image for print views -->
    <div v-if="printMode==='summary' || printMode==='detailed'" class="print-letterhead mb-4">
      <img ref="letterheadEl" :src="letterheadSrc" alt="Letterhead" class="print-letterhead-img" />
    </div>
    <h1 class="text-xl font-semibold">Financial Estimate (Lite · Mobile‑first)</h1>

    <!-- Mode switcher -->
    <div class="flex items-center gap-2 no-print">
      <button :class="['px-3 py-1 border rounded', mode==='CSV' ? 'bg-blue-600 text-white' : 'bg-white']" @click="mode='CSV'">CSV Estimate</button>
      <button :class="['px-3 py-1 border rounded', mode==='CALC' ? 'bg-blue-600 text-white' : 'bg-white']" @click="mode='CALC'">Calculator</button>
      <div class="text-sm text-gray-600 ml-auto">Tariff version: {{ version || '—' }}</div>
    </div>

    <!-- CSV-driven Estimate -->
    <div v-if="mode==='CSV'" class="bg-white border rounded p-3 space-y-3">
      <section class="space-y-2">
        <h2 class="text-lg font-medium">Import CSV</h2>
        <div class="flex flex-col sm:flex-row gap-3">
          <input type="file" accept=".csv,text/csv" @change="onCsvFile" class="text-sm" />
          <button class="px-3 py-1 border rounded bg-gray-50" @click="useCsvText = !useCsvText">{{ useCsvText ? 'Hide' : 'Paste' }} CSV</button>
          <button v-if="csvText" class="px-3 py-1 border rounded" @click="parseCsv()">Re-parse</button>
          <button v-if="csvRows.length" class="px-3 py-1 border rounded" @click="clearCsv()">Clear</button>
        </div>
        <textarea v-if="useCsvText" v-model="csvText" rows="6" class="w-full border rounded px-2 py-1 font-mono text-xs" placeholder="Paste CSV here and click Re-parse"></textarea>
      </section>

      <section v-if="csvRows.length" class="space-y-3">
        <div class="border-b pb-2">
          <div class="text-base font-semibold">{{ titleDisplayed || 'Untitled Quotation' }}</div>
          <div class="text-sm text-gray-600" v-if="metaUnits">Units / stands: {{ metaUnits }}</div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2 text-xs text-gray-700">
            <div><span class="text-gray-500">Client:</span> {{ headerClient || '—' }}</div>
            <div><span class="text-gray-500">Project:</span> {{ headerProject || '—' }}</div>
            <div><span class="text-gray-500">Location:</span> {{ headerLocation || '—' }}</div>
            <div><span class="text-gray-500">Quote #:</span> {{ headerQuoteNo || '—' }}</div>
            <div><span class="text-gray-500">Prepared by:</span> {{ headerPreparedBy || '—' }}</div>
            <div><span class="text-gray-500">Date:</span> {{ headerDate || new Date().toLocaleDateString() }}</div>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="min-w-full text-sm">
            <tbody>
              <tr v-for="(r, idx) in displayRows" :key="idx" :class="rowClass(r)">
                <td class="py-1 pr-2 align-top" v-if="r.kind==='subsection'">{{ r.label }}</td>
                <td class="py-1 pr-2 align-top" :colspan="r.kind!=='subsection' ? 2 : 1">
                  <span v-if="r.kind==='section'" class="font-semibold">{{ r.label }}</span>
                  <span v-else-if="r.kind==='total'" class="font-semibold">{{ r.label }}</span>
                  <span v-else-if="r.kind==='say'" class="italic">{{ r.label }}</span>
                  <span v-else>{{ r.label }}</span>
                </td>
                <td class="py-1 px-2 text-right whitespace-nowrap align-top" v-if="r.amount !== null">{{ r.amountText || money(r.amount) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="pt-2 text-sm text-gray-700">
          <div v-if="totalsDisplayed.vat != null">VAT: {{ money(totalsDisplayed.vat) }}</div>
          <div v-if="totalsDisplayed.grand != null" class="font-semibold">Grand Total: {{ money(totalsDisplayed.grand) }}</div>
          <div v-if="totalsDisplayed.perStand != null && metaUnits">Per Stand: {{ money(totalsDisplayed.perStand) }}</div>
        </div>
      </section>
    </div>

    <!-- Calculator (refactored to mimic CSV layout) -->
    <div v-else class="bg-white border rounded p-3 space-y-3">
      <!-- Header -->
      <section class="space-y-2 no-print">
        <h2 class="text-lg font-medium">Inputs</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label class="block text-sm">
            <span class="text-xs text-gray-600">Title</span>
            <input v-model="calcTitle" type="text" class="border rounded w-full px-2 py-1" placeholder="Quotation for …" />
          </label>
          <label class="block text-sm">
            <span class="text-xs text-gray-600">Units / stands</span>
            <input v-model.number="units" type="number" min="0" class="border rounded w-full px-2 py-1" />
          </label>
          <label class="block text-sm">
            <span class="text-xs text-gray-600">Currency</span>
            <select v-model="currency" class="border rounded w-full px-2 py-1">
              <option value="USD">USD</option>
              <option value="ZWL">ZWL</option>
            </select>
          </label>
          <label class="block text-sm">
            <span class="text-xs text-gray-600">VAT rate (%)</span>
            <input v-model.number="vatRate" type="number" min="0" step="0.01" class="border rounded w-full px-2 py-1" />
          </label>
          <label class="block text-sm">
            <span class="text-xs text-gray-600">Contingency (%)</span>
            <input v-model.number="contingencyPct" type="number" min="0" step="0.01" class="border rounded w-full px-2 py-1" />
          </label>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label class="block text-sm">
            <span class="text-xs text-gray-600">Client</span>
            <input v-model="headerClient" type="text" class="border rounded w-full px-2 py-1" />
          </label>
          <label class="block text-sm">
            <span class="text-xs text-gray-600">Project</span>
            <input v-model="headerProject" type="text" class="border rounded w-full px-2 py-1" />
          </label>
          <label class="block text-sm">
            <span class="text-xs text-gray-600">Location</span>
            <input v-model="headerLocation" type="text" class="border rounded w-full px-2 py-1" />
          </label>
          <label class="block text-sm">
            <span class="text-xs text-gray-600">Quote #</span>
            <input v-model="headerQuoteNo" type="text" class="border rounded w-full px-2 py-1" />
          </label>
          <label class="block text-sm">
            <span class="text-xs text-gray-600">Prepared by</span>
            <input v-model="headerPreparedBy" type="text" class="border rounded w-full px-2 py-1" />
          </label>
          <label class="block text-sm">
            <span class="text-xs text-gray-600">Date</span>
            <input v-model="headerDate" type="date" class="border rounded w-full px-2 py-1" />
          </label>
        </div>
      </section>

      <!-- Part I -->
      <section class="space-y-2 no-print">
        <h3 class="text-md font-medium">PART I (Basic Charge)</h3>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label class="block text-sm">
            <span class="text-xs text-gray-600">Per lot rate</span>
            <input v-model.number="basicPerLotRate" type="number" min="0" step="0.01" class="border rounded w-full px-2 py-1" />
          </label>
          <label class="block text-sm">
            <span class="text-xs text-gray-600">Existing building (amount)</span>
            <input v-model.number="existingBuilding" type="number" min="0" step="0.01" class="border rounded w-full px-2 py-1" />
          </label>
          <label class="block text-sm">
            <span class="text-xs text-gray-600">Initial charge (computed: $50 + 20% of per-lot total)</span>
            <input :value="money(computedInitialCharge)" disabled class="border rounded w-full px-2 py-1 bg-gray-50" />
          </label>
        </div>
      </section>

      <!-- Part II -->
      <section class="space-y-2 no-print">
        <h3 class="text-md font-medium">PART II (Reimbursables)</h3>
        <div class="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <label class="block text-sm">
            <span class="text-xs text-gray-600">Beacons qty (default: 2.5 × stands; min 3)</span>
            <input :value="defaultBeaconsQty" disabled class="border rounded w-full px-2 py-1 bg-gray-50" />
          </label>
          <label class="block text-sm">
            <span class="text-xs text-gray-600">Override beacons qty?</span>
            <input type="checkbox" v-model="beaconsOverrideEnabled" class="ml-2 align-middle" />
          </label>
          <label class="block text-sm">
            <span class="text-xs text-gray-600">Beacons qty (override)</span>
            <input v-model.number="beaconsOverrideQty" :disabled="!beaconsOverrideEnabled" type="number" min="0" class="border rounded w-full px-2 py-1" />
            <div class="text-[11px] text-gray-500 mt-0.5">Effective: {{ effectiveBeaconsQty }}</div>
          </label>
          <label class="block text-sm">
            <span class="text-xs text-gray-600">Beacon rate</span>
            <input v-model.number="beaconsRate" type="number" min="0" step="0.01" class="border rounded w-full px-2 py-1" />
          </label>
          <label class="block text-sm">
            <span class="text-xs text-gray-600">GP basic (amount)</span>
            <input v-model.number="gpBasic" type="number" min="0" step="0.01" class="border rounded w-full px-2 py-1" />
          </label>
          <label class="block text-sm">
            <span class="text-xs text-gray-600">GP per-lot rate</span>
            <input v-model.number="gpPerLotRate" type="number" min="0" step="0.01" class="border rounded w-full px-2 py-1" />
          </label>
          <label class="block text-sm">
            <span class="text-xs text-gray-600">Dispensation per-lot rate</span>
            <input v-model.number="dispPerLotRate" type="number" min="0" step="0.01" class="border rounded w-full px-2 py-1" />
          </label>
          <label class="block text-sm">
            <span class="text-xs text-gray-600">Intercity km</span>
            <input v-model.number="travelIntercityKm" type="number" min="0" class="border rounded w-full px-2 py-1" />
          </label>
          <label class="block text-sm">
            <span class="text-xs text-gray-600">Intercity rate /km</span>
            <input v-model.number="travelIntercityRate" type="number" min="0" step="0.01" class="border rounded w-full px-2 py-1" />
          </label>
          <label class="block text-sm">
            <span class="text-xs text-gray-600">Local km per day</span>
            <input v-model.number="localPerDayKm" type="number" min="0" class="border rounded w-full px-2 py-1" />
          </label>
          <label class="block text-sm">
            <span class="text-xs text-gray-600">Local days</span>
            <input v-model.number="localDays" type="number" min="0" class="border rounded w-full px-2 py-1" />
          </label>
          <label class="block text-sm">
            <span class="text-xs text-gray-600">Local rate /km</span>
            <input v-model.number="localRate" type="number" min="0" step="0.01" class="border rounded w-full px-2 py-1" />
          </label>
          <label class="block text-sm">
            <span class="text-xs text-gray-600">Subsistence people</span>
            <input v-model.number="subsistencePeople" type="number" min="0" class="border rounded w-full px-2 py-1" />
          </label>
          <label class="block text-sm">
            <span class="text-xs text-gray-600">Subsistence days</span>
            <input v-model.number="subsistenceDays" type="number" min="0" class="border rounded w-full px-2 py-1" />
          </label>
          <label class="block text-sm">
            <span class="text-xs text-gray-600">Subsistence rate /person/day</span>
            <input v-model.number="subsistenceRate" type="number" min="0" step="0.01" class="border rounded w-full px-2 py-1" />
          </label>
          <label class="block text-sm">
            <span class="text-xs text-gray-600">Travel time (hours)</span>
            <input v-model.number="travelTimeHours" type="number" min="0" class="border rounded w-full px-2 py-1" />
          </label>
          <label class="block text-sm">
            <span class="text-xs text-gray-600">Travel time rate /hr</span>
            <input v-model.number="travelTimeRate" type="number" min="0" step="0.01" class="border rounded w-full px-2 py-1" />
          </label>
        </div>
      </section>

      <!-- Part III -->
      <section class="space-y-2 no-print">
        <h3 class="text-md font-medium">PART III (Professional Work)</h3>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label class="block text-sm">
            <span class="text-xs text-gray-600">Professional hours</span>
            <input v-model.number="profHours" type="number" min="0" class="border rounded w-full px-2 py-1" />
          </label>
          <label class="block text-sm">
            <span class="text-xs text-gray-600">Rate per quarter hour</span>
            <input v-model.number="profRatePerQuarter" type="number" min="0" step="0.01" class="border rounded w-full px-2 py-1" />
          </label>
          <label class="block text-sm">
            <span class="text-xs text-gray-600">Exam fee per lot</span>
            <input v-model.number="examPerLotRate" type="number" min="0" step="0.01" class="border rounded w-full px-2 py-1" />
          </label>
        </div>
      </section>

      <!-- Preview (same table style as CSV) -->
      <section class="space-y-3">
        <div class="border-b pb-2">
          <div class="text-base font-semibold">{{ titleDisplayed || 'Untitled Quotation' }}</div>
          <div class="text-sm text-gray-600" v-if="metaUnits">Units / stands: {{ metaUnits }}</div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2 text-xs text-gray-700">
            <div><span class="text-gray-500">Client:</span> {{ headerClient || '—' }}</div>
            <div><span class="text-gray-500">Project:</span> {{ headerProject || '—' }}</div>
            <div><span class="text-gray-500">Location:</span> {{ headerLocation || '—' }}</div>
            <div><span class="text-gray-500">Quote #:</span> {{ headerQuoteNo || '—' }}</div>
            <div><span class="text-gray-500">Prepared by:</span> {{ headerPreparedBy || '—' }}</div>
            <div><span class="text-gray-500">Date:</span> {{ headerDate || new Date().toLocaleDateString() }}</div>
          </div>
        </div>
        <!-- Detailed table -->
        <div class="overflow-x-auto" :class="{'print-hidden': printMode==='summary'}">
          <table class="min-w-full text-sm">
            <tbody>
              <tr v-for="(r, idx) in displayRows" :key="idx" :class="rowClass(r)">
                <td class="py-1 pr-2 align-top" v-if="r.kind==='subsection'">{{ r.label }}</td>
                <td class="py-1 pr-2 align-top" :colspan="r.kind!=='subsection' ? 2 : 1">
                  <span v-if="r.kind==='section'" class="font-semibold">{{ r.label }}</span>
                  <span v-else-if="r.kind==='total'" class="font-semibold">{{ r.label }}</span>
                  <span v-else-if="r.kind==='say'" class="italic">{{ r.label }}</span>
                  <span v-else>{{ r.label }}</span>
                </td>
                <td class="py-1 px-2 text-right whitespace-nowrap align-top" v-if="r.amount !== null">{{ r.amountText || money(r.amount) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="pt-2 text-sm text-gray-700" :class="{'print-hidden': printMode==='summary'}">
          <div v-if="totalsDisplayed.vat != null">VAT: {{ money(totalsDisplayed.vat) }}</div>
          <div v-if="totalsDisplayed.grand != null" class="font-semibold">Grand Total: {{ money(totalsDisplayed.grand) }}</div>
          <div v-if="totalsDisplayed.perStand != null && metaUnits">Per Stand: {{ money(totalsDisplayed.perStand) }}</div>
        </div>

        <!-- Summary-only block for printMode summary -->
        <div v-if="printMode==='summary'" class="mt-3 border rounded p-3 text-sm">
          <div class="font-medium mb-1">Quotation Summary</div>
          <div class="flex flex-col gap-1">
            <div class="flex justify-between"><span>Professional Fees</span><span class="font-semibold">{{ money(summary.professional) }}</span></div>
            <div class="flex justify-between"><span>Reimbursables</span><span class="font-semibold">{{ money(summary.reimbursables) }}</span></div>
            <div class="flex justify-between"><span>Surveyor General's Examination Fees</span><span class="font-semibold">{{ money(summary.exam) }}</span></div>
            <div class="flex justify-between border-t pt-1"><span>Total</span><span class="font-semibold">{{ money(summary.grand) }}</span></div>
          </div>
        </div>
      </section>
    </div>

    <!-- Sticky actions -->
    <div class="sticky bottom-2 left-0 right-0 mx-4">
      <div class="bg-white/95 backdrop-blur border rounded px-3 py-2 shadow flex items-center justify-between">
        <div class="text-sm text-gray-600">{{ mode==='CSV' ? 'CSV estimate' : 'Calculator' }}</div>
        <div class="flex gap-2">
          <button class="px-3 py-1 border rounded bg-gray-50" @click="saveDraft()">Save Draft</button>
          <button class="px-3 py-1 border rounded" @click="shareWhatsApp()">Share</button>
          <button class="px-3 py-1 border rounded" @click="exportSummaryPdf()">Generate Quote Summary</button>
          <button class="px-3 py-1 border rounded bg-green-600 text-white" @click="exportPdf()">Generate Detailed Quote</button>
        </div>
      </div>
    </div>
  </div>
  
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { loadTariff } from '../../../../services/tariff'
import { computeEstimate, computeEffectivePegs, type EstimateResult } from '../../../../services/estimate'

// Mode
const mode = ref<'CSV'|'CALC'>('CSV')

// Shared
const version = ref<string>('')
const tariff = ref<any>(null)
const jobType = ref<string>('')
const locality = ref<'URBAN'|'RURAL'>('URBAN')
const currency = ref<'ZWL'|'USD'>('USD')
const vatRate = ref<number>(15)
// Header fields (for print/export)
const headerClient = ref<string>('')
const headerProject = ref<string>('')
const headerLocation = ref<string>('')
const headerQuoteNo = ref<string>('')
const headerPreparedBy = ref<string>('')
const headerDate = ref<string>('')

// Subdivision‑specific
const parcels = ref<number>(0)
const usePegEstimate = ref<boolean>(true)
const pegFactor = ref<number>(2.5) // default heuristic; real values from tariff overrides
const pegsOverride = ref<number>(0)
const estimatedPegs = computed(() => Math.ceil((parcels.value || 0) * (pegFactor.value || 0)))
const effectivePegs = computed(() => usePegEstimate.value ? estimatedPegs.value : Math.max(0, Math.floor(pegsOverride.value || 0)))

const km = ref<number>(0)
const days = ref<number>(0)

// Itemized estimate (live)
const estimate = ref<EstimateResult | null>(null)
function recompute() {
  if (!tariff.value) { estimate.value = null; return }
  estimate.value = computeEstimate(tariff.value, {
    jobType: jobType.value,
    locality: locality.value,
    currency: currency.value,
    vatRate: vatRate.value,
    parcels: parcels.value,
    usePegEstimate: usePegEstimate.value,
    pegFactor: pegFactor.value,
    pegsOverride: pegsOverride.value,
    km: km.value,
    days: days.value,
  })
}

function money(n: number) {
  const v = Number(n || 0)
  const parts = v.toFixed(2).split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const sym = currency.value === 'USD' ? '$' : 'ZWL '
  return sym + parts.join('.')
}

// Persistence (localStorage) — drafts only, no backend yet
const LS_KEY = 'surveypro.estimate.draft'
const LS_CSV = 'surveypro.estimate.csv'
function saveDraft() {
  if (mode.value === 'CSV') {
    const payload = {
      csvText: csvText.value, currency: currency.value,
      headerClient: headerClient.value, headerProject: headerProject.value, headerLocation: headerLocation.value,
      headerQuoteNo: headerQuoteNo.value, headerPreparedBy: headerPreparedBy.value, headerDate: headerDate.value
    }
    localStorage.setItem(LS_CSV, JSON.stringify(payload))
  } else {
    const payload = {
      // legacy calc context
      jobType: jobType.value, locality: locality.value, currency: currency.value, vatRate: vatRate.value,
      parcels: parcels.value, usePegEstimate: usePegEstimate.value, pegFactor: pegFactor.value, pegsOverride: pegsOverride.value,
      km: km.value, days: days.value,
      // new calculator inputs
      headerClient: headerClient.value, headerProject: headerProject.value, headerLocation: headerLocation.value,
      headerQuoteNo: headerQuoteNo.value, headerPreparedBy: headerPreparedBy.value, headerDate: headerDate.value,
      calcTitle: calcTitle.value, units: units.value, contingencyPct: contingencyPct.value,
      basicInitial: basicInitial.value, basicPerLotRate: basicPerLotRate.value, existingBuilding: existingBuilding.value,
  beaconsRate: beaconsRate.value,
      gpBasic: gpBasic.value, gpPerLotRate: gpPerLotRate.value, dispPerLotRate: dispPerLotRate.value,
      travelIntercityKm: travelIntercityKm.value, travelIntercityRate: travelIntercityRate.value,
      localPerDayKm: localPerDayKm.value, localDays: localDays.value, localRate: localRate.value,
      subsistencePeople: subsistencePeople.value, subsistenceDays: subsistenceDays.value, subsistenceRate: subsistenceRate.value,
      travelTimeHours: travelTimeHours.value, travelTimeRate: travelTimeRate.value,
      profHours: profHours.value, profRatePerQuarter: profRatePerQuarter.value,
      examPerLotRate: examPerLotRate.value,
      beaconsOverrideEnabled: beaconsOverrideEnabled.value,
      beaconsOverrideQty: beaconsOverrideQty.value
    }
    localStorage.setItem(LS_KEY, JSON.stringify(payload))
  }
}
function loadDraft() {
  try {
    const rawCsv = localStorage.getItem(LS_CSV)
    if (rawCsv) {
      const d = JSON.parse(rawCsv)
      if (d.csvText) csvText.value = d.csvText
      if (d.currency) currency.value = d.currency
      headerClient.value = d.headerClient || ''
      headerProject.value = d.headerProject || ''
      headerLocation.value = d.headerLocation || ''
      headerQuoteNo.value = d.headerQuoteNo || ''
      headerPreparedBy.value = d.headerPreparedBy || ''
      headerDate.value = d.headerDate || ''
      if (csvText.value) parseCsv()
      mode.value = 'CSV'
      return
    }
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const d = JSON.parse(raw)
      jobType.value = d.jobType || ''
      locality.value = d.locality || 'URBAN'
      currency.value = d.currency || 'USD'
      vatRate.value = typeof d.vatRate === 'number' ? d.vatRate : 15
      parcels.value = typeof d.parcels === 'number' ? d.parcels : 0
      usePegEstimate.value = !!d.usePegEstimate
      pegFactor.value = typeof d.pegFactor === 'number' ? d.pegFactor : pegFactor.value
      pegsOverride.value = typeof d.pegsOverride === 'number' ? d.pegsOverride : 0
      km.value = typeof d.km === 'number' ? d.km : 0
      days.value = typeof d.days === 'number' ? d.days : 0
      // new calc
  headerClient.value = d.headerClient || ''
  headerProject.value = d.headerProject || ''
  headerLocation.value = d.headerLocation || ''
  headerQuoteNo.value = d.headerQuoteNo || ''
  headerPreparedBy.value = d.headerPreparedBy || ''
  headerDate.value = d.headerDate || ''
      calcTitle.value = d.calcTitle || ''
      units.value = typeof d.units === 'number' ? d.units : 0
      contingencyPct.value = typeof d.contingencyPct === 'number' ? d.contingencyPct : 6
      basicInitial.value = typeof d.basicInitial === 'number' ? d.basicInitial : 0
      basicPerLotRate.value = typeof d.basicPerLotRate === 'number' ? d.basicPerLotRate : 0
      existingBuilding.value = typeof d.existingBuilding === 'number' ? d.existingBuilding : 0
      beaconsRate.value = typeof d.beaconsRate === 'number' ? d.beaconsRate : 18
      gpBasic.value = typeof d.gpBasic === 'number' ? d.gpBasic : 0
      gpPerLotRate.value = typeof d.gpPerLotRate === 'number' ? d.gpPerLotRate : 10
      dispPerLotRate.value = typeof d.dispPerLotRate === 'number' ? d.dispPerLotRate : 1
      travelIntercityKm.value = typeof d.travelIntercityKm === 'number' ? d.travelIntercityKm : 0
      travelIntercityRate.value = typeof d.travelIntercityRate === 'number' ? d.travelIntercityRate : 0.5
      localPerDayKm.value = typeof d.localPerDayKm === 'number' ? d.localPerDayKm : 0
      localDays.value = typeof d.localDays === 'number' ? d.localDays : 0
      localRate.value = typeof d.localRate === 'number' ? d.localRate : 0.5
      subsistencePeople.value = typeof d.subsistencePeople === 'number' ? d.subsistencePeople : 0
      subsistenceDays.value = typeof d.subsistenceDays === 'number' ? d.subsistenceDays : 0
      subsistenceRate.value = typeof d.subsistenceRate === 'number' ? d.subsistenceRate : 60
      travelTimeHours.value = typeof d.travelTimeHours === 'number' ? d.travelTimeHours : 0
      travelTimeRate.value = typeof d.travelTimeRate === 'number' ? d.travelTimeRate : 15
      profHours.value = typeof d.profHours === 'number' ? d.profHours : 0
      profRatePerQuarter.value = typeof d.profRatePerQuarter === 'number' ? d.profRatePerQuarter : 12.5
      examPerLotRate.value = typeof d.examPerLotRate === 'number' ? d.examPerLotRate : 15
  beaconsOverrideEnabled.value = !!d.beaconsOverrideEnabled
  beaconsOverrideQty.value = typeof d.beaconsOverrideQty === 'number' ? d.beaconsOverrideQty : null
      mode.value = 'CALC'
    }
  } catch {}
}

// Share / Export
const printMode = ref<'detailed'|'summary'>('detailed')
const letterheadEl = ref<HTMLImageElement|null>(null)
const letterheadSrc = ref<string>('/letterhead.png')
function exportSummaryPdf() {
  printMode.value = 'summary'
  nextTick(async () => {
    try {
      // Ensure the letterhead image is loaded before printing
      const img = letterheadEl.value
      if (img && !img.complete) {
        await new Promise<void>((resolve) => {
          const done = () => resolve()
          img.addEventListener('load', done, { once: true })
          img.addEventListener('error', done, { once: true })
        })
      }
    } finally {
      window.print()
      // Briefly keep summary mode to ensure print uses correct layout
      setTimeout(() => { printMode.value = 'detailed' }, 100)
    }
  })
}
function exportPdf() {
  printMode.value = 'detailed'
  nextTick(async () => {
    try {
      const img = letterheadEl.value
      if (img && !img.complete) {
        await new Promise<void>((resolve) => {
          const done = () => resolve()
          img.addEventListener('load', done, { once: true })
          img.addEventListener('error', done, { once: true })
        })
      }
    } finally {
      window.print()
    }
  })
}
function shareWhatsApp() {
  const total = mode.value==='CSV' ? (csvTotals.value.grand || 0) : (estimate.value?.totals?.grand || 0)
  const perStand = mode.value==='CSV' ? (csvTotals.value.perStand || 0) : 0
  const title = mode.value==='CSV' ? (csvTitle.value || 'Survey Quote') : `Survey Quote`
  const units = csvMeta.value.units
  const client = headerClient.value ? `Client: ${headerClient.value}\n` : ''
  const qno = headerQuoteNo.value ? `Quote #: ${headerQuoteNo.value}\n` : ''
  const unitLine = mode.value==='CSV' && units ? `Units: ${units}\n` : (units ? `Units: ${units}\n` : '')
  const txt = encodeURIComponent(`${title}\n${client}${qno}${unitLine}Total: ${money(total)}${ perStand ? `\nPer Stand: ${money(perStand)}` : '' }`)
  const url = `https://wa.me/?text=${txt}`
  window.open(url, '_blank')
}

onMounted(async () => {
  const data = await loadTariff()
  tariff.value = data
  version.value = data?.version || ''
  // Example: read peg factor override from tariff for subdivisions (if present)
  const pf = data?.job_type_overrides?.SUBDIVISION?.peg_factor
  if (typeof pf === 'number' && pf > 0) pegFactor.value = pf
  loadDraft()
  recompute()
  // Ensure the preferred public letterhead is available; if not, try /tariff/, else fallback to /help
  try {
    const res = await fetch('/letterhead.png', { method: 'HEAD', cache: 'no-store' })
    if (!res.ok) {
      const res2 = await fetch('/tariff/letterhead.png', { method: 'HEAD', cache: 'no-store' })
      if (res2.ok) letterheadSrc.value = '/tariff/letterhead.png'
      else letterheadSrc.value = '/help/letterhead.png'
    }
  } catch {
    // If HEAD check fails (e.g., older browsers), keep default; print preloader will still handle load/error
  }
})

watch([jobType, locality, currency, vatRate, parcels, usePegEstimate, pegFactor, pegsOverride, km, days], () => {
  recompute()
  saveDraft()
})

// (moved) Watch calculator inputs is placed after all refs/computeds

// -----------------
// CSV parsing/render
// -----------------
type CsvRow = string[]
type DisplayRow = { kind: 'section'|'subsection'|'item'|'total'|'say', label: string, amount: number|null, amountText?: string }
const csvText = ref<string>('')
const csvRows = ref<CsvRow[]>([])
const csvDisplayRows = ref<DisplayRow[]>([])
const csvTitle = ref<string>('')
const csvMeta = ref<{ units: number|null }>({ units: null })
const csvTotals = ref<{ vat: number|null, grand: number|null, perStand: number|null }>({ vat: null, grand: null, perStand: null })
const useCsvText = ref<boolean>(false)

function onCsvFile(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  if (!f) return
  const reader = new FileReader()
  reader.onload = () => {
    csvText.value = String(reader.result || '')
    parseCsv()
  }
  reader.readAsText(f)
}

function parseCsv() {
  csvRows.value = parseCsvText(csvText.value)
  buildFromCsv(csvRows.value)
  saveDraft()
}

function clearCsv() {
  csvText.value = ''
  csvRows.value = []
  csvDisplayRows.value = []
  csvTitle.value = ''
  csvMeta.value = { units: null }
  csvTotals.value = { vat: null, grand: null, perStand: null }
  saveDraft()
}

function parseCsvText(text: string): CsvRow[] {
  const rows: CsvRow[] = []
  let i = 0
  let cur: string[] = []
  let cell = ''
  let inQuotes = false
  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i+1] === '"') { cell += '"'; i += 2; continue } // escaped quote
        inQuotes = false; i++; continue
      }
      cell += ch; i++; continue
    } else {
      if (ch === '"') { inQuotes = true; i++; continue }
      if (ch === ',') { cur.push(cell); cell = ''; i++; continue }
      if (ch === '\n' || ch === '\r') {
        // finalize row on LF; handle CRLF by skipping LF
        if (ch === '\r' && text[i+1] === '\n') i++
        cur.push(cell); rows.push(cur); cur = []; cell = ''; i++; continue
      }
      cell += ch; i++; continue
    }
  }
  // last cell
  cur.push(cell)
  if (cur.length > 1 || cur[0].trim()) rows.push(cur)
  return rows
}

function toNumber(maybeMoney: string | undefined): number | null {
  if (!maybeMoney) return null
  const s = maybeMoney.trim()
  if (!s) return null
  // Detect currency
  if (s.startsWith('$')) currency.value = 'USD'
  if (s.toUpperCase().startsWith('ZWL')) currency.value = 'ZWL'
  // Strip everything except digits, dot and minus
  const num = s.replace(/[^0-9.\-]/g, '')
  if (!num) return null
  const v = Number(num)
  return Number.isFinite(v) ? v : null
}

function classify(label: string): 'section'|'subsection'|'total'|'say'|'item' {
  const t = label.trim()
  if (!t) return 'item'
  if (/^PART\s+/i.test(t)) return 'section'
  if (/^[A-Z]\.\s+/.test(t)) return 'subsection'
  if (/^(Sub-?Total|VAT|Grand Total)/i.test(t)) return 'total'
  if (/^Say\b/i.test(t)) return 'say'
  return 'item'
}

function buildFromCsv(rows: CsvRow[]) {
  csvDisplayRows.value = []
  csvTitle.value = ''
  csvMeta.value = { units: null }
  csvTotals.value = { vat: null, grand: null, perStand: null }

  // Title row (first non-empty row)
  const first = rows.find(r => r.some(c => (c||'').trim()))
  if (first) {
    csvTitle.value = (first[0] || '').trim()
    // try find units in any numeric cell
    for (let k = 1; k < first.length; k++) {
      const n = toNumber(first[k])
      if (n && Number.isFinite(n)) { csvMeta.value.units = Math.floor(n); break }
    }
  }

  for (const r of rows) {
    const label = (r[0] || '').trim()
    const kind = classify(label)
    if (!label && (!r[1] || !r[1].trim())) continue // skip empty rows
    if (kind === 'total') {
      const amt = toNumber(r[1])
      const dr: DisplayRow = { kind, label, amount: amt, amountText: r[1] || undefined }
      csvDisplayRows.value.push(dr)
      // Capture totals
      if (/VAT/i.test(label) && amt != null) csvTotals.value.vat = amt
      if (/Grand Total/i.test(label) && amt != null) csvTotals.value.grand = amt
      continue
    }
    if (kind === 'say') {
      // Combine pieces like: ["Say ", "$221.00", " per Stand", ...]
      const amtNum = toNumber(r[1])
      const amtText = (r[1] || '').trim()
      const tail = (r[2] || '').trim()
      const sayLabel = `Say ,${amtText}${tail ? `, ${tail}` : ''}`
      const dr: DisplayRow = { kind, label: sayLabel, amount: null }
      csvDisplayRows.value.push(dr)
      if (amtNum != null) csvTotals.value.perStand = amtNum
      continue
    }
    if (kind === 'section' || kind === 'subsection') {
      csvDisplayRows.value.push({ kind, label, amount: null })
      continue
    }
    // item
    const amt = toNumber(r[1])
    if (!label && amt == null) continue
    const dr: DisplayRow = { kind: 'item', label, amount: amt, amountText: r[1] || undefined }
    csvDisplayRows.value.push(dr)
  }
  // If per-stand missing but we have units and grand total, derive
  if (csvTotals.value.perStand == null && csvTotals.value.grand != null && csvMeta.value.units) {
    csvTotals.value.perStand = csvTotals.value.grand / csvMeta.value.units
  }
}

function rowClass(r: DisplayRow) {
  if (r.kind === 'section') return 'row-section'
  if (r.kind === 'total') return 'row-total'
  return ''
}

// ---------------------------------
// Calculator inputs and computation
// ---------------------------------
// Header/meta
const calcTitle = ref<string>('')
const units = ref<number>(0)
const contingencyPct = ref<number>(6)

// PART I
const basicInitial = ref<number>(0)
const basicPerLotRate = ref<number>(0)
const existingBuilding = ref<number>(0)

// PART II A: Beacons
const defaultBeaconsQty = computed(() => Math.max(3, Math.ceil((units.value || 0) * 2.5)))
const beaconsOverrideEnabled = ref<boolean>(false)
const beaconsOverrideQty = ref<number|null>(null)
const effectiveBeaconsQty = computed(() => {
  if (beaconsOverrideEnabled.value) {
    const q = Math.max(0, Math.floor(beaconsOverrideQty.value || 0))
    return q
  }
  return defaultBeaconsQty.value
})
const beaconsRate = ref<number>(18) // $18/beacon (sample)

// PART II B: General Plan & Dispensation
const gpBasic = ref<number>(0)
const gpPerLotRate = ref<number>(10) // $10 per lot (sample)
const dispPerLotRate = ref<number>(1) // $1 per lot (sample)

// PART II C: Travel & Subsistence
const travelIntercityKm = ref<number>(0)
const travelIntercityRate = ref<number>(0.5)
const localPerDayKm = ref<number>(0)
const localDays = ref<number>(0)
const localRate = ref<number>(0.5)
const subsistencePeople = ref<number>(0)
const subsistenceDays = ref<number>(0)
const subsistenceRate = ref<number>(60)
const travelTimeHours = ref<number>(0)
const travelTimeRate = ref<number>(15)

// PART III: Professional
const profHours = ref<number>(0)
const profRatePerQuarter = ref<number>(12.5) // per 15 minutes (sample)

// Exam fees
const examPerLotRate = ref<number>(15) // $15 per lot (sample inferred)

const calcDisplayRows = computed<DisplayRow[]>(() => {
  const rows: DisplayRow[] = []
  const n = Math.max(0, Math.floor(units.value || 0))
  // PART I
  rows.push({ kind: 'section', label: 'PART I (Basic Charge)', amount: null })
  const perLotTotal = n * (basicPerLotRate.value || 0)
  const initialCharge = 50 + 0.2 * perLotTotal
  rows.push({ kind: 'item', label: `Initial Charge for ${n} units`, amount: initialCharge })
  if (basicPerLotRate.value) rows.push({ kind: 'item', label: 'Per Lot Charge', amount: perLotTotal })
  if (existingBuilding.value) rows.push({ kind: 'item', label: 'Charge for existing Building', amount: existingBuilding.value })

  // PART II
  rows.push({ kind: 'section', label: 'PART II (Reimbursables)', amount: null })
  // A. Beacons
  if (effectiveBeaconsQty.value && beaconsRate.value) rows.push({ kind: 'subsection', label: 'A.', amount: null })
  if (effectiveBeaconsQty.value && beaconsRate.value) rows.push({ kind: 'item', label: `Charge for ${effectiveBeaconsQty.value} beacons @ ${money(beaconsRate.value)}/beacon`, amount: effectiveBeaconsQty.value * beaconsRate.value })
  // B. GP & Dispensation
  if (gpBasic.value || gpPerLotRate.value || dispPerLotRate.value) rows.push({ kind: 'subsection', label: 'B.', amount: null })
  if (gpBasic.value) rows.push({ kind: 'item', label: 'Basic Charge for General Plan', amount: gpBasic.value })
  if (gpPerLotRate.value) rows.push({ kind: 'item', label: `Charge for ${n} lots @ ${money(gpPerLotRate.value)} per lot`, amount: n * gpPerLotRate.value })
  if (dispPerLotRate.value) rows.push({ kind: 'item', label: `Dispensation Certificate ${money(dispPerLotRate.value)} per lot`, amount: n * dispPerLotRate.value })
  // C. Travel etc.
  const anyC = (travelIntercityKm.value && travelIntercityRate.value) || (localPerDayKm.value && localDays.value && localRate.value) || (subsistencePeople.value && subsistenceDays.value && subsistenceRate.value) || (travelTimeHours.value && travelTimeRate.value)
  if (anyC) rows.push({ kind: 'subsection', label: 'C.', amount: null })
  if (travelIntercityKm.value && travelIntercityRate.value) rows.push({ kind: 'item', label: `Travelling to and from site: ${travelIntercityKm.value} km @ ${money(travelIntercityRate.value)}/km`, amount: travelIntercityKm.value * travelIntercityRate.value })
  if (localPerDayKm.value && localDays.value && localRate.value) rows.push({ kind: 'item', label: `Local Mileage ${localPerDayKm.value}km per day for ${localDays.value} days @${money(localRate.value)}/km`, amount: localPerDayKm.value * localDays.value * localRate.value })
  if (subsistencePeople.value && subsistenceDays.value && subsistenceRate.value) rows.push({ kind: 'item', label: `Subsistence for ${subsistencePeople.value} people for ${subsistenceDays.value} days @ ${money(subsistenceRate.value)}/person/day`, amount: subsistencePeople.value * subsistenceDays.value * subsistenceRate.value })
  if (travelTimeHours.value && travelTimeRate.value) rows.push({ kind: 'item', label: `Travelling time ${travelTimeHours.value} hours @ ${money(travelTimeRate.value)}/hr`, amount: travelTimeHours.value * travelTimeRate.value })

  // PART III
  rows.push({ kind: 'section', label: "PART III (Professional Work)", amount: null })
  if (profHours.value && profRatePerQuarter.value) rows.push({ kind: 'item', label: `Calculations and supervision, ${profHours.value} hours @ ${money(profRatePerQuarter.value)}/quarter hour`, amount: profHours.value * 4 * profRatePerQuarter.value })

  // Totals (calculated)
  const subtotal = rows.filter(r => r.kind === 'item' && r.amount != null).reduce((a, r) => a + (r.amount || 0), 0)
  if (subtotal) rows.push({ kind: 'total', label: 'Sub-Total', amount: subtotal })
  const cont = subtotal * ((contingencyPct.value || 0) / 100)
  if (cont) rows.push({ kind: 'total', label: `Contingency Fee @ ${Number(contingencyPct.value || 0).toFixed(2)}%`, amount: cont })
  const subtotal2 = subtotal + cont
  if (subtotal2) rows.push({ kind: 'total', label: 'Sub-Total', amount: subtotal2 })
  const vat = subtotal2 * ((vatRate.value || 0) / 100)
  if (vat) rows.push({ kind: 'total', label: `VAT @${Number(vatRate.value || 0).toFixed(2)}%`, amount: vat })
  const subtotal3 = subtotal2 + vat
  if (subtotal3) rows.push({ kind: 'total', label: 'Sub-Total', amount: subtotal3 })
  const exam = n * (examPerLotRate.value || 0)
  if (exam) rows.push({ kind: 'total', label: `Surveyor General's Examination Fees`, amount: exam })
  const grand = subtotal3 + exam
  if (grand) rows.push({ kind: 'total', label: 'Grand Total', amount: grand })
  if (grand && n > 0) rows.push({ kind: 'say', label: 'Say', amount: Math.ceil(grand / n), amountText: money(Math.ceil(grand / n)) + ', per Stand' })
  return rows
})

const computedInitialCharge = computed(() => {
  const n = Math.max(0, Math.floor(units.value || 0))
  const perLotTotal = n * (basicPerLotRate.value || 0)
  return 50 + 0.2 * perLotTotal
})

const titleDisplayed = computed(() => mode.value === 'CSV' ? (csvTitle.value || '') : (calcTitle.value || ''))
const metaUnits = computed(() => mode.value === 'CSV' ? (csvMeta.value.units || null) : (units.value || null))
const displayRows = computed<DisplayRow[]>(() => mode.value === 'CSV' ? (csvDisplayRows.value || []) : (calcDisplayRows.value || []))
const totalsDisplayed = computed(() => {
  if (mode.value === 'CSV') return csvTotals.value
  // derive from calc rows
  let vat: number|null = null, grand: number|null = null, perStand: number|null = null
  for (const r of calcDisplayRows.value) {
    if (r.kind === 'total' && /VAT/i.test(r.label)) vat = r.amount || 0
    if (r.kind === 'total' && /Grand Total/i.test(r.label)) grand = r.amount || 0
    if (r.kind === 'say' && r.amount != null) perStand = r.amount
  }
  if (perStand == null && grand != null && (units.value || 0) > 0) perStand = grand / (units.value || 1)
  return { vat, grand, perStand }
})

// Summary composition (Professional vs Reimbursables)
const summary = computed(() => {
  // Walk active display rows
  const rows = displayRows.value
  let currentPart: 'PART I'|'PART II'|'PART III'|null = null
  let part1 = 0, part2 = 0, part3 = 0
  let contingency = 0, vat = 0, exam = 0
  for (const r of rows) {
    if (r.kind === 'section') {
      if (/PART\s+I\b/i.test(r.label)) currentPart = 'PART I'
      else if (/PART\s+II\b/i.test(r.label)) currentPart = 'PART II'
      else if (/PART\s+III\b/i.test(r.label)) currentPart = 'PART III'
      else currentPart = null
      continue
    }
    if (r.kind === 'item' && r.amount != null) {
      if (currentPart === 'PART I') part1 += r.amount
      else if (currentPart === 'PART II') part2 += r.amount
      else if (currentPart === 'PART III') part3 += r.amount
    }
    if (r.kind === 'total' && /Contingency/i.test(r.label) && r.amount != null) contingency += r.amount
    if (r.kind === 'total' && /VAT/i.test(r.label) && r.amount != null) vat += r.amount
    if (r.kind === 'total' && /Surveyor General/i.test(r.label) && r.amount != null) exam += r.amount
  }
  const professional = part1 + part3 + contingency + vat
  const reimbursables = part2
  const grand = totalsDisplayed.value.grand || (professional + reimbursables + exam)
  return { professional, reimbursables, exam, grand }
})

// Watch calculator inputs
watch([
  calcTitle, units, contingencyPct,
  basicInitial, basicPerLotRate, existingBuilding,
  beaconsRate,
  gpBasic, gpPerLotRate, dispPerLotRate,
  travelIntercityKm, travelIntercityRate,
  localPerDayKm, localDays, localRate,
  subsistencePeople, subsistenceDays, subsistenceRate,
  travelTimeHours, travelTimeRate,
  profHours, profRatePerQuarter,
  examPerLotRate,
  beaconsOverrideEnabled, beaconsOverrideQty
], () => {
  saveDraft()
})
</script>

<script lang="ts">
export default { name: 'EstimateView' }
</script>

<style scoped>
/* Subtle row accents */
.row-section { background: #f8fafc; border-top: 1px solid #e5e7eb; }
.row-total { background: #fff7ed; }

@media print {
  .no-print { display: none !important; }
  .sticky { display: none !important; }
  table { border-collapse: collapse; width: 100%; }
  td { border-bottom: 1px solid #e5e7eb; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .print-hidden { display: none !important; }
  .print-letterhead { display: block !important; text-align: left; margin-bottom: 1rem; }
  .print-letterhead-img { width: 100%; max-height: 140px; object-fit: contain; }
}

/* Hide letterhead while on screen to avoid duplicating UI */
@media screen {
  .print-letterhead { display: none; }
}
</style>
