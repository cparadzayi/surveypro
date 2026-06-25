<template>
  <div class="found-beacons-view">
    <!-- Header -->
    <div class="bg-white border-b border-gray-200 px-6 py-4">
      <h2 class="text-2xl font-bold text-gray-900">Found Beacons Assessment</h2>
      <p class="mt-1 text-sm text-gray-600">
        Section 3 of Report on Survey (SI 727 of 1979)
      </p>
    </div>

    <!-- Instructions -->
    <div class="px-6 py-4 bg-blue-50 border-b border-blue-100">
      <div class="flex items-start space-x-3">
        <svg class="w-5 h-5 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <div class="flex-1">
          <h3 class="text-sm font-semibold text-blue-900">Assessment Instructions</h3>
          <p class="mt-1 text-sm text-blue-800">
            Found beacons have been automatically loaded from your coordinate points database. 
            For each beacon, record whether it was found, its condition, and any alignment test results. 
            Import previous survey data below for SI 727 Section 67(5) comparison.
          </p>
        </div>
      </div>
    </div>

    <!-- Comparison Method Selection (SI 727 Section 67(5)) -->
    <div class="px-6 py-6 bg-white border-b border-gray-200">
      <h3 class="text-lg font-semibold text-gray-900 mb-3">
        📊 Beacon Comparison Method
      </h3>
      
      <div class="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
        <div class="flex items-start space-x-3">
          <svg class="w-5 h-5 text-amber-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
          </svg>
          <div class="flex-1">
            <h4 class="text-sm font-semibold text-amber-900">SI 727 Section 67(5) Requirement</h4>
            <p class="mt-1 text-sm text-amber-800">
              The computations shall include a schedule on which the data obtained from the survey 
              are compared with the original data. This comparison may be shown by means of a 
              <strong>sketch</strong> or by a <strong>tabulation of co-ordinates</strong>.
            </p>
          </div>
        </div>
      </div>
      
      <div class="space-y-3">
        <label class="flex items-start p-4 border-2 rounded-lg cursor-pointer transition-all"
               :class="comparisonMethod === 'tabulation' ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50'">
          <input 
            type="radio" 
            v-model="comparisonMethod" 
            value="tabulation"
            class="mt-1 h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
          />
          <div class="ml-3">
            <div class="text-sm font-medium text-gray-900">
              📋 Tabulation of Co-ordinates
            </div>
            <div class="text-sm text-gray-600 mt-1">
              Table format showing original vs. new coordinates with differences (dy, dx).
              Best for surveys on the same coordinate system.
            </div>
          </div>
        </label>
        
        <label class="flex items-start p-4 border-2 rounded-lg cursor-pointer transition-all"
               :class="comparisonMethod === 'sketch' ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50'">
          <input 
            type="radio" 
            v-model="comparisonMethod" 
            value="sketch"
            class="mt-1 h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
          />
          <div class="ml-3">
            <div class="text-sm font-medium text-gray-900">
              🗺️ Comparison Sketch
            </div>
            <div class="text-sm text-gray-600 mt-1">
              Graphical representation with vectors showing displacement. Includes inter-beacon distance and bearing checks.
            </div>
          </div>
        </label>
        
        <label class="flex items-start p-4 border-2 rounded-lg cursor-pointer transition-all"
               :class="comparisonMethod === 'both' ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50'">
          <input 
            type="radio" 
            v-model="comparisonMethod" 
            value="both"
            class="mt-1 h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
          />
          <div class="ml-3">
            <div class="text-sm font-medium text-gray-900">
              📊 + 🗺️ Both Methods
            </div>
            <div class="text-sm text-gray-600 mt-1">
              Include both tabulation and sketch in the Calculations document.
            </div>
          </div>
        </label>
      </div>
      
      <!-- Previous Survey Data Import -->
      <div v-if="comparisonMethod" class="mt-6 pt-6 border-t border-gray-200">
        <h4 class="text-sm font-semibold text-gray-900 mb-3">📁 Previous Survey Data (for comparison)</h4>
        <p class="text-sm text-gray-600 mb-4">
          Import coordinate data from previous surveys to compare with current observations.
          This is required for SI 727 Section 67(5) comparison.
        </p>
        
        <div class="flex items-center space-x-4">
          <input
            ref="historicalFileInput"
            type="file"
            accept=".csv,.txt"
            @change="handleHistoricalFileUpload"
            class="hidden"
          />
          <button
            @click="triggerHistoricalFileInput"
            class="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
          >
            📄 Import Previous Survey CSV
          </button>
          
          <span v-if="historicalPointsCount > 0" class="text-sm text-green-600 font-medium">
            ✓ {{ historicalPointsCount }} points loaded
          </span>
        </div>
        
        <!-- Import Preview -->
        <div v-if="historicalPoints.length > 0" class="mt-4 bg-gray-50 rounded-lg p-4">
          <div class="flex items-center justify-between mb-2">
            <h5 class="text-sm font-medium text-gray-900">Imported Previous Survey Points</h5>
            <button
              @click="clearHistoricalPoints"
              class="text-xs text-red-600 hover:text-red-800"
            >
              Clear All
            </button>
          </div>
          <div class="max-h-48 overflow-y-auto">
            <table class="min-w-full text-xs">
              <thead class="bg-gray-100">
                <tr>
                  <th class="px-2 py-1 text-left">Point</th>
                  <th class="px-2 py-1 text-right">Y</th>
                  <th class="px-2 py-1 text-right">X</th>
                  <th class="px-2 py-1 text-left">SR No.</th>
                  <th class="px-2 py-1 text-left">System</th>
                  <th class="px-2 py-1 text-left">Description</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="pt in historicalPoints.slice(0, 10)" :key="pt.Point" class="border-t border-gray-200">
                  <td class="px-2 py-1 font-medium">{{ pt.Point }}</td>
                  <td class="px-2 py-1 text-right font-mono">{{ formatCoordValue(pt.Y) }}</td>
                  <td class="px-2 py-1 text-right font-mono">{{ formatCoordValue(pt.X) }}</td>
                  <td class="px-2 py-1">{{ pt.SR_num || '-' }}</td>
                  <td class="px-2 py-1">{{ pt.System || '-' }}</td>
                  <td class="px-2 py-1">{{ pt.Description || '-' }}</td>
                </tr>
              </tbody>
            </table>
            <p v-if="historicalPoints.length > 10" class="text-xs text-gray-500 mt-2 text-center">
              ... and {{ historicalPoints.length - 10 }} more points
            </p>
          </div>
        </div>
        
        <!-- Import Error -->
        <div v-if="historicalImportError" class="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
          <p class="text-sm text-red-800">{{ historicalImportError }}</p>
        </div>
      </div>
      
      <!-- Tolerance Settings -->
      <div v-if="comparisonMethod" class="mt-6 pt-6 border-t border-gray-200">
        <h4 class="text-sm font-semibold text-gray-900 mb-3">Tolerance Settings</h4>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm text-gray-700 mb-1">Survey Type</label>
            <select v-model="surveyType" class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
              <option value="urban">Urban (±0.020m)</option>
              <option value="rural">Rural (±0.200m)</option>
              <option value="trig">Trig Beacons (±0.010m)</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <div v-if="surveyType === 'custom'">
            <label class="block text-sm text-gray-700 mb-1">Tolerance (meters)</label>
            <input 
              v-model.number="customTolerance" 
              type="number" 
              step="0.001"
              class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              placeholder="0.020"
            />
          </div>
        </div>
      </div>
      
      <!-- Analysis Button -->
      <div v-if="historicalPoints.length > 0 && importedToDb" class="mt-6 pt-6 border-t border-gray-200">
        <div class="flex items-center gap-4">
          <!-- Import Success Badge -->
          <span class="px-3 py-1 bg-green-100 text-green-700 text-sm rounded-full">
            ✓ Historical data imported to database
          </span>
          
          <!-- Run Analysis Button -->
          <button
            @click="runLeastSquaresAnalysis"
            :disabled="isAnalyzing"
            class="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            <span v-if="isAnalyzing">⏳ Analyzing...</span>
            <span v-else>📊 Run Beacon Comparison</span>
          </button>
        </div>
        <p class="text-xs text-gray-500 mt-2">
          Click to run least squares analysis and compare current vs. historical coordinates.
        </p>
      </div>
      
      <!-- Least Squares Analysis Results -->
      <div v-if="leastSquaresResult" class="mt-6 pt-6 border-t border-gray-200">
        <h4 class="text-lg font-semibold text-gray-900 mb-4">📊 Beacon Comparison Results (SI 727)</h4>
        
        <!-- No Matches Warning -->
        <div v-if="leastSquaresResult.matched_count === 0" class="p-4 bg-yellow-50 border border-yellow-200 rounded-lg mb-4">
          <div class="flex items-start">
            <span class="text-yellow-600 text-xl mr-3">⚠️</span>
            <div>
              <p class="font-semibold text-yellow-800">No Matching Beacons Found</p>
              <p class="text-sm text-yellow-700 mt-1">{{ leastSquaresResult.message }}</p>
              <p class="text-xs text-yellow-600 mt-2">Ensure point names in your CSV (e.g., "P2", "ZA") exactly match names in your current coordinate points.</p>
            </div>
          </div>
        </div>
        
        <!-- Assessment Banner (only show if matches exist) -->
        <div 
          v-if="leastSquaresResult.least_squares"
          class="p-4 rounded-lg mb-4"
          :class="{
            'bg-green-50 border border-green-200': leastSquaresResult.least_squares.assessment === 'PASS',
            'bg-yellow-50 border border-yellow-200': leastSquaresResult.least_squares.assessment === 'MARGINAL',
            'bg-red-50 border border-red-200': leastSquaresResult.least_squares.assessment === 'FAIL'
          }"
        >
          <div class="flex items-center justify-between">
            <div>
              <span class="text-lg font-bold" :class="{
                'text-green-700': leastSquaresResult.least_squares.assessment === 'PASS',
                'text-yellow-700': leastSquaresResult.least_squares.assessment === 'MARGINAL',
                'text-red-700': leastSquaresResult.least_squares.assessment === 'FAIL'
              }">
                {{ leastSquaresResult.least_squares.assessment === 'PASS' ? '✓ PASS' : 
                   leastSquaresResult.least_squares.assessment === 'MARGINAL' ? '⚠ MARGINAL' : '✗ FAIL' }}
              </span>
              <p class="text-sm mt-1">{{ leastSquaresResult.least_squares.recommendation }}</p>
            </div>
            <div class="text-right">
              <div class="text-2xl font-bold">{{ leastSquaresResult.least_squares.pass_rate }}%</div>
              <div class="text-xs text-gray-600">Pass Rate</div>
            </div>
          </div>
        </div>
        
        <!-- Statistics Summary (only show if matches exist) -->
        <div v-if="leastSquaresResult.least_squares" class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div class="bg-gray-50 p-3 rounded-lg">
            <div class="text-xs text-gray-500">Matched Beacons</div>
            <div class="text-xl font-bold">{{ leastSquaresResult.matched_count }}</div>
          </div>
          <div class="bg-gray-50 p-3 rounded-lg">
            <div class="text-xs text-gray-500">RMS Error</div>
            <div class="text-xl font-bold">{{ leastSquaresResult.least_squares.rms_total.toFixed(4) }} m</div>
          </div>
          <div class="bg-gray-50 p-3 rounded-lg">
            <div class="text-xs text-gray-500">σ₀ (Sigma Naught)</div>
            <div class="text-xl font-bold">{{ leastSquaresResult.least_squares.sigma_naught.toFixed(4) }} m</div>
          </div>
          <div class="bg-gray-50 p-3 rounded-lg">
            <div class="text-xs text-gray-500">Max Distance</div>
            <div class="text-xl font-bold">{{ leastSquaresResult.least_squares.max_distance.toFixed(4) }} m</div>
          </div>
        </div>
        
        <!-- Detailed Statistics (only show if matches exist) -->
        <div v-if="leastSquaresResult.least_squares" class="bg-gray-50 rounded-lg p-4 mb-6">
          <h5 class="text-sm font-semibold text-gray-900 mb-3">Least Squares Statistics</h5>
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div class="text-gray-600">Mean dy (systematic shift):</div>
              <div class="font-mono font-medium">{{ leastSquaresResult.least_squares.mean_dy.toFixed(4) }} m</div>
            </div>
            <div>
              <div class="text-gray-600">Mean dx (systematic shift):</div>
              <div class="font-mono font-medium">{{ leastSquaresResult.least_squares.mean_dx.toFixed(4) }} m</div>
            </div>
            <div>
              <div class="text-gray-600">Std Dev dy:</div>
              <div class="font-mono font-medium">{{ leastSquaresResult.least_squares.std_dy.toFixed(4) }} m</div>
            </div>
            <div>
              <div class="text-gray-600">Std Dev dx:</div>
              <div class="font-mono font-medium">{{ leastSquaresResult.least_squares.std_dx.toFixed(4) }} m</div>
            </div>
            <div>
              <div class="text-gray-600">Range dy:</div>
              <div class="font-mono font-medium">{{ leastSquaresResult.least_squares.min_dy.toFixed(4) }} to {{ leastSquaresResult.least_squares.max_dy.toFixed(4) }} m</div>
            </div>
            <div>
              <div class="text-gray-600">Range dx:</div>
              <div class="font-mono font-medium">{{ leastSquaresResult.least_squares.min_dx.toFixed(4) }} to {{ leastSquaresResult.least_squares.max_dx.toFixed(4) }} m</div>
            </div>
          </div>
        </div>
        
        <!-- Residuals Table -->
        <div class="overflow-x-auto">
          <h5 class="text-sm font-semibold text-gray-900 mb-3">Coordinate Comparison (Previous vs Current)</h5>
          <table class="min-w-full text-xs">
            <thead class="bg-gray-100">
              <tr>
                <th class="px-2 py-2 text-left">Point</th>
                <th class="px-2 py-2 text-right">Prev Y</th>
                <th class="px-2 py-2 text-right">Curr Y</th>
                <th class="px-2 py-2 text-right font-bold">dy</th>
                <th class="px-2 py-2 text-right">Prev X</th>
                <th class="px-2 py-2 text-right">Curr X</th>
                <th class="px-2 py-2 text-right font-bold">dx</th>
                <th class="px-2 py-2 text-right">Distance</th>
                <th class="px-2 py-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr 
                v-for="beacon in leastSquaresResult.beacons" 
                :key="beacon.point_name"
                :class="beacon.within_tolerance ? '' : 'bg-red-50'"
                class="border-t border-gray-200"
              >
                <td class="px-2 py-2 font-medium">{{ beacon.point_name }}</td>
                <td class="px-2 py-2 text-right font-mono">{{ beacon.prev_y.toFixed(3) }}</td>
                <td class="px-2 py-2 text-right font-mono">{{ beacon.curr_y.toFixed(3) }}</td>
                <td class="px-2 py-2 text-right font-mono font-bold" :class="Math.abs(beacon.dy) > 0.05 ? 'text-red-600' : 'text-green-600'">
                  {{ beacon.dy >= 0 ? '+' : '' }}{{ beacon.dy.toFixed(4) }}
                </td>
                <td class="px-2 py-2 text-right font-mono">{{ beacon.prev_x.toFixed(3) }}</td>
                <td class="px-2 py-2 text-right font-mono">{{ beacon.curr_x.toFixed(3) }}</td>
                <td class="px-2 py-2 text-right font-mono font-bold" :class="Math.abs(beacon.dx) > 0.05 ? 'text-red-600' : 'text-green-600'">
                  {{ beacon.dx >= 0 ? '+' : '' }}{{ beacon.dx.toFixed(4) }}
                </td>
                <td class="px-2 py-2 text-right font-mono">{{ beacon.linear_distance.toFixed(4) }}</td>
                <td class="px-2 py-2 text-center">
                  <span v-if="beacon.within_tolerance" class="text-green-600">✓</span>
                  <span v-else class="text-red-600">✗</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Beacons List -->
    <div class="px-6 py-6">
      <div v-if="fixedPoints.length === 0" class="text-center py-12">
        <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path>
        </svg>
        <h3 class="mt-2 text-sm font-medium text-gray-900">No Fixed Points Found</h3>
        <p class="mt-1 text-sm text-gray-500">
          No Fixed points (Status = F) were found in your CSV import.
        </p>
      </div>

      <div v-else class="space-y-6">
        <div v-for="beacon in beacons" :key="beacon.beaconId" 
             class="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          
          <!-- Beacon Header -->
          <div class="bg-gray-50 px-4 py-3 border-b border-gray-200">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-lg font-semibold text-gray-900">Beacon {{ beacon.beaconId }}</h3>
                <p class="text-sm text-gray-600">{{ getBeaconDescription(beacon.beaconId) }}</p>
              </div>
              <div class="text-sm text-gray-500">
                Y={{ formatCoordinate(beacon.currentCoordinates.y) }}, 
                X={{ formatCoordinate(beacon.currentCoordinates.x) }}
              </div>
            </div>
          </div>

          <!-- Beacon Form -->
          <div class="p-4 space-y-4">
            
            <!-- Status Selection -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Beacon Status <span class="text-red-500">*</span>
              </label>
              <div class="grid grid-cols-3 gap-3">
                <button
                  @click="beacon.status = 'found'"
                  :class="[
                    'px-4 py-2 text-sm font-medium rounded-md border transition-colors',
                    beacon.status === 'found'
                      ? 'bg-green-50 border-green-500 text-green-700'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                  ]"
                >
                  ✓ Found
                </button>
                <button
                  @click="beacon.status = 'not-found'"
                  :class="[
                    'px-4 py-2 text-sm font-medium rounded-md border transition-colors',
                    beacon.status === 'not-found'
                      ? 'bg-yellow-50 border-yellow-500 text-yellow-700'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                  ]"
                >
                  ✗ Not Found
                </button>
                <button
                  @click="beacon.status = 'replaced'"
                  :class="[
                    'px-4 py-2 text-sm font-medium rounded-md border transition-colors',
                    beacon.status === 'replaced'
                      ? 'bg-blue-50 border-blue-500 text-blue-700'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                  ]"
                >
                  ⟳ Replaced
                </button>
              </div>
            </div>

            <!-- Original Data Section (for comparison) -->
            <div v-if="comparisonMethod" class="border-t border-gray-200 pt-4">
              <div class="flex items-center justify-between mb-3">
                <h4 class="text-sm font-semibold text-gray-900">
                  📄 Original Data (Previous Survey)
                </h4>
                <button 
                  @click="toggleOriginalData(beacon.beaconId)"
                  class="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  {{ beacon.showOriginalData ? '▼ Hide' : '▶ Show' }}
                </button>
              </div>
              
              <div v-if="beacon.showOriginalData" class="space-y-3 p-4 bg-gray-50 rounded-md">
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs font-medium text-gray-700 mb-1">
                      Previous S.R. Number <span class="text-red-500">*</span>
                    </label>
                    <input
                      v-model="beacon.originalData.srNumber"
                      type="text"
                      class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
                      placeholder="e.g., SR 21/2016"
                      @input="calculateDiscrepancy(beacon)"
                    />
                  </div>
                  
                  <div>
                    <label class="block text-xs font-medium text-gray-700 mb-1">Source</label>
                    <select 
                      v-model="beacon.originalData.source"
                      class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
                    >
                      <option value="previous-survey">Previous Survey Diagram</option>
                      <option value="deeds-office">Deeds Office Records</option>
                      <option value="sg-office">Surveyor General Office</option>
                      <option value="trig-list">Official Trig List</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
                
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs font-medium text-gray-700 mb-1">
                      Original Y (Westing) <span class="text-red-500">*</span>
                    </label>
                    <input
                      v-model.number="beacon.originalData.coordinates.y"
                      type="number"
                      step="0.001"
                      class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md font-mono"
                      placeholder="-82612.590"
                      @input="calculateDiscrepancy(beacon)"
                    />
                  </div>
                  
                  <div>
                    <label class="block text-xs font-medium text-gray-700 mb-1">
                      Original X (Southing) <span class="text-red-500">*</span>
                    </label>
                    <input
                      v-model.number="beacon.originalData.coordinates.x"
                      type="number"
                      step="0.001"
                      class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md font-mono"
                      placeholder="2149425.610"
                      @input="calculateDiscrepancy(beacon)"
                    />
                  </div>
                </div>
                
                <!-- Auto-Calculated Discrepancy Display -->
                <div v-if="beacon.discrepancy" class="mt-4 p-3 bg-white border border-gray-200 rounded-md">
                  <h5 class="text-xs font-semibold text-gray-700 mb-2">
                    📐 Calculated Discrepancy
                  </h5>
                  
                  <div class="grid grid-cols-4 gap-3 text-center">
                    <div>
                      <div class="text-xs text-gray-600">dy (ΔY)</div>
                      <div 
                        class="text-sm font-mono font-semibold"
                        :class="Math.abs(beacon.discrepancy.dy) <= toleranceThreshold ? 'text-green-600' : 'text-red-600'"
                      >
                        {{ formatDifference(beacon.discrepancy.dy) }}m
                      </div>
                    </div>
                    
                    <div>
                      <div class="text-xs text-gray-600">dx (ΔX)</div>
                      <div 
                        class="text-sm font-mono font-semibold"
                        :class="Math.abs(beacon.discrepancy.dx) <= toleranceThreshold ? 'text-green-600' : 'text-red-600'"
                      >
                        {{ formatDifference(beacon.discrepancy.dx) }}m
                      </div>
                    </div>
                    
                    <div>
                      <div class="text-xs text-gray-600">Distance</div>
                      <div 
                        class="text-sm font-mono font-semibold"
                        :class="beacon.discrepancy.distance <= toleranceThreshold ? 'text-green-600' : 'text-red-600'"
                      >
                        {{ beacon.discrepancy.distance.toFixed(3) }}m
                      </div>
                    </div>
                    
                    <div>
                      <div class="text-xs text-gray-600">Bearing</div>
                      <div class="text-sm font-mono font-semibold text-gray-700">
                        {{ formatBearing(beacon.discrepancy.bearing) }}
                      </div>
                    </div>
                  </div>
                  
                  <div class="mt-2 text-center">
                    <span 
                      v-if="beacon.discrepancy.withinTolerance"
                      class="inline-flex items-center px-2 py-1 text-xs font-medium text-green-800 bg-green-100 rounded-full"
                    >
                      ✓ Within tolerance (±{{ toleranceThreshold.toFixed(3) }}m)
                    </span>
                    <span 
                      v-else
                      class="inline-flex items-center px-2 py-1 text-xs font-medium text-red-800 bg-red-100 rounded-full"
                    >
                      ⚠ Exceeds tolerance (±{{ toleranceThreshold.toFixed(3) }}m)
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Found Beacon Details -->
            <div v-if="beacon.status === 'found'" class="space-y-4 p-4 bg-green-50 rounded-md">
              
              <!-- Condition -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  Beacon Condition
                </label>
                <select v-model="beacon.condition" class="w-full px-3 py-2 border border-gray-300 rounded-md">
                  <option value="">Select condition...</option>
                  <option value="excellent">Excellent</option>
                  <option value="good">Good</option>
                  <option value="fair">Fair</option>
                  <option value="poor">Poor</option>
                </select>
              </div>

              <!-- Particular Circumstances -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  Particular Circumstances
                </label>
                <textarea
                  v-model="beacon.circumstances"
                  rows="2"
                  class="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="e.g., scattered stones, no centre-mark, concreted by owner, fence posts, etc."
                ></textarea>
                <p class="mt-1 text-xs text-gray-500">
                  Report any unusual conditions (optional if beacon is in good condition)
                </p>
              </div>

              <!-- Alignment Test -->
              <div class="border-t border-green-200 pt-4">
                <label class="flex items-center space-x-2 mb-3">
                  <input
                    type="checkbox"
                    v-model="beacon.hasAlignmentTest"
                    class="rounded border-gray-300"
                  />
                  <span class="text-sm font-medium text-gray-700">Alignment Test Performed</span>
                </label>

                <div v-if="beacon.hasAlignmentTest && beacon.alignmentTest" class="space-y-3 pl-6">
                  <div>
                    <label class="block text-sm text-gray-700 mb-1">Line</label>
                    <input
                      v-model="beacon.alignmentTest.line"
                      type="text"
                      class="w-full px-3 py-2 border border-gray-300 rounded-md"
                      placeholder="e.g., P1-P2"
                    />
                  </div>
                  <div>
                    <label class="block text-sm text-gray-700 mb-1">Test Result</label>
                    <input
                      v-model="beacon.alignmentTest.testResult"
                      type="text"
                      class="w-full px-3 py-2 border border-gray-300 rounded-md"
                      placeholder="e.g., Measured bearing: 45°23'15&quot;"
                    />
                  </div>
                  <div>
                    <label class="block text-sm text-gray-700 mb-1">Discrepancy (meters)</label>
                    <input
                      v-model.number="beacon.alignmentTest.discrepancyMeters"
                      type="number"
                      step="0.001"
                      class="w-full px-3 py-2 border border-gray-300 rounded-md"
                      placeholder="0.008"
                    />
                  </div>
                  <div>
                    <label class="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        v-model="beacon.alignmentTest.acceptable"
                        class="rounded border-gray-300"
                      />
                      <span class="text-sm text-gray-700">Acceptable (within tolerance)</span>
                    </label>
                  </div>
                </div>
              </div>

              <!-- Adopted Status -->
              <div class="border-t border-green-200 pt-4">
                <label class="flex items-center space-x-2 mb-2">
                  <input
                    type="checkbox"
                    v-model="beacon.adopted"
                    class="rounded border-gray-300"
                  />
                  <span class="text-sm font-medium text-gray-700">Beacon Position Adopted</span>
                </label>

                <div v-if="!beacon.adopted" class="pl-6 mt-2">
                  <label class="block text-sm text-gray-700 mb-1">Reason for Rejection</label>
                  <textarea
                    v-model="beacon.rejectionReason"
                    rows="2"
                    class="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="Explain why this beacon was not adopted..."
                  ></textarea>
                </div>
              </div>

            </div>

            <!-- Not Found Details -->
            <div v-if="beacon.status === 'not-found'" class="p-4 bg-yellow-50 rounded-md">
              <p class="text-sm text-yellow-800 mb-3">
                <strong>Note:</strong> Beacon not found. You may need to replace this beacon (see Section 4).
              </p>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  Search Details
                </label>
                <textarea
                  v-model="beacon.circumstances"
                  rows="2"
                  class="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="e.g., Extensive search conducted within 5m radius. Area recently cleared for development."
                ></textarea>
              </div>
            </div>

            <!-- Replaced Beacon Details -->
            <div v-if="beacon.status === 'replaced' && beacon.replacement" class="space-y-4 p-4 bg-blue-50 rounded-md">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  Reason for Replacement <span class="text-red-500">*</span>
                </label>
                <textarea
                  v-model="beacon.replacement.reason"
                  rows="2"
                  class="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="e.g., Original beacon not found. Beacon found disturbed/tilted."
                ></textarea>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  Method of Determining New Position <span class="text-red-500">*</span>
                </label>
                <textarea
                  v-model="beacon.replacement.method"
                  rows="2"
                  class="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="e.g., Intersection from P1, P2, and P3. Verified by RTK GPS."
                ></textarea>
              </div>

              <div>
                <label class="block text-sm text-gray-700 mb-1">
                  Distance from Original Position (meters)
                </label>
                <input
                  v-model.number="beacon.replacement.distanceFromOriginal"
                  type="number"
                  step="0.001"
                  class="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="0.145"
                />
                <p class="mt-1 text-xs text-gray-500">Optional - if original position was known</p>
              </div>
            </div>

          </div>
        </div>
      </div>

      <!-- Summary -->
      <div v-if="beacons.length > 0" class="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <h4 class="text-sm font-semibold text-gray-900 mb-3">Assessment Summary</h4>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span class="text-gray-600">Total Beacons:</span>
            <span class="ml-2 font-semibold text-gray-900">{{ beacons.length }}</span>
          </div>
          <div>
            <span class="text-gray-600">Found:</span>
            <span class="ml-2 font-semibold text-green-600">{{ foundCount }}</span>
          </div>
          <div>
            <span class="text-gray-600">Not Found:</span>
            <span class="ml-2 font-semibold text-yellow-600">{{ notFoundCount }}</span>
          </div>
          <div>
            <span class="text-gray-600">Replaced:</span>
            <span class="ml-2 font-semibold text-blue-600">{{ replacedCount }}</span>
          </div>
        </div>
        <div class="mt-3 pt-3 border-t border-gray-200">
          <div class="text-sm">
            <span class="text-gray-600">Adopted:</span>
            <span class="ml-2 font-semibold text-gray-900">{{ adoptedCount }} of {{ foundCount }} found beacons</span>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="mt-6 flex items-center justify-between">
        <button
          @click="$emit('back')"
          class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          ← Back to Control Point Selection
        </button>

        <div class="flex gap-3">
          <button
            @click="skipForNow"
            class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Skip for Now →
          </button>
          
          <button
            @click="saveAndContinue"
            :disabled="!isValid"
            :class="[
              'px-6 py-2 text-sm font-medium text-white rounded-md transition-colors',
              isValid
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-gray-400 cursor-not-allowed'
            ]"
          >
            Save & Continue to Field Book →
          </button>
        </div>
      </div>

      <!-- Validation Messages -->
      <div v-if="!isValid && beacons.length > 0" class="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
        <h4 class="text-sm font-semibold text-red-900 mb-2">⚠ Please Complete Required Fields</h4>
        <ul class="text-sm text-red-800 space-y-1">
          <li v-for="error in validationErrors" :key="error">• {{ error }}</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import type { FoundBeacon } from '../../../types/cadastral';
