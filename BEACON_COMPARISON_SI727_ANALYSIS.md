# Beacon Comparison Analysis - SI 727 Section 67(5)

**Regulation:** SI 727 of 1979, Section 67(5) - Survey (General) Regulations  
**Date:** 2025-01-21  
**Status:** Requirements Analysis & Implementation Design

---

## 📜 Official Requirement

### **SI 727 Section 67(5):**

> **(5) The computations shall include a schedule on which the data obtained from the survey are compared with the original data, and such comparison may be shown by means of a sketch or by a tabulation of co-ordinates:**
>
> **Provided that the original data shall be recorded in black, the survey data in red and other data in any other colour except green.**

---

## 🎯 Key Requirements

### **1. Mandatory Comparison Schedule**
- Must compare **new survey data** vs. **original data**
- Part of the Calculations/Computations document
- Required for all surveys that re-establish existing beacons

### **2. Two Approved Methods**

#### **Method A: Comparison Sketch**
- Visual/graphical representation
- Shows beacon positions (old vs. new)
- Displacement vectors if applicable
- Scale and orientation indicated

#### **Method B: Tabulation of Co-ordinates**
- Table format
- Side-by-side coordinate comparison
- Discrepancy calculations
- Statistical summary

### **3. Color Coding Standard**
- **Black:** Original data (from previous survey/records)
- **Red:** New survey data (current survey)
- **Other colors (not green):** Additional data (e.g., calculated positions, adjustments)
- **Green:** Reserved (do not use)

---

## 🔍 Expert Consultation - Land Surveyors

### **Questions for Zimbabwe & South Africa Surveyors:**

#### **1. Data Sources**
- Where do you typically obtain "original data"?
  - Previous survey diagrams (S.G. Office archives)
  - Deeds Office records
  - Surveyor General database
  - Client-provided historical surveys
  - Trig beacon coordinates (official publications)

#### **2. Comparison Sketch Practice**
- What scale do you typically use? (1:500, 1:1000, 1:2000?)
- Do you show:
  - Displacement vectors with magnitude?
  - Bearing of displacement?
  - Search area boundaries?
  - Surrounding features for context?
- How do you handle large discrepancies (>0.5m)?

#### **3. Tabulation Practice**
- What columns do you include?
  - Beacon ID
  - Original Y, X
  - New Y, X
  - ΔY, ΔX (differences)
  - Distance discrepancy
  - Bearing of displacement
  - Remarks (condition, circumstances)
- Do you include statistical summary?
  - Mean discrepancy
  - Standard deviation
  - Maximum discrepancy
  - RMS error

#### **4. Tolerance Standards**
- What discrepancies are considered acceptable?
  - Urban areas: ±0.020m? ±0.050m?
  - Rural areas: ±0.100m? ±0.200m?
  - Trig beacons: ±0.010m?
- When do you reject and replace a beacon?

#### **5. Automation Opportunities**
- Would you prefer:
  - **Option A:** Automatic sketch generation?
  - **Option B:** Automatic tabulation?
  - **Option C:** Both with user choice?
- What additional features would be helpful?
  - Automatic discrepancy flagging (red if >tolerance)
  - Statistical analysis
  - Confidence ellipses
  - Historical trend tracking (multiple surveys)

---

## 💡 Proposed Automated Solution

### **Phase 1: Data Collection (Already Implemented)**

Our `FoundBeaconsView` component captures:
- ✅ Beacon ID
- ✅ Original coordinates (from previous survey/CSV)
- ✅ Current coordinates (new survey)
- ✅ Status (found/not found/replaced)
- ✅ Condition assessment
- ✅ Particular circumstances
- ✅ Alignment test results

### **Phase 2: Automatic Comparison Generation**

We need to add fields to capture "original data" source:
- Previous S.R. Number
- Previous survey date
- Source of original coordinates (Deeds Office, S.G. Office, etc.)

---

## 📊 Method A: Comparison Sketch (Graphical)

### **Automated Sketch Features:**

