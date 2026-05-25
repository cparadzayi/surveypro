<template>
  <!-- ─────────────────────────────────────────────────────────────────────── -->
  <!-- Lite • Compare — Beacon Coordinate Comparison & Least Squares Adjustment -->
  <!-- Section 67(5): 4-param Helmert · iterative data snooping · W-test · χ²    -->
  <!-- ─────────────────────────────────────────────────────────────────────── -->
  <ModuleScaffold
    title="Beacon Comparison & Adjustment"
    description="Section 67(5) — Cape Lo P(Y,X), South-oriented. 4-parameter Helmert least-squares with iterative data snooping (W-test, chi-square)."
    :breadcrumbs="[
      { label: 'Lite', to: '/modules/lite' },
      { label: 'Transform' },
      { label: 'Beacon Comparison' },
    ]"
  >
    <div class="space-y-4">

      <!-- CONFIGURATION ────────────────────────────────────────────────────── -->
      <div class="bg-white rounded-lg border border-gray-200">
        <div class="px-4 py-2.5 border-b border-gray-200 text-xs font-medium text-[#1a3a5c]">
          Configuration
        </div>
        <div class="flex flex-wrap gap-4 items-end px-4 py-3">

          <div>
            <label class="block text-[11px] text-gray-500 mb-1">SI 727 class</label>
            <select
              :value="surveyClass"
              @change="store.setSurveyClass($event.target.value)"
              class="px-2 py-1.5 border border-gray-300 rounded text-sm
                     focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]"
            >
              <option value="B">Class B</option>
              <option value="C">Class C</option>
            </select>
          </div>

          <div>
            <label class="block text-[11px] text-gray-500 mb-1">A priori σ₀ (metres)</label>
            <input
              type="number" step="0.001" min="0.001"
              :value="sigma0"
              @input="store.setSigma0($event.target.value)"
              class="w-28 px-2 py-1.5 border border-gray-300 rounded text-sm
                     focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]"
            />
            <p class="text-[10px] text-gray-400 mt-0.5">{{ sigma0Note }}</p>
          </div>

          <div>
            <label class="block text-[11px] text-gray-500 mb-1">Confidence level</label>
            <select
              :value="critW"
              @change="critW = parseFloat($event.target.value)"
              class="px-2 py-1.5 border border-gray-300 rounded text-sm
                     focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]"
            >
              <option value="1.960">95 % (W &gt; 1.960)</option>
              <option value="2.576">99 % (W &gt; 2.576)</option>
              <option value="3.291">99.9 % (W &gt; 3.291)</option>
            </select>
          </div>

          <div class="flex flex-wrap gap-2 ml-auto items-center">
            <button
              @click="downloadTemplate"
              class="px-3 py-1.5 text-xs border border-gray-300 rounded
                     hover:bg-gray-50 transition-colors"
              title="Download a CSV template pre-filled with the sample data"
            >
              ⬇ Template
            </button>
            <label
              class="px-3 py-1.5 text-xs border border-gray-300 rounded cursor-pointer
                     hover:bg-gray-50 transition-colors"
            >
              ⬆ Upload CSV
              <input
                type="file" accept=".csv,text/csv"
                class="hidden"
                @change="handleUpload"
              />
            </label>
            <span class="w-px h-5 bg-gray-200 mx-1"></span>
            <button
              @click="store.loadSample()"
              class="px-3 py-1.5 text-xs border border-gray-300 rounded
                     hover:bg-gray-50 transition-colors"
            >
              Load sample data
            </button>
            <button
              @click="store.addPoint()"
              class="px-3 py-1.5 text-xs border border-gray-300 rounded
                     hover:bg-gray-50 transition-colors"
            >
              + Add beacon
            </button>
            <button
              @click="store.compute()"
              class="px-4 py-1.5 text-xs font-medium bg-[#1a3a5c] text-white
                     rounded hover:bg-[#0f2540] transition-colors"
            >
              ▶ Compute
            </button>
            <button
              @click="downloadReport"
              :disabled="!result"
              class="px-3 py-1.5 text-xs font-medium border border-[#1a3a5c] text-[#1a3a5c]
                     rounded hover:bg-[#1a3a5c] hover:text-white transition-colors
                     disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#1a3a5c]"
              title="Generate the SI 727 §67(5) examination report (PDF)"
            >
              📄 Examination Report (PDF)
            </button>
          </div>
        </div>

        <!-- CSV format hint + import status -->
        <div class="px-4 pb-3 -mt-1 space-y-1">
          <p class="text-[10px] text-gray-400">
            CSV columns:
            <code class="bg-gray-100 px-1 rounded">Beacon, Hist_Y, Hist_X, Survey_Y, Survey_X</code>
            — Cape Lo <b>Y = Westing</b>, <b>X = Southing</b>. Download the template for a worked example, then replace the rows with your data.
          </p>
          <p
            v-if="importMsg"
            class="text-[11px]"
            :class="importMsg.ok ? 'text-green-600' : 'text-red-600'"
          >
            {{ importMsg.ok ? '✓' : '⚠' }} {{ importMsg.text }}
          </p>
        </div>

        <!-- Examination details (for the SG report header) -->
        <div class="px-4 pb-3 border-t border-gray-100 pt-3">
          <div class="text-[11px] font-medium text-[#1a3a5c] mb-2">Examination details (for PDF report)</div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <input v-model="surveyorName" placeholder="Surveyor name"
                   class="px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]" />
            <input v-model="plsNumber" placeholder="PLS no."
                   class="px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]" />
            <input v-model="location" placeholder="Location / description"
                   class="px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]" />
            <input v-model="priorSurvey" placeholder="Prior survey / Diagram-GP no."
                   class="px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]" />
          </div>
        </div>
      </div>

      <!-- INPUT TABLE ──────────────────────────────────────────────────────── -->
      <div class="bg-white rounded-lg border border-gray-200">
        <div class="px-4 py-2.5 border-b border-gray-200 flex justify-between items-center">
          <span class="text-xs font-medium text-[#1a3a5c]">Input data</span>
          <span class="text-[10px] text-gray-400">Minimum 3 beacons required</span>
        </div>
        <div class="overflow-x-auto">
          <table class="min-w-full text-xs">
            <thead>
              <tr>
                <th class="text-left px-3 py-2 font-medium text-gray-600 bg-gray-50 w-28">
                  Beacon
                </th>
                <!-- Original data columns — BLACK per Sec 67(5) -->
                <th class="text-right px-3 py-2 font-medium text-gray-900 bg-gray-100">
                  Hist. Y · Westing (m)
                </th>
                <th class="text-right px-3 py-2 font-medium text-gray-900 bg-gray-100">
                  Hist. X · Southing (m)
                </th>
                <!-- Survey data columns — RED per Sec 67(5) -->
                <th class="text-right px-3 py-2 font-medium text-red-600 bg-red-50">
                  Survey Y · Westing (m)
                </th>
                <th class="text-right px-3 py-2 font-medium text-red-600 bg-red-50">
                  Survey X · Southing (m)
                </th>
                <th class="w-8 bg-gray-50"></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(p, idx) in points"
                :key="p.id"
                :class="idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'"
                class="border-t border-gray-100"
              >
                <td class="px-3 py-1.5">
                  <input
                    :value="p.name"
                    @input="store.updatePoint(p.id, 'name', $event.target.value)"
                    class="w-full bg-transparent text-left text-xs focus:outline-none"
                  />
                </td>
                <td class="px-3 py-1.5 bg-gray-50/40">
                  <input
                    type="number" step="0.001"
                    :value="p.yH"
                    @input="store.updatePoint(p.id, 'yH', parseFloat($event.target.value))"
                    class="w-full bg-transparent text-right text-xs text-gray-900
                           font-medium focus:outline-none"
                  />
                </td>
                <td class="px-3 py-1.5 bg-gray-50/40">
                  <input
                    type="number" step="0.001"
                    :value="p.xH"
                    @input="store.updatePoint(p.id, 'xH', parseFloat($event.target.value))"
                    class="w-full bg-transparent text-right text-xs text-gray-900
                           font-medium focus:outline-none"
                  />
                </td>
                <td class="px-3 py-1.5 bg-red-50/20">
                  <input
                    type="number" step="0.001"
                    :value="p.yS"
                    @input="store.updatePoint(p.id, 'yS', parseFloat($event.target.value))"
                    class="w-full bg-transparent text-right text-xs text-red-600
                           font-medium focus:outline-none"
                  />
                </td>
                <td class="px-3 py-1.5 bg-red-50/20">
                  <input
                    type="number" step="0.001"
                    :value="p.xS"
                    @input="store.updatePoint(p.id, 'xS', parseFloat($event.target.value))"
                    class="w-full bg-transparent text-right text-xs text-red-600
                           font-medium focus:outline-none"
                  />
                </td>
                <td class="px-1 py-1.5 text-center">
                  <button
                    @click="store.removePoint(p.id)"
                    class="text-red-400 hover:text-red-600 text-base leading-none"
                  >×</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <!-- Colour legend per Section 67(5) -->
        <div class="flex flex-wrap gap-4 px-4 py-2 text-[10px] text-gray-500 border-t border-gray-100">
          <span><b class="text-gray-900">■ BLACK</b> — original (historical) data</span>
          <span><b class="text-red-600">■ RED</b> — survey data</span>
          <span><b class="text-blue-700">■ BLUE</b> — computed / other data (not green)</span>
        </div>
      </div>

      <!-- ERROR BANNER ──────────────────────────────────────────────────────── -->
      <div
        v-if="error"
        class="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-xs text-red-700"
      >
        ⚠ {{ error }}
      </div>

      <!-- RESULTS ──────────────────────────────────────────────────────────── -->
      <div v-if="result" class="bg-white rounded-lg border border-gray-200">

        <!-- Tab bar -->
        <div class="flex border-b border-gray-200 overflow-x-auto">
          <button
            v-for="tab in TABS" :key="tab.id"
            @click="activeTab = tab.id"
            :class="[
              'flex-shrink-0 px-4 py-2.5 text-xs border-b-2 -mb-px transition-colors whitespace-nowrap',
              activeTab === tab.id
                ? 'border-[#c8a84b] text-[#1a3a5c] font-medium'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            ]"
          >{{ tab.label }}</button>
        </div>

        <!-- ── SCHEDULE TAB ───────────────────────────────────────────────── -->
        <div v-show="activeTab === 'schedule'" class="p-4">
          <div class="flex flex-wrap justify-between items-center mb-3 gap-2 text-xs text-gray-500">
            <span>
              σ₀ = {{ sigma0.toFixed(3) }} m · Critical W = {{ critW }} ·
              <b class="text-blue-600">{{ acceptedCount }} Accepted</b>
              <template v-if="rejectedCount > 0">
                · <b class="text-red-600">{{ rejectedCount }} Rejected</b>
              </template>
            </span>
          </div>

          <div class="overflow-x-auto">
            <table class="min-w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th rowspan="2" class="text-left px-2 py-1.5 font-medium text-gray-600
                                         border-b-2 border-gray-300 bg-white align-bottom
                                         whitespace-nowrap">Beacon</th>
                  <th colspan="2" class="text-center px-2 py-1 font-medium text-gray-900
                                         bg-gray-100 border-b border-gray-300">Original data</th>
                  <th colspan="2" class="text-center px-2 py-1 font-medium text-red-600
                                         bg-red-50 border-b border-gray-300">Survey data</th>
                  <th colspan="2" class="text-center px-2 py-1 font-medium text-blue-700
                                         bg-blue-50 border-b border-gray-300">Raw diff.</th>
                  <th colspan="2" class="text-center px-2 py-1 font-medium text-blue-700
                                         bg-blue-50 border-b border-gray-300">Residuals</th>
                  <th colspan="2" class="text-center px-2 py-1 font-medium text-blue-700
                                         bg-blue-50 border-b border-gray-300">Pos. residual</th>
                  <th rowspan="2" class="text-right px-2 py-1 font-medium text-blue-700
                                         bg-blue-50 border-b-2 border-gray-300 align-bottom
                                         whitespace-nowrap">W-max</th>
                  <th rowspan="2" class="text-center px-2 py-1 font-medium text-gray-600
                                         bg-white border-b-2 border-gray-300 align-bottom">Status</th>
                </tr>
                <tr>
                  <th class="text-right px-2 py-1 font-medium text-gray-900 bg-gray-100 border-b border-gray-200 whitespace-nowrap">Y (m)</th>
                  <th class="text-right px-2 py-1 font-medium text-gray-900 bg-gray-100 border-b border-gray-200 whitespace-nowrap">X (m)</th>
                  <th class="text-right px-2 py-1 font-medium text-red-600 bg-red-50 border-b border-gray-200 whitespace-nowrap">Y (m)</th>
                  <th class="text-right px-2 py-1 font-medium text-red-600 bg-red-50 border-b border-gray-200 whitespace-nowrap">X (m)</th>
                  <th class="text-right px-2 py-1 font-medium text-blue-700 bg-blue-50 border-b border-gray-200 whitespace-nowrap">ΔY (m)</th>
                  <th class="text-right px-2 py-1 font-medium text-blue-700 bg-blue-50 border-b border-gray-200 whitespace-nowrap">ΔX (m)</th>
                  <th class="text-right px-2 py-1 font-medium text-blue-700 bg-blue-50 border-b border-gray-200 whitespace-nowrap">vY (m)</th>
                  <th class="text-right px-2 py-1 font-medium text-blue-700 bg-blue-50 border-b border-gray-200 whitespace-nowrap">vX (m)</th>
                  <th class="text-right px-2 py-1 font-medium text-blue-700 bg-blue-50 border-b border-gray-200 whitespace-nowrap">Dist (m)</th>
                  <th class="text-right px-2 py-1 font-medium text-blue-700 bg-blue-50 border-b border-gray-200 whitespace-nowrap">Brg (S)</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(p, idx) in result.pts"
                  :key="p.id"
                  :class="[
                    'border-t border-gray-100',
                    p.finalStatus === 'REJECT' ? 'bg-red-50'
                    : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/60',
                  ]"
                >
                  <td class="px-2 py-1.5 font-medium text-left whitespace-nowrap">
                    {{ p.name }}
                    <span v-if="p.finalStatus === 'REJECT'" class="text-red-500 ml-1">⊗</span>
                  </td>
                  <td class="px-2 py-1.5 text-right text-gray-900 font-medium whitespace-nowrap">{{ f3(p.yH) }}</td>
                  <td class="px-2 py-1.5 text-right text-gray-900 font-medium whitespace-nowrap">{{ f3(p.xH) }}</td>
                  <td class="px-2 py-1.5 text-right text-red-600 font-medium whitespace-nowrap">{{ f3(p.yS) }}</td>
                  <td class="px-2 py-1.5 text-right text-red-600 font-medium whitespace-nowrap">{{ f3(p.xS) }}</td>
                  <td class="px-2 py-1.5 text-right text-blue-700 whitespace-nowrap">{{ f4s(p.dY) }}</td>
                  <td class="px-2 py-1.5 text-right text-blue-700 whitespace-nowrap">{{ f4s(p.dX) }}</td>
                  <td class="px-2 py-1.5 text-right whitespace-nowrap"
                      :class="p.finalStatus === 'REJECT' ? 'text-red-600' : 'text-blue-700'">
                    {{ f4s(p.vY) }}
                  </td>
                  <td class="px-2 py-1.5 text-right whitespace-nowrap"
                      :class="p.finalStatus === 'REJECT' ? 'text-red-600' : 'text-blue-700'">
                    {{ f4s(p.vX) }}
                  </td>
                  <td class="px-2 py-1.5 text-right whitespace-nowrap font-medium"
                      :class="p.finalStatus === 'REJECT' ? 'text-red-600' : 'text-blue-700'">
                    {{ f4(p.resDist) }}
                  </td>
                  <td class="px-2 py-1.5 text-right text-blue-700 whitespace-nowrap">{{ formatDMS(p.resBrg) }}</td>
                  <td class="px-2 py-1.5 text-right whitespace-nowrap font-medium"
                      :class="wColour(p)">
                    {{ p.wMax != null ? p.wMax.toFixed(2) : '—' }}
                  </td>
                  <td class="px-2 py-1.5 text-center whitespace-nowrap">
                    <span
                      :class="[
                        'inline-block px-2 py-0.5 rounded text-[10px] font-medium text-white',
                        p.finalStatus === 'REJECT' ? 'bg-red-600' : 'bg-blue-600',
                      ]"
                    >{{ p.finalStatus || '—' }}</span>
                    <span
                      v-if="p.finalStatus === 'REJECT' && p.rejIter"
                      class="text-[9px] text-gray-400 ml-1"
                    >iter {{ p.rejIter }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="flex flex-wrap gap-4 mt-3 text-[10px] text-gray-500">
            <span><b class="text-gray-900">BLACK</b>: Original (historical) data</span>
            <span><b class="text-red-600">RED</b>: Survey data</span>
            <span><b class="text-blue-700">BLUE</b>: Computed data (not green — Sec. 67(5))</span>
            <span>W-test critical value: {{ critW }} · Residuals after Helmert transformation · Bearings South-oriented (0°=S, 90°=W)</span>
          </div>
        </div>

        <!-- ── TRANSFORMATION TAB ─────────────────────────────────────────── -->
        <div v-show="activeTab === 'trans'" class="p-4">
          <h2 class="text-xs font-medium text-[#1a3a5c] mb-3">
            Helmert 4-parameter similarity transformation
          </h2>
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <div
              v-for="param in transformParams"
              :key="param.label"
              class="bg-gray-50 rounded-lg p-3 border-l-2 border-[#1a3a5c]"
            >
              <div class="text-[10px] text-gray-500 mb-1">{{ param.label }}</div>
              <div class="text-sm font-medium text-blue-800 break-all">{{ param.value }}</div>
              <div class="text-[10px] text-gray-400 mt-1">{{ param.note }}</div>
            </div>
          </div>
          <div class="mt-4 bg-blue-50 rounded-lg p-3 text-xs text-blue-800 leading-relaxed">
            <b>Model (Cape Lo P(Y,X)):</b>
            Y<sub>survey</sub> = T<sub>Y</sub> + a·Y<sub>hist</sub> − b·X<sub>hist</sub>
            &nbsp;|&nbsp;
            X<sub>survey</sub> = T<sub>X</sub> + b·Y<sub>hist</sub> + a·X<sub>hist</sub>
            <br><span class="mt-1 block">{{ transformInterpretation }}</span>
            <span class="mt-1 block text-[11px] text-blue-600">
              Translation is reported at the network centroid (Y<sub>c</sub> = {{ f3(result.adj.params.yc) }}, X<sub>c</sub> = {{ f3(result.adj.params.xc) }}).
            </span>
          </div>
        </div>

        <!-- ── STATISTICS TAB ─────────────────────────────────────────────── -->
        <div v-show="activeTab === 'stats'" class="p-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">

            <!-- Summary cards -->
            <div>
              <h2 class="text-xs font-medium text-[#1a3a5c] mb-3">Overall statistics</h2>
              <div class="grid grid-cols-2 gap-2 mb-3">
                <div
                  v-for="s in statCards"
                  :key="s.label"
                  class="bg-gray-50 rounded-lg p-2.5"
                >
                  <div class="text-[10px] text-gray-500">{{ s.label }}</div>
                  <div class="text-sm font-medium text-blue-800 mt-1">{{ s.value }}</div>
                </div>
              </div>

              <!-- Chi-square test result -->
              <div
                :class="[
                  'rounded-lg p-3 text-xs leading-relaxed',
                  chi2Passes
                    ? 'bg-green-50 text-green-800 border border-green-200'
                    : 'bg-amber-50 text-amber-800 border border-amber-200',
                ]"
              >
                <b>Chi-square test (95 % CI):</b><br>
                χ² = {{ result.adj.stats.chi2?.toFixed(4) }} must fall in
                [{{ result.adj.stats.chi2L?.toFixed(2) }},
                {{ result.adj.stats.chi2U?.toFixed(2) }}]
                for DOF = {{ result.adj.stats.DOF }}<br>
                <b>{{
                  chi2Passes
                    ? '✓ Test PASSES — variance consistent with a priori accuracy'
                    : '✗ Test FAILS — review a priori σ₀ or check for remaining blunders'
                }}</b>
              </div>
            </div>

            <!-- Iteration log -->
            <div>
              <h2 class="text-xs font-medium text-[#1a3a5c] mb-3">
                Iteration log (data snooping)
              </h2>
              <table class="min-w-full text-xs">
                <thead>
                  <tr class="bg-gray-50">
                    <th class="text-left px-2 py-1.5 font-medium text-gray-600">Iter</th>
                    <th class="text-right px-2 py-1.5 font-medium text-gray-600">Active pts</th>
                    <th class="text-right px-2 py-1.5 font-medium text-gray-600">σ₀ (m)</th>
                    <th class="text-right px-2 py-1.5 font-medium text-gray-600">χ²</th>
                    <th class="text-right px-2 py-1.5 font-medium text-gray-600">χ² bounds</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="entry in result.log"
                    :key="entry.iter"
                    class="border-t border-gray-100"
                  >
                    <td class="px-2 py-1.5">{{ entry.iter }}</td>
                    <td class="px-2 py-1.5 text-right">{{ entry.n }}</td>
                    <td class="px-2 py-1.5 text-right">{{ entry.s0.toFixed(5) }}</td>
                    <td class="px-2 py-1.5 text-right">{{ entry.chi2.toFixed(4) }}</td>
                    <td class="px-2 py-1.5 text-right text-gray-400">
                      [{{ entry.chi2L.toFixed(2) }}, {{ entry.chi2U.toFixed(2) }}]
                    </td>
                  </tr>
                </tbody>
              </table>

              <div
                v-if="result.converged"
                class="mt-3 bg-green-50 border border-green-200 rounded px-3 py-2
                       text-xs text-green-700"
              >
                ✓ Converged in {{ result.log.length }} iteration(s).
                {{ rejectedCount }} beacon(s) rejected.
              </div>
            </div>
          </div>
        </div>

        <!-- ── DISPLACEMENT PLOT TAB ──────────────────────────────────────── -->
        <div v-show="activeTab === 'plot'" class="p-4">
          <p class="text-xs text-gray-500 mb-3">
            Conventional map orientation (North up, East right) derived from Cape Lo (Y,X).
            Arrows scaled ×{{ plotData?.arrowScale ?? 1 }} for visibility.
            ● Black = historical position ·
            <span class="text-red-600">● Red = survey position</span> ·
            <span class="text-red-600 font-medium">Red arrow = rejected beacon</span>
          </p>

          <svg
            v-if="plotData"
            :viewBox="`0 0 ${plotData.W} ${plotData.H}`"
            class="w-full rounded border border-gray-200 bg-gray-50"
          >
            <!-- Grid -->
            <line
              v-for="i in 5" :key="`gx${i}`"
              :x1="plotData.pad + (i - 1) * (plotData.W - 2 * plotData.pad) / 4"
              :y1="plotData.pad"
              :x2="plotData.pad + (i - 1) * (plotData.W - 2 * plotData.pad) / 4"
              :y2="plotData.H - plotData.pad"
              stroke="#e5e7eb" stroke-width="0.5"
            />
            <line
              v-for="i in 5" :key="`gy${i}`"
              :x1="plotData.pad"
              :y1="plotData.pad + (i - 1) * (plotData.H - 2 * plotData.pad) / 4"
              :x2="plotData.W - plotData.pad"
              :y2="plotData.pad + (i - 1) * (plotData.H - 2 * plotData.pad) / 4"
              stroke="#e5e7eb" stroke-width="0.5"
            />
            <!-- Axis labels -->
            <text
              :x="plotData.W / 2" :y="plotData.H - 8"
              text-anchor="middle" font-size="10" fill="#6b7280"
            >Easting (m)</text>
            <text
              x="12" :y="plotData.H / 2"
              text-anchor="middle" font-size="10" fill="#6b7280"
              :transform="`rotate(-90, 12, ${plotData.H / 2})`"
            >Northing (m)</text>

            <!-- Per-beacon elements -->
            <template v-for="pt in plotData.pointData" :key="pt.id">
              <!-- Displacement arrow -->
              <line
                :x1="pt.x1" :y1="pt.y1" :x2="pt.x2" :y2="pt.y2"
                :stroke="pt.isRej ? '#dc3545' : '#9ca3af'"
                :stroke-width="pt.isRej ? 2 : 1"
              />
              <!-- Arrowhead polygon -->
              <polygon
                v-if="pt.hasArrow"
                :points="pt.arrowPoints"
                :fill="pt.isRej ? '#dc3545' : '#9ca3af'"
              />
              <!-- Historical position (black) -->
              <circle :cx="pt.x1" :cy="pt.y1" r="4" fill="#1f2937" opacity="0.85" />
              <!-- Survey position (red) -->
              <circle
                :cx="pt.x2" :cy="pt.y2" r="3"
                :fill="pt.isRej ? '#dc3545' : '#c0392b'"
              />
              <!-- Beacon name label -->
              <text
                :x="pt.x1 + 6" :y="pt.y1 - 5"
                font-size="9"
                :fill="pt.isRej ? '#dc3545' : '#6b7280'"
                :font-weight="pt.isRej ? 500 : 400"
              >{{ pt.name }}</text>
            </template>
          </svg>

          <p v-if="rejectedNames.length" class="mt-2 text-xs text-red-600 font-medium">
            Rejected: {{ rejectedNames.join(', ') }}
          </p>
          <p class="mt-1 text-[10px] text-gray-400">
            Arrow lengths are scaled for visualisation only — they do not represent true distances.
          </p>
        </div>

        <!-- ── EDGE COMPLIANCE TAB ────────────────────────────────────────── -->
        <div v-show="activeTab === 'edges'" class="p-4">
          <div v-if="!result?.edges?.rows?.length" class="text-xs text-gray-500">
            No edges to compare.
          </div>
          <template v-else>
            <div class="text-xs text-gray-500 mb-2">
              SI 727 Class {{ result.surveyClass }} · all pairs among accepted beacons ·
              <b class="text-blue-700">{{ result.edges.summary.bothPass }}</b> of
              {{ result.edges.summary.totalLines }} lines pass both checks ·
              SI 727 mean scale {{ result.edges.summary.meanScale != null ? result.edges.summary.meanScale.toFixed(8) : '—' }},
              swing {{ result.edges.summary.meanSwingDeg != null ? formatDMS(result.edges.summary.meanSwingDeg) : '—' }}
            </div>
            <div class="overflow-x-auto">
              <table class="min-w-full text-xs border-collapse">
                <thead>
                  <tr class="bg-gray-50 text-gray-600">
                    <th class="text-left px-2 py-1.5">Line</th>
                    <th class="text-right px-2 py-1.5">d Hist (m)</th>
                    <th class="text-right px-2 py-1.5">d Surv (m)</th>
                    <th class="text-right px-2 py-1.5">Δd (m)</th>
                    <th class="text-right px-2 py-1.5">dist tol (m)</th>
                    <th class="text-center px-2 py-1.5">dist</th>
                    <th class="text-right px-2 py-1.5">swing-res (″)</th>
                    <th class="text-right px-2 py-1.5">dir tol (″)</th>
                    <th class="text-center px-2 py-1.5">dir</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(e, idx) in result.edges.rows"
                    :key="e.from + '-' + e.to"
                    :class="[!e.pass ? 'bg-red-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/60', 'border-t border-gray-100']"
                  >
                    <td class="px-2 py-1.5 whitespace-nowrap">{{ e.from }} – {{ e.to }}</td>
                    <td class="px-2 py-1.5 text-right">{{ f3(e.dH) }}</td>
                    <td class="px-2 py-1.5 text-right">{{ f3(e.dS) }}</td>
                    <td class="px-2 py-1.5 text-right">{{ f4s(e.dDiff) }}</td>
                    <td class="px-2 py-1.5 text-right text-gray-500">{{ f4(e.dAllow) }}</td>
                    <td class="px-2 py-1.5 text-center" :class="e.distOk ? 'text-blue-600' : 'text-red-600 font-medium'">{{ e.distOk ? '✓' : '✗' }}</td>
                    <td class="px-2 py-1.5 text-right">{{ e.dirResidualSec.toFixed(1) }}</td>
                    <td class="px-2 py-1.5 text-right text-gray-500">{{ e.dirAllowSec.toFixed(1) }}</td>
                    <td class="px-2 py-1.5 text-center" :class="e.dirOk ? 'text-blue-600' : 'text-red-600 font-medium'">{{ e.dirOk ? '✓' : '✗' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="text-[10px] text-gray-400 mt-2">
              Distance tolerance = factor·√(0.075f + 0.00015f²), f = shorter line. Direction tolerance = K/(S+300)″,
              S = historical ray length. Direction shown as residual after removing the Helmert swing.
            </p>
          </template>
        </div>

      </div><!-- /results -->
    </div>
  </ModuleScaffold>
</template>

<script setup>
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import ModuleScaffold from '@/components/scaffold/ModuleScaffold.vue'
import { useSurveyAdjustmentStore } from '@/stores/surveyAdjustmentStore'
import { f3, f4, f4s, formatDMS, SAMPLE_DATA } from '@/utils/surveyMath'
import { generateBeaconAdjustmentReport } from '@/utils/beaconAdjustmentReport'
import { medianPairwiseDistance } from '@/utils/si727'

// ── STORE ─────────────────────────────────────────────────────────────────────
const store = useSurveyAdjustmentStore()
const { points, sigma0, critW, surveyClass, sigma0Auto, result, error } = storeToRefs(store)

// ── LOCAL UI STATE ────────────────────────────────────────────────────────────
const activeTab = ref('schedule')
const sigma0Note = computed(() => {
  if (!sigma0Auto.value) return 'manual override'
  const L = medianPairwiseDistance(points.value, false)
  return L > 0
    ? `SI 727 class ${surveyClass.value} @ L≈${L.toFixed(0)} m`
    : `SI 727 class ${surveyClass.value}`
})
const importMsg = ref(null)   // { ok: boolean, text: string } | null

// ── EXAMINATION REPORT METADATA ───────────────────────────────────────────────
const surveyorName = ref('')
const plsNumber    = ref('')
const location     = ref('')
const priorSurvey  = ref('')

function downloadReport() {
  if (!result.value) return
  generateBeaconAdjustmentReport(result.value, {
    surveyorName: surveyorName.value,
    plsNumber: plsNumber.value,
    location: location.value,
    priorSurvey: priorSurvey.value,
    sigma0: sigma0.value,
    critW: critW.value,
    date: new Date().toLocaleDateString('en-CA'),
  })
}

// ── CSV TEMPLATE DOWNLOAD ─────────────────────────────────────────────────────
const CSV_HEADER = 'Beacon,Hist_Y,Hist_X,Survey_Y,Survey_X'

/** Build & download a CSV template pre-filled with the sample beacons.
 *  Y = Westing, X = Southing (Cape Lo). */
function downloadTemplate() {
  const rows = SAMPLE_DATA.map(p =>
    [p.name, p.yH.toFixed(3), p.xH.toFixed(3), p.yS.toFixed(3), p.xS.toFixed(3)].join(','),
  )
  const csv = [CSV_HEADER, ...rows].join('\r\n') + '\r\n'
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = 'beacon-comparison-template.csv'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// ── CSV UPLOAD / PARSE ────────────────────────────────────────────────────────
/**
 * Parse a beacon-comparison CSV into rows of { name, eH, nH, eS, nS }.
 * Tolerates an optional header line and blank rows; throws on malformed input.
 */
function parseBeaconCsv(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) throw new Error('The file is empty.')

  // Treat the first line as a header unless its numeric columns parse as numbers.
  const firstCols = lines[0].split(',')
  const firstLooksLikeData =
    firstCols.length >= 5 && firstCols.slice(1, 5).every(c => Number.isFinite(parseFloat(c)))
  const dataLines = firstLooksLikeData ? lines : lines.slice(1)

  const rows = dataLines.map((line, i) => {
    const cols = line.split(',').map(s => s.trim())
    if (cols.length < 5) {
      throw new Error(
        `Row ${i + 1}: expected 5 columns (${CSV_HEADER}), found ${cols.length}.`,
      )
    }
    const [name, yH, xH, yS, xS] = cols
    const nums = { yH: Number(yH), xH: Number(xH), yS: Number(yS), xS: Number(xS) }
    for (const [k, v] of Object.entries(nums)) {
      if (!Number.isFinite(v)) {
        throw new Error(`Row ${i + 1} (${name || 'unnamed'}): "${k}" is not a valid number.`)
      }
    }
    return { name: name || `BM ${String(i + 1).padStart(3, '0')}`, ...nums }
  })

  if (rows.length < 3) throw new Error('Need at least 3 beacons to run a comparison.')
  return rows
}

async function handleUpload(event) {
  const input = event.target
  const file  = input.files?.[0]
  if (!file) return
  try {
    const rows = parseBeaconCsv(await file.text())
    store.setPoints(rows)
    importMsg.value = { ok: true, text: `Loaded ${rows.length} beacons from "${file.name}".` }
  } catch (err) {
    importMsg.value = { ok: false, text: err.message || 'Could not read the CSV file.' }
  } finally {
    input.value = ''   // allow re-uploading the same filename
  }
}

const TABS = [
  { id: 'schedule', label: 'Computation schedule' },
  { id: 'trans',    label: 'Transformation'        },
  { id: 'stats',    label: 'Statistics'             },
  { id: 'plot',     label: 'Displacement plot'      },
  { id: 'edges',    label: 'Edge compliance'        },
]

// ── COMPUTED — SCHEDULE ───────────────────────────────────────────────────────
const acceptedCount = computed(
  () => result.value?.pts.filter(p => p.finalStatus === 'ACCEPT').length ?? 0,
)
const rejectedCount = computed(
  () => result.value?.pts.filter(p => p.finalStatus === 'REJECT').length ?? 0,
)
const rejectedNames = computed(
  () => result.value?.pts.filter(p => p.finalStatus === 'REJECT').map(p => p.name) ?? [],
)

/** Tailwind colour class for the W-max cell */
function wColour(p) {
  if (p.wMax == null) return 'text-blue-700'
  if (p.wMax > critW.value)         return 'text-red-600'
  if (p.wMax > critW.value * 0.8)   return 'text-amber-600'
  return 'text-blue-700'
}

// ── COMPUTED — TRANSFORMATION TAB ─────────────────────────────────────────────
const transformParams = computed(() => {
  if (!result.value?.adj?.params) return []
  const p = result.value.adj.params
  return [
    { label: 'Translation ΔY (Westing)',  value: f4(p.TY)  + ' m',     note: 'datum shift @ centroid'    },
    { label: 'Translation ΔX (Southing)', value: f4(p.TX)  + ' m',     note: 'datum shift @ centroid'    },
    { label: 'Scale factor',               value: p.scale.toFixed(8),   note: 'Ratio survey / historical' },
    { label: 'Scale (ppm)',                value: p.ppm.toFixed(2) + ' ppm', note: '(scale − 1) × 10⁶'    },
    { label: 'Rotation θ',                 value: formatDMS(p.rotDeg), note: p.rotDeg.toFixed(6) + '° (Y→X +)' },
    { label: 'Coefficient a',              value: p.a.toFixed(8),      note: 'scale · cos θ'             },
    { label: 'Coefficient b',              value: p.b.toFixed(8),      note: 'scale · sin θ'             },
  ]
})

const transformInterpretation = computed(() => {
  if (!result.value?.adj?.params) return ''
  const { TY, TX, ppm, rotDeg } = result.value.adj.params
  const sameSystem = Math.abs(ppm) < 1 && Math.abs(rotDeg) < 0.001
  return `Translation (${f4(TY)} m Y/Westing, ${f4(TX)} m X/Southing) is the systematic datum shift between ` +
    (sameSystem
      ? 'both surveys, which are confirmed to be in essentially the same coordinate system.'
      : 'the two coordinate systems — a significant difference is present.')
})

// ── COMPUTED — STATISTICS TAB ─────────────────────────────────────────────────
const chi2Passes = computed(() => {
  if (!result.value?.adj?.stats) return false
  const { chi2, chi2L, chi2U } = result.value.adj.stats
  return chi2 >= chi2L && chi2 <= chi2U
})

const statCards = computed(() => {
  if (!result.value?.adj?.stats) return []
  const s = result.value.adj.stats
  return [
    { label: 'Active pts (n)',       value: s.n                               },
    { label: 'DOF (2n − 4)',         value: s.DOF                             },
    { label: 'σ₀ a posteriori',      value: s.s0.toFixed(5)  + ' m'          },
    { label: 'σ₀ a priori',          value: s.sig0?.toFixed(5) + ' m'        },
    { label: 'σ₀ ratio (post/prior)',value: (s.s0 / (s.sig0 || 1)).toFixed(4)},
    { label: 'Chi-square χ²',        value: s.chi2?.toFixed(4)               },
  ]
})

// ── COMPUTED — DISPLACEMENT PLOT ──────────────────────────────────────────────
const plotData = computed(() => {
  if (!result.value) return null

  const pts  = result.value.pts
  // Map Cape Lo (Y=Westing, X=Southing) to a conventional N-up / E-right view:
  //   East  = −Y  (west is left)      North = −X  (south is down)
  const eAll = pts.flatMap(p => [-p.yH, -p.yS])
  const nAll = pts.flatMap(p => [-p.xH, -p.xS])
  const minE = Math.min(...eAll), maxE = Math.max(...eAll)
  const minN = Math.min(...nAll), maxN = Math.max(...nAll)

  const W = 560, H = 300, pad = 50
  const sc = Math.min(
    (W - 2 * pad) / ((maxE - minE) || 1),
    (H - 2 * pad) / ((maxN - minN) || 1),
  )
  const px = e => pad + (e - minE) * sc
  const py = n => H - pad - (n - minN) * sc

  const maxRaw    = Math.max(...pts.map(p => Math.hypot(p.yS - p.yH, p.xS - p.xH)))
  const asc       = maxRaw > 0 ? Math.min(200 / maxRaw, 1000) : 1
  const arrowScale = Math.round(asc)

  const pointData = pts.map(p => {
    const eH = -p.yH, nH = -p.xH, eS = -p.yS, nS = -p.xS
    const x1 = px(eH), y1 = py(nH)
    const x2 = x1 + (eS - eH) * asc
    const y2 = y1 - (nS - nH) * asc
    const isRej = p.finalStatus === 'REJECT'

    const dx = x2 - x1, dy = y2 - y1
    const len = Math.sqrt(dx * dx + dy * dy)
    const hasArrow = len > 2

    let arrowPoints = ''
    if (hasArrow) {
      const ux = dx / len, uy = dy / len
      const hx = x2 - ux * 5, hy = y2 - uy * 5
      arrowPoints =
        `${x2},${y2} ${hx - uy * 2.5},${hy + ux * 2.5} ${hx + uy * 2.5},${hy - ux * 2.5}`
    }
    return { id: p.id, name: p.name, x1, y1, x2, y2, isRej, hasArrow, arrowPoints }
  })

  return { W, H, pad, pointData, arrowScale }
})
</script>