import { 
  parseHistoricalPointsCSV, 
  getLeastSquaresAnalysis,
  importHistoricalSurveyPoints,
  type HistoricalPointCSV,
  type LeastSquaresResult 
} from '../../../services/historicalSurveyPoints';
import { listCoordinatePoints } from '../../../services/spatial';

// Extended beacon type with UI state
interface BeaconWithUIState extends FoundBeacon {
  hasAlignmentTest?: boolean;
  showOriginalData?: boolean;
}

// Props
interface Props {
  fixedPoints: Array<{
    id: string;
    original: { y: number; x: number };
    description: string;
  }>;
  existingBeacons?: FoundBeacon[];
  projectId?: number;  // Project ID for historical survey points comparison
}

const props = defineProps<Props>();

// Emits
const emit = defineEmits<{
  (e: 'save', data: { beacons: FoundBeacon[]; comparisonConfig: any }): void;
  (e: 'back'): void;
}>();

// State
const beacons = ref<BeaconWithUIState[]>([]);
const hasAlignmentTest = ref<Record<string, boolean>>({});

// Comparison method state
const comparisonMethod = ref<'tabulation' | 'sketch' | 'both'>('tabulation');
const surveyType = ref<'urban' | 'rural' | 'trig' | 'custom'>('urban');
const customTolerance = ref<number>(0.020);

