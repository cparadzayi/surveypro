# Project Setup Persistence Fix

## Problem Identified

Project setup data (datum, instruments, designation, township) was **not persisting** to the database.

### Root Cause

1. **Missing Database Columns:** The `survey_projects` table in surveyor schemas did NOT have columns for:
   - `datum`
   - `instruments`
   - `designation`
   - `township`

2. **Backend Model Restriction:** The `SurveyProject.update()` method had an `allowedColumns` whitelist that excluded these fields, causing them to be silently skipped during updates.

3. **Frontend Not Sending Datum:** The frontend was not including `datum` in the project update payload.

---

## Solution Implemented

### 1. **Database Migration** ✅

**File:** `app-backend/migrations/061_add_missing_project_fields.sql`

**What it does:**
- Adds 4 missing columns to `survey_projects` table in ALL surveyor schemas:
  - `datum VARCHAR(50) DEFAULT 'hartebeesthoek94'`
  - `instruments TEXT`
  - `designation TEXT`
  - `township VARCHAR(100)`
- Handles both public schema (legacy) and surveyor schemas
- Idempotent (safe to run multiple times)

**Run this:**
```bash
psql -U postgres -d surveypro_db -f app-backend/migrations/061_add_missing_project_fields.sql
```

### 2. **Backend Model Update** ✅

**File:** `app-backend/src/models/SurveyProject.js` (line 168-172)

**Change:**
```javascript
// BEFORE
const allowedColumns = [
  'name', 'client_name', 'survey_type', 'survey_date', 'district',
  'central_meridian', 'working_directory', 'status', 'metadata', 
  'workflow_state', 'last_used'
]

// AFTER
const allowedColumns = [
  'name', 'client_name', 'survey_type', 'survey_date', 'district',
  'central_meridian', 'working_directory', 'status', 'metadata', 
  'workflow_state', 'last_used', 'datum', 'instruments', 'designation', 'township'
]
```

**Result:** Backend now accepts and saves these fields during project updates.

### 3. **Frontend Update** ✅

**File:** `app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue` (line 2055-2065)

**Change:**
```javascript
// BEFORE
const updateSuccess = await updateSurveyProject(selectedProjectId.value, {
  surveyType: setupData.surveyType,
  township: setupData.township,
  district: setupData.district,
  surveyDate: setupData.surveyDate,
  designation: setupData.surveyOf,
  instruments: setupData.instruments,
  workingDirectory: setupData.workingDirectory,
  centralMeridian: setupData.loZone
});

// AFTER
const updateSuccess = await updateSurveyProject(selectedProjectId.value, {
  surveyType: setupData.surveyType,
  township: setupData.township,
  district: setupData.district,
  surveyDate: setupData.surveyDate,
  designation: setupData.surveyOf,
  instruments: setupData.instruments,
  workingDirectory: setupData.workingDirectory,
  centralMeridian: setupData.loZone,
  datum: setupData.datum  // ✅ NOW INCLUDED
});
```

**Result:** Frontend now sends datum to backend for persistence.

---

## What Gets Saved Now

When you complete Project Setup, the following data is now **permanently saved** to the database:

| Field | Database Column | Example Value |
|-------|----------------|---------------|
| Survey Type | `survey_type` | "Cadastral Survey" |
| Township | `township` | "Gwelo" |
| District | `district` | "Midlands" |
| Survey Date | `survey_date` | "2025-12-13" |
| Survey Of | `designation` | "Elon Estates Subdivision" |
| Instruments | `instruments` | "Leica TS16, Trimble R12" |
| Lo Zone | `central_meridian` | 31 |
| **Datum** | **`datum`** | **"hartebeesthoek94"** ✅ |
| Working Directory | `working_directory` | "Documents/SurveyPro/..." |

---

## Testing Steps

### 1. **Run Migration**
```bash
psql -U postgres -d surveypro_db -f app-backend/migrations/061_add_missing_project_fields.sql
```

**Expected output:**
```
Processing schema: surveyor_john_doe
  ✅ Added datum column to surveyor_john_doe.survey_projects
  ✅ Added instruments column to surveyor_john_doe.survey_projects
  ✅ Added designation column to surveyor_john_doe.survey_projects
  ✅ Added township column to surveyor_john_doe.survey_projects
...
Migration 061 complete!
```

### 2. **Restart Backend**
```bash
cd app-backend
npm run dev
```

### 3. **Restart Frontend**
```bash
cd app-frontend
npm run dev
```

### 4. **Test Persistence**

**A. Create New Project:**
1. Go to Cadastral Standard → Project Setup
2. Fill in all fields:
   - Survey Type: "Cadastral Survey"
   - Township: "Test Township"
   - District: "Test District"
   - Survey Date: Today
   - Survey Of: "Test Survey"
   - Instruments: "Test Instruments"
   - Lo Zone: 31
   - **Datum: Hartebeesthoek94** (should be pre-selected)
3. Click "Complete Setup"
4. **Verify in console:** Should see "Project record updated in database"

**B. Verify Data Saved:**
```sql
-- Check if data was saved
SELECT 
  name,
  survey_type,
  township,
  district,
  designation,
  instruments,
  central_meridian,
  datum
FROM survey_projects
WHERE name = 'Your Project Name';
```

**Expected result:**
- All fields should have values
- `datum` should be `'hartebeesthoek94'`

**C. Reload Page and Check Persistence:**
1. Refresh the browser
2. Select the same project
3. Go back to Project Setup
4. **All fields should be populated** with saved values ✅

---

## Verification Queries

### Check if columns exist:
```sql
-- For your surveyor schema (replace 'surveyor_john_doe' with your schema)
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'surveyor_john_doe'  -- Your schema name
  AND table_name = 'survey_projects'
  AND column_name IN ('datum', 'instruments', 'designation', 'township')
ORDER BY column_name;
```

**Expected result:** 4 rows showing all columns exist

### Check saved project data:
```sql
-- See all project setup data
SELECT 
  id,
  name,
  survey_type,
  township,
  district,
  survey_date,
  designation,
  instruments,
  central_meridian,
  datum,
  working_directory
FROM survey_projects
ORDER BY created_at DESC
LIMIT 5;
```

---

## Files Modified

1. ✅ **Migration:** `app-backend/migrations/061_add_missing_project_fields.sql` (NEW)
2. ✅ **Backend Model:** `app-backend/src/models/SurveyProject.js` (line 168-172)
3. ✅ **Frontend Workflow:** `app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue` (line 2064)

---

## Summary

**Before Fix:**
- ❌ Datum, instruments, designation, township not saved
- ❌ Data lost on page refresh
- ❌ Had to re-enter setup data every time

**After Fix:**
- ✅ All project setup data persists to database
- ✅ Data survives page refresh
- ✅ Datum defaults to Hartebeesthoek94
- ✅ Can reload project and continue workflow

---

## Next Steps

1. Run migration 061
2. Restart backend and frontend servers
3. Test with a new project
4. Verify data persists after page refresh
5. Continue with QGIS testing

**Status:** Ready to test! 🎉
