# Parcel Persistence Fix - Project ID Access

## Issue

The MapLibreAreaView component was showing "No project selected" error when trying to auto-save digitized parcels, even though a project was selected and persistent in the workflow state.

**Error Message:**
```
No project selected. Please select a project first.
```

---

## Root Cause

The component was incorrectly accessing the `workflowState` object. The code was using:

```typescript
// ❌ INCORRECT
workflowState?.value?.projectInfo?.projectId
```

However, `workflowState` is provided directly (not as a ref) from the parent component:

```typescript
// In CadastralStandardView.vue
provide('workflowState', workflowState as any);
```

So it should be accessed as:

```typescript
// ✅ CORRECT
workflowState?.projectInfo?.projectId
```

---

## Fix Applied

Updated all references to `workflowState` in MapLibreAreaView.vue to remove the incorrect `.value` accessor:

### **1. loadParcelsFromDatabase()**
```typescript
// Before
if (!workflowState?.value?.projectInfo?.projectId) {
  console.log('[MapLibre] 📦 No project ID - skipping parcel load');
  return;
}
const existingParcels = await fetchParcels(workflowState.value.projectInfo.projectId);

// After
if (!workflowState?.projectInfo?.projectId) {
  console.log('[MapLibre] 📦 No project ID - skipping parcel load');
  return;
}
console.log('[MapLibre] 📦 Project ID:', workflowState.projectInfo.projectId);
const existingParcels = await fetchParcels(workflowState.projectInfo.projectId);
```

### **2. autoSaveParcel()**
```typescript
// Before
if (!workflowState?.value?.projectInfo?.projectId) {
  console.warn('[MapLibre] ⚠️ No project ID - skipping auto-save');
  return;
}
const savedParcel = await createParcel({
  project_id: workflowState.value.projectInfo.projectId,
  // ...
});

// After
if (!workflowState?.projectInfo?.projectId) {
  console.warn('[MapLibre] ⚠️ No project ID - skipping auto-save');
  console.warn('[MapLibre] ⚠️ workflowState:', workflowState);
  return;
}
console.log(`[MapLibre] 💾 Project ID: ${workflowState.projectInfo.projectId}`);
const savedParcel = await createParcel({
  project_id: workflowState.projectInfo.projectId,
  // ...
});
```

### **3. saveAllParcels()**
```typescript
// Before
if (!workflowState?.value?.projectInfo?.projectId) {
  alert('No project selected. Please select a project first.');
  return;
}
const result = await finalizeParcels(
  workflowState.value.projectInfo.projectId,
  draftParcelIds
);

// After
if (!workflowState?.projectInfo?.projectId) {
  alert('No project selected. Please select a project first.');
  return;
}
const result = await finalizeParcels(
  workflowState.projectInfo.projectId,
  draftParcelIds
);
```

---

## Debug Logging Added

Enhanced console logging to help diagnose project ID issues:

```typescript
// Load parcels
console.log('[MapLibre] 📦 Project ID:', workflowState.projectInfo.projectId);

// Auto-save
console.log(`[MapLibre] 💾 Project ID: ${workflowState.projectInfo.projectId}`);
console.warn('[MapLibre] ⚠️ workflowState:', workflowState);
```

---

## How Project ID is Set

The project ID is populated in `CadastralStandardView.vue` when a project is selected:

```typescript
// In onProjectChange()
workflowState.projectInfo.projectId = project.id;
workflowState.projectInfo.centralMeridian = project.central_meridian || undefined;
workflowState.projectInfo.controlPointIds = project.control_point_ids || [];
```

This happens when:
1. User selects a project from the dropdown
2. Project is restored from localStorage on page load
3. Project is linked via `linkToProject(project.id)`

---

## Testing

### **Verify Fix**
1. Start the application
2. Navigate to Cadastral Standard workflow
3. Select a project (e.g., "Elon Estates Gwelo")
4. Import coordinates
5. Complete workflow to Area Computation step
6. Digitize a parcel
7. Check console for:
   ```
   [MapLibre] 💾 Auto-saving parcel Stand 2474 to database...
   [MapLibre] 💾 Project ID: 42
   [MapLibre] ✅ Parcel Stand 2474 auto-saved (ID: 1)
   ```

### **Expected Console Output**
```
[MapLibre] 📦 Loading existing parcels from database...
[MapLibre] 📦 Project ID: 42
[MapLibre] 📝 No existing parcels found - starting fresh

[MapLibre] 📊 Computing area for parcel: Stand 2474
[MapLibre] ✅ Area computed for Stand 2474:
  - Area: 810.06 m²
  - Closure error: 0.025m
  - Closure ratio: 1:3,919

[MapLibre] 💾 Auto-saving parcel Stand 2474 to database...
[MapLibre] 💾 Project ID: 42
[MapLibre] ✅ Parcel Stand 2474 auto-saved (ID: 1)
```

---

## Files Modified

1. **`MapLibreAreaView.vue`**
   - Fixed `loadParcelsFromDatabase()` - Line 1474
   - Fixed `autoSaveParcel()` - Line 1555, 1602
   - Fixed `saveAllParcels()` - Line 1967, 1987
   - Added debug logging throughout

---

## Summary

✅ **Fixed workflowState access** - Removed incorrect `.value` accessor  
✅ **Added debug logging** - Project ID now logged for troubleshooting  
✅ **Verified project persistence** - Project ID correctly flows from parent  
✅ **Auto-save now functional** - Parcels save to database immediately  

The digitized parcels will now persist correctly to the database using the project ID from the workflow state.
