# Calculated Points Implementation

## Overview
The cadastral workflow has been refactored to support **calculated points** - points that are computed mathematically rather than observed in the field. These points do NOT appear in the Field Book but DO appear in Calculations and the Coordinate List.

## What Are Calculated Points?

Calculated points are survey points that are:
- **Computed** from other observed points (e.g., intersections, offsets, subdivisions)
- **Not physically beaconed** in the field
- **Not recorded** in field observations
- **Included** in calculations and coordinate lists for completeness

### Examples:
- Intersection points computed from two bearings
- Offset points calculated from a baseline
- Subdivision points derived from parcel boundaries
- Intermediate points for curve calculations

---

## CSV Format

### Identifying Calculated Points

Calculated points can be identified in the CSV file using any of these methods:

#### Method 1: Point Type Column (Recommended)
```csv
Point,Y,X,Status,Description,Date of survey,Type
P1,18862.520,2268555.010,F,50mm Iron Pipe,1/10/2025,Observed
CP1,18900.000,2268600.000,P,Calculated intersection,1/10/2025,Calculated
```

#### Method 2: Status Column
```csv
Point,Y,X,Status,Description,Date of survey
P1,18862.520,2268555.010,F,50mm Iron Pipe,1/10/2025
CP1,18900.000,2268600.000,C,Intersection point,1/10/2025
```

#### Method 3: Description Contains "Calculated"
```csv
Point,Y,X,Status,Description,Date of survey
P1,18862.520,2268555.010,F,50mm Iron Pipe,1/10/2025
CP1,18900.000,2268600.000,P,Calculated from P1 and P2,1/10/2025
```

### Detection Logic

The system automatically detects calculated points if ANY of these conditions are met:

1. **Type column** = "Calculated" or "C" (case-insensitive)
2. **Status column** = "C" or "CALC" (case-insensitive)
3. **Description** contains "calculated" (case-insensitive)

---

## Workflow Integration

### 1. CSV Import (`cadastral-csv.ts`)

**File:** `app-frontend/src/utils/cadastral-csv.ts`

**Changes:**
- Added detection logic for calculated points
- Set `includeInFieldBook: false` for calculated points
- Set `includeInCoordinateList: true` for all points
- Added summary statistics for calculated vs field book points

**Console Output:**
```
[CSV Parser] 📊 Import Summary:
  - Total Points: 150
  - Field Book Points: 142
  - Calculated Points: 8 (excluded from field book)
  - Fixed Points (F): 12
  - Peg Points (P): 138
  - Other Points: 0
```

### 2. Field Book Generation

**Files:**
- `app-frontend/src/utils/TwoPassDocumentGenerator.ts`
- `app-frontend/src/utils/comprehensive-document.ts`

**Changes:**
- Filter out calculated points before generating field book
- Only observed points appear in field book pages (E1-E99)
- Calculated points are excluded from page numbering

**Filtering Logic:**
```typescript
const filteredPoints = data.surveyPoints.filter(pt => {
  const desc = (pt.description || '').toLowerCase();
  const isCalculated = desc.includes('calculated');
  return !isCalculated;
});
```

**Console Output:**
```
[FieldBook] 🧮 Excluding calculated point: CP1
[FieldBook] 🧮 Excluding calculated point: CP2
[FieldBook] 📊 Points: 150 total, 142 in field book, 8 calculated (excluded)
```

### 3. Calculations Part 1

**File:** `app-frontend/src/utils/calculations-part1.ts`

**Changes:**
- Updated `generateFieldBookPageLookup()` to filter calculated points
- Calculated points show "-" in F/B column (not "E1", "E2", etc.)
- Only observed points get field book page references

**Behavior:** Calculated points **DO appear** in calculations
- All points (observed + calculated) are included in calculations table
- Calculated points show "-" for field book reference
- Calculations show how calculated points were derived
- Page numbering includes calculated points

### 4. Coordinate List

**File:** `app-frontend/src/utils/coordinate-list.ts`

