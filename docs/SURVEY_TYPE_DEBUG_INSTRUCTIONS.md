# Survey Type Debug Instructions

## Current Status
The console shows: `Survey Type: N/A` which means `project.survey_type` is `null` or `undefined` in the database.

## Next Steps to Debug

### 1. Refresh the Page
Refresh your browser to see the new debug logs I just added. You should now see:

```
🔍 [DEBUG] Raw project object from surveyProjects array:
  - project.survey_type: null (or undefined)
  - typeof survey_type: undefined
  - Full project object: { ... }
```

This will show us the EXACT value coming from the database.

### 2. Check Backend Terminal
Look at your **backend terminal** (where you ran `npm run dev`) for these logs:

```
[SurveyProject.findAll] 🔍 Fetching projects...
[SurveyProject.findAll] ✅ Found 2 projects
[SurveyProject.findAll] 📋 Project: "Para1" (ID: 51)
[SurveyProject.findAll]   - Survey Type: subdivision (or N/A)
```

This will tell us if the database actually has the value.

### 3. Check Browser Console
After refresh, look for these logs in browser console (F12):

```
[useSurveyors] 🔍 Fetching survey projects...
[useSurveyors] ✅ Loaded 2 projects
[useSurveyors] 📋 Project 1: "Para1" (ID: 51)
[useSurveyors]   - Survey Type: subdivision (or N/A)
```

This will tell us if the API response includes the value.

### 4. Run Database Query
If both backend and frontend show `N/A`, run this SQL query to check the database:

```sql
SELECT id, name, survey_type, district 
FROM survey_projects 
WHERE name = 'Para1';
```

**Expected Result:**
- If `survey_type` is NULL → Database doesn't have the value (need to update)
- If `survey_type` has a value → Backend is not returning it (API issue)

### 5. Fix Database if NULL
If the database shows NULL, update it:

```sql
UPDATE survey_projects
SET survey_type = 'subdivision'
WHERE name = 'Para1';
```

Then refresh the page and check again.

## What Each Log Tells Us

| Log Location | What It Shows | If N/A Means |
|-------------|---------------|--------------|
| Backend Terminal | Database value | Database has NULL |
| Browser Console (useSurveyors) | API response | Backend not returning it |
| Browser Console (DEBUG) | Frontend object | Frontend not receiving it |
| Browser Console (CadastralStandard) | Workflow state | Frontend not setting it |

## Files to Check

1. **Backend Terminal** - Shows database query results
2. **Browser Console** - Shows API response and frontend state
3. **Database** - Run SQL query to verify actual data

## Quick Fix

If you just want to fix it quickly without debugging:

1. Run this SQL:
   ```sql
   UPDATE survey_projects SET survey_type = 'subdivision' WHERE name = 'Para1';
   ```

2. Refresh the page

3. Survey Type should now populate

## Debug Files Created

- `CHECK_PARA1_DATABASE.sql` - SQL queries to check database
- `DATABASE_RETRIEVAL_LOGGING.md` - Explanation of all logs
- `SURVEY_TYPE_DEBUG_INSTRUCTIONS.md` - This file
