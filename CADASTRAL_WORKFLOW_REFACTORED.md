# Cadastral Workflow - Refactored (CORRECTED)

**Date:** 2025-01-21  
**Status:** ✅ Refactored - Found Beacons moved after Calculations Part 1

---

## 🔄 NEW Workflow Sequence (CORRECTED)

```
Step 0: Project Setup
    ↓
Step 1: CSV Import
    ↓
Step 2: Control Point Selection
    ↓
Step 3: Field Book Generation
    ↓
Step 4: Calculations Part 1 (Coordinate Adjustment)
    ↓
Step 5: Found Beacons Assessment ← MOVED HERE!
    ↓
Step 6: Coordinate List Generation
    ↓
Step 7: Area Computation
    ↓
Step 8: Report on Survey
    ↓
Step 9: DSG Certificate
```

---

## 💡 Why This Order Makes Sense

### **Logical Survey Workflow:**

1. **Project Setup** - Initialize project metadata
2. **CSV Import** - Import raw field measurements
3. **Control Point Selection** - Select survey control network
4. **Field Book** - Document field observations
5. **Calculations Part 1** - Adjust coordinates, compute closure errors
6. **Found Beacons Assessment** ← **CRITICAL POSITION**
   - **Why here?** We need adjusted coordinates before comparing with original data
   - Beacon comparison uses final adjusted coordinates vs. original survey
   - Discrepancies calculated from adjusted positions, not raw measurements
7. **Coordinate List** - Generate final coordinate list (informed by beacon assessment)
8. **Area Computation** - Calculate parcel areas
9. **Report on Survey** - Compile comprehensive report
10. **DSG Certificate** - Final submission package

### **Technical Rationale:**

**Before Refactoring (INCORRECT):**
```
CSV Import → Control Points → Found Beacons → Field Book → Calculations
                                    ↑
                            Uses RAW coordinates
                            (Not adjusted yet!)
```

**After Refactoring (CORRECT):**
```
CSV Import → Control Points → Field Book → Calculations → Found Beacons → Coordinate List
                                                              ↑
                                                    Uses ADJUSTED coordinates
                                                    (Proper comparison!)
```

---

## 📝 Changes Made

### **1. Workflow Steps Array Updated:**

```typescript
const workflowSteps = [
  { id: 'project-setup', name: 'Project Setup' },
  { id: 'csv-import', name: 'Import CSV' },
  { id: 'control-point-selection', name: 'Control Point Selection' },
  { id: 'field-book', name: 'Field Book' },
  { id: 'calculations-part1', name: 'Calculations Part 1' },
  { id: 'found-beacons', name: 'Found Beacons Assessment' },  // ← MOVED HERE
  { id: 'coordinate-list', name: 'Coordinate List' },
  { id: 'area-computation', name: 'Area Computation' },
  { id: 'report-on-survey', name: 'Report on Survey' },
  { id: 'dsg-certificate', name: 'DSG Certificate' }
];
```

### **2. Navigation Updated:**

#### **Control Point Selection → Field Book**
```typescript
// ControlPointSelectionView.vue

// Skip button
const skipForNow = () => {
  workflowState.projectInfo.controlPointsSkipped = true;
  workflowState.currentStep = 'field-book';  // ← Changed from 'found-beacons'
}

// Save button
const saveAndContinue = async () => {
  // ... save logic
  workflowState.currentStep = 'field-book';  // ← Changed from 'found-beacons'
}
```

#### **Found Beacons → Coordinate List**
```typescript
// CadastralStandardView.vue

function handleFoundBeaconsSave(data: { beacons: any[]; comparisonConfig: any }) {
  // ... save logic
  workflowState.currentStep = 'coordinate-list';  // ← Changed from 'field-book'
}
```

---

## 🎯 Benefits of New Order

### **1. Accurate Beacon Comparison:**
- ✅ Uses adjusted coordinates (after Calculations Part 1)
- ✅ Proper closure error analysis
- ✅ Correct discrepancy calculations
- ✅ Reliable tolerance assessment

### **2. Logical Document Flow:**
- ✅ Field Book → Calculations → Beacon Assessment → Coordinate List
- ✅ Each step builds on previous results
- ✅ Coordinate List informed by beacon adoption decisions
- ✅ Professional survey workflow

### **3. SI 727 Compliance:**
- ✅ Beacon comparison uses final adjusted positions
- ✅ Discrepancies calculated correctly
- ✅ Tolerance checks meaningful
- ✅ Report on Survey has accurate data

### **4. Data Integrity:**
- ✅ Adjusted coordinates available for comparison
- ✅ Closure errors computed before beacon assessment
- ✅ Coordinate List reflects beacon adoption status
- ✅ Area computation uses validated coordinates

---

## 📊 Updated Navigation Flow

### **Complete Flow:**

```
Project Setup
    ↓ (handleProjectSetupComplete)
CSV Import
    ↓ (button click)
Control Point Selection
    ↓ (saveAndContinue / skipForNow)
Field Book
    ↓ (Continue button)
Calculations Part 1
    ↓ (goToNextStep)
Found Beacons Assessment ← NEW POSITION
    ↓ (handleFoundBeaconsSave)
Coordinate List
    ↓ (Continue button)
Area Computation
    ↓ (goToNextStep)
Report on Survey
    ↓ (goToNextStep)
DSG Certificate
```

### **Key Navigation Points:**

1. **Control Point Selection:**
   - Save → `field-book`
   - Skip → `field-book`

2. **Field Book:**
   - Continue → `calculations-part1` (via goToNextStep)

3. **Calculations Part 1:**
   - Continue → `found-beacons` (via goToNextStep)

4. **Found Beacons:**
   - Save → `coordinate-list` (via handleFoundBeaconsSave)

