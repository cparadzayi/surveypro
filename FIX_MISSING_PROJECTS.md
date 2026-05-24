# Fix Missing Projects Issue

## Problem
Charles Paradzayi (License: 293) is logged in but the dashboard shows "No Projects Yet" even though he has 4 projects in the database.

## Root Cause
The application uses a new authentication system with the `surveyor_profiles` table, but existing projects are still linked to the old `surveyors` table via the `surveyor_id` column. When the dashboard loads, it queries:

```sql
SELECT * FROM survey_projects 
WHERE surveyor_profile_id = [charles's profile id]
```

But Charles's projects have `surveyor_profile_id = NULL` because they were created before the new system was implemented. They only have `surveyor_id` pointing to the old `surveyors` table.

## Solution
We need to link the projects from the old `surveyor_id` to the new `surveyor_profile_id` by matching on `license_number`.

## How to Fix

### Option 1: Run the fix script (Recommended)

1. Open a terminal in the `app-backend` directory:
   ```bash
   cd c:\mataranyika\SurveyPro-nov-alpha\app-backend
   ```

2. Run the fix for Charles specifically:
   ```bash
   npm run fix:charles
   ```

   OR use the batch file:
   ```bash
   fix-charles.bat
   ```

3. Refresh the dashboard in your browser - Charles should now see his 4 projects!

### Option 2: Run the general fix for all users

If other users are also missing projects, run:
```bash
npm run fix:projects
```

This will fix the linkage for ALL surveyors, not just Charles.

### Option 3: Manual SQL fix

If you prefer to run SQL directly in your database client:

```sql
-- Find Charles's surveyor profile ID
SELECT p.id, p.name, p.license_number
FROM surveyor_profiles p
WHERE p.license_number = '293';

-- Link his projects (replace <profile_id> with the ID from above)
UPDATE survey_projects sp
SET surveyor_profile_id = <profile_id>
FROM surveyors s
WHERE s.id = sp.surveyor_id
  AND s.license_number = '293'
  AND sp.status = 'active';

-- Verify the fix
SELECT sp.id, sp.name
FROM survey_projects sp
WHERE sp.surveyor_profile_id = <profile_id>;
```

## What the Fix Script Does

1. **Finds Charles's profile** in the `surveyor_profiles` table (License: 293)
2. **Locates his projects** that are still linked to the old `surveyors` table
3. **Updates** `survey_projects.surveyor_profile_id` to point to his new profile
4. **Verifies** that all 4 projects are now properly linked
5. **Provides a summary** of what was fixed

## Verification Steps

After running the fix:

1. **Check the terminal output** - it should show:
   ```
   ✅ Charles Paradzayi now has 4 projects:
      1. [Project Name]
      2. [Project Name]
      3. [Project Name]
      4. [Project Name]
   ```

2. **Refresh the dashboard** in your browser (Ctrl+F5 or Cmd+Shift+R)

3. **Verify projects appear** in the "Your Projects" section

4. **Try selecting a project** to ensure it opens correctly

## Technical Details

### Database Schema Changes

The application migrated from:
- **Old**: `survey_projects.surveyor_id` → `surveyors.id`
- **New**: `survey_projects.surveyor_profile_id` → `surveyor_profiles.id`

The `surveyor_profiles` table is integrated with the authentication system (`users` table), while the old `surveyors` table was standalone.

### Why This Happened

When the authentication system was implemented:
1. New `surveyor_profiles` table was created
2. New `users` table was created
3. Existing surveyors were migrated to `surveyor_profiles`
4. BUT existing projects were NOT automatically linked to the new profiles
5. The application code was updated to use `surveyor_profile_id`
6. Old projects with only `surveyor_id` became "invisible"

### Prevention

For new projects, the `POST /survey-projects` endpoint automatically sets `surveyor_profile_id` from the authenticated user, so this issue won't occur for newly created projects.

## Files Involved

- **Fix Script**: `app-backend/scripts/fix-charles-projects.js`
- **Batch File**: `app-backend/fix-charles.bat`
- **General Fix**: `app-backend/scripts/fix-project-linkage.js`
- **Backend Model**: `app-backend/src/models/SurveyProject.js`
- **Backend Routes**: `app-backend/src/routes/survey-projects.js`
- **Frontend Component**: `app-frontend/src/views/DashboardView.vue`

## Troubleshooting

### Still not showing projects?

1. **Check the backend logs** for errors
2. **Verify authentication** - make sure Charles is logged in
3. **Check browser console** for API errors
4. **Run the verify query**:
   ```sql
   SELECT 
     sp.id,
     sp.name,
     sp.surveyor_profile_id,
     p.name as surveyor_name
   FROM survey_projects sp
   LEFT JOIN surveyor_profiles p ON p.id = sp.surveyor_profile_id
   WHERE sp.status = 'active';
   ```

### Projects exist but still NULL profile_id?

The old `surveyors` table might not have a matching entry. Check:
```sql
SELECT * FROM surveyors WHERE license_number = '293';
```

If no match, you'll need to manually set the `surveyor_profile_id`:
```sql
UPDATE survey_projects
SET surveyor_profile_id = <charles_profile_id>
WHERE id IN (<project_id_1>, <project_id_2>, ...);
```

## Need Help?

If the issue persists:
1. Run the fix script with verbose output
2. Check the database manually
3. Review the backend API logs
4. Verify the authentication token is valid
