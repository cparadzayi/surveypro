# Found Beacons View - Enhanced Specification

**Component:** `FoundBeaconsView.vue`  
**Purpose:** Beacon assessment + SI 727 Section 67(5) comparison method selection  
**Date:** 2025-01-21

---

## 🎯 Component Structure

### **Section 1: Header & Instructions** (Existing)
- Title: "Found Beacons Assessment"
- Subtitle: "Section 3 of Report on Survey (SI 727 of 1979)"
- Instructions panel

### **Section 2: Comparison Method Selection** (NEW)
User chooses between two SI 727 Section 67(5) approved methods:
- **Tabulation of Co-ordinates** (table format)
- **Comparison Sketch** (graphical format)
- **Both Methods** (include both in Calculations document)

### **Section 3: Beacon Assessment Cards**
For each Fixed point from CSV:
- **Basic Info** (existing)
- **Original Data Input** (NEW)
- **Auto-Calculated Discrepancy** (NEW)
- **Status & Condition** (existing)
- **Alignment Test** (existing)
- **Adopted Decision** (existing)

### **Section 4: Summary & Navigation** (Enhanced)
- Statistics
- Validation
- Save & Continue

---

## 📋 Section 2: Comparison Method Selection

### **UI Layout:**

```vue
<template>
  <!-- After header, before beacon cards -->
  <div class="comparison-method-section bg-white shadow rounded-lg p-6 mb-6">
    <h2 class="text-xl font-semibold text-gray-900 mb-4">
      📊 Beacon Comparison Method
    </h2>
    
    <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
      <div class="flex">
        <div class="flex-shrink-0">
          <svg class="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
          </svg>
        </div>
        <div class="ml-3">
          <h3 class="text-sm font-medium text-blue-800">SI 727 Section 67(5) Requirement</h3>
          <p class="mt-1 text-sm text-blue-700">
            The computations shall include a schedule on which the data obtained from the survey 
            are compared with the original data. This comparison may be shown by means of a 
            <strong>sketch</strong> or by a <strong>tabulation of co-ordinates</strong>.
          </p>
        </div>
      </div>
    </div>
    
    <div class="space-y-4">
      <label class="comparison-method-option">
        <input 
          type="radio" 
          v-model="comparisonMethod" 
          value="tabulation"
          class="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
        />
        <div class="ml-3">
          <div class="text-sm font-medium text-gray-900">
            📋 Tabulation of Co-ordinates
          </div>
          <div class="text-sm text-gray-600">
            Table format showing original vs. new coordinates with differences (dy, dx).
            Best for surveys on the same coordinate system.
          </div>
          <div class="mt-2 text-xs text-gray-500">
            Example: SR 21/2016 format with black (original) and red (new) columns
          </div>
        </div>
      </label>
      
      <label class="comparison-method-option">
        <input 
          type="radio" 
          v-model="comparisonMethod" 
          value="sketch"
          class="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
        />
        <div class="ml-3">
          <div class="text-sm font-medium text-gray-900">
            🗺️ Comparison Sketch
          </div>
          <div class="text-sm text-gray-600">
            Graphical representation with vectors showing displacement between old and new positions.
            Includes inter-beacon distance and bearing checks.
          </div>
          <div class="mt-2 text-xs text-gray-500">
            Shows consistency between surveys (distances and directions)
          </div>
        </div>
      </label>
      
      <label class="comparison-method-option">
        <input 
          type="radio" 
          v-model="comparisonMethod" 
          value="both"
          class="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
        />
        <div class="ml-3">
          <div class="text-sm font-medium text-gray-900">
            📊 + 🗺️ Both Methods
          </div>
          <div class="text-sm text-gray-600">
            Include both tabulation and sketch in the Calculations document.
            Provides comprehensive comparison for complex surveys.
          </div>
        </div>
      </label>
    </div>
    
    <!-- Conditional: Show tolerance setting -->
    <div v-if="comparisonMethod" class="mt-6 pt-6 border-t border-gray-200">
      <h3 class="text-sm font-medium text-gray-900 mb-3">Tolerance Settings</h3>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm text-gray-700 mb-1">Survey Type</label>
          <select v-model="surveyType" class="w-full px-3 py-2 border border-gray-300 rounded-md">
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
            class="w-full px-3 py-2 border border-gray-300 rounded-md"
            placeholder="0.020"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

const comparisonMethod = ref<'tabulation' | 'sketch' | 'both'>('tabulation');
const surveyType = ref<'urban' | 'rural' | 'trig' | 'custom'>('urban');
const customTolerance = ref<number>(0.020);

const toleranceThreshold = computed(() => {
  switch (surveyType.value) {
    case 'urban': return 0.020;
    case 'rural': return 0.200;
    case 'trig': return 0.010;
    case 'custom': return customTolerance.value;
    default: return 0.020;
  }
});
</script>

<style scoped>
.comparison-method-option {
  @apply flex items-start p-4 border-2 border-gray-200 rounded-lg cursor-pointer transition-all;
}

.comparison-method-option:hover {
  @apply border-blue-300 bg-blue-50;
}

.comparison-method-option:has(input:checked) {
  @apply border-blue-600 bg-blue-50;
}
</style>
```

---

## 📋 Section 3: Enhanced Beacon Cards

### **Original Data Input (NEW):**

