# Area Computation Rename - Migration Guide

**Date:** November 19, 2025  
**Issue:** Renamed "Calculations Part 2" to "Area Computation" - requires data migration

---

## 🔧 **Quick Fix for Users**

If you're seeing errors like:
```
TypeError: Cannot read properties of null (reading 'component')
[Vue Router warn]: uncaught error during route navigation
```

This is because your browser has cached workflow data with the old step name.

### **Solution 1: Clear Browser Data (Recommended)**

1. Open browser DevTools (F12)
2. Go to **Application** tab (Chrome) or **Storage** tab (Firefox)
3. Expand **Local Storage**
4. Click on your site (e.g., `http://localhost:5173`)
5. Find and delete these keys:
   - `selectedProject`
   - `workflowState`
   - Any keys containing `calculations-part2` or `calculations_part2`
6. Refresh the page (F5)

### **Solution 2: Run Console Command**

1. Open browser DevTools (F12)
2. Go to **Console** tab
3. Paste and run:
```javascript
// Clear old workflow data
localStorage.removeItem('selectedProject');
localStorage.removeItem('workflowState');
Object.keys(localStorage).forEach(key => {
  if (key.includes('calculations-part2') || key.includes('calculations_part2')) {
    localStorage.removeItem(key);
  }
});
console.log('✅ Cleared old workflow data. Please refresh the page.');
```
4. Refresh the page (F5)

### **Solution 3: Database Migration (For Admins)**

If you have existing projects in the database with workflow state, run this SQL:

```sql
-- Update workflow_state JSON to rename step
UPDATE survey_projects
SET workflow_state = jsonb_set(
  workflow_state,
  '{current_step}',
  '"area_computation"'::jsonb
)
WHERE workflow_state->>'current_step' = 'calculations-part2';

-- Update completed_steps array
UPDATE survey_projects
SET workflow_state = jsonb_set(
  workflow_state,
  '{completed_steps}',
  (
    SELECT jsonb_agg(
      CASE 
        WHEN elem::text = '"calculations_part2"' THEN '"area_computation"'::jsonb
        ELSE elem
      END
    )
    FROM jsonb_array_elements(workflow_state->'completed_steps') elem
  )
)
WHERE workflow_state->'completed_steps' @> '["calculations_part2"]'::jsonb;

-- Update step_data keys
UPDATE survey_projects
SET workflow_state = (
  SELECT jsonb_object_agg(
    CASE 
      WHEN key = 'calculations_part2' THEN 'area_computation'
      ELSE key
    END,
    value
  )
  FROM jsonb_each(workflow_state->'step_data')
)
WHERE workflow_state->'step_data' ? 'calculations_part2';
```

---

## 📝 **What Changed**

### **Step Identifiers**
- Old: `calculations-part2` (kebab-case) / `calculations_part2` (snake_case)
- New: `area-computation` (kebab-case) / `area_computation` (snake_case)

### **Display Names**
- Old: "Calculations Part 2"
- New: "Area Computation"

### **Files Modified**
- Frontend: 8 files (views, components, services, config)
- Backend: 1 file (survey-projects.js)

### **Database Schema**
- Table: `survey_projects`
- Column: `workflow_state` (JSONB)
- Affected fields:
  - `current_step`
  - `completed_steps[]`
  - `step_data.calculations_part2` → `step_data.area_computation`

---

## ✅ **Verification**

After clearing data, verify the fix:

1. Navigate to **Cadastral Standard** workflow
2. You should see "Area Computation" as Step 5
3. No console errors
4. Workflow progresses normally

---

## 🚨 **For Developers**

If you're still seeing errors after clearing data:

1. **Check router configuration:**
   ```bash
   grep -r "calculations-part2" app-frontend/src/router/
   ```

2. **Check component imports:**
   ```bash
   grep -r "CalculationsPart2View" app-frontend/src/
   ```

3. **Check backend API:**
   ```bash
   grep -r "calculations_part2" app-backend/src/
   ```

4. **Restart dev servers:**
   ```bash
   # Frontend
   cd app-frontend
   npm run dev

   # Backend
   cd app-backend
   npm run dev
   ```

---

## 📞 **Support**

If issues persist:
1. Check browser console for specific error messages
2. Check backend logs for API errors
3. Verify database workflow_state column data
4. Contact development team with error details
