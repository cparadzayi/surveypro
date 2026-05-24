# Found Beacons Assessment - Debugging Guide

## ✅ FIX APPLIED

**Issue:** Imported points weren't being loaded when navigating to Found Beacons step  
**Root Cause:** `setCurrentStep()` only saved the current step but didn't reload workflow state from database  
**Fix:** Modified `setCurrentStep()` to reload workflow state after navigation

**File Changed:** `useCadastralWorkflow.ts` (lines 457-466)

**Test the fix:**
1. Refresh the page
2. Navigate to Found Beacons Assessment
3. Console should show: `🔄 Reloading workflow state after navigating to step: found-beacons`
4. Console should show: `✅ Restored X imported points`
5. Console should show: `[Found Beacons] Total imported points: X` (not 0!)

---

## Problem

Test data contains points with Status="F" (Fixed/Found beacons) but they're not appearing in the Found Beacons Assessment step.

## Root Cause Analysis

The Found Beacons Assessment filters imported points by `status === 'F'`. If beacons aren't showing up, one of these is the issue:

1. **CSV status column not being read**
2. **Status field lost during save/load**
3. **Status field has wrong value** (e.g., lowercase "f" instead of "F")
4. **Points not restored when switching between steps**

## Debug Logging Added

I've added comprehensive debug logging to `fixedPointsForBeaconAssessment` computed property. When you navigate to the Found Beacons step, check the console for:

### Expected Console Output (Working)

```
[Found Beacons] 🔍 Computing fixed points for beacon assessment...
[Found Beacons] Total imported points: 540
[Found Beacons] Status distribution: { F: 27, P: 513 }
[Found Beacons] Sample points: [
  { id: 'BP001', status: 'F', description: '50mm Iron Pipe in Concrete' },
  { id: 'BP002', status: 'F', description: '50mm Iron Pipe in Concrete' },
  { id: '2283A', status: 'P', description: '50mm Iron Peg' }
]
[Found Beacons] ✅ Found fixed point: BP001 status= F
[Found Beacons] ✅ Found fixed point: BP002 status= F
...
[Found Beacons] ✅ Total fixed points found: 27
```

### Problem Indicators

**Case 1: Status field is missing/null**
```
[Found Beacons] Status distribution: { "null/undefined": 540 }
[Found Beacons] Sample points: [
  { id: 'BP001', status: null, description: '50mm Iron Pipe in Concrete' }
]
[Found Beacons] ✅ Total fixed points found: 0
```

**Fix:** Check CSV file - Status column exists and has values

**Case 2: Status field has wrong case**
```
[Found Beacons] Status distribution: { f: 27, p: 513 }
[Found Beacons] Sample points: [
  { id: 'BP001', status: 'f', description: '...' }  // lowercase!
]
[Found Beacons] ✅ Total fixed points found: 0
```

**Fix:** CSV must use uppercase "F" and "P"

**Case 3: Points not loaded**
```
[Found Beacons] Total imported points: 0
[Found Beacons] Status distribution: {}
[Found Beacons] ✅ Total fixed points found: 0
```

**Fix:** Reload workflow state or re-import CSV

## CSV Format Requirements

### Correct Format
```csv
Point,Y,X,Status,Description,Date of survey
BP001,97538.004,2247107.872,F,50mm Iron Pipe in Concrete,1/10/2025
BP002,96271.080,2247869.919,F,50mm Iron Pipe in Concrete,1/10/2025
2283A,97057.022,2247854.388,P,50mm Iron Peg,1/10/2025
```

### Key Requirements
- ✅ **Status column MUST use uppercase**: `F` or `P`
- ✅ **Column name**: `Status` (case-insensitive in header)
- ✅ **F = Fixed** (found beacon/control point)
- ✅ **P = Peg** (placed survey marker)
- ✅ **Blank = Other** (OCP - Old Control Point, etc.)

### Common Mistakes

❌ **Lowercase status**
```csv
Point,Y,X,Status,Description,Date of survey
BP001,97538.004,2247107.872,f,50mm Iron Pipe,1/10/2025
```

❌ **Missing status column**
```csv
Point,Y,X,Description,Date of survey
BP001,97538.004,2247107.872,50mm Iron Pipe,1/10/2025
```

❌ **Wrong column name**
```csv
Point,Y,X,Type,Description,Date of survey
BP001,97538.004,2247107.872,F,50mm Iron Pipe,1/10/2025
```