// Historical survey points state
const historicalPoints = ref<HistoricalPointCSV[]>([]);
const historicalImportError = ref<string>('');
const historicalFileInput = ref<HTMLInputElement | null>(null);

// Least squares analysis state
const leastSquaresResult = ref<LeastSquaresResult | null>(null);
const isAnalyzing = ref(false);
const isImporting = ref(false);
const importedToDb = ref(false);

// Computed count for historical points
const historicalPointsCount = computed(() => historicalPoints.value.length);

// Handle file upload for historical survey data
async function handleHistoricalFileUpload(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  historicalImportError.value = '';

  try {
    const content = await file.text();
    const parsed = parseHistoricalPointsCSV(content);
    historicalPoints.value = parsed;
    console.log(`[FoundBeacons] Imported ${parsed.length} historical survey points from ${file.name}`);
    
    // Auto-populate original data fields by matching point names
    let matchedCount = 0;
    beacons.value.forEach(beacon => {
      const historicalPoint = parsed.find(hp => 
        hp.Point.toLowerCase() === beacon.beaconId.toLowerCase()
      );
      
      if (historicalPoint) {
        beacon.originalData = {
          coordinates: {
            y: typeof historicalPoint.Y === 'number' ? historicalPoint.Y : parseFloat(historicalPoint.Y),
            x: typeof historicalPoint.X === 'number' ? historicalPoint.X : parseFloat(historicalPoint.X)
          },
          srNumber: historicalPoint.SR_num || '',
          surveyDate: historicalPoint.Survey_date ? new Date(historicalPoint.Survey_date) : undefined,
          source: 'previous-survey' as const
        };
        matchedCount++;
        console.log(`[FoundBeacons] ✓ Matched ${beacon.beaconId} with historical data (Y=${historicalPoint.Y}, X=${historicalPoint.X})`);
      }
    });
    
    console.log(`[FoundBeacons] ✅ Auto-populated ${matchedCount} of ${beacons.value.length} beacons with historical data`);
    
    if (matchedCount === 0) {
      historicalImportError.value = 'No matching beacons found. Ensure point names in CSV match your current beacon IDs.';
      return;
    }
    
    // Auto-import to database
    const projectId = props.projectId || 
      parseInt(window.location.pathname.match(/\/projects?\/(\d+)/)?.[1] || '0') ||
      (window as any).__CURRENT_PROJECT_ID__;
    
    if (projectId) {
      isImporting.value = true;
      console.log(`[FoundBeacons] 💾 Auto-importing ${parsed.length} historical points to database...`);
      
      try {
        const result = await importHistoricalSurveyPoints(
          projectId,
          parsed,
          file.name
        );
        
        console.log('[FoundBeacons] Import result:', result);
        
        if (result.success && result.inserted > 0) {
          importedToDb.value = true;
          console.log(`[FoundBeacons] ✅ Auto-imported ${result.inserted} historical points to database`);
        } else if (result.success && result.inserted === 0) {
          historicalImportError.value = `Import completed but 0 points were inserted. Skipped: ${result.skipped || 0}. Check point names and coordinates.`;
          console.warn('[FoundBeacons] No points inserted:', result);
        } else {
          historicalImportError.value = 'Auto-import failed. Check console for details.';
        }
      } catch (error: any) {
        console.error('[FoundBeacons] Auto-import failed:', error);
        historicalImportError.value = `Auto-import failed: ${error.message}`;
      } finally {
        isImporting.value = false;
      }
    }
  } catch (error: any) {
    historicalImportError.value = `Failed to parse CSV: ${error.message}`;
    console.error('[FoundBeacons] CSV parse error:', error);
  }

  // Reset file input
  if (target) target.value = '';
}

