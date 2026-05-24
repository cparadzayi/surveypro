# Project Information Auto-Load Fix

## Issue
When selecting a project in the Cadastral Standard workflow, the **Survey Type** field was not being auto-populated from the database, even though other fields (district, survey date, etc.) were loading correctly.

## Root Cause
The `onProjectChange()` function in `CadastralStandardView.vue` was missing the code to load `survey_type` from the project and set it to `workflowState.projectInfo.surveyType`.

## Solution
Added the missing survey_type loading logic to the `onProjectChange()` function:

```typescript
if (project.survey_type) {
  workflowState.projectInfo.surveyType = project.survey_type;
}
```

## Changes Made

### File: `app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue`

**Lines 3685-3687** (Added):
```typescript
if (project.survey_type) {
  workflowState.projectInfo.surveyType = project.survey_type;
}
```

**Line 3713** (Added console log):
```typescript
console.log(`  - Survey Type: ${project.survey_type || 'N/A'}`);
```

## Verification

After this fix, when you select a project:

1. ✅ Survey Type field will auto-populate
2. ✅ Console will show: `Survey Type: subdivision` (or whatever type is stored)
3. ✅ All other project fields continue to work (district, survey date, working directory, etc.)

## Testing

1. Select project "Para1" in the Cadastral Standard workflow
2. Check the **Survey Information** section
3. Verify **Survey Type** dropdown shows the correct value (e.g., "Subdivision")
4. Check browser console for log: `Survey Type: subdivision`

## Related Fields That Were Already Working

- ✅ Survey Date → `workflowState.surveyorInfo.surveyDate`
- ✅ Survey Of (Designation) → `workflowState.surveyorInfo.surveyOf`
- ✅ District → `workflowState.projectInfo.district`
- ✅ Instruments → `workflowState.surveyorInfo.instruments`
- ✅ Working Directory → `workflowState.projectInfo.workingDirectory`
- ✅ Project Name → `workflowState.projectInfo.name`
- ✅ Central Meridian → `workflowState.projectInfo.centralMeridian`
- ✅ Control Points → `workflowState.projectInfo.controlPointIds`

## Database Schema

The `survey_type` field exists in the `survey_projects` table and is correctly:
- ✅ Stored when creating projects
- ✅ Returned by the backend API
- ✅ Included in the `SurveyProject` interface

The only missing piece was the frontend loading logic, which is now fixed.
