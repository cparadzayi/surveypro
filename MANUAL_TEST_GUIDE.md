# Manual Test Guide - Cadastral Workflow (Phases 1 & 2)

## 🎯 What We're Testing

✅ **Phase 1:** Database persistence (auto-save, session resume)  
✅ **Phase 2:** Workflow configuration & visual dashboard  
⏳ **Phase 3:** Full UI integration (next step)

---

## ✅ Pre-Test Verification

### 1. Check Migrations Applied

```bash
cd app-backend
psql -U postgres -d surveypro_v1 -c "SELECT * FROM migrations ORDER BY id DESC LIMIT 3;"
```

**Should see:**
- Migration 023 (workflow_state column)
- Migration 022 (removed surveyor_id)

### 2. Check Backend Running

Visit: http://localhost:3050/api/health

**Should return:** `{ "status": "ok" }`

### 3. Check Frontend Running

Visit: http://localhost:5173/

**Should see:** Login page or Dashboard

---

## 📋 Manual Test Scenarios

### Test 1: Backend API - Workflow Endpoints

#### 1.1 Open Developer Tools
- Press F12 in browser
- Go to Console tab

#### 1.2 Get Auth Token
```javascript
// In console:
localStorage.getItem('token')
// Copy the token value
```

#### 1.3 Test GET Workflow Endpoint

Open new browser tab and paste:
```
http://localhost:3050/api/survey-projects/YOUR_PROJECT_ID/workflow
```

Or use console:
```javascript
fetch('/api/survey-projects/1/workflow', {
  headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
})
.then(r => r.json())
.then(d => console.log('Workflow state:', d))
```

**Expected Result:**
```javascript
{
  "ok": true,
  "workflow_state": {
    "completed_steps": [],
    "current_step": "import_csv",
    "step_data": {},
    "generated_documents": {},
    "can_finalize": false
  }
}
```

✅ **PASS** if you see the structure above  
❌ **FAIL** if you get 404 or 500 error

---

### Test 2: Frontend Composable - Database Persistence

#### 2.1 Navigate to Cadastral Standard
- Log in to SurveyPro
- Click "Cadastral Standard" module
- Open browser console (F12)

#### 2.2 Check Auto-Link
**Look for console message:**
```
✅ Workflow linked to project X
```

✅ **PASS** if you see this message  
❌ **FAIL** if no message appears

#### 2.3 Import CSV Test

**Steps:**
1. Click "Choose File" or upload CSV
2. Select a CSV file with coordinates
3. Watch console

**Expected Console Output:**
```
💾 Saving workflow state: step=csv-import, action=complete
✅ Workflow state saved successfully
```

✅ **PASS** if coordinates load AND console shows save messages  
❌ **FAIL** if no save messages appear

#### 2.4 Test Persistence (Critical!)

**Steps:**
1. Import CSV (coordinates should appear)
2. Press F5 to refresh page
3. Wait for page to reload
4. Check console

**Expected Console Output:**
```
📥 Loading workflow state for project X
✅ Restored N imported points
✅ Workflow state loaded: current step = csv-import
✅ Completed steps: import_csv
```

**Expected UI:**
- Coordinates are still displayed
- No need to re-import

✅ **PASS** if data persists after refresh  
❌ **FAIL** if coordinates disappear after refresh

---

### Test 3: Workflow Configuration Functions

#### 3.1 Test in Browser Console

Navigate to Cadastral Standard, then in console:

```javascript
// Import functions
import { canAccessStep, getStepStatus, getWorkflowProgress } from './src/config/cadastralWorkflow.ts'

// Test 1: Can access first step with no prerequisites
const test1 = canAccessStep('import_csv', [])
console.log('Test 1 - Access import_csv:', test1)
// Expected: { allowed: true }

// Test 2: Cannot access step 2 without completing step 1
const test2 = canAccessStep('field_book', [])
console.log('Test 2 - Access field_book without prereqs:', test2)
// Expected: { allowed: false, reason: "Please complete: Import CSV", missingSteps: ["import_csv"] }

// Test 3: Can access step 2 after completing step 1
const test3 = canAccessStep('field_book', ['import_csv'])
console.log('Test 3 - Access field_book after import:', test3)
// Expected: { allowed: true }

// Test 4: Calculate progress
const progress = getWorkflowProgress(['import_csv', 'field_book'])
console.log('Test 4 - Progress with 2/7 steps:', progress + '%')
// Expected: 29% (2 out of 7 ≈ 29%)
```