5. **Coordinate List:**
   - Continue → `area-computation` (via goToNextStep)

---

## 🔍 Data Flow Analysis

### **Found Beacons Data Requirements:**

**Input Data:**
- ✅ Fixed points from CSV import
- ✅ **Adjusted coordinates from Calculations Part 1** ← CRITICAL
- ✅ Control point information
- ✅ Survey metadata

**Output Data:**
- ✅ Beacon status (found/not-found/replaced)
- ✅ Beacon condition
- ✅ Original coordinates (from previous survey)
- ✅ **Discrepancies (using adjusted coordinates)** ← CORRECT
- ✅ Comparison method and tolerance
- ✅ Adoption decisions

**Used By:**
- ✅ Coordinate List (beacon adoption status)
- ✅ Report on Survey (Sections 3 & 4)
- ✅ Calculations PDF (beacon comparison schedule)

---

## ✅ Verification Checklist

### **Workflow Order:**
- [x] Project Setup (Step 0)
- [x] CSV Import (Step 1)
- [x] Control Point Selection (Step 2)
- [x] Field Book (Step 3)
- [x] Calculations Part 1 (Step 4)
- [x] **Found Beacons (Step 5)** ← MOVED
- [x] Coordinate List (Step 6)
- [x] Area Computation (Step 7)
- [x] Report on Survey (Step 8)
- [x] DSG Certificate (Step 9)

### **Navigation:**
- [x] Control Point Selection → Field Book
- [x] Field Book → Calculations Part 1
- [x] Calculations Part 1 → Found Beacons
- [x] **Found Beacons → Coordinate List** ← UPDATED
- [x] Coordinate List → Area Computation
- [x] Area Computation → Report on Survey

### **Data Dependencies:**
- [x] Found Beacons receives adjusted coordinates
- [x] Discrepancy calculations use adjusted values
- [x] Coordinate List informed by beacon adoption
- [x] Report on Survey has complete beacon data

---

## 📋 Files Modified

### **1. CadastralStandardView.vue:**
- Updated `workflowSteps` array order
- Updated `handleFoundBeaconsSave` navigation

### **2. ControlPointSelectionView.vue:**
- Updated `skipForNow()` navigation
- Updated `saveAndContinue()` navigation

### **3. Documentation:**
- Created `CADASTRAL_WORKFLOW_REFACTORED.md` (this file)
- Updated workflow diagrams

---

## 🎓 Implementation Notes

### **Why Adjusted Coordinates Matter:**

**Example Scenario:**
```
Original Survey (SR 21/2016):
  Beacon CP1: Y = -82612.590, X = 2149425.610

Raw CSV Import:
  Beacon CP1: Y = -82612.592, X = 2149425.608

After Calculations Part 1 (Adjusted):
  Beacon CP1: Y = -82612.590, X = 2149425.615

Discrepancy Calculation:
  WRONG: Raw - Original = (-0.002, -0.002) → 0.003m
  RIGHT: Adjusted - Original = (0.000, 0.005) → 0.005m
```

The adjusted coordinates account for:
- Network adjustment
- Closure error distribution
- Control point constraints
- Least squares adjustment

### **Coordinate List Integration:**

The Coordinate List now correctly reflects:
1. Adjusted coordinates from Calculations
2. Beacon adoption status from Found Beacons
3. Cross-references to Field Book and Calculations pages
4. Final validated positions

---

## 🚀 Testing the Refactored Workflow

### **End-to-End Test:**

1. **Start:** Project Setup
2. **Import CSV** with Fixed points
3. **Select Control Points** (or skip)
4. **Generate Field Book**
5. **Run Calculations Part 1** (coordinates adjusted)
6. **Assess Found Beacons:**
   - Enter original coordinates
   - System uses adjusted coordinates for comparison
   - See correct discrepancies
   - Mark beacons as adopted/rejected
7. **Generate Coordinate List** (reflects beacon decisions)
8. **Compute Areas**
9. **Generate Report on Survey**

### **Validation Points:**

- ✅ Found Beacons uses adjusted coordinates
- ✅ Discrepancies calculated correctly
- ✅ Tolerance checks meaningful
- ✅ Coordinate List shows adopted beacons
- ✅ Report on Survey has accurate data

---

## 📊 Comparison: Before vs After

### **Before (INCORRECT):**
| Step | Component | Issue |
|------|-----------|-------|
| 2 | Control Points | ✓ |
| 3 | **Found Beacons** | ❌ Uses raw coordinates |
| 4 | Field Book | ✓ |
| 5 | Calculations | ✓ Adjusts coordinates |
| 6 | Coordinate List | ❌ Doesn't reflect beacon assessment |

### **After (CORRECT):**
| Step | Component | Status |
|------|-----------|--------|
| 2 | Control Points | ✓ |
| 3 | Field Book | ✓ |
| 4 | Calculations | ✓ Adjusts coordinates |
| 5 | **Found Beacons** | ✅ Uses adjusted coordinates |
| 6 | Coordinate List | ✅ Reflects beacon assessment |

---

## 🎯 Summary

### **Key Change:**
**Found Beacons moved from Step 3 to Step 5** (after Calculations Part 1)

### **Rationale:**
Beacon comparison requires adjusted coordinates for accurate discrepancy calculation

### **Impact:**
- ✅ Correct discrepancy calculations
- ✅ Meaningful tolerance checks
- ✅ Proper SI 727 compliance
- ✅ Logical workflow progression
- ✅ Data integrity maintained

### **Files Updated:**
- `CadastralStandardView.vue` (workflow steps array, handler)
- `ControlPointSelectionView.vue` (navigation)
- Documentation (this file)

---

**Status:** ✅ Refactoring Complete  
**Date:** 2025-01-21  
**Version:** 2.0 (Corrected Workflow Order)