## Testing Steps

### 1. Check CSV File
Open your CSV in a text editor (NOT Excel, which may change values):
```
Point,Y,X,Status,Description,Date of survey
BP001,97538.004,2247107.872,F,50mm Iron Pipe in Concrete,1/10/2025
```

Verify:
- [ ] Status column exists
- [ ] Status values are uppercase "F" or "P"
- [ ] No extra spaces around status values

### 2. Check Console During Import
After importing CSV, check for validation messages:
```
[CSV Import] ✅ Loaded 540 points
[CSV Import] Status distribution: { F: 27, P: 513 }
```

### 3. Check Found Beacons Step
Navigate to Found Beacons Assessment step and check console:
```
[Found Beacons] 🔍 Computing fixed points for beacon assessment...
[Found Beacons] Total imported points: 540
[Found Beacons] Status distribution: { F: 27, P: 513 }
[Found Beacons] ✅ Total fixed points found: 27
```

### 4. Check Database (if re-loading project)
If reloading an existing project, check if status was saved:
```sql
SELECT 
  project_id,
  step_name,
  step_data->'import_csv'->'points'->0->>'status' as first_point_status,
  jsonb_array_length(step_data->'import_csv'->'points') as point_count
FROM workflow_states
WHERE project_id = YOUR_PROJECT_ID;
```

## Quick Fixes

### Fix 1: Re-Import CSV with Correct Format
1. Fix CSV file (ensure Status column has uppercase F/P)
2. Navigate to CSV Import step
3. Click "Import New CSV" or drag-drop file
4. Select "Complete Replace" when prompted
5. Navigate to Found Beacons step
6. Verify console shows correct fixed points count

### Fix 2: Manually Edit Database (Advanced)
If CSV is correct but database has wrong data:

```sql
-- Check current workflow state
SELECT step_data->'import_csv'->'points'->0 as first_point
FROM workflow_states
WHERE project_id = YOUR_PROJECT_ID;

-- Update all points to set correct status from description
UPDATE workflow_states
SET step_data = jsonb_set(
  step_data,
  '{import_csv,points}',
  (
    SELECT jsonb_agg(
      jsonb_set(point, '{status}', 
        CASE 
          WHEN point->>'id' LIKE 'BP%' THEN '"F"'::jsonb
          WHEN point->>'description' LIKE '%Pipe in Concrete%' THEN '"F"'::jsonb
          ELSE '"P"'::jsonb
        END
      )
    )
    FROM jsonb_array_elements(step_data->'import_csv'->'points') as point
  )
)
WHERE project_id = YOUR_PROJECT_ID;
```

## Code Flow (for debugging)

1. **CSV Import** → `validateAndParseCSV()` in `cadastral-csv.ts`
   - Reads status column: `record['status']`
   - Creates point: `{ status: record['status'] as any }`

2. **Save to State** → `setImportedPoints()` in `useCadastralWorkflow.ts`
   - Maps to DB: `{ status: p.status }`
   - Saves to workflow_states table

3. **Load from DB** → `loadWorkflowState()` in `useCadastralWorkflow.ts`
   - Restores: `status: p.status`

4. **Filter Fixed Points** → `fixedPointsForBeaconAssessment` computed property
   - Filters: `.filter(p => p.status === 'F')`

## Files to Check

- **Frontend:** `CadastralStandardView.vue` (line 1550-1587)
- **CSV Parser:** `cadastral-csv.ts` (line 208)
- **Workflow State:** `useCadastralWorkflow.ts` (lines 183, 317)
- **Type Definition:** `cadastral.ts` (line 14: `type PointStatus = 'F' | 'P' | null`)

## Expected Behavior

✅ **Working System:**
1. Import CSV with Status column (F/P values)
2. Console shows: `Status distribution: { F: X, P: Y }`
3. Navigate to Found Beacons step
4. Console shows: `Total fixed points found: X`
5. Found Beacons form displays X beacons for assessment

❌ **Broken System:**
1. Import CSV
2. Console shows: `Status distribution: { "null/undefined": X }`
3. Found Beacons step shows: "No beacons found"

## Next Steps

1. **Check console output** when navigating to Found Beacons step
2. **Copy the console logs** and send them if issue persists
3. **Verify CSV file format** matches requirements above
4. **Try re-importing** with corrected CSV if status is wrong

The debug logging will tell us exactly where the status field is being lost!
