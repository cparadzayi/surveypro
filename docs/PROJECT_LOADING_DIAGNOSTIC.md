# 🔍 Project Loading Diagnostic Guide

**Issue:** Projects not loading in UI

---

## 🚀 Step 1: Check Database

Run this to see what's in the database:

```bash
cd app-backend
scripts\check-projects.bat
```

**Expected output:**
- Should show projects in `survey_projects` table
- Should show matching `surveyor_profiles`
- Should show no orphaned projects

**If you see orphaned projects**, that's the problem!

---

## 🔍 Step 2: Check Backend Logs

Look for these log messages in your backend console:

```
[GET /survey-projects] Request received from user: charles@example.com
[GET /survey-projects] Looking for profile with user_id: 1
[GET /survey-projects] Profile found: Yes (id: 1)
[SurveyProject.findAll] 🔍 Fetching projects...
[SurveyProject.findAll] - Surveyor Profile ID: 1
[SurveyProject.findAll] ✅ Found X projects
[GET /survey-projects] User charles@example.com (profile_id: 1) has X projects
```

**What to check:**
- ✅ Profile found? (should be "Yes")
- ✅ Number of projects found?
- ❌ Any errors?

---

## 🔍 Step 3: Check Frontend Console

Look for these messages in browser console (F12):

```
[useSurveyors] 🔍 Fetching survey projects...
[useSurveyors] - Surveyor Profile ID: Auto (from auth)
[useSurveyors] - Request URL: /survey-projects
🔑 Token attached to request: /survey-projects
[useSurveyors] ✅ Response received: true
[useSurveyors] ✅ Loaded X projects
```

**What to check:**
- ✅ Response received: true?
- ✅ Number of projects loaded?
- ❌ Any 404 or 500 errors?

---

## 🐛 Common Issues & Fixes

### **Issue 1: No surveyor profile found (404)**

**Symptoms:**
```
[GET /survey-projects] No profile found for user_id X, returning 404
```

**Fix:**
```sql
-- Check if user has a surveyor profile
SELECT u.id, u.email, sp.id as profile_id, sp.name
FROM users u
LEFT JOIN surveyor_profiles sp ON u.id = sp.user_id
WHERE u.email = 'your-email@example.com';
```

If `profile_id` is NULL, you need to complete your profile in the app.

---

### **Issue 2: Projects exist but belong to wrong surveyor**

**Symptoms:**
```
[SurveyProject.findAll] ✅ Found 0 projects
```

But database shows projects exist.

**Fix:**
```sql
-- Check which surveyor owns the projects
SELECT 
  sp.id,
  sp.name as project_name,
  sp.surveyor_profile_id,
  p.name as surveyor_name,
  p.user_id
FROM survey_projects sp
LEFT JOIN surveyor_profiles p ON sp.surveyor_profile_id = p.id;

-- Check your user_id
SELECT id, email FROM users WHERE email = 'your-email@example.com';
```

If projects belong to a different `surveyor_profile_id`, you need to reassign them.

---

### **Issue 3: Orphaned projects (no matching surveyor_profile_id)**

**Symptoms:**
```sql
-- This query returns rows
SELECT * FROM survey_projects sp
LEFT JOIN surveyor_profiles p ON sp.surveyor_profile_id = p.id
WHERE p.id IS NULL;
```

**Fix:**
```sql
-- Option A: Assign orphaned projects to your profile
UPDATE survey_projects
SET surveyor_profile_id = (
  SELECT id FROM surveyor_profiles 
  WHERE user_id = (SELECT id FROM users WHERE email = 'your-email@example.com')
)
WHERE surveyor_profile_id NOT IN (SELECT id FROM surveyor_profiles);

-- Option B: Delete orphaned projects
DELETE FROM survey_projects
WHERE surveyor_profile_id NOT IN (SELECT id FROM surveyor_profiles);
```

---

### **Issue 4: Frontend not receiving data**

**Symptoms:**
- Backend logs show projects found
- Frontend shows 0 projects

**Check:**
```javascript
// In browser console, check the response
// Look for the API call to /survey-projects
// Click on it in Network tab
// Check the Response

// Should see:
{
  "ok": true,
  "projects": [
    { "id": 1, "name": "Project Name", ... }
  ]
}
```

**Fix:** Check if `response.data.projects` is being set correctly in `useSurveyors.ts`

---

### **Issue 5: Projects array is undefined**

**Symptoms:**
```
Cannot read property 'length' of undefined
```

**Fix:**
```typescript
// In useSurveyors.ts, line 170
if (response.data.ok && response.data.projects) {
  surveyProjects.value = response.data.projects || []
  console.log(`[useSurveyors] ✅ Loaded ${response.data.projects.length} projects`)
}
```

---

## 🔧 Quick Fix Script

If projects are orphaned, run this:

```sql
-- Fix orphaned projects for Charles Makonese
UPDATE survey_projects
SET surveyor_profile_id = (
  SELECT id FROM surveyor_profiles 
  WHERE name = 'Charles Makonese'
  LIMIT 1
)
WHERE surveyor_profile_id IS NULL 
   OR surveyor_profile_id NOT IN (SELECT id FROM surveyor_profiles);
```

---

## ✅ Verification Steps

After fixing:

1. **Restart backend**
   ```bash
   cd app-backend
   npm start
   ```

2. **Clear browser cache** (Ctrl+Shift+Delete)

3. **Reload frontend** (Ctrl+F5)

4. **Check console logs**
   - Backend should show: `Found X projects`
   - Frontend should show: `Loaded X projects`

5. **Check UI**
   - Projects should appear in dropdown/list

---

## 📊 Expected Flow

```
User logs in
  ↓
Frontend: GET /auth/me
  ↓
Backend: Returns user + surveyor profile
  ↓
Frontend: GET /survey-projects
  ↓
Backend: Finds surveyor_profile_id from user_id
  ↓
Backend: Queries survey_projects WHERE surveyor_profile_id = X
  ↓
Backend: Returns { ok: true, projects: [...] }
  ↓
Frontend: Sets surveyProjects.value = response.data.projects
  ↓
UI: Displays projects
```

---

## 🆘 Still Not Working?

Run the diagnostic script and share the output:

```bash
cd app-backend
scripts\check-projects.bat > project-diagnostic.txt
```

Then check:
1. How many projects exist?
2. Do they have valid `surveyor_profile_id`?
3. Does your user have a surveyor profile?
4. Do the IDs match up?

---

**Most common fix:** Orphaned projects need to be reassigned to a valid surveyor profile.