// Clear historical points
function clearHistoricalPoints() {
  historicalPoints.value = [];
  historicalImportError.value = '';
  importedToDb.value = false;
  leastSquaresResult.value = null;
}

// Import historical points to database
async function importHistoricalToDb() {
  const projectId = props.projectId || 
    parseInt(window.location.pathname.match(/\/projects?\/(\d+)/)?.[1] || '0') ||
    (window as any).__CURRENT_PROJECT_ID__;
  
  if (!projectId) {
    historicalImportError.value = 'No project ID available.';
    return;
  }
  
  if (historicalPoints.value.length === 0) {
    historicalImportError.value = 'No points to import. Load a CSV file first.';
    return;
  }
  
  isImporting.value = true;
  historicalImportError.value = '';
  
  console.log(`[FoundBeacons] Importing ${historicalPoints.value.length} points to database for project ${projectId}`);
  console.log('[FoundBeacons] First point:', historicalPoints.value[0]);
  
  try {
    const result = await importHistoricalSurveyPoints(
      projectId,
      historicalPoints.value,
      'previous_survey.csv'
    );
    
    console.log('[FoundBeacons] Import result:', result);
    
    if (result.success && result.inserted > 0) {
      importedToDb.value = true;
      console.log(`[FoundBeacons] Imported ${result.inserted} points to database`);
    } else if (result.success && result.inserted === 0) {
      historicalImportError.value = `Import completed but 0 points were inserted. Skipped: ${result.skipped || 0}. Check point names and coordinates.`;
      console.warn('[FoundBeacons] No points inserted:', result);
    } else {
      historicalImportError.value = 'Import failed. Check console for details.';
    }
  } catch (error: any) {
    console.error('[FoundBeacons] Import failed:', error);
    historicalImportError.value = `Import failed: ${error.message}`;
  } finally {
    isImporting.value = false;
  }
}

