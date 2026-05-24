# Lo Zone Selection Fix

## Issue
The CSV import was ignoring the selected Lo zone and always using Lo 31 (the project's saved central meridian), even when the user selected a different Lo zone (e.g., Lo 33) in Project Setup.

## Root Cause
In the `handleFileChange` function (line 2493), the code was using:
```typescript
const loZone = workflowState.projectInfo.centralMeridian;
```

This always pulled the **saved** central meridian from the project (which was 31), instead of using the **currently selected** Lo zone from `selectedLoZone.value`.

## The Problem Flow

### Before Fix:
1. User selects **Lo 33** in Project Setup
2. `selectedLoZone.value` is set to **33** ✅
3. User imports CSV
4. Code uses `workflowState.projectInfo.centralMeridian` = **31** ❌
5. Coordinates are transformed using **Lo 31** instead of **Lo 33**
6. **Wrong location!**

### Why This Happened:
- `workflowState.projectInfo.centralMeridian` stores the project's **saved** Lo zone
- When you select a project (Para1), it loads the saved central meridian (31)
- Even if you select a different Lo zone in Project Setup, the old saved value was being used for CSV import

## Solution

Changed line 2493 to prioritize `selectedLoZone.value`:

```typescript
// OLD (Incorrect)
const loZone = workflowState.projectInfo.centralMeridian;

// NEW (Correct)
const loZone = selectedLoZone.value || workflowState.projectInfo.centralMeridian;
```

### Added Safety Checks:
1. **Logging** - Shows which Lo zone is being used
2. **Validation** - Alerts if no Lo zone is selected
3. **Fallback** - Uses saved central meridian if selectedLoZone is not set

## Code Changes

**File**: `CadastralStandardView.vue` (lines 2492-2501)

```typescript
// Get Lo zone from selected Lo zone (from Project Setup)
const loZone = selectedLoZone.value || workflowState.projectInfo.centralMeridian;
console.log(`[CSV Import] Using Lo zone: Lo${loZone || 'not set'}`);
console.log(`[CSV Import] - selectedLoZone.value: ${selectedLoZone.value}`);
console.log(`[CSV Import] - workflowState.projectInfo.centralMeridian: ${workflowState.projectInfo.centralMeridian}`);

if (!loZone) {
  alert('Error: No Lo zone selected. Please go back to Project Setup and select a Lo zone.');
  return;
}
```

## How It Works Now

### After Fix:
1. User selects **Lo 33** in Project Setup
2. `selectedLoZone.value` is set to **33** ✅
3. User imports CSV
4. Code checks `selectedLoZone.value` first = **33** ✅
5. Coordinates are transformed using **Lo 33** ✅
6. **Correct location!** ✅

## Console Logs to Verify

When you import a CSV, you'll now see:
```
[CSV Import] Using Lo zone: Lo33
[CSV Import] - selectedLoZone.value: 33
[CSV Import] - workflowState.projectInfo.centralMeridian: 31
```

This confirms:
- ✅ Selected Lo zone (33) is being used
- ✅ Not using the old saved value (31)

## Testing

1. **Select a project** with a saved Lo zone (e.g., Para1 with Lo 31)
2. **Go to Project Setup** and select a different Lo zone (e.g., Lo 33)
3. **Import a CSV file**
4. **Check console logs** - Should show "Using Lo zone: Lo33"
5. **Verify coordinates** - Should be in the correct location for Lo 33

## Edge Cases Handled

### Case 1: No Lo Zone Selected
- **Before**: Would use saved central meridian (might be wrong)
- **After**: Shows error alert and prevents import

### Case 2: Project Has No Saved Central Meridian
- **Before**: Would use `undefined` (crash)
- **After**: Uses `selectedLoZone.value` or shows error

### Case 3: User Doesn't Change Lo Zone
- **Before**: Used saved central meridian ✅
- **After**: Uses saved central meridian (fallback) ✅

## Priority Order

The code now checks in this order:
1. **`selectedLoZone.value`** (from Project Setup dropdown) - **HIGHEST PRIORITY**
2. **`workflowState.projectInfo.centralMeridian`** (saved in project) - **FALLBACK**
3. **Error alert** if neither is available - **SAFETY**

This ensures the user's current selection always takes precedence over saved values.

## Files Modified

- ✅ `CadastralStandardView.vue` (lines 2492-2501) - Fixed Lo zone selection logic
