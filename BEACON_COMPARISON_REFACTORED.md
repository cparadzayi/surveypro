# Beacon Comparison - Refactored Solution

**Based on:** Real-world example from SR 21/2016  
**Regulation:** SI 727 Section 67(5)  
**Date:** 2025-01-21

---

## 📋 Real-World Format Analysis

### **From the Example (SR 21/2016):**

**Table Structure:**
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        COORDINATE COMPARISON                                  │
├────────────────────────────────────────┬─────────────────────────────────────┤
│            SR 21/2016                  │          This Survey                │
├───────┬──────────┬──────────┬──────────┼──────────┬──────────┬──────┬───────┤
│ Point │    Y     │    X     │    Y     │    X     │   dy     │  dx  │       │
├───────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────┼───────┤
│ 85c   │-82612,590│2149425,610│-82612,590│2149425,615│  0,000   │-0,005│       │
│ 84a   │-82624,208│2149405,760│-82624,208│2149405,764│  0,000   │-0,004│       │
│ 86c   │-82600,507│2149418,538│-82600,508│2149418,543│  0,000   │-0,005│       │
│ Sec1  │-82686,210│2149442,080│-82686,226│2149442,061│  0,016   │ 0,019│       │
│ Sec2N │-82576,840│2149534,820│-82576,832│2149534,823│ -0,008   │-0,003│       │
│ 84d   │-82555,870│2149522,543│-82555,861│2149522,545│ -0,009   │-0,002│       │
│ 90c   │-82565,985│2149398,334│-82565,997│2149398,334│  0,011   │ 0,000│       │
└───────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────┴───────┘

From the above comparison, I adopt the positions of all found beacons.
```

### **Key Observations:**

1. **Two-column layout:**
   - Left: Original survey (SR 21/2016) in **BLACK**
   - Right: This survey in **RED**

2. **Columns shown:**
   - Point ID
   - Original Y, X
   - New Y, X
   - dy (ΔY difference)
   - dx (ΔX difference)

3. **Precision:**
   - Coordinates: 3 decimals (millimeters)
   - Differences: 3 decimals

4. **Color coding:**
   - Original data: Black text
   - New survey data: Red text
   - Differences: Red text (highlighting discrepancies)

5. **Conclusion statement:**
   - "From the above comparison, I adopt the positions of all found beacons."

---

## 🎨 Comparison Sketch Analysis

### **Vector Comparison Method:**

For surveys on the same system, the comparison sketch shows:

1. **Beacon positions:**
   - Original positions (black dots)
   - New positions (red dots)
   - Vectors connecting them

2. **Consistency checks:**
   - **Distance check:** Compare inter-beacon distances
     - Old: Distance between CP1-CP2 from original survey
     - New: Distance between CP1-CP2 from new survey
     - Difference should be minimal
   
   - **Direction check:** Compare bearings
     - Old: Bearing CP1→CP2 from original survey
     - New: Bearing CP1→CP2 from new survey
     - Should be consistent

3. **Visual indicators:**
   - Scale bar
   - North arrow
   - Displacement vectors with magnitudes
   - Tolerance circles (optional)

### **Example Sketch Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│  BEACON COMPARISON SKETCH                                   │
│  Scale: 1:500          S.R. No.: 12345/2025                │
│  Original Survey: SR 21/2016                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                    N ↑                                      │
│                                                             │
│         85c                                                 │
│          ●─→●  (Δ=0.005m)                                  │
│        Black Red                                            │
│                                                             │
│                           86c                               │
│                            ●─→●  (Δ=0.007m)                │
│                                                             │
│         84a                                                 │
│          ●─→●  (Δ=0.004m)                                  │
│                                                             │
│  INTER-BEACON DISTANCE CHECK:                               │
│  ┌──────────────┬──────────┬──────────┬──────────┐         │
│  │ Line         │ Original │ New      │ Diff     │         │
│  ├──────────────┼──────────┼──────────┼──────────┤         │
│  │ 85c - 84a    │ 23.456m  │ 23.456m  │ 0.000m   │         │
│  │ 84a - 86c    │ 31.234m  │ 31.235m  │ 0.001m   │         │
│  │ 86c - 85c    │ 28.789m  │ 28.789m  │ 0.000m   │         │
│  └──────────────┴──────────┴──────────┴──────────┘         │
│                                                             │
│  BEARING CHECK:                                             │
│  ┌──────────────┬──────────┬──────────┬──────────┐         │
│  │ Line         │ Original │ New      │ Diff     │         │
│  ├──────────────┼──────────┼──────────┼──────────┤         │
│  │ 85c → 84a    │ 145°23'  │ 145°23'  │ 0°00'    │         │
│  │ 84a → 86c    │ 087°15'  │ 087°15'  │ 0°00'    │         │
│  └──────────────┴──────────┴──────────┴──────────┘         │
│                                                             │
│  Scale: ├──────┤ 10m                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 Refactored Implementation

### **Updated FoundBeacon Interface:**

```typescript
interface FoundBeacon {
  beaconId: string;
  status: 'found' | 'not-found' | 'replaced';
  
