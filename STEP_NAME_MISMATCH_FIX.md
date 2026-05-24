# Step Name Mismatch Fix - Found Beacons Issue

## Problem

Found Beacons Assessment showed 0 beacons even though CSV data contained 5 fixed points with Status="F".

## Root Cause

**Step naming inconsistency:**
- CSV import step is called `csv-import` (with **dash**)
- But load code was looking for `import_csv` (with **underscore**)

This meant imported points were saved to the database but never loaded back!

## Console Evidence

**Before Fix:**
```
✅ Restored 540 adjusted coordinates  ← Only this was loaded
(No message about imported points)
[Found Beacons] Total imported points: 0  ← Empty!
```

**After Fix:**
```
🔍 Restoring points from database...
  - Points in DB: 540
  - First point.status: F
✅ Restored 540 imported points  ← Now loading!
[Found Beacons] Total imported points: 540
[Found Beacons] Status distribution: { F: 5, P: 535 }
[Found Beacons] ✅ Total fixed points found: 5  ← Fixed!
```

## Fix Applied

**File:** `useCadastralWorkflow.ts` (lines 294-308)

Changed from:
```typescript
if (dbState.step_data?.import_csv?.points) {  // ❌ Wrong name
```

To:
```typescript
const csvStepData = dbState.step_data?.['csv-import'] || dbState.step_data?.import_csv;  // ✅ Checks both
if (csvStepData?.points) {
```

This now checks for both naming conventions for backwards compatibility.

## Testing

**1. Refresh the page (F5)**

**2. Navigate to Found Beacons Assessment**

**3. Check console output:**

Expected success indicators:
- ✅ `🔍 Restoring points from database...`
- ✅ `- Points in DB: 540`
- ✅ `- First point.status: F` (or P, depending on first point)
- ✅ `✅ Restored 540 imported points`
- ✅ `[Found Beacons] Total imported points: 540`
- ✅ `[Found Beacons] Status distribution: { F: 5, P: 535 }`
- ✅ `[Found Beacons] ✅ Total fixed points found: 5`

**4. Verify UI shows 5 beacons in the assessment form**

## Why You Have 5 Beacons (Not 27)

Your test data has **5 points with Status="F"**, not 27. The 27 was from my example in the debugging guide. Your actual data:
- 5 Fixed points (Status="F") - Found beacons/control points
- 535 Peg points (Status="P") - Survey pegs
- Total: 540 points

## Files Changed

1. **`useCadastralWorkflow.ts`**
   - Lines 294-308: Fixed step name lookup
   - Added backwards compatibility check for both `csv-import` and `import_csv`
   - Added status field logging

2. **`CadastralStandardView.vue`**
   - Lines 1550-1587: Added comprehensive debug logging for Found Beacons

## Related Fixes Today

1. ✅ **Workflow State Reload** - `setCurrentStep()` now reloads state after navigation
2. ✅ **Step Name Mismatch** - Checks both `csv-import` and `import_csv`
3. ✅ **Debug Logging** - Shows status distribution and point details

## Verification SQL (Optional)

To check what's stored in your database:

```sql
SELECT 
  step_name,
  jsonb_object_keys(step_data) as data_keys,
  jsonb_array_length(step_data->'csv-import'->'points') as points_csv_dash,
  jsonb_array_length(step_data->'import_csv'->'points') as points_csv_underscore
FROM workflow_states
WHERE project_id = 1;
```

This will show which naming convention your database is using.

## Expected Result

After refreshing:
- Found Beacons Assessment should display **5 beacons** for assessment
- Each beacon should show its coordinates and description
- You can proceed to fill in the beacon assessment details (found/not found, condition, etc.)
