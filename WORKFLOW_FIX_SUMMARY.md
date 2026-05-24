# Cadastral Workflow Fix Summary
**Date:** December 9, 2025  
**Issue:** Workflow state not persisting, preventing step progression

---

## 🔍 Root Causes Identified

### 1. Missing Database Columns ❌
The surveyor schema `survey_projects` tables are missing:
- `workflow_state` (JSONB) - stores workflow progress
- `last_used` (TIMESTAMP) - tracks recent projects

**Error in logs:**
```
column "workflow_state" of relation "survey_projects" does not exist
```

### 2. Wrong Database Connection (FIXED ✅)
The PATCH `/workflow` route was using `fastify.pg.query` instead of the schema-aware `db` connection, causing it to query the wrong schema.

**Fixed in:** `app-backend/src/routes/survey-projects.js` line 462

---

## ✅ Fixes Applied

### Fix 1: Updated Backend Route
**File:** `app-backend/src/routes/survey-projects.js`

Changed workflow UPDATE from:
```javascript
const result = await fastify.pg.query(...)  // ❌ Wrong - queries public schema
```

To:
```javascript
const result = await db.query(...)  // ✅ Correct - queries surveyor schema
```

### Fix 2: Updated Migration File
**File:** `app-backend/migrations/040.do.sql`

Added missing columns to future surveyor schemas:
```sql
workflow_state JSONB DEFAULT '{"completed_steps": [], "current_step": "project-setup", ...}'::jsonb,
last_used TIMESTAMP,
```

---

## 🚀 Required Action: Add Columns to Existing Schemas

### Option 1: Run Batch File (Easiest)
Double-click: `add-workflow-columns.bat`

This will:
1. Add the missing columns
2. Verify they were added
3. Show current projects

### Option 2: Run SQL Manually
Open pgAdmin or psql and run:

```sql
-- Add columns to surveyor_kuziva_paradzayi schema
ALTER TABLE surveyor_kuziva_paradzayi.survey_projects 
ADD COLUMN IF NOT EXISTS workflow_state JSONB 
  DEFAULT '{"completed_steps": [], "current_step": "project-setup", "step_data": {}, "generated_documents": {}, "can_finalize": false}'::jsonb,
ADD COLUMN IF NOT EXISTS last_used TIMESTAMP;

-- Verify
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'surveyor_kuziva_paradzayi' 
  AND table_name = 'survey_projects' 
  AND column_name IN ('workflow_state', 'last_used');

-- Check projects
SELECT id, name, workflow_state->>'current_step' as current_step
FROM surveyor_kuziva_paradzayi.survey_projects
ORDER BY id;
```

---

## 🎯 Expected Results After Fix

Once columns are added:

1. ✅ **Project Setup** → Saves completion state
2. ✅ **Control Point Selection** → Becomes accessible
3. ✅ **All Workflow Steps** → Progress persists
4. ✅ **Step Navigation** → Works seamlessly
5. ✅ **Workflow State** → Survives page refreshes

---

## 📊 Additional Issues Found (Lower Priority)

### Issue: 500 Errors on Spatial Feature Import
**Symptom:** All 298 points failed to import to spatial layer  
**Status:** Needs investigation of `/spatial/layers/:id/features` route

### Issue: 409 Conflict on Batch Coordinate Import
**Symptom:** Duplicate entry error  
**Status:** Likely duplicate prevention working as intended

---

## 🔧 Files Modified

1. ✅ `app-backend/src/routes/survey-projects.js` (line 462)
2. ✅ `app-backend/migrations/040.do.sql` (lines 58-59)
3. 📄 `add-workflow-columns.bat` (NEW - run this!)
4. 📄 `add-workflow-state-column.sql` (NEW - alternative)

---

## ✨ Next Steps

1. **Run** `add-workflow-columns.bat` to add missing columns
2. **Restart** backend server (should auto-restart)
3. **Test** workflow progression:
   - Complete Project Setup
   - Navigate to Control Point Selection
   - Verify state persists
4. **Report** if issues persist

---

## 📝 Technical Notes

### Why This Happened
The migration `040.do.sql` created surveyor schema tables without `workflow_state` and `last_used` columns, but the application code expected them. The public schema likely has these columns, but surveyor schemas don't.

### Schema-Per-Surveyor Model
- Each surveyor has isolated schema: `surveyor_[username]`
- Tables: `survey_projects`, `coordinate_points`, `land_parcels`, etc.
- Schema-aware connection sets `search_path` dynamically
- No `surveyor_profile_id` needed (implicit from schema)

### Workflow State Structure
```json
{
  "completed_steps": ["project-setup", "control-point-selection"],
  "current_step": "csv-import",
  "step_data": {
    "project-setup": { ... },
    "control-point-selection": { ... }
  },
  "generated_documents": {},
  "can_finalize": false
}
```

---

**Status:** 🟡 Awaiting database column addition  
**Priority:** 🔴 Critical - blocks all workflow progression
