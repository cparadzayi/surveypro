# Central Meridian (Lo Value) Communication Fix

## Problem

The "Generate Coordinate List" function was not using the correct central meridian (Lo value) from Step 0 (Project Setup). Instead, it was falling back to the project's database value or defaulting to Lo31.

## Root Cause

**Two issues identified:**

### 1. **Workflow State Not Restoring `projectInfo.centralMeridian`**

The `loadWorkflowState` function in `useCadastralWorkflow.ts` was restoring:
- ✅ Imported points
- ✅ Surveyor info
- ✅ Adjusted coordinates
- ❌ **Project info (including central meridian)** - MISSING

**Result:** When the workflow state was reloaded from the database, `workflowState.projectInfo.centralMeridian` was `undefined`.

### 2. **Incorrect Priority Order**

The `generateCoordinateList` function had this logic:

```typescript
centralMeridian: workflowState.projectInfo.centralMeridian || selectedProject.value?.central_meridian || undefined
```

**Problem:** Since `workflowState.projectInfo.centralMeridian` was `undefined` (not restored), it always fell back to `selectedProject.value?.central_meridian`.

---

## Solution

### **Fix 1: Restore `projectInfo` from Database**

**File:** `app-frontend/src/composables/useCadastralWorkflow.ts`

**Added restoration logic for project-setup step data:**

```typescript
// Restore projectInfo from project-setup step
if (dbState.step_data?.['project-setup']) {
  const setupData = dbState.step_data['project-setup']
  if (setupData.project_name) {
    workflowState.projectInfo.name = setupData.project_name
  }
  if (setupData.district) {
    workflowState.projectInfo.district = setupData.district
  }
  if (setupData.working_directory) {
    workflowState.projectInfo.workingDirectory = setupData.working_directory
  }
  if (setupData.central_meridian !== undefined) {
    workflowState.projectInfo.centralMeridian = setupData.central_meridian
    console.log(`✅ Restored central meridian: Lo${setupData.central_meridian}`)
  }
}
```

**Result:** When workflow state is reloaded, `workflowState.projectInfo.centralMeridian` is now properly restored from the database.

---

### **Fix 2: Improved Priority Order with Logging**

**File:** `app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue`

**Updated `generateCoordinateList` function:**

```typescript
// Determine central meridian with proper priority:
// 1. From Step 0 (project-setup) stored in workflowState
// 2. From selected project (database)
// 3. Default to 31 if neither available
const centralMeridian = workflowState.projectInfo.centralMeridian 
  ?? selectedProject.value?.central_meridian 
  ?? 31;

console.log('[CoordinateList] Central Meridian determination:');
console.log('  - From Step 0 (workflowState.projectInfo):', workflowState.projectInfo.centralMeridian);
console.log('  - From selected project:', selectedProject.value?.central_meridian);
console.log('  - Final value used:', centralMeridian);
```

**Benefits:**
- ✅ Clear priority order (Step 0 > Project > Default)
- ✅ Detailed logging for debugging
- ✅ Nullish coalescing (`??`) instead of logical OR (`||`) to handle `0` values correctly

---

### **Fix 3: Use Consistent Central Meridian Variable**

**Updated control point fetching:**

```typescript
// Before (inconsistent):
const response = await fetch(`${API_BASE}/control-points?gauss_lo=${workflowState.projectInfo.centralMeridian || 31}&limit=5000`);

// After (consistent):
const response = await fetch(`${API_BASE}/control-points?gauss_lo=${centralMeridian}&limit=5000`);
```

**Result:** All parts of the coordinate list generation now use the same `centralMeridian` value.

---

## Data Flow

### **Step 0: Project Setup**

1. User selects central meridian (e.g., Lo 29)
2. `ProjectSetupView` emits setup data:
   ```typescript
   emit('complete', {
     projectName: 'Elon Estates',
     district: 'Gwelo',
     workingDirectory: 'C:/...',
     centralMeridian: 29
   })
   ```
3. `CadastralStandardView` receives and saves:
   ```typescript
   workflowState.projectInfo.centralMeridian = setupData.centralMeridian;
   
   await completeCurrentStep({
     project_name: setupData.projectName,
     district: setupData.district,
     working_directory: setupData.workingDirectory,
     central_meridian: setupData.centralMeridian
   });
   ```
