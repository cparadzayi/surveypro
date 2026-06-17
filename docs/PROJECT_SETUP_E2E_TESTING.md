# Project Setup Enhancement - End-to-End Testing Guide

**Date:** 2025-01-22  
**Feature:** Survey Type & Stand Reference Persistence  
**Status:** Ready for Testing

---

## 🎯 Testing Objective

Verify that Survey Type, Stand Reference, and Township information entered at Project Setup (Step 0) persists throughout the entire workflow and correctly auto-populates in all documents, especially the DSG Certificate.

---

## 📋 Pre-Testing Checklist

### **1. Database Migration**
- [ ] Backup database: `pg_dump -U postgres surveypro > backup_before_027.sql`
- [ ] Run migration: `psql -U postgres -d surveypro -f app-backend/migrations/027.do.sql`
- [ ] Verify columns added:
  ```sql
  \d survey_projects
  -- Should show: survey_type, stand_reference, township
  ```
- [ ] Verify indexes created:
  ```sql
  \di idx_survey_projects_*
  -- Should show: idx_survey_projects_survey_type, idx_survey_projects_stand_reference
  ```

### **2. Application Setup**
- [ ] Backend running: `cd app-backend && npm start`
- [ ] Frontend running: `cd app-frontend && npm run dev`
- [ ] Browser console open (F12) for debugging
- [ ] Database client open for verification

---

## 🧪 Test Scenarios

### **Test 1: New Project - Subdivision (Complete Flow)**

#### **Step 0: Project Setup**

**Actions:**
1. Navigate to Cadastral Standard workflow
2. Click "Start New Project" or "Project Setup"
3. Fill in Project Identification:
   - Project Name: `Elon Estates Gwelo`
   - District: `Gwelo`
4. Fill in Survey Information:
   - Survey Type: Select `Subdivision`
   - Stand/Reference Number: `STANDS 1-50`
   - Township: `Gweru Township`
5. Set Working Directory
6. Click "Complete Setup & Start Workflow"

**Expected Results:**
- ✅ Form validates all required fields
- ✅ Submit button enabled when all fields filled
- ✅ Console logs show:
  ```
  ✅ Project setup completed: {
    projectName: "Elon Estates Gwelo",
    district: "Gwelo",
    surveyType: "subdivision",
    standReference: "STANDS 1-50",
    township: "Gweru Township",
    workingDirectory: "..."
  }
  📋 Survey Type: subdivision
  🏘️ Stand Reference: STANDS 1-50
  ```
- ✅ Workflow advances to CSV Import (Step 1)

**Database Verification:**
```sql
SELECT id, name, district, survey_type, stand_reference, township 
FROM survey_projects 
ORDER BY created_at DESC 
LIMIT 1;

-- Expected:
-- name: Elon Estates Gwelo
-- district: Gwelo
-- survey_type: subdivision
-- stand_reference: STANDS 1-50
-- township: Gweru Township
```

---

#### **Step 1-7: Complete Workflow**

**Actions:**
1. Import CSV with survey points
2. Complete Field Book
3. Complete Calculations Part 1
4. Complete Coordinate List
5. Complete Area Computation
6. Complete Report on Survey
7. Navigate to DSG Certificate (Step 9)

**Expected Results:**
- ✅ All steps complete normally
- ✅ Project info persists in workflow state
- ✅ No errors in console

---

#### **Step 9: DSG Certificate (Auto-Population Test)**

**Actions:**
1. Navigate to DSG Certificate step
2. Observe "Survey Of" field on page load

**Expected Results:**
- ✅ "Survey Of" field auto-populated with:
  ```
  STANDS 1-50, ELON ESTATES GWELO, GWELO DISTRICT
  ```
- ✅ Console logs show:
  ```
  [DSG Certificate] Auto-populated from persistent project data: {
    surveyType: "subdivision",
    standReference: "STANDS 1-50",
    projectName: "Elon Estates Gwelo",
    district: "Gwelo",
    township: "Gweru Township",
    surveyOf: "STANDS 1-50, ELON ESTATES GWELO, GWELO DISTRICT"
  }
  ```
- ✅ AI/ML suggestions button shows subdivision-specific templates
- ✅ User can still edit if needed

**Manual Verification:**
- [ ] Survey Of includes stand reference
- [ ] Survey Of includes project name
- [ ] Survey Of includes district
- [ ] Format is professional and correct
- [ ] Capitalization is consistent

---

### **Test 2: New Project - Mining Lease**

#### **Step 0: Project Setup**

**Actions:**
1. Start new project
2. Fill in:
   - Project Name: `Maligreen Mining`
   - District: `Shabani`
   - Survey Type: `Mining Lease`
   - Stand/Reference Number: `Mining Lease No.44`
   - Township: `Shabani Mine Surface Rights A`
3. Complete setup

**Expected Results:**
- ✅ Data saved correctly
- ✅ Console shows mining-lease type

**Database Verification:**
```sql
SELECT survey_type, stand_reference, township 
FROM survey_projects 
WHERE name = 'Maligreen Mining';

-- Expected:
-- survey_type: mining-lease
-- stand_reference: Mining Lease No.44
-- township: Shabani Mine Surface Rights A
```