// Trigger file input click
function triggerHistoricalFileInput() {
  historicalFileInput.value?.click();
}

// Format coordinate value (handles string or number)
function formatCoordValue(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return isNaN(num) ? '-' : num.toFixed(3);
}

// Run least squares analysis on beacon comparison
async function runLeastSquaresAnalysis() {
  // Get project ID from props, route, or window global
  const projectId = props.projectId || 
    parseInt(window.location.pathname.match(/\/projects?\/(\d+)/)?.[1] || '0') ||
    (window as any).__CURRENT_PROJECT_ID__;
  
  if (!projectId) {
    historicalImportError.value = 'No project ID available. Please ensure you are viewing a project.';
    return;
  }
  
  console.log('[FoundBeacons] Running least squares analysis for project:', projectId);
  isAnalyzing.value = true;
  leastSquaresResult.value = null;
  
  try {
    const toleranceType = surveyType.value === 'rural' ? 'rural' : 'urban';
    const result = await getLeastSquaresAnalysis(projectId, toleranceType);
    leastSquaresResult.value = result;
    console.log('[FoundBeacons] Least squares analysis complete:', result);
    
    if (result.matched_count === 0) {
      historicalImportError.value = result.message || 'No matching beacons found. Ensure point names in CSV match your current coordinate points.';
    }
  } catch (error: any) {
    console.error('[FoundBeacons] Least squares analysis failed:', error);
    historicalImportError.value = `Analysis failed: ${error.message}`;
  } finally {
    isAnalyzing.value = false;
  }
}