**Changes:**
- Added `calculated` section to `GroupedPoints` interface
- Added `isCalculatedPoint()` detection method
- Calculated points appear in their own section after "FOUND BEACONS"
- Section order: TRIG → WORKING → FOUND → **CALCULATED** → PLACED

**Behavior:** Calculated points **DO appear** in coordinate list
- Listed in separate "CALCULATED POINTS" section
- Appear after "FOUND BEACONS" and before "PLACED BEACONS"
- Cross-references to Field Book show "-" (not beaconed)
- Cross-references to Calculations show correct page numbers (C1, C2, etc.)

---

## Type Definitions

### Updated Interfaces

**File:** `app-frontend/src/types/cadastral.ts`

```typescript
export interface CadastralPoint {
  id: string;
  original: { y: number; x: number; };
  wgs84?: { lng: number; lat: number; };
  fieldBook: { y: string; x: string; };
  coordinateList: { y: string; x: string; };
  status: PointStatus;
  description: string;
  surveyDate: Date;
  
  // Document generation flags
  includeInFieldBook: boolean;    // ⭐ NEW: Controls field book inclusion
  includeInCoordinateList: boolean;
}

export interface CSVValidationResult {
  isValid: boolean;
  errors: CSVValidationError[];
  warnings: CSVValidationWarning[];
  preview: CadastralPoint[];
  summary: {
    totalPoints: number;
    fixedPoints: number;
    pegPoints: number;
    otherPoints: number;
    calculatedPoints: number;      // ⭐ NEW: Count of calculated points
    fieldBookPoints: number;        // ⭐ NEW: Count of field book points
  };
}
```

---

## Document Appearance

### Field Book (E1-E99)
```
┌──────────────────────────────────────┐
│ Electronic Field Book - Page E1      │
├──────┬────────────┬────────────┬─────┤
│ Point│ Y (Westing)│ X (Southing)│ ... │
├──────┼────────────┼────────────┼─────┤
│ P1   │ 18862.520  │ 2268555.010│ ... │
│ P2   │ 18900.123  │ 2268600.456│ ... │
│ P3   │ 18950.789  │ 2268650.123│ ... │
│      │            │            │     │  ← CP1 NOT shown (calculated)
│ P4   │ 19000.456  │ 2268700.789│ ... │
└──────┴────────────┴────────────┴─────┘
```

### Calculations Part 1 (C1-C99)
```
┌─────────────────────────────────────────────────────┐
│ Calculations Part 1 - Page C1                       │
├──────┬────────────┬────────────┬────────┬──────────┤
│ Point│ Y (Westing)│ X (Southing)│ Status │   F/B    │
├──────┼────────────┼────────────┼────────┼──────────┤
│ P1   │ 18862.520  │ 2268555.010│ F      │ E1       │
│ P2   │ 18900.123  │ 2268600.456│ P      │ E1       │
│ P3   │ 18950.789  │ 2268650.123│ P      │ E1       │
│ M5   │ 96892.200  │ 2247571.920│ Calc   │ -        │  ← Shows "-" not "E1"
│ M6   │ 96750.760  │ 2247697.040│ Calc   │ -        │  ← Shows "-" not "E1"
│ P4   │ 19000.456  │ 2268700.789│ P      │ E2       │
└──────┴────────────┴────────────┴────────┴──────────┘
```