  // Original data (from previous survey)
  originalData: {
    coordinates: { y: number; x: number };
    srNumber: string;  // e.g., "SR 21/2016"
    surveyDate?: Date;
    source: 'previous-survey' | 'deeds-office' | 'sg-office' | 'trig-list';
  };
  
  // Current survey data
  currentCoordinates: { y: number; x: number };
  
  // Auto-calculated discrepancy
  discrepancy: {
    dy: number;  // ΔY (Y_new - Y_original)
    dx: number;  // ΔX (X_new - X_original)
    distance: number;  // √(dy² + dx²)
    bearing?: number;  // Bearing of displacement
  };
  
  // Assessment
  condition?: 'excellent' | 'good' | 'fair' | 'poor';
  circumstances?: string;
  adopted: boolean;  // "I adopt the position of this beacon"
  
  // Alignment test (optional)
  alignmentTest?: {
    line: string;  // e.g., "85c-84a"
    originalDistance: number;
    newDistance: number;
    distanceDifference: number;
    originalBearing: number;
    newBearing: number;
    bearingDifference: number;
    acceptable: boolean;
  };
  
  // Replacement (if not found)
  replacement?: {
    reason: string;
    method: string;
    distanceFromOriginal?: number;
  };
}
```

### **Comparison Data Structure:**

```typescript
interface BeaconComparison {
  // Header info
  currentSRNumber: string;  // "This Survey"
  originalSRNumber: string;  // "SR 21/2016"
  
  // Beacons
  beacons: FoundBeacon[];
  
  // Method selection
  comparisonMethod: 'tabulation' | 'sketch' | 'both';
  
  // Statistics
  statistics: {
    totalBeacons: number;
    beaconsFound: number;
    beaconsAdopted: number;
    meanDiscrepancy: number;
    maxDiscrepancy: number;
    rmsError: number;
  };
  
  // Inter-beacon checks (for sketch method)
  interBeaconChecks?: {
    line: string;  // "85c-84a"
    originalDistance: number;
    newDistance: number;
    difference: number;
    originalBearing: number;
    newBearing: number;
    bearingDiff: number;
  }[];
  