// Computed tolerance threshold
const toleranceThreshold = computed(() => {
  switch (surveyType.value) {
    case 'urban': return 0.020;
    case 'rural': return 0.200;
    case 'trig': return 0.010;
    case 'custom': return customTolerance.value;
    default: return 0.020;
  }
});

// Initialize beacons from fixed points or database
onMounted(async () => {
  if (props.existingBeacons && props.existingBeacons.length > 0) {
    beacons.value = props.existingBeacons.map(b => ({
      ...b,
      showOriginalData: false,
      originalData: b.originalData || {
        coordinates: { y: 0, x: 0 },
        srNumber: '',
        source: 'previous-survey' as const
      }
    }));
  } else {
    // Try to load found beacons from database first
    const projectId = props.projectId || 
      parseInt(window.location.pathname.match(/\/projects?\/(\d+)/)?.[1] || '0') ||
      (window as any).__CURRENT_PROJECT_ID__;
    
    if (projectId) {
      try {
        console.log('[FoundBeacons] 🔍 Auto-loading found beacons from database for project', projectId);
        const dbPoints = await listCoordinatePoints(projectId);
        
        // Filter for Fixed points (status 'F')
        const foundBeaconPoints = dbPoints.filter(pt => {
          return pt.status === 'F';
        });
        
        if (foundBeaconPoints.length > 0) {
          console.log(`[FoundBeacons] ✅ Auto-loaded ${foundBeaconPoints.length} found beacons from database`);
          beacons.value = foundBeaconPoints.map(point => ({
            beaconId: point.name,
            status: 'found' as const,
            condition: undefined,
            circumstances: '',
            currentCoordinates: {
              y: point.y,
              x: point.x
            },
            adopted: true,
            hasAlignmentTest: false,
            showOriginalData: false,
            alignmentTest: undefined,
            replacement: undefined,
            originalData: {
              coordinates: { y: 0, x: 0 },
              srNumber: '',
              source: 'previous-survey' as const
            }
          }));
        } else {
          console.log('[FoundBeacons] ℹ️ No found beacons in database, using fixedPoints from props');
          // Fallback to props.fixedPoints if no database points found
          beacons.value = props.fixedPoints.map(point => ({
            beaconId: point.id,
            status: 'found' as const,
            condition: undefined,
            circumstances: '',
            currentCoordinates: {
              y: point.original.y,
              x: point.original.x
            },
            adopted: true,
            hasAlignmentTest: false,
            showOriginalData: false,
            alignmentTest: undefined,
            replacement: undefined,
            originalData: {
              coordinates: { y: 0, x: 0 },
              srNumber: '',
              source: 'previous-survey' as const
            }
          }));
        }
      } catch (error) {
        console.error('[FoundBeacons] ❌ Failed to load beacons from database:', error);
        // Fallback to props.fixedPoints on error
        beacons.value = props.fixedPoints.map(point => ({
          beaconId: point.id,
          status: 'found' as const,
          condition: undefined,
          circumstances: '',
          currentCoordinates: {
            y: point.original.y,
            x: point.original.x
          },
          adopted: true,
          hasAlignmentTest: false,
          showOriginalData: false,
          alignmentTest: undefined,
          replacement: undefined,
          originalData: {
            coordinates: { y: 0, x: 0 },
            srNumber: '',
            source: 'previous-survey' as const
          }
        }));
      }
    } else {
      // No project ID, use props.fixedPoints
      beacons.value = props.fixedPoints.map(point => ({
        beaconId: point.id,
        status: 'found' as const,
        condition: undefined,
        circumstances: '',
        currentCoordinates: {
          y: point.original.y,
          x: point.original.x
        },
        adopted: true,
        hasAlignmentTest: false,
        showOriginalData: false,
        alignmentTest: undefined,
        replacement: undefined,
        originalData: {
          coordinates: { y: 0, x: 0 },
          srNumber: '',
          source: 'previous-survey' as const
        }
      }));
    }
  }
});