### Coordinate List (L1-L99)
```
┌──────────────────────────────────────────────────────┐
│ Coordinate List - Page L1                            │
│                                                      │
│ FOUND BEACONS                                        │
├──────┬───────────┬───────────┬──────────┬───────────┤
│ Point│ Y (West)  │ X (South) │ Field Bk │ Calc Page │
├──────┼───────────┼───────────┼──────────┼───────────┤
│ P1   │ 18862.52  │ 2268555.01│ E1       │ C1        │
│ P2   │ 18900.12  │ 2268600.46│ E1       │ C1        │
│ P3   │ 18950.79  │ 2268650.12│ E1       │ C1        │
├──────┴───────────┴───────────┴──────────┴───────────┤
│ CALCULATED POINTS                                    │  ⭐ NEW section
├──────┬───────────┬───────────┬──────────┬───────────┤
│ Point│ Y (West)  │ X (South) │ Field Bk │ Calc Page │
├──────┼───────────┼───────────┼──────────┼───────────┤
│ M5   │ 96892.20  │ 2247571.92│ -        │ C1        │  ← Shows "-" for F/B
│ M6   │ 96750.76  │ 2247697.04│ -        │ C1        │  ← Shows calc page
│ M7   │ 96995.07  │ 2247744.27│ -        │ C1        │
├──────┴───────────┴───────────┴──────────┴───────────┤
│ PLACED BEACONS                                       │
├──────┬───────────┬───────────┬──────────┬───────────┤
│ Point│ Y (West)  │ X (South) │ Field Bk │ Calc Page │
├──────┼───────────┼───────────┼──────────┼───────────┤
│ P4   │ 19000.46  │ 2268700.79│ E2       │ C2        │
└──────┴───────────┴───────────┴──────────┴───────────┘
```

---

## Testing

### Test Scenario 1: Simple Calculated Point

**CSV:**
```csv
Point,Y,X,Status,Description,Date of survey
P1,18862.520,2268555.010,F,50mm Iron Pipe,1/10/2025
CP1,18900.000,2268600.000,C,Calculated intersection,1/10/2025
P2,18950.789,2268650.123,P,12mm iron peg,1/10/2025
```

**Expected:**
- Total: 3 points
- Field Book: 2 points (P1, P2)
- Calculated: 1 point (CP1)
- Field Book pages: E1 (2 points)
- Calculations pages: C1 (3 points)
- Coordinate List: L1 (3 points, CP1 shows "-" for field book)

### Test Scenario 2: Multiple Calculated Points

**CSV:**
```csv
Point,Y,X,Status,Description,Date of survey,Type
P1,18862.520,2268555.010,F,50mm Iron Pipe,1/10/2025,Observed
CP1,18900.000,2268600.000,P,Offset from P1,1/10/2025,Calculated
CP2,18925.000,2268625.000,P,Intersection,1/10/2025,Calculated
P2,18950.789,2268650.123,P,12mm iron peg,1/10/2025,Observed
CP3,18975.000,2268675.000,P,Subdivision point,1/10/2025,Calculated
P3,19000.456,2268700.789,P,12mm iron peg,1/10/2025,Observed
```

**Expected:**
- Total: 6 points
- Field Book: 3 points (P1, P2, P3)
- Calculated: 3 points (CP1, CP2, CP3)
- Field Book pages: E1 (3 points)
- Calculations pages: C1 (6 points)
- Coordinate List: L1 (6 points, CP1/CP2/CP3 show "-" for field book)

---

## Benefits

### 1. **Accuracy**
- Field book only shows physically observed points
- Matches actual field work procedures
- Prevents confusion about which points were beaconed

### 2. **Completeness**
- All points (observed + calculated) appear in calculations
- Coordinate list is comprehensive
- Proper documentation of derived points

### 3. **Compliance**
- Follows SI 727 Zimbabwe cadastral survey standards
- Proper distinction between observed and calculated data
- Clear audit trail for calculations

### 4. **Flexibility**
- Multiple ways to identify calculated points
- Works with existing CSV formats
- Backward compatible (no calculated points = all in field book)

---

## Migration Guide

### For Existing Projects

If you have existing CSV files without calculated points:
1. **No changes needed** - all points will be treated as observed
2. **Optional:** Add "Type" column to explicitly mark calculated points
3. **Optional:** Update descriptions to include "calculated" for derived points

### For New Projects

1. **Add Type column** to CSV template:
   ```csv
   Point,Y,X,Status,Description,Date of survey,Type
   ```

2. **Mark calculated points** with Type="Calculated":
   ```csv
   CP1,18900.000,2268600.000,P,Intersection point,1/10/2025,Calculated
   ```

3. **Import CSV** - system will automatically:
   - Detect calculated points
   - Exclude them from field book
   - Include them in calculations and coordinate list

