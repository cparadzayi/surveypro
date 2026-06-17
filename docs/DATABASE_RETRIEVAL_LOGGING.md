# Database Retrieval Console Logging

## Overview
Added comprehensive console logging to track the "Para1" project (and all projects) as they are retrieved from the database, both on the backend and frontend.

## Backend Logging

### File: `app-backend/src/models/SurveyProject.js`

#### `findAll()` Method
Logs when fetching all projects for a surveyor:

```
[SurveyProject.findAll] 🔍 Fetching projects...
[SurveyProject.findAll] - Surveyor Profile ID: 5
[SurveyProject.findAll] ✅ Found 2 projects
[SurveyProject.findAll] 📋 Project: "Para1" (ID: 51)
[SurveyProject.findAll]   - Survey Type: subdivision
[SurveyProject.findAll]   - District: Shabani
[SurveyProject.findAll]   - Survey Date: 2025-11-18
[SurveyProject.findAll]   - Working Directory: Documents/SurveyPro/Projects/Para1_Shabani_2025-11-22
[SurveyProject.findAll]   - Designation: LOTS 1 - 12 OF LOT 84 OF SUBDIVISION B OF SUBDIVISION E OF SHABANI MINE
[SurveyProject.findAll]   - Central Meridian: 31
[SurveyProject.findAll]   - Control Points: 3 points
```

#### `findById()` Method
Logs when fetching a specific project by ID:

```
[SurveyProject.findById] 🔍 Fetching project by ID: 51
[SurveyProject.findById] ✅ Found project: "Para1"
[SurveyProject.findById]   - Survey Type: subdivision
[SurveyProject.findById]   - District: Shabani
[SurveyProject.findById]   - Survey Date: 2025-11-18
[SurveyProject.findById]   - Working Directory: Documents/SurveyPro/Projects/Para1_Shabani_2025-11-22
[SurveyProject.findById]   - Designation: LOTS 1 - 12 OF LOT 84 OF SUBDIVISION B OF SUBDIVISION E OF SHABANI MINE
[SurveyProject.findById]   - Central Meridian: 31
[SurveyProject.findById]   - Control Points: 3 points
```

## Frontend Logging

### File: `app-frontend/src/composables/useSurveyors.ts`

#### `fetchSurveyProjects()` Function
Logs when fetching projects from the API:

```
[useSurveyors] 🔍 Fetching survey projects...
[useSurveyors] - Surveyor Profile ID: Auto (from auth)
[useSurveyors] - Request URL: /survey-projects
[useSurveyors] ✅ Response received: true
[useSurveyors] ✅ Loaded 2 projects
[useSurveyors] 📋 Project 1: "Para1" (ID: 51)
[useSurveyors]   - Survey Type: subdivision
[useSurveyors]   - District: Shabani
[useSurveyors]   - Survey Date: 2025-11-18
[useSurveyors]   - Working Directory: Documents/SurveyPro/Projects/Para1_Shabani_2025-11-22
[useSurveyors]   - Designation: LOTS 1 - 12 OF LOT 84 OF SUBDIVISION B OF SUBDIVISION E OF SHABANI MINE
[useSurveyors]   - Central Meridian: 31
[useSurveyors]   - Control Points: 3
```

### File: `app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue`

#### `onProjectChange()` Function (Already Added)
Logs when a project is selected:

```
[CadastralStandard] Project "Para1" selected
  - Project ID: 51
  - Survey Type: subdivision
  - Central Meridian: Lo31
  - Control Points: 3 selected
```

## Complete Data Flow Tracking

When you select "Para1" project, you'll see this complete flow in the console:

### 1. Backend Database Query
```
[SurveyProject.findAll] 🔍 Fetching projects...
[SurveyProject.findAll] - Surveyor Profile ID: 5
[SurveyProject.findAll] ✅ Found 2 projects
[SurveyProject.findAll] 📋 Project: "Para1" (ID: 51)
[SurveyProject.findAll]   - Survey Type: subdivision
[SurveyProject.findAll]   - District: Shabani
...
```

### 2. Frontend API Response
```
[useSurveyors] 🔍 Fetching survey projects...
[useSurveyors] ✅ Response received: true
[useSurveyors] ✅ Loaded 2 projects
[useSurveyors] 📋 Project 1: "Para1" (ID: 51)
[useSurveyors]   - Survey Type: subdivision
...
```

### 3. Project Selection
```
[CadastralStandard] Project "Para1" selected
  - Project ID: 51
  - Survey Type: subdivision
  - Central Meridian: Lo31
  - Control Points: 3 selected
```

## What to Look For

### ✅ Success Indicators
- All three log sections appear
- Survey Type shows "subdivision" (not N/A)
- All fields have values (not N/A)
- Control Points shows 3 points

### ❌ Problem Indicators
- Survey Type shows "N/A" → Database doesn't have the value
- Missing backend logs → Database query failing
- Missing frontend logs → API request failing
- Missing selection logs → Frontend not loading the data

## Testing

1. **Open Browser Console** (F12)
2. **Navigate to Cadastral Standard** workflow
3. **Select "Para1"** from project dropdown
4. **Check console** for all three log sections
5. **Verify** Survey Type field is populated in the UI

## Files Modified

- ✅ `app-backend/src/models/SurveyProject.js` - Added logging to `findAll()` and `findById()`
- ✅ `app-frontend/src/composables/useSurveyors.ts` - Added logging to `fetchSurveyProjects()`
- ✅ `app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue` - Already had logging in `onProjectChange()`

## Next Steps

If Survey Type still shows as empty after these logs:

1. Check backend logs to see if `survey_type` is NULL in database
2. Check frontend logs to see if API response includes `survey_type`
3. Check selection logs to see if `workflowState.projectInfo.surveyType` is being set
4. Verify the database actually has the value stored