✅ **PASS** if all tests return expected values  
❌ **FAIL** if functions throw errors or return wrong values

---

### Test 4: Database Verification

#### 4.1 Check workflow_state Column

```bash
cd app-backend
psql -U postgres -d surveypro
```

```sql
-- Check if column exists
\d survey_projects

-- Should see: workflow_state | jsonb |

-- View actual data
SELECT id, name, workflow_state 
FROM survey_projects 
WHERE id = 1;
```

**Expected Result:**
```json
{
  "completed_steps": ["import_csv"],
  "current_step": "csv-import",
  "step_data": {
    "import_csv": {
      "coordinate_count": 45,
      "completed_at": "2025-11-11T18:30:00.000Z",
      "points": [...]
    }
  }
}
```

✅ **PASS** if workflow_state contains data  
❌ **FAIL** if workflow_state is null or empty

---

### Test 5: Workflow Dashboard Component (Visual Test)

**Note:** This requires integration (Phase 3), but we can test the component exists:

```javascript
// In browser console at Cadastral Standard page:
import WorkflowDashboard from './src/components/cadastral/WorkflowDashboard.vue'
console.log('Dashboard component:', WorkflowDashboard)
```

✅ **PASS** if component imports without error  
❌ **FAIL** if module not found

---

## 📊 Test Results Checklist

| Test | Status | Notes |
|------|--------|-------|
| Backend health check | ⬜ | http://localhost:3050/api/health |
| GET /workflow endpoint | ⬜ | Returns workflow_state |
| PATCH /workflow endpoint | ⬜ | Updates state |
| Frontend auto-link | ⬜ | Console shows "linked to project" |
| Auto-save on import | ⬜ | Console shows "saving" message |
| **Persistence test** | ⬜ | **CRITICAL: Data survives refresh** |
| Workflow validation | ⬜ | canAccessStep works |
| Progress calculation | ⬜ | getWorkflowProgress works |
| Database column | ⬜ | workflow_state exists |
| Dashboard component | ⬜ | Component file exists |

---

## 🐛 Troubleshooting

### Problem: "Cannot find module cadastralWorkflow"
**Solution:** 
```bash
cd app-frontend
npm run dev
# Vite should hot-reload the new files
```

### Problem: "workflow_state column doesn't exist"
**Solution:**
```bash
cd app-backend
npm run migrate
# Check output for "Applied 023.do.sql"
```

### Problem: "No 'linked to project' message"
**Solution:** Check that:
1. You have a project selected
2. localStorage has 'selectedProject'
3. The onMounted hook is running

### Problem: "Data doesn't persist after refresh"
**Solution:** Check:
1. Is `projectId.value` set?
2. Check network tab for PATCH requests
3. Check backend logs for save errors
4. Verify database has workflow_state data

---

## ✅ Success Criteria

**Phase 1 & 2 are working if:**

1. ✅ You can import coordinates
2. ✅ Console shows "💾 Saving workflow state"
3. ✅ You refresh the page (F5)
4. ✅ Coordinates are still there
5. ✅ Console shows "📥 Loading workflow state"
6. ✅ Database has workflow_state data
7. ✅ Workflow functions execute without errors

---

## 🎯 Next Step: Phase 3 Integration

Once all tests pass, we'll integrate the WorkflowDashboard component into the UI to get the visual indicators and click-to-navigate features.

**Current Status:**
- ✅ Backend API ready
- ✅ Frontend persistence ready
- ✅ Workflow config ready
- ✅ Dashboard component ready
- ⏳ UI integration pending (5 minutes of work)

---

## 📝 Test Execution Log

**Date:** _____________  
**Tester:** _____________  
**Environment:** Development  
**Browser:** _____________  

**Results:**
- Backend tests: ⬜ PASS ⬜ FAIL
- Frontend tests: ⬜ PASS ⬜ FAIL  
- Persistence test: ⬜ PASS ⬜ FAIL
- Database tests: ⬜ PASS ⬜ FAIL

**Overall Status:** ⬜ READY FOR PHASE 3 ⬜ NEEDS FIXES

**Notes:**
_________________________________________________________________
_________________________________________________________________