---

## Console Logging

The system provides detailed logging for debugging:

```
[CSV Parser] 🌍 Will transform coordinates from Cape Lo 31 to WGS84
[CSV Parser] 🧮 Detected CALCULATED point: CP1
  - Point Type: calculated
  - Status: p
  - Description: intersection point
[CSV Parser] 📊 Import Summary:
  - Total Points: 150
  - Field Book Points: 142
  - Calculated Points: 8 (excluded from field book)
  - Fixed Points (F): 12
  - Peg Points (P): 138
  - Other Points: 0

[FieldBook] 🧮 Excluding calculated point: CP1
[FieldBook] 🧮 Excluding calculated point: CP2
[FieldBook] 📊 Points: 150 total, 142 in field book, 8 calculated (excluded)
[FieldBook] Will generate 6 pages (E1-E6)

[ComprehensiveDoc] 🧮 Excluding calculated point from Field Book: CP1
[ComprehensiveDoc] 📋 Survey points filtering:
[ComprehensiveDoc] - Total survey points: 150
[ComprehensiveDoc] - TRIG beacons filtered out: 0
[ComprehensiveDoc] - Calculated points filtered out: 8
[ComprehensiveDoc] - Points for Field Book: 142

[CalculationsPart1] 🧮 Excluding calculated point from F/B lookup: M5
[CalculationsPart1] 🧮 Excluding calculated point from F/B lookup: M6
[CalculationsPart1] 📊 Field Book lookup: 150 total, 142 in field book, 8 calculated

[CoordinateList] 📊 Point grouping:
  - TRIG: 2
  - WORKING: 5
  - FOUND: 135
  - CALCULATED: 8
  - PLACED: 0
```

---

## Files Modified

### Frontend
1. **`app-frontend/src/types/cadastral.ts`**
   - Added `calculatedPoints` and `fieldBookPoints` to summary
   - Updated `CSVValidationResult` interface

2. **`app-frontend/src/utils/cadastral-csv.ts`**
   - Added calculated point detection logic
   - Updated `includeInFieldBook` flag based on detection
   - Added summary statistics logging

3. **`app-frontend/src/utils/TwoPassDocumentGenerator.ts`**
   - Added filtering for calculated points in `renderFieldBook()`
   - Added console logging for excluded points

4. **`app-frontend/src/utils/comprehensive-document.ts`**
   - Updated filtering logic to exclude calculated points from field book
   - Added detailed logging for point filtering

5. **`app-frontend/src/utils/calculations-part1.ts`**
   - Updated `generateFieldBookPageLookup()` to filter calculated points
   - Calculated points now show "-" in F/B column instead of page numbers
   - Added console logging for excluded calculated points

6. **`app-frontend/src/utils/coordinate-list.ts`**
   - Added `calculated` array to `GroupedPoints` interface
   - Added `isCalculatedPoint()` detection method
   - Updated section order to include "CALCULATED POINTS" after "FOUND BEACONS"
   - Updated `renderPointsOnPageContinuous()` to force "-" for calculated points in F.B column
   - Added console logging for point grouping statistics

---

## Future Enhancements

### Potential Improvements
1. **UI Indicator** - Visual badge in CSV preview showing calculated points
2. **Calculation Details** - Show formula/method used for calculated points
3. **Validation** - Warn if calculated points have field observations
4. **Export** - Option to export only observed or only calculated points
5. **Statistics** - Dashboard showing calculated vs observed point ratios

### Advanced Features
1. **Auto-calculation** - Compute calculated points from formulas in CSV
2. **Dependency tracking** - Show which points were used to calculate others
3. **Error propagation** - Calculate uncertainty for calculated points
4. **Batch processing** - Apply same calculation to multiple points

---

## Support

For questions or issues:
1. Check console logs for detailed error messages
2. Verify CSV format matches one of the supported methods
3. Ensure calculated points have valid coordinates
4. Review this documentation for proper usage

**Last Updated:** December 14, 2025
**Version:** 1.0.0