  // Conclusion
  conclusion: string;  // "From the above comparison, I adopt the positions of all found beacons."
}
```

---

## 📊 Coordinate Tabulation Generator

### **HTML/PDF Output:**

```typescript
function generateCoordinateTabulation(comparison: BeaconComparison): string {
  return `
    <div class="coordinate-comparison">
      <h2>COORDINATE COMPARISON</h2>
      
      <table>
        <thead>
          <tr>
            <th colspan="3" style="color: black;">${comparison.originalSRNumber}</th>
            <th colspan="4" style="color: red;">This Survey</th>
          </tr>
          <tr>
            <th>Point</th>
            <th style="color: black;">Y</th>
            <th style="color: black;">X</th>
            <th style="color: red;">Y</th>
            <th style="color: red;">X</th>
            <th style="color: red;">dy</th>
            <th style="color: red;">dx</th>
          </tr>
        </thead>
        <tbody>
          ${comparison.beacons.map(beacon => `
            <tr>
              <td>${beacon.beaconId}</td>
              <td style="color: black;">${formatCoordinate(beacon.originalData.coordinates.y)}</td>
              <td style="color: black;">${formatCoordinate(beacon.originalData.coordinates.x)}</td>
              <td style="color: red;">${formatCoordinate(beacon.currentCoordinates.y)}</td>
              <td style="color: red;">${formatCoordinate(beacon.currentCoordinates.x)}</td>
              <td style="color: red;">${formatDifference(beacon.discrepancy.dy)}</td>
              <td style="color: red;">${formatDifference(beacon.discrepancy.dx)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      
      <p class="conclusion">${comparison.conclusion}</p>
    </div>
  `;
}

function formatCoordinate(value: number): string {
  // Format with comma as thousands separator and 3 decimals
  return value.toFixed(3).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatDifference(value: number): string {
  const formatted = Math.abs(value).toFixed(3);
  const sign = value >= 0 ? '' : '-';
  return `${sign}${formatted}`;
}
```

---

## 🎨 Comparison Sketch Generator

### **Canvas-based Implementation:**

```typescript
function generateComparisonSketch(comparison: BeaconComparison): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  
  // Calculate bounds and scale
  const bounds = calculateBounds(comparison.beacons);
  const scale = calculateScale(bounds, canvas.width, canvas.height);
  
  // Draw beacons
  comparison.beacons.forEach(beacon => {
    // Original position (black)
    drawBeacon(ctx, beacon.originalData.coordinates, 'black', scale);
    
    // New position (red)
    drawBeacon(ctx, beacon.currentCoordinates, 'red', scale);
    
    // Displacement vector
    drawVector(ctx, 
      beacon.originalData.coordinates, 
      beacon.currentCoordinates, 
      beacon.discrepancy.distance,
      scale
    );
    
    // Label
    drawLabel(ctx, beacon.beaconId, beacon.currentCoordinates, scale);
  });
  
  // Draw inter-beacon distance check table
  drawInterBeaconTable(ctx, comparison.interBeaconChecks);
  
  // Draw bearing check table
  drawBearingTable(ctx, comparison.interBeaconChecks);
  
  // Draw legend and scale
  drawLegend(ctx);
  drawScaleBar(ctx, scale);
  
  return canvas;
}

function drawBeacon(
  ctx: CanvasRenderingContext2D, 
  coords: {y: number, x: number}, 
  color: string,
  scale: number
) {
  const screenX = coords.y * scale;
  const screenY = coords.x * scale;
  
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(screenX, screenY, 5, 0, 2 * Math.PI);
  ctx.fill();
}

function drawVector(
  ctx: CanvasRenderingContext2D,
  from: {y: number, x: number},
  to: {y: number, x: number},
  magnitude: number,
  scale: number
) {
  const fromX = from.y * scale;
  const fromY = from.x * scale;
  const toX = to.y * scale;
  const toY = to.x * scale;
  
  // Draw arrow
  ctx.strokeStyle = 'blue';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
  
  // Draw arrowhead
  const angle = Math.atan2(toY - fromY, toX - fromX);
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(
    toX - 10 * Math.cos(angle - Math.PI / 6),
    toY - 10 * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    toX - 10 * Math.cos(angle + Math.PI / 6),
    toY - 10 * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
  
  // Label with magnitude
  ctx.fillStyle = 'blue';
  ctx.font = '12px Arial';
  ctx.fillText(`Δ=${magnitude.toFixed(3)}m`, (fromX + toX) / 2, (fromY + toY) / 2);
}
```

---

## 🔄 Enhanced FoundBeaconsView Component

### **New UI Sections:**

#### **1. Original Data Input (for each beacon):**

```vue
<div class="original-data-section">
  <h4>Original Data (Previous Survey)</h4>
  
  <div class="form-row">
    <label>Previous S.R. Number:</label>
    <input v-model="beacon.originalData.srNumber" placeholder="e.g., SR 21/2016" />
  </div>
  
  <div class="form-row">
    <label>Original Y (Westing):</label>
    <input v-model.number="beacon.originalData.coordinates.y" type="number" step="0.001" />
  </div>
  
  <div class="form-row">
    <label>Original X (Southing):</label>
    <input v-model.number="beacon.originalData.coordinates.x" type="number" step="0.001" />
  </div>
  
  <div class="form-row">
    <label>Source:</label>
    <select v-model="beacon.originalData.source">
      <option value="previous-survey">Previous Survey Diagram</option>
      <option value="deeds-office">Deeds Office Records</option>
      <option value="sg-office">Surveyor General Office</option>
      <option value="trig-list">Official Trig List</option>
    </select>
  </div>
</div>
```

#### **2. Auto-Calculated Discrepancy Display:**

```vue
<div v-if="beacon.originalData && beacon.currentCoordinates" class="discrepancy-display">
  <h4>Calculated Discrepancy</h4>
  
  <div class="discrepancy-grid">
    <div class="metric">
      <label>dy (ΔY):</label>
      <span :class="{'within-tolerance': Math.abs(beacon.discrepancy.dy) <= 0.020}">
        {{ formatDifference(beacon.discrepancy.dy) }}m
      </span>
    </div>
    
    <div class="metric">
      <label>dx (ΔX):</label>
      <span :class="{'within-tolerance': Math.abs(beacon.discrepancy.dx) <= 0.020}">
        {{ formatDifference(beacon.discrepancy.dx) }}m
      </span>
    </div>
    
    <div class="metric">
      <label>Distance:</label>
      <span :class="{'within-tolerance': beacon.discrepancy.distance <= 0.020}">
        {{ beacon.discrepancy.distance.toFixed(3) }}m
      </span>
    </div>
    
    <div class="metric">
      <label>Bearing:</label>
      <span>{{ formatBearing(beacon.discrepancy.bearing) }}</span>
    </div>
  </div>
  
  <div class="tolerance-indicator">
    <span v-if="beacon.discrepancy.distance <= 0.020" class="badge badge-success">
      ✓ Within tolerance (±0.020m)
    </span>
    <span v-else class="badge badge-warning">
      ⚠ Exceeds tolerance (±0.020m)
    </span>
  </div>
</div>
```

#### **3. Comparison Method Selection:**

```vue
<div class="comparison-method-section">
  <h3>Comparison Schedule Method (SI 727 Section 67(5))</h3>
  
  <div class="method-options">
    <label>
      <input type="radio" v-model="comparisonMethod" value="tabulation" />
      <span>Tabulation of Co-ordinates</span>
      <p class="help-text">Table format showing original vs. new coordinates with differences</p>
    </label>
    
    <label>
      <input type="radio" v-model="comparisonMethod" value="sketch" />
      <span>Comparison Sketch</span>
      <p class="help-text">Graphical representation with vectors and inter-beacon checks</p>
    </label>
    
    <label>
      <input type="radio" v-model="comparisonMethod" value="both" />
      <span>Both Methods</span>
      <p class="help-text">Include both tabulation and sketch in Calculations document</p>
    </label>
  </div>
  
  <button @click="previewComparison" class="btn btn-secondary">
    👁️ Preview Comparison
  </button>
</div>
```

---

## 📝 Updated Workflow

### **Step 3: Found Beacons Assessment (Enhanced)**

1. **For each Fixed point:**
   - Enter original coordinates (from previous survey)
   - Enter previous S.R. Number
   - Select data source
   - System auto-calculates dy, dx, distance
   - Mark as found/not found/replaced
   - Check "Adopt position" if acceptable

2. **Inter-beacon consistency (optional):**
   - Select beacon pairs for distance/bearing checks
   - System calculates original vs. new distances
   - System calculates original vs. new bearings
   - Flags inconsistencies

3. **Select comparison method:**
   - Tabulation (table)
   - Sketch (graphical)
   - Both

4. **Preview and save:**
   - Preview comparison document
   - Save beacon assessment data
   - Continue to Field Book

---

## 🎯 Implementation Priority

### **Phase 1: Coordinate Tabulation (High Priority)**
- ✅ Most commonly used method
- ✅ Easier to implement
- ✅ Clear format from example
- **Timeline:** 2-3 days

### **Phase 2: Auto-Calculation (High Priority)**
- ✅ Calculate dy, dx automatically
- ✅ Calculate distance discrepancy
- ✅ Flag tolerance exceedances
- **Timeline:** 1 day

### **Phase 3: Comparison Sketch (Medium Priority)**
- Canvas-based drawing
- Vector visualization
- Inter-beacon checks
- **Timeline:** 3-4 days

### **Phase 4: PDF Integration (High Priority)**
- Embed in Calculations document
- SI 727 color coding (black/red)
- Professional formatting
- **Timeline:** 2 days

---

## ✅ Success Criteria

1. ✅ Capture original coordinates for each beacon
2. ✅ Auto-calculate dy, dx, distance
3. ✅ Generate coordinate tabulation matching SR 21/2016 format
4. ✅ Apply SI 727 color coding (black/red)
5. ✅ Include conclusion statement
6. ✅ Embed in Calculations PDF
7. ✅ (Optional) Generate comparison sketch with vectors

---

**Next Step:** Enhance FoundBeaconsView component with original data fields and auto-calculation