```
┌─────────────────────────────────────────────┐
│  BEACON COMPARISON SKETCH                   │
│  Scale: 1:500                               │
│  S.R. No.: 12345/2025                       │
│  Original Survey: S.R. 8765/2010            │
├─────────────────────────────────────────────┤
│                                             │
│         CP2 (VOMGWE)                        │
│           ●────────→ ●                      │
│         Black      Red                      │
│         (2010)    (2025)                    │
│         Δ = 0.145m                          │
│         Bearing: 087°15'                    │
│                                             │
│         CP1 (MGWANI)                        │
│           ●─→ ●                             │
│         Δ = 0.008m                          │
│                                             │
│  LEGEND:                                    │
│  ● Black = Original position                │
│  ● Red = New survey position                │
│  → Vector = Displacement                    │
│                                             │
│  STATISTICS:                                │
│  Mean discrepancy: 0.077m                   │
│  Max discrepancy: 0.145m                    │
│  RMS error: 0.089m                          │
└─────────────────────────────────────────────┘
```

### **Implementation:**
- Use HTML5 Canvas or SVG
- Auto-scale based on beacon spread
- Color-coded per SI 727 (black/red)
- Export to PDF

---

## 📋 Method B: Tabulation of Co-ordinates

### **Automated Table Format:**

```
BEACON COMPARISON - TABULATION OF CO-ORDINATES
S.R. No.: 12345/2025
Original Survey: S.R. 8765/2010

┌─────────┬──────────────────────┬──────────────────────┬─────────────────┬──────────┬─────────┐
│ Beacon  │ Original Coordinates │ New Survey Coords    │ Differences     │ Distance │ Remarks │
│ ID      │ (Black - 2010)       │ (Red - 2025)         │ (ΔY, ΔX)        │ (m)      │         │
├─────────┼──────────────────────┼──────────────────────┼─────────────────┼──────────┼─────────┤
│ CP1     │ Y: 18862.520         │ Y: 18862.528         │ ΔY: +0.008      │ 0.008    │ Found   │
│ MGWANI  │ X: 2268555.010       │ X: 2268555.010       │ ΔX:  0.000      │          │ Good    │
│         │                      │                      │ Bearing: 000°   │          │         │
├─────────┼──────────────────────┼──────────────────────┼─────────────────┼──────────┼─────────┤
│ CP2     │ Y: 10266.830         │ Y: 10266.975         │ ΔY: +0.145      │ 0.145    │ Found   │
│ VOMGWE  │ X: 2275951.170       │ X: 2275951.170       │ ΔX:  0.000      │          │ Fair    │
│         │                      │                      │ Bearing: 000°   │          │         │
├─────────┼──────────────────────┼──────────────────────┼─────────────────┼──────────┼─────────┤
│ CP3     │ Y: 25123.450         │ Y: 25123.598         │ ΔY: +0.148      │ 0.148    │ Replaced│
│ HARARE  │ X: 2270234.560       │ X: 2270234.560       │ ΔX:  0.000      │          │ Not fnd │
└─────────┴──────────────────────┴──────────────────────┴─────────────────┴──────────┴─────────┘

STATISTICAL SUMMARY:
  Number of beacons compared: 3
  Mean discrepancy: 0.100m
  Standard deviation: 0.071m
  Maximum discrepancy: 0.148m (CP3 HARARE)
  RMS error: 0.123m
  
TOLERANCE ASSESSMENT:
  Acceptable tolerance: ±0.200m (rural area)
  Beacons within tolerance: 3 of 3 (100%)
  Beacons requiring replacement: 1 (CP3 - not found)
```

### **Implementation:**
- Generate from `FoundBeacon[]` data
- Calculate discrepancies automatically
- Color-code in PDF (black/red text)
- Include statistical analysis
- Flag beacons exceeding tolerance

---

## 🔧 Enhanced FoundBeaconsView Component

### **Additional Fields Needed:**