```vue
<template>
  <div v-for="beacon in beacons" :key="beacon.beaconId" class="beacon-card">
    <!-- Existing header -->
    
    <!-- NEW: Original Data Section -->
    <div class="original-data-section bg-gray-50 p-4 rounded-lg mb-4">
      <div class="flex items-center justify-between mb-3">
        <h4 class="text-sm font-semibold text-gray-900">
          📄 Original Data (Previous Survey)
        </h4>
        <button 
          @click="toggleOriginalData(beacon.beaconId)"
          class="text-sm text-blue-600 hover:text-blue-800"
        >
          {{ beacon.showOriginalData ? 'Hide' : 'Show' }}
        </button>
      </div>
      
      <div v-if="beacon.showOriginalData" class="space-y-3">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs text-gray-700 mb-1">
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
            <label class="block text-xs text-gray-700 mb-1">Source</label>
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
            <label class="block text-xs text-gray-700 mb-1">
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
            <label class="block text-xs text-gray-700 mb-1">
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
    
    <!-- Existing sections: Status, Condition, Alignment Test, etc. -->
  </div>
</template>

<script setup lang="ts">
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

function formatDifference(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(3)}`;
}

function formatBearing(bearing?: number): string {
  if (bearing === undefined) return 'N/A';
  const degrees = Math.floor(bearing);
  const minutes = Math.floor((bearing - degrees) * 60);
  const seconds = Math.floor(((bearing - degrees) * 60 - minutes) * 60);
  return `${degrees}°${minutes}'${seconds}"`;
}
</script>
```

---

## 💾 Save Function Enhancement

```typescript
function saveAndContinue() {
  if (!isValid.value) return;
  
  // Prepare beacon data
  const cleanedBeacons = beacons.value.map(beacon => {
    const cleaned: FoundBeacon = {
      beaconId: beacon.beaconId,
      status: beacon.status,
      currentCoordinates: beacon.currentCoordinates,
      adopted: beacon.adopted
    };
    
    // Add original data if provided
    if (beacon.originalData?.srNumber && beacon.originalData?.coordinates) {
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
    
    // Add other fields...
    if (beacon.condition) cleaned.condition = beacon.condition;
    if (beacon.circumstances) cleaned.circumstances = beacon.circumstances;
    if (beacon.alignmentTest) cleaned.alignmentTest = beacon.alignmentTest;
    if (beacon.replacement) cleaned.replacement = beacon.replacement;
    
    return cleaned;
  });
  
  // Prepare comparison config
  const comparisonConfig: BeaconComparisonConfig = {
    method: comparisonMethod.value,
    currentSRNumber: workflowState.projectInfo.srNumber || 'This Survey',
    originalSRNumber: beacons.value[0]?.originalData?.srNumber,
    toleranceThreshold: toleranceThreshold.value,
    conclusion: generateConclusion()
  };
  
  // Emit save event with both beacons and comparison config
  emit('save', {
    beacons: cleanedBeacons,
    comparisonConfig
  });
}

function generateConclusion(): string {
  const adoptedCount = beacons.value.filter(b => b.adopted).length;
  const totalCount = beacons.value.length;
  
  if (adoptedCount === totalCount) {
    return 'From the above comparison, I adopt the positions of all found beacons.';
  } else {
    return `From the above comparison, I adopt the positions of ${adoptedCount} of ${totalCount} beacons.`;
  }
}
```

---

## 🎨 Styling

```css
<style scoped>
.beacon-card {
  @apply bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden mb-4;
}

.original-data-section {
  @apply transition-all duration-200;
}

.comparison-method-option {
  @apply flex items-start p-4 border-2 border-gray-200 rounded-lg cursor-pointer transition-all;
}

.comparison-method-option:hover {
  @apply border-blue-300 bg-blue-50;
}

.comparison-method-option:has(input:checked) {
  @apply border-blue-600 bg-blue-50;
}
</style>
```

---

## ✅ Validation Rules

1. **If comparison method selected:**
   - At least one beacon must have original data
   - Original S.R. Number required
   - Original coordinates required

2. **For tabulation method:**
   - All beacons should have original data for complete table

3. **For sketch method:**
   - At least 2 beacons with original data for inter-beacon checks

---

## 📊 Summary Statistics Enhancement

```vue
<div class="summary-panel">
  <h3>Summary</h3>
  
  <!-- Existing stats -->
  <div>Total beacons: {{ beacons.length }}</div>
  <div>Found: {{ foundCount }}</div>
  <div>Adopted: {{ adoptedCount }}</div>
  
  <!-- NEW: Comparison stats -->
  <div v-if="comparisonMethod" class="mt-4 pt-4 border-t border-gray-200">
    <h4 class="text-sm font-semibold text-gray-700 mb-2">Comparison Statistics</h4>
    <div class="text-sm text-gray-600">
      <div>Beacons with original data: {{ beaconsWithOriginalData }}</div>
      <div>Within tolerance: {{ beaconsWithinTolerance }}</div>
      <div>Mean discrepancy: {{ meanDiscrepancy.toFixed(3) }}m</div>
      <div>Max discrepancy: {{ maxDiscrepancy.toFixed(3) }}m</div>
    </div>
  </div>
</div>
```

---

## 🚀 Next Steps

1. **Update FoundBeaconsView.vue** with comparison method selection
2. **Add original data input fields** for each beacon
3. **Implement auto-calculation** of discrepancies
4. **Update save handler** in CadastralStandardView
5. **Create comparison generators** (tabulation & sketch)
6. **Integrate into Calculations PDF**

---

**Status:** Ready for implementation