4. Backend saves to database:
   ```sql
   UPDATE survey_projects 
   SET workflow_state = jsonb_set(
     workflow_state, 
     '{step_data,project-setup}', 
     '{"central_meridian": 29, ...}'
   )
   ```

---

### **Step 4: Generate Coordinate List**

1. User clicks "Generate Coordinate List"
2. System determines central meridian:
   ```typescript
   const centralMeridian = workflowState.projectInfo.centralMeridian  // Lo 29 ✅
     ?? selectedProject.value?.central_meridian                       // Fallback
     ?? 31;                                                            // Default
   ```
3. Console output:
   ```
   [CoordinateList] Central Meridian determination:
     - From Step 0 (workflowState.projectInfo): 29
     - From selected project: 29
     - Final value used: 29
   ```
4. Coordinate list PDF is generated with Lo 29

---

### **Workflow State Restoration (Page Refresh)**

1. User refreshes page or returns to workflow
2. `loadWorkflowState` is called
3. **NEW:** Restores `projectInfo.centralMeridian` from database:
   ```typescript
   if (dbState.step_data?.['project-setup']?.central_meridian !== undefined) {
     workflowState.projectInfo.centralMeridian = dbState.step_data['project-setup'].central_meridian;
     console.log(`✅ Restored central meridian: Lo${setupData.central_meridian}`);
   }
   ```
4. `workflowState.projectInfo.centralMeridian` is now available for coordinate list generation

---

## Testing

### **Test Case 1: New Project with Lo 29**

1. Create new project
2. Step 0: Select Lo 29
3. Complete Steps 1-3
4. Step 4: Generate Coordinate List
5. **Expected Console Output:**
   ```
   [CoordinateList] Central Meridian determination:
     - From Step 0 (workflowState.projectInfo): 29
     - From selected project: 29
     - Final value used: 29
   ```
6. **Expected PDF:** "Coordinate System: Lo 29°"

---

### **Test Case 2: Existing Project (Page Refresh)**

1. Open existing project (Lo 27 set in Step 0)
2. Refresh page
3. **Expected Console Output:**
   ```
   ✅ Restored central meridian: Lo27
   ```
4. Navigate to Step 4
5. Generate Coordinate List
6. **Expected Console Output:**
   ```
   [CoordinateList] Central Meridian determination:
     - From Step 0 (workflowState.projectInfo): 27
     - From selected project: 27
     - Final value used: 27
   ```
7. **Expected PDF:** "Coordinate System: Lo 27°"

---

### **Test Case 3: Legacy Project (No Step 0 Data)**

1. Open old project created before Step 0 was added
2. `workflowState.projectInfo.centralMeridian` = `undefined`
3. `selectedProject.value?.central_meridian` = `31` (from database)
4. **Expected Console Output:**
   ```
   [CoordinateList] Central Meridian determination:
     - From Step 0 (workflowState.projectInfo): undefined
     - From selected project: 31
     - Final value used: 31
   ```
5. **Expected PDF:** "Coordinate System: Lo 31°"

---

## Files Modified

1. **`app-frontend/src/composables/useCadastralWorkflow.ts`**
   - Added restoration of `projectInfo` from `project-setup` step data
   - Lines 354-370

2. **`app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue`**
   - Improved central meridian determination with proper priority
   - Added detailed logging
   - Made control point fetching use consistent `centralMeridian` variable
   - Lines 2260-2291

---

## Benefits

✅ **Correct Lo value** - Uses value from Step 0 as intended  
✅ **Persistent** - Survives page refreshes and workflow reloads  
✅ **Debuggable** - Detailed console logging shows exactly which value is used  
✅ **Backwards compatible** - Falls back to project database value for legacy projects  
✅ **Consistent** - All parts of coordinate list generation use same Lo value  

---

## Summary

The central meridian (Lo value) now correctly flows from Step 0 (Project Setup) through the entire workflow:

**Step 0** → Save to `workflowState` + Database  
**Database** → Restore to `workflowState` on reload  
**Step 4** → Use `workflowState` value for coordinate list generation  

The two-step communication is now fully reconciled.