```typescript
interface FoundBeacon {
  // Existing fields...
  beaconId: string;
  status: 'found' | 'not-found' | 'replaced';
  currentCoordinates: { y: number; x: number };
  
  // NEW: Original data fields
  originalData?: {
    coordinates: { y: number; x: number };
    source: 'previous-survey' | 'deeds-office' | 'sg-office' | 'trig-list' | 'other';
    srNumber?: string;  // Previous S.R. Number
    surveyDate?: Date;  // Previous survey date
    surveyor?: string;  // Previous surveyor
  };
  
  // AUTO-CALCULATED fields
  discrepancy?: {
    deltaY: number;
    deltaX: number;
    distance: number;
    bearing: number;  // Bearing of displacement
    withinTolerance: boolean;
  };
}
```

### **UI Enhancements:**

1. **Original Data Section** (for each beacon):
   - Input for original Y, X coordinates
   - Dropdown: Source of original data
   - Input: Previous S.R. Number (if applicable)
   - Date picker: Previous survey date

2. **Auto-Calculation Display**:
   - Show ΔY, ΔX automatically
   - Show distance discrepancy
   - Show bearing of displacement
   - Color-code: Green if within tolerance, Red if exceeds

3. **Comparison Method Selection**:
   - Radio buttons: "Sketch" or "Tabulation" or "Both"
   - Preview button to see comparison before saving

---

## 📈 Implementation Roadmap

### **Phase 1: Data Capture (Current)**
- ✅ Basic beacon assessment
- ✅ Status (found/not found/replaced)
- ✅ Current coordinates

### **Phase 2: Original Data Integration** (Next)
- Add original coordinates input
- Add source tracking
- Add previous S.R. Number field
- Auto-calculate discrepancies

### **Phase 3: Comparison Generation**
- Build tabulation generator
- Build sketch generator
- Implement SI 727 color coding
- Add statistical analysis

### **Phase 4: PDF Integration**
- Embed comparison in Calculations PDF
- Proper page layout
- Color printing support
- Export standalone comparison document

---

## 🎓 Best Practices from Field Surveyors

### **Common Scenarios:**

#### **Scenario 1: Trig Beacons (High Precision)**
- Original data: Official trig list
- Tolerance: ±0.010m
- Method: Usually tabulation
- Action if exceeded: Investigate, don't replace without authority

#### **Scenario 2: Urban Subdivision (Medium Precision)**
- Original data: Previous S.R. diagram
- Tolerance: ±0.050m
- Method: Sketch or tabulation
- Action if exceeded: Alignment test, possible replacement

#### **Scenario 3: Rural Farm Survey (Lower Precision)**
- Original data: Old farm diagram
- Tolerance: ±0.200m
- Method: Usually sketch
- Action if exceeded: Document circumstances, replace if necessary

---

## 💻 Technical Implementation

### **Calculation Functions:**

```typescript
function calculateDiscrepancy(
  original: { y: number; x: number },
  current: { y: number; x: number }
): Discrepancy {
  const deltaY = current.y - original.y;
  const deltaX = current.x - original.x;
  const distance = Math.sqrt(deltaY ** 2 + deltaX ** 2);
  const bearing = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
  
  return {
    deltaY,
    deltaX,
    distance,
    bearing: bearing < 0 ? bearing + 360 : bearing,
    withinTolerance: distance <= TOLERANCE_THRESHOLD
  };
}

function generateComparisonTable(beacons: FoundBeacon[]): string {
  // Generate HTML table with SI 727 color coding
  // Black text for original data
  // Red text for new survey data
  // Calculate statistics
}

function generateComparisonSketch(beacons: FoundBeacon[]): Canvas {
  // Draw beacons on canvas
  // Black dots for original positions
  // Red dots for new positions
  // Vectors showing displacement
  // Auto-scale and center
}
```

---

## 🚀 Next Steps

1. **Consult with surveyors** - Get real-world examples
2. **Enhance FoundBeaconsView** - Add original data fields
3. **Build comparison generators** - Both sketch and tabulation
4. **Integrate with Calculations PDF** - Embed comparison schedule
5. **Test with real survey data** - Validate against SI 727

---

**Status:** Awaiting surveyor consultation for practical implementation details
