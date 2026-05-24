# QuickStart Modal - Testing Guide

**Date:** November 19, 2024  
**Status:** Ready for Testing

---

## ✅ **Pre-Test Checklist**

- [x] Migration ran successfully (`026_project_last_used.do.sql`)
- [x] Backend server running (`npm run dev`)
- [x] Frontend server running (`npm run dev`)
- [ ] Browser DevTools open (Console + Network tabs)
- [ ] Vue DevTools extension installed (optional but helpful)

---

## 🧪 **Test Scenarios**

### **Test 1: New User (No Projects) - Create First Project**

**Setup:**
```javascript
// Open browser console and run:
localStorage.clear();
// Then refresh the page
```

**Steps:**
1. Navigate to: `http://localhost:5173/modules/cadastral-standard/workflow`
2. **Expected:** QuickStart modal appears automatically
3. **Expected:** Tab 1 shows "No Projects Yet" message
4. Click "Create First Project" button
5. **Expected:** Switches to Tab 2 (Create New)
6. Fill in form:
   - Project Name: "Test Project Alpha"
   - Client Name: "Test Client"
   - District: "Harare"
   - Survey Type: "Cadastral" (default)
   - Survey Date: (today's date, default)
7. Click "⚙️ Advanced Configuration"
8. **Expected:** Advanced section expands
9. Select Central Meridian: Lo 31 (default)
10. Click "Select Control Points..."
11. Select at least 3 control points
12. **Expected:** Working directory auto-generates: `Documents/SurveyPro/Projects/test_project_alpha_2024-11-19`
13. Click "Create & Continue →"
14. **Expected:** Loading spinner appears
15. **Expected:** Modal closes after ~1-2 seconds
16. **Expected:** Project is now selected in workflow
17. **Expected:** Console logs: `✅ Project "Test Project Alpha" created successfully!`

**Verification:**
```sql
-- Check database
SELECT * FROM survey_projects 
WHERE name = 'Test Project Alpha';

-- Verify last_used is set
SELECT name, last_used, created_at 
FROM survey_projects 
ORDER BY created_at DESC LIMIT 1;
```

**Pass Criteria:**
- ✅ Modal opens automatically
- ✅ Form validation works
- ✅ Project created in database
- ✅ Modal closes after creation
- ✅ Project selected in workflow
- ✅ Working directory auto-generated
- ✅ Control points saved

---

### **Test 2: Returning User (Has Projects) - Select Recent**

**Setup:**
```javascript
// Ensure Test Project Alpha exists from Test 1
// Clear localStorage to simulate fresh session
localStorage.clear();
// Refresh page
```

**Steps:**
1. Navigate to: `http://localhost:5173/modules/cadastral-standard/workflow`
2. **Expected:** QuickStart modal appears
3. **Expected:** Tab 1 shows "Test Project Alpha" in recent projects
4. **Expected:** Project card shows:
   - Project name
   - Client name
   - District
   - "Last used: Today" or "Last used: X minutes ago"
5. Click on the project card (radio button)
6. **Expected:** Project card highlights with blue border
7. Click "Continue →"
8. **Expected:** Modal closes
9. **Expected:** Project loaded in workflow
10. **Expected:** Console logs: `[QuickStart] Project selected: Test Project Alpha`

**Verification:**
```sql
-- Check last_used was updated
SELECT name, last_used 
FROM survey_projects 
WHERE name = 'Test Project Alpha';
-- last_used should be very recent (within last minute)
```

**Pass Criteria:**
- ✅ Modal shows recent projects
- ✅ Can select project
- ✅ Modal closes on continue
- ✅ Project loads correctly
- ✅ last_used timestamp updated

---

### **Test 3: Multi-Project User - Create Second Project**

**Setup:**
```javascript
// Test Project Alpha should exist
// User is in workflow with Alpha selected
```

**Steps:**
1. Refresh page or navigate to Cadastral Standard
2. **Expected:** QuickStart modal appears
3. **Expected:** "Test Project Alpha" shown in recent projects
4. Click "✨ Create New" tab
5. Fill in form:
   - Project Name: "Test Project Beta"
   - Client Name: "Another Client"
   - District: "Bulawayo"
   - Survey Type: "Subdivision"
6. Expand Advanced Configuration
7. Select Lo 29 meridian
8. Select 3 control points
9. Click "Create & Continue →"
10. **Expected:** Project created and selected
11. **Expected:** Modal closes
12. Refresh page
13. **Expected:** QuickStart modal shows both projects
14. **Expected:** "Test Project Beta" appears first (most recent)
15. **Expected:** "Test Project Alpha" appears second

**Verification:**
```sql
-- Check both projects exist
SELECT name, last_used, created_at 
FROM survey_projects 
WHERE name LIKE 'Test Project%'
ORDER BY last_used DESC;
```

**Pass Criteria:**
- ✅ Can create multiple projects
- ✅ Recent projects sorted by last_used
- ✅ Can switch between projects
- ✅ Each project maintains its own settings

---

### **Test 4: Form Validation**

**Steps:**
1. Open QuickStart modal
2. Go to "Create New" tab
3. Leave Project Name empty
4. Click "Create & Continue →"
5. **Expected:** Button is disabled (gray)
6. **Expected:** No API call made
7. Enter Project Name: "Validation Test"
8. **Expected:** Button still disabled
9. Expand Advanced Configuration
10. **Expected:** Validation error: "At least 3 control points required"
11. Select only 2 control points
12. **Expected:** Button still disabled
13. **Expected:** Error message persists
14. Select 3rd control point
15. **Expected:** Button becomes enabled (blue)
16. **Expected:** Error message disappears
17. Click "Create & Continue →"
18. **Expected:** Project created successfully

**Pass Criteria:**
- ✅ Required field validation works
- ✅ Control points validation works
- ✅ Button disabled when invalid
- ✅ Error messages clear and helpful
- ✅ Validation updates in real-time

---

### **Test 5: Cancel Button**

**Steps:**
1. Open QuickStart modal
2. Go to "Create New" tab
3. Fill in some fields
4. Click "Cancel" button
5. **Expected:** Modal closes
6. **Expected:** No project created
7. **Expected:** Form data cleared
8. Open modal again
9. **Expected:** Form is empty (not persisted)

**Pass Criteria:**
- ✅ Cancel closes modal
- ✅ No data saved
- ✅ Form resets on reopen

---

### **Test 6: Show All Projects**

**Setup:**
```javascript
// Create 6+ projects to test pagination
```

**Steps:**
1. Open QuickStart modal
2. **Expected:** Shows 5 recent projects
3. **Expected:** "Show All Projects (6)" button visible
4. Click "Show All Projects"
5. **Expected:** All projects now visible
6. **Expected:** Can scroll through list
7. Select a project from the expanded list
8. Click "Continue →"
9. **Expected:** Selected project loads

**Pass Criteria:**
- ✅ Shows 5 recent by default
- ✅ Can expand to show all
- ✅ All projects selectable
- ✅ Scrolling works for long lists

---

### **Test 7: Network Error Handling**

**Steps:**
1. Open Browser DevTools → Network tab
2. Enable "Offline" mode
3. Open QuickStart modal
4. Go to "Create New" tab
5. Fill in valid form
6. Click "Create & Continue →"
7. **Expected:** Loading spinner appears
8. **Expected:** After timeout, error alert appears
9. **Expected:** Modal stays open
10. **Expected:** Form data preserved
11. Disable "Offline" mode
12. Click "Create & Continue →" again
13. **Expected:** Project created successfully

**Pass Criteria:**
- ✅ Handles network errors gracefully
- ✅ Shows error message
- ✅ Preserves form data
- ✅ Can retry after error

---

### **Test 8: Keyboard Navigation**

**Steps:**
1. Open QuickStart modal
2. Press `Tab` key repeatedly
3. **Expected:** Focus moves through:
   - Tab buttons
   - Radio buttons (Tab 1)
   - Form fields (Tab 2)
   - Cancel button
   - Continue button
4. Press `Enter` on a project radio button
5. **Expected:** Project selected
6. Press `Enter` on Continue button
7. **Expected:** Modal closes, project loads
8. Open modal again
9. Press `Escape` key
10. **Expected:** Modal closes

**Pass Criteria:**
- ✅ Full keyboard navigation
- ✅ Tab order logical
- ✅ Enter key works
- ✅ Escape key closes modal

---

### **Test 9: Working Directory Auto-Generation**

**Steps:**
1. Open QuickStart modal → Create New
2. Enter Project Name: "My Test Project!"
3. Expand Advanced Configuration
4. **Expected:** Working Directory shows:
   `Documents/SurveyPro/Projects/my_test_project_2024-11-19`
5. Change Project Name to: "Another-Project_123"
6. **Expected:** Working Directory updates to:
   `Documents/SurveyPro/Projects/another_project_123_2024-11-19`
7. Change Survey Date to: "2024-12-25"
8. **Expected:** Working Directory updates to:
   `Documents/SurveyPro/Projects/another_project_123_2024-12-25`

**Pass Criteria:**
- ✅ Auto-generates on name change
- ✅ Slugifies name correctly
- ✅ Includes date
- ✅ Updates in real-time

---

### **Test 10: Integration with Workflow**

**Steps:**
1. Create/select a project via QuickStart modal
2. **Expected:** Modal closes
3. **Expected:** Project name visible in workflow header
4. **Expected:** Working directory populated
5. **Expected:** Control points loaded
6. **Expected:** Central meridian set
7. Click "Import Coordinates" button
8. **Expected:** File picker opens
9. Import a CSV file
10. **Expected:** CSV imports successfully
11. **Expected:** Workflow advances to Field Book
12. Refresh page
13. **Expected:** Project persists (localStorage)
14. **Expected:** Workflow state restored

**Pass Criteria:**
- ✅ Project data flows to workflow
- ✅ All fields populated correctly
- ✅ CSV import works
- ✅ Workflow progression works
- ✅ State persists across refresh

---

## 🐛 **Known Issues to Watch For**

### **Issue 1: Auth Store Property**
**Symptom:** Console error about `authStore.surveyorProfile`
**Fix:** Change line 1115 in CadastralStandardView.vue:
```typescript
// From:
:surveyor-profile-id="authStore.surveyorProfile?.id"

// To (if needed):
:surveyor-profile-id="authStore.profile?.profile?.id"
// OR
:surveyor-profile-id="authStore.currentSurveyor?.id"
```

### **Issue 2: Type Mismatches**
**Symptom:** TypeScript warnings about SurveyProject types
**Impact:** None - runtime works correctly
**Fix:** Can be ignored or types can be aligned later

---

## 📊 **Test Results Template**

```markdown
## Test Results - [Date]

### Environment
- Browser: Chrome/Firefox/Safari
- OS: Windows/Mac/Linux
- Backend: Running ✅/❌
- Frontend: Running ✅/❌
- Migration: Applied ✅/❌

### Test Results
| Test # | Scenario | Status | Notes |
|--------|----------|--------|-------|
| 1 | New User - Create First | ✅/❌ | |
| 2 | Returning User - Select Recent | ✅/❌ | |
| 3 | Multi-Project - Create Second | ✅/❌ | |
| 4 | Form Validation | ✅/❌ | |
| 5 | Cancel Button | ✅/❌ | |
| 6 | Show All Projects | ✅/❌ | |
| 7 | Network Error Handling | ✅/❌ | |
| 8 | Keyboard Navigation | ✅/❌ | |
| 9 | Working Directory Auto-Gen | ✅/❌ | |
| 10 | Integration with Workflow | ✅/❌ | |

### Issues Found
1. [Issue description]
2. [Issue description]

### Overall Assessment
- Pass Rate: X/10
- Critical Issues: X
- Minor Issues: X
- Ready for Production: Yes/No
```

---

## 🎯 **Success Criteria**

**Minimum Requirements (Must Pass):**
- ✅ Modal opens automatically for new users
- ✅ Can create new project
- ✅ Can select existing project
- ✅ Form validation works
- ✅ Project data flows to workflow
- ✅ No console errors (except known type warnings)

**Nice to Have (Should Pass):**
- ✅ Keyboard navigation works
- ✅ Error handling graceful
- ✅ Loading states display
- ✅ Working directory auto-generates
- ✅ Recent projects sorted correctly

---

## 🚀 **Quick Test Commands**

```javascript
// Clear localStorage (simulate new user)
localStorage.clear();

// Check current project
JSON.parse(localStorage.getItem('selectedProject'));

// Check auth state
// (In Vue DevTools or console)
$vm0.$store.state.auth;

// Force show modal
// (In Vue DevTools)
$vm0.showQuickStartModal = true;
```

---

## 📝 **Testing Notes**

- Test in multiple browsers (Chrome, Firefox, Safari)
- Test on different screen sizes (desktop, tablet, mobile)
- Test with slow network (DevTools → Network → Slow 3G)
- Test with ad blockers enabled
- Test with browser extensions that might interfere
- Test rapid clicking (double-click prevention)
- Test with very long project names
- Test with special characters in names

---

**Happy Testing! 🧪**

Report any issues found and we'll fix them immediately! 🚀