#### **Step 9: DSG Certificate**

**Expected Auto-Population:**
```
MINING LEASE NO.44, MALIGREEN MINING, SHABANI DISTRICT
```

or

```
MINING LEASE NO.44, SHABANI MINE SURFACE RIGHTS A, SHABANI DISTRICT
```

**Verification:**
- [ ] Includes mining lease number
- [ ] Includes project or township name
- [ ] Includes district
- [ ] AI/ML suggestions show mining-lease templates

---

### **Test 3: New Project - Municipal Land**

#### **Step 0: Project Setup**

**Actions:**
1. Start new project
2. Fill in:
   - Project Name: `Gweru Urban Development`
   - District: `Gwelo`
   - Survey Type: `Municipal Land`
   - Stand/Reference Number: `STAND 9723`
   - Township: `Gwelo Township Lands`
3. Complete setup

**Expected DSG Certificate Auto-Population:**
```
STAND 9723, GWERU URBAN DEVELOPMENT, GWELO DISTRICT
```

or

```
STAND 9723 GWERU TOWNSHIP OF GWELO TOWNSHIP LANDS, GWELO DISTRICT
```

---

### **Test 4: Existing Project (Backward Compatibility)**

#### **Test Objective:**
Verify that existing projects (created before migration) still work correctly.

**Actions:**
1. Load an existing project (created before migration)
2. Navigate through workflow
3. Check DSG Certificate

**Expected Results:**
- ✅ Project loads without errors
- ✅ Workflow functions normally
- ✅ DSG Certificate works (may not auto-populate if no data)
- ✅ No console errors
- ✅ Database shows NULL for new fields (acceptable)

**Database Verification:**
```sql
SELECT id, name, survey_type, stand_reference, township 
FROM survey_projects 
WHERE created_at < '2025-01-22';

-- Expected:
-- survey_type: NULL
-- stand_reference: NULL
-- township: NULL
```

---

### **Test 5: Page Refresh (Persistence Test)**

#### **Test Objective:**
Verify data persists after page refresh (localStorage).

**Actions:**
1. Complete Project Setup with all fields
2. Advance to CSV Import
3. Refresh browser (F5)
4. Navigate to DSG Certificate

**Expected Results:**
- ✅ Workflow state restored from localStorage
- ✅ Project info still available
- ✅ DSG Certificate still auto-populates
- ✅ No data loss

---

### **Test 6: Browser Close/Reopen (Database Persistence)**

#### **Test Objective:**
Verify data persists after browser close (database).

**Actions:**
1. Complete Project Setup with all fields
2. Save project to database
3. Close browser completely
4. Reopen browser
5. Load project from database
6. Navigate to DSG Certificate

**Expected Results:**
- ✅ Project loads from database
- ✅ All fields restored correctly
- ✅ DSG Certificate auto-populates
- ✅ No data loss

---

### **Test 7: Validation Testing**

#### **Test Objective:**
Verify form validation works correctly.

**Test 7a: Missing Required Fields**

**Actions:**
1. Start Project Setup
2. Leave Survey Type empty
3. Try to submit

**Expected Results:**
- ✅ Submit button disabled
- ✅ Validation message: "⚠️ Survey type is required"
- ✅ Form does not submit

**Test 7b: Missing Stand Reference**

**Actions:**
1. Fill all fields except Stand Reference
2. Try to submit

**Expected Results:**
- ✅ Submit button disabled
- ✅ Validation message: "⚠️ Stand/Reference number is required"

**Test 7c: Optional Township**

**Actions:**
1. Fill all required fields
2. Leave Township empty
3. Submit

**Expected Results:**
- ✅ Form submits successfully
- ✅ Township saved as NULL or empty string
- ✅ DSG Certificate still works (without township)

---

### **Test 8: AI/ML Suggestions**

#### **Test Objective:**
Verify AI/ML suggestions use survey type correctly.

**Actions:**
1. Complete Project Setup with Survey Type = "Subdivision"
2. Navigate to DSG Certificate
3. Click "Show Suggestions" for Survey Of

**Expected Results:**
- ✅ Suggestions show subdivision-specific templates
- ✅ Suggestions include stand reference
- ✅ Suggestions include project name
- ✅ Confidence scores displayed
- ✅ Can apply suggestion by clicking

**Repeat for Other Survey Types:**
- [ ] Mining Lease - shows mining-lease templates
- [ ] State Land - shows state-land templates
- [ ] Municipal Land - shows municipal-land templates

---

### **Test 9: Manual Override**

#### **Test Objective:**
Verify user can override auto-populated data.

**Actions:**
1. Complete Project Setup
2. Navigate to DSG Certificate
3. Observe auto-populated "Survey Of"
4. Manually edit the field
5. Save certificate

**Expected Results:**
- ✅ Can edit auto-populated field
- ✅ Manual changes persist
- ✅ No errors or warnings
- ✅ User has full control

---

### **Test 10: Special Characters & Edge Cases**

#### **Test Objective:**
Verify system handles special characters and edge cases.