// Watch for alignment test checkbox
watch(() => beacons.value, (newBeacons) => {
  newBeacons.forEach((beacon, index) => {
    if ((beacon as any).hasAlignmentTest && !beacon.alignmentTest) {
      beacon.alignmentTest = {
        line: '',
        testResult: '',
        discrepancyMeters: 0,
        acceptable: true
      };
    } else if (!(beacon as any).hasAlignmentTest) {
      beacon.alignmentTest = undefined;
    }

    if (beacon.status === 'replaced' && !beacon.replacement) {
      beacon.replacement = {
        reason: '',
        method: '',
        distanceFromOriginal: undefined
      };
    }
  });
}, { deep: true });

// Computed
const foundCount = computed(() => 
  beacons.value.filter(b => b.status === 'found').length
);

const notFoundCount = computed(() => 
  beacons.value.filter(b => b.status === 'not-found').length
);

const replacedCount = computed(() => 
  beacons.value.filter(b => b.status === 'replaced').length
);

const adoptedCount = computed(() => 
  beacons.value.filter(b => b.status === 'found' && b.adopted).length
);

const validationErrors = computed(() => {
  const errors: string[] = [];
  
  beacons.value.forEach((beacon, index) => {
    const num = index + 1;
    
    if (!beacon.status) {
      errors.push(`Beacon ${beacon.beaconId}: Status is required`);
    }
    
    if (beacon.status === 'replaced') {
      if (!beacon.replacement?.reason) {
        errors.push(`Beacon ${beacon.beaconId}: Replacement reason is required`);
      }
      if (!beacon.replacement?.method) {
        errors.push(`Beacon ${beacon.beaconId}: Method of determining new position is required`);
      }
    }
  });
  
  return errors;
});

