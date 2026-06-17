# TRIG Beacons Handling in Comprehensive Document

## Overview

TRIG beacons (control points from the national survey system) are handled differently in the Coordinate List vs. Calculations Part 1 PDF.

## Current Implementation

### ✅ Coordinate List Generator (`coordinate-list.ts`)

**INCLUDES project control points (TRIG beacons)**

```typescript
// Lines 87-131
if (projectControlPoints && projectControlPoints.length > 0) {
  const trigPoints: AdjustedCoordinate[] = projectControlPoints.map((cp, index) => ({
    pointId: cp.monu_num || cp.id || `CP${index + 1}`,
    y: parseFloat(cp.y_gauss || cp.y) || 0,
    x: parseFloat(cp.x_gauss || cp.x) || 0,
    status: 'TRIG',
    description: cp.monu_name || cp.name || `Control Point ${index + 1}`,
    fieldBookPage: '', // Control points don't have field book entries
    calculationsPage: 0, // From national system (no calculations)
    adjustment: {
      isDuplicate: false,
      observationCount: 1,
      method: 'gps'
    }
  }));
  
  // Prepend control points to TRIG BEACONS section
  groupedPoints.trig = [...trigPoints, ...groupedPoints.trig];
}
```

**Result:** TRIG beacons appear at the top of the Coordinate List in the "TRIG BEACONS" section.

**Example Output:**
```
TRIG BEACONS
F/B   Calcs  Beacons/Stations  Y           X            Description
-     0      TSM001            97234.567   2248123.456  Town Survey Mark 001
-     0      TSM002            96987.654   2247890.123  Town Survey Mark 002
E20   125    2475A             97057.022   2247854.388  12mm iron peg (surveyed point)
```

### ❌ Calculations Part 1 Generator (`calculations-part1.ts`)

**DOES NOT include project control points**

The `generateCalculationsPart1PDF()` method signature:
```typescript
async generateCalculationsPart1PDF(
  surveyPoints: SurveyPoint[],
  surveyorInfo: {...},
  startingPage: number = 116
): Promise<CalculationsPart1Result>
```

**No parameter for `projectControlPoints`!**

The `generateCombinedPointsTable()` method only uses `surveyPoints`:
```typescript
private generateCombinedPointsTable(
  pdf: jsPDF,
  surveyPoints: SurveyPoint[],
  lookup: Record<string, string>
): void {
  // Only renders surveyPoints, not control points
}
```

**Result:** TRIG beacons from project setup DO NOT appear in the Calculations Part 1 "CALCULATIONS" table.

## Why This Difference?

### SGO Standard Interpretation

1. **Coordinate List** - Final reference document
   - MUST include ALL points (TRIG beacons + surveyed points)
   - Used for official record and cross-referencing
   - TRIG beacons establish the coordinate system

2. **Calculations Part 1** - Working calculations
   - Shows duplicate point analysis
   - Shows field observations and adjustments
   - TRIG beacons are GPS-fixed (no calculations needed)
   - They don't have duplicate observations to analyze

### Current Behavior is CORRECT

**TRIG beacons from national system:**
- ✅ Appear in Coordinate List (official record)
- ❌ Do NOT appear in Calculations Part 1 (no calculations to show)
- ❌ Do NOT appear in Field Book (not field-observed)

**Surveyed points:**
- ✅ Appear in Coordinate List
- ✅ Appear in Calculations Part 1 (if duplicates exist)
- ✅ Appear in Field Book (field observations)

## Comprehensive Document Generator Flow

```typescript
// MapLibreAreaView.vue - Line 2300
projectControlPoints: workflowState?.projectInfo?.controlPoints || []

↓

// comprehensive-document.ts - Line 124
await coordListGenerator.generateCoordinateListPDF(
  data.adjustedCoordinates,
  data.surveyorInfo,
  data.projectControlPoints,  // ✅ Passed to Coordinate List
  calcPageLookup
)

↓

// coordinate-list.ts - Lines 87-131
if (projectControlPoints && projectControlPoints.length > 0) {
  // Convert to AdjustedCoordinate format
  // Prepend to TRIG BEACONS section
  groupedPoints.trig = [...trigPoints, ...groupedPoints.trig];
}
```

## Verification Steps

When you generate the comprehensive PDF, check the console logs:

```
[ComprehensiveDoc] 3/5 Generating Coordinate List with cross-references...
[ComprehensiveDoc] - Adjusted coordinates: 542
[ComprehensiveDoc] - Project control points: 3  ✅ Should show count
[ComprehensiveDoc] - First control point: { monu_num: 'TSM001', ... }  ✅ Should show data

[CoordinateList] Processing control points: 3  ✅ Should match above
[CoordinateList] Converted trig points: 3  ✅ Should match above
```

Then open the generated PDF and verify:

1. **Coordinate List** - Page 100+
   - TRIG BEACONS section should list control points FIRST
   - Then surveyed TRIG beacons (if any)
   - F/B column: `-` (no field book entry)
   - Calcs column: `0` (no calculations page)

2. **Calculations Part 1** - Page 116+
   - Should NOT include control points
   - Only shows surveyed points with field observations

## If TRIG Beacons Are Missing

### Debug Checklist

1. **Check workflowState has control points:**
   ```javascript
   console.log('Control points:', workflowState?.projectInfo?.controlPoints);
   ```

2. **Check they're being passed to generator:**
   ```javascript
   // In MapLibreAreaView.vue exportAreaConsistencyPDF()
   console.log('Passing control points:', workflowState?.projectInfo?.controlPoints);
   ```

3. **Check console logs during generation:**
   - Look for `[ComprehensiveDoc] - Project control points: X`
   - Look for `[CoordinateList] Processing control points: X`
   - Look for `[CoordinateList] Converted trig points: X`

4. **Check control point data structure:**
   ```javascript
   // Should have properties like:
   {
     monu_num: 'TSM001',
     monu_name: 'Town Survey Mark 001',
     y_gauss: 97234.567,
     x_gauss: 2248123.456
   }
   ```

### Common Issues

1. **Empty array** - `workflowState.projectInfo.controlPoints = []`
   - User didn't select control points during project setup
   - Solution: Go back to project setup and select control points

2. **Wrong property names** - Control point data uses different field names
   - Check `coordinate-list.ts` lines 100-101 for supported property names
   - Add new property name mappings if needed

3. **Data not loaded** - Control points not loaded from database
   - Check project setup saves control points correctly
   - Verify they're loaded when project is opened

## Summary

✅ **TRIG beacons ARE included in the Coordinate List** - This is correct per SGO standards

❌ **TRIG beacons are NOT in Calculations Part 1** - This is also correct (no calculations to show)

The comprehensive document generator correctly passes project control points to the Coordinate List generator, where they appear in the TRIG BEACONS section at the top of the list.

If you're not seeing them, check the debug logs and verify that `workflowState.projectInfo.controlPoints` contains data.