**Test 10a: Special Characters in Stand Reference**

**Actions:**
1. Enter Stand Reference: `STANDS 1-50, 100-150 & 200`
2. Complete setup

**Expected Results:**
- ✅ Saves correctly
- ✅ Displays correctly in DSG Certificate
- ✅ No SQL injection or XSS issues

**Test 10b: Very Long Township Name**

**Actions:**
1. Enter Township: `Shabani Mine Surface Rights Area A Section 1 Subdivision Block 5`
2. Complete setup

**Expected Results:**
- ✅ Saves correctly (VARCHAR(255) limit)
- ✅ Displays correctly
- ✅ No truncation errors

**Test 10c: Unicode Characters**

**Actions:**
1. Enter Project Name with unicode: `Élön Éstätës`
2. Complete setup

**Expected Results:**
- ✅ Saves correctly
- ✅ Displays correctly
- ✅ No encoding issues

---

## 📊 Test Results Template

### **Test Execution Log**

| Test # | Test Name | Date | Tester | Status | Notes |
|--------|-----------|------|--------|--------|-------|
| 1 | Subdivision Complete Flow | | | ⬜ Pass / ⬜ Fail | |
| 2 | Mining Lease | | | ⬜ Pass / ⬜ Fail | |
| 3 | Municipal Land | | | ⬜ Pass / ⬜ Fail | |
| 4 | Backward Compatibility | | | ⬜ Pass / ⬜ Fail | |
| 5 | Page Refresh Persistence | | | ⬜ Pass / ⬜ Fail | |
| 6 | Browser Close Persistence | | | ⬜ Pass / ⬜ Fail | |
| 7 | Validation Testing | | | ⬜ Pass / ⬜ Fail | |
| 8 | AI/ML Suggestions | | | ⬜ Pass / ⬜ Fail | |
| 9 | Manual Override | | | ⬜ Pass / ⬜ Fail | |
| 10 | Special Characters | | | ⬜ Pass / ⬜ Fail | |

---

## 🐛 Bug Report Template

**Bug ID:** [AUTO-INCREMENT]  
**Test #:** [Test number where bug found]  
**Severity:** ⬜ Critical / ⬜ High / ⬜ Medium / ⬜ Low  
**Status:** ⬜ Open / ⬜ In Progress / ⬜ Fixed / ⬜ Closed  

**Description:**
[Clear description of the bug]

**Steps to Reproduce:**
1. [Step 1]
2. [Step 2]
3. [Step 3]

**Expected Result:**
[What should happen]

**Actual Result:**
[What actually happened]

**Screenshots/Logs:**
[Attach screenshots or paste console logs]

**Environment:**
- Browser: [Chrome/Firefox/Safari]
- OS: [Windows/Mac/Linux]
- Database: [PostgreSQL version]

---

## ✅ Acceptance Criteria

### **Functionality:**
- [ ] All required fields validated correctly
- [ ] Data saves to database with correct types
- [ ] Data persists across page refresh (localStorage)
- [ ] Data persists across browser close (database)
- [ ] DSG Certificate auto-populates correctly
- [ ] AI/ML suggestions use survey type
- [ ] Manual override works
- [ ] Backward compatibility maintained

### **Performance:**
- [ ] Project Setup loads in < 1 second
- [ ] Form submission completes in < 2 seconds
- [ ] DSG Certificate auto-population in < 100ms
- [ ] No performance degradation

### **User Experience:**
- [ ] UI is intuitive and clear
- [ ] Validation messages helpful
- [ ] Auto-population feels seamless
- [ ] No confusing errors or warnings

### **Data Integrity:**
- [ ] No data loss on refresh
- [ ] No data loss on browser close
- [ ] No SQL injection vulnerabilities
- [ ] No XSS vulnerabilities
- [ ] Special characters handled correctly

---

## 🚀 Production Readiness Checklist

- [ ] All tests passed
- [ ] No critical or high severity bugs
- [ ] Database migration tested
- [ ] Rollback plan verified
- [ ] Documentation complete
- [ ] User training materials prepared
- [ ] Monitoring/logging configured
- [ ] Backup strategy confirmed

---

## 📞 Support & Escalation

**If tests fail:**
1. Document the failure (bug report template)
2. Check console logs for errors
3. Verify database migration ran correctly
4. Review code changes
5. Escalate to development team if needed

**Rollback Procedure:**
```bash
# If critical issues found
psql -U postgres -d surveypro -f app-backend/migrations/027.undo.sql

# Restore backup if needed
psql -U postgres -d surveypro < backup_before_027.sql
```

---

## 📝 Testing Notes

**Date:** _____________  
**Tester:** _____________  
**Environment:** _____________  

**Overall Status:** ⬜ Pass / ⬜ Fail / ⬜ Partial  

**Summary:**
[Brief summary of testing results]

**Issues Found:**
[List any issues or concerns]

**Recommendations:**
[Any recommendations for improvement]

---

**Testing Status:** ✅ Ready to Execute  
**Estimated Time:** 2-3 hours  
**Required Resources:** Database access, browser, test data
