# CSV Import Flow Diagnostic Guide

## Issue
Calculations Part 1 is returning zero values for Y and X coordinates of imported points.

## Data Flow Stages (Now Instrumented with Logging)

### STAGE 1: CSV File Parsing
**File:** `app-frontend/src/utils/cadastral-csv.ts`
**Function:** `validateAndParseCSV()`
**Lines:** 129-136

```typescript
const rawY = record['y'] ? parseFloat(record['y']) : NaN;
const rawX = record['x'] ? parseFloat(record['x']) : NaN;
```

**Console logs to check:**
- `[CSV Parser] === STAGE 1: PARSING ===`
- `rawY:` should show the numeric value (e.g., -17.8123456)
- `rawX:` should show the numeric value (e.g., 31.0456789)
- `isNaN:` should be `false` for valid coordinates

---

### STAGE 2: Creating Point Object
**File:** `app-frontend/src/utils/cadastral-csv.ts`
**Lines:** 138-145

```typescript
const originalY = isNaN(rawY) ? 0 : rawY;
const originalX = isNaN(rawX) ? 0 : rawX;
```

**Console logs to check:**
- `[CSV Parser] === STAGE 2: CREATING POINT OBJECT ===`
- `originalY (will be assigned):` should match rawY (not 0)
- `originalX (will be assigned):` should match rawX (not 0)

---

### STAGE 3: Final Point Object
**File:** `app-frontend/src/utils/cadastral-csv.ts`
**Lines:** 147-175

```typescript
const point: CadastralPoint = {
  id: record['point'] || '',
  original: {
    y: originalY,
    x: originalX
  },
  ...
};
```

**Console logs to check:**
- `[CSV Parser] === STAGE 3: FINAL POINT OBJECT ===`
- `point.original.y:` should show the coordinate value
- `point.original.x:` should show the coordinate value
- `Full point object:` JSON with all fields

---

### STAGE 4: After CSV Validation
**File:** `app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue`
**Lines:** 1565-1571

**Console logs to check:**
- `===== STAGE 4: AFTER CSV VALIDATION =====`
- `First point.original.y:` should still have the value
- `First point.original.x:` should still have the value

---

### STAGE 5: Handle Data Imported
**File:** `app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue`
**Lines:** 1529-1535

**Console logs to check:**
- `===== STAGE 5: HANDLE DATA IMPORTED =====`
- `First point.original.y:` should still have the value
- `First point.original.x:` should still have the value

---

### STAGE 6: Generate Calculations (Read from workflowState)
**File:** `app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue`
**Lines:** 1370-1389

**Console logs to check:**
- `===== STAGE 6: GENERATE CALCULATIONS (Read from workflowState) =====`
- `First point.original?.y:` **THIS IS WHERE THE PROBLEM MANIFESTS**
- `First point.original?.x:` **THIS IS WHERE THE PROBLEM MANIFESTS**
- For each point: `Point X: original.y=?, original.x=? → y=?, x=?`

**If coordinates are 0 here, the issue is between STAGE 5 and STAGE 6**

---

### STAGE 7: Save to Database
**File:** `app-frontend/src/composables/useCadastralWorkflow.ts`
**Lines:** 188-198

```typescript
const mappedPoints = points.map(p => ({
  id: p.id,
  y: p.original.y,  // Direct access
  x: p.original.x,  // Direct access
  ...
}));
```

**Console logs to check:**
- `===== STAGE 7: SAVE TO DATABASE (Mapping) =====`
- `points[0].original.y:` before mapping
- `mappedPoints[0].y:` after mapping

---

## Testing Instructions

1. **Open Browser DevTools** (F12)
2. **Go to Console tab**
3. **Clear the console**
4. **Import your CSV file** (`test-coordinates.csv`)
5. **Watch the console for all 7 stages**
6. **Identify where coordinates become 0**

## Expected Values for test-coordinates.csv

From your file:
```csv
Point,Y,X,Status,Calcs Page,Description,Date of survey
1,-17.8123456,31.0456789,F,1,Corner Beacon,2024-10-15
```

Expected at each stage:
- **rawY:** -17.8123456
- **rawX:** 31.0456789
- **originalY:** -17.8123456
- **originalX:** 31.0456789
- **point.original.y:** -17.8123456
- **point.original.x:** 31.0456789

## Likely Culprits

### Hypothesis 1: CSV Header Mismatch
If Stage 1 shows `rawY: NaN`, the CSV headers don't match:
- Check console: `[CSV Parser] Header columns:`
- Should show: `['point', 'y', 'x', 'status', ...]`
- Your file has: `Point,Y,X,Status,Calcs Page,Description,Date of survey`

**The parser converts headers to lowercase**, so "Y" becomes "y" ✅

### Hypothesis 2: Extra Columns Causing Parse Issues
Your CSV has "Calcs Page" column that may not be expected.
Check if column count matches in Stage 1 logs.

### Hypothesis 3: Workflow State Restoration Overwriting Data
If you're reloading a project, the database might return points without coordinates.
Check backend logs for: `[GET /survey-projects/:id/workflow]`

### Hypothesis 4: Database Storage/Retrieval Issue
The mappedPoints might save correctly but load incorrectly.
Check browser Network tab → `/survey-projects/{id}/workflow` response.

## Next Steps Based on Console Output

**If Stage 1-5 show correct values but Stage 6 shows zeros:**
→ Issue is in `workflowState.importedPoints` reactivity or the `setImportedPoints()` function

**If Stage 1 shows NaN:**
→ CSV header or parsing issue

**If Stage 7 shows zeros:**
→ Data transformation issue in `p.original.y` access

**If values are correct through all stages but still zero in Calculations:**
→ Check if workflow state is being reloaded from database and overwriting the imported data

## Files Modified for Debugging

1. `app-frontend/src/utils/cadastral-csv.ts` - Added Stages 1-3 logging
2. `app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue` - Added Stages 4-6 logging
3. `app-frontend/src/composables/useCadastralWorkflow.ts` - Added Stage 7 logging

All changes are console.log statements only - no functional changes.