const isValid = computed(() => validationErrors.value.length === 0);

// Methods
function getBeaconDescription(beaconId: string): string {
  const point = props.fixedPoints.find(p => p.id === beaconId);
  return point?.description || '';
}

function formatCoordinate(value: number): string {
  return value.toFixed(3);
}

// Toggle original data visibility
function toggleOriginalData(beaconId: string) {
  const beacon = beacons.value.find(b => b.beaconId === beaconId);
  if (beacon) {
    beacon.showOriginalData = !beacon.showOriginalData;
  }
}

// Calculate discrepancy between original and current coordinates
function calculateDiscrepancy(beacon: BeaconWithUIState) {
  if (!beacon.originalData?.coordinates.y || !beacon.originalData?.coordinates.x) {
    beacon.discrepancy = undefined;
    return;
  }
  
  const dy = beacon.currentCoordinates.y - beacon.originalData.coordinates.y;
  const dx = beacon.currentCoordinates.x - beacon.originalData.coordinates.x;
  const distance = Math.sqrt(dy * dy + dx * dx);
  const bearing = Math.atan2(dy, dx) * (180 / Math.PI);
  
  beacon.discrepancy = {
    dy,
    dx,
    distance,
    bearing: bearing < 0 ? bearing + 360 : bearing,
    withinTolerance: distance <= toleranceThreshold.value
  };
}

// Format difference with sign
function formatDifference(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(3)}`;
}

// Format bearing as DMS
function formatBearing(bearing?: number): string {
  if (bearing === undefined) return 'N/A';
  const degrees = Math.floor(bearing);
  const minutes = Math.floor((bearing - degrees) * 60);
  const seconds = Math.floor(((bearing - degrees) * 60 - minutes) * 60);
  return `${degrees}°${minutes.toString().padStart(2, '0')}'${seconds.toString().padStart(2, '0')}"`;
}

function skipForNow() {
  console.log('[Found Beacons] User chose to skip beacon assessment');
  
  // Emit empty data to indicate skip
  emit('save', { 
    beacons: [], 
    comparisonConfig: {
      method: 'tabulation',
      currentSRNumber: 'This Survey',
      toleranceThreshold: 0.020,
      conclusion: 'Beacon assessment skipped - to be completed later.'
    }
  });
}

function saveAndContinue() {
  if (!isValid.value) return;
  
  // Clean up beacons before saving
  const cleanedBeacons = beacons.value.map(beacon => {
    const cleaned: FoundBeacon = {
      beaconId: beacon.beaconId,
      status: beacon.status,
      currentCoordinates: beacon.currentCoordinates,
      adopted: beacon.adopted
    };
    
    // Add original data if provided
    if (beacon.originalData?.srNumber && beacon.originalData?.coordinates.y && beacon.originalData?.coordinates.x) {
      cleaned.originalData = {
        coordinates: beacon.originalData.coordinates,
        srNumber: beacon.originalData.srNumber,
        source: beacon.originalData.source || 'previous-survey'
      };
    }
    
    // Add calculated discrepancy
    if (beacon.discrepancy) {
      cleaned.discrepancy = beacon.discrepancy;
    }
    
    if (beacon.status === 'found') {
      if (beacon.condition) cleaned.condition = beacon.condition;
      if (beacon.circumstances) cleaned.circumstances = beacon.circumstances;
      if (beacon.alignmentTest) cleaned.alignmentTest = beacon.alignmentTest;
      if (!beacon.adopted && beacon.rejectionReason) {
        cleaned.rejectionReason = beacon.rejectionReason;
      }
    }
    
    if (beacon.status === 'not-found' && beacon.circumstances) {
      cleaned.circumstances = beacon.circumstances;
    }
    
    if (beacon.status === 'replaced' && beacon.replacement) {
      cleaned.replacement = beacon.replacement;
    }
    
    return cleaned;
  });
  
  // Prepare comparison configuration
  const adoptedCount = cleanedBeacons.filter(b => b.adopted).length;
  const totalCount = cleanedBeacons.length;
  
  // Get original S.R. number from first beacon with original data
  const firstBeaconWithOriginalData = cleanedBeacons.find(b => b.originalData?.srNumber);
  const originalSRNumber = firstBeaconWithOriginalData?.originalData?.srNumber;
  
  const comparisonConfig = {
    method: comparisonMethod.value,
    currentSRNumber: 'This Survey', // Will be updated from project info
    originalSRNumber: originalSRNumber,
    toleranceThreshold: toleranceThreshold.value,
    conclusion: adoptedCount === totalCount
      ? 'From the above comparison, I adopt the positions of all found beacons.'
      : `From the above comparison, I adopt the positions of ${adoptedCount} of ${totalCount} beacons.`
  };
  
  emit('save', { beacons: cleanedBeacons, comparisonConfig });
}
</script>

<style scoped>
.found-beacons-view {
  @apply min-h-screen bg-gray-50;
}
</style>
