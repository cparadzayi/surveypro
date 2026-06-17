# 🔍 Project Data Persistence Analysis

**Analysis Date:** November 23, 2025  
**Issue:** User has to re-enter survey information when revisiting existing projects

---

## 📊 Current State

### ✅ **What IS Being Saved**

The backend **DOES save** all project information to the database:

```sql
-- survey_projects table (from SurveyProject.js lines 28-32)
INSERT INTO survey_projects (
  name,
  surveyor_profile_id,
  project_id,
  client_name,
  district,           -- ✅ SAVED
  survey_type,        -- ✅ SAVED
  survey_date,        -- ✅ SAVED
  instruments,        -- ✅ SAVED
  designation,        -- ✅ SAVED
  working_directory,  -- ✅ SAVED
  central_meridian    -- ✅ SAVED (Lo Zone)
)
```

**Confirmed in backend logs:**
```javascript
// SurveyProject.js lines 92-97
console.log(`[SurveyProject.findAll]   - Survey Type: ${project.survey_type || 'N/A'}`)
console.log(`[SurveyProject.findAll]   - District: ${project.district || 'N/A'}`)
console.log(`[SurveyProject.findAll]   - Survey Date: ${project.survey_date || 'N/A'}`)
console.log(`[SurveyProject.findAll]   - Designation: ${project.designation || 'N/A'}`)
console.log(`[SurveyProject.findAll]   - Instruments: ${project.instruments || 'N/A'}`)
```

---

## ❌ **What IS NOT Being Auto-Loaded**

### **Problem 1: ProjectSetupView Only Loads 2 Fields**

**File:** `ProjectSetupView.vue` (lines 468-475)

```typescript
function onProjectChange() {
  console.log('[ProjectSetup] Project changed:', setupData.value.projectId)
  // Auto-populate from project if available
  if (selectedProject.value) {
    setupData.value.district = selectedProject.value.district || ''  // ✅ Loaded
    setupData.value.surveyDate = formatDateForInput(selectedProject.value.survey_date)  // ✅ Loaded
  }
}
```

**Missing fields:**
- ❌ `surveyType` - NOT loaded
- ❌ `township` - NOT loaded
- ❌ `surveyOf` (designation) - NOT loaded
- ❌ `instruments` - NOT loaded
- ❌ `loZone` (central_meridian) - NOT loaded
- ❌ `datum` - NOT loaded
- ❌ `workingDirectory` - NOT loaded

---

### **Problem 2: CadastralStandardView Loads More, But After Setup**

**File:** `CadastralStandardView.vue` (lines 3720-3769)

```typescript
function onProjectChange() {
  const project = surveyProjects.value.find(p => p.id === selectedProjectId.value);
  if (project) {
    // ✅ These ARE loaded when project changes
    if (project.survey_date) {
      workflowState.surveyorInfo.surveyDate = new Date(project.survey_date).toLocaleDateString(...);
    }
    if (project.designation) {
      workflowState.surveyorInfo.surveyOf = project.designation;
    }
    if (project.district) {
      workflowState.projectInfo.district = project.district;
    }
    if (project.survey_type) {
      workflowState.projectInfo.surveyType = project.survey_type;
    }
    if (project.instruments) {
      workflowState.surveyorInfo.instruments = project.instruments;
    }
    if (project.working_directory) {
      workflowState.projectInfo.workingDirectory = project.working_directory;
    }
    workflowState.projectInfo.centralMeridian = project.central_meridian || undefined;
  }
}
```

**BUT:** This happens **AFTER** the Project Setup step, so the user still has to re-enter data in the setup form.

---

## 🐛 **Root Cause**

The issue is a **timing problem**:

1. User selects existing project in dropdown
2. `ProjectSetupView.onProjectChange()` is called
3. **Only 2 fields** are auto-populated (district, surveyDate)
4. User sees empty form fields and thinks they need to re-enter everything
5. User fills in the form again (duplicate work!)
6. Later, `CadastralStandardView.onProjectChange()` loads the data into `workflowState`

**Result:** User experience is poor - they have to re-enter data that's already in the database.

---

## ✅ **Solution**

### **Fix 1: Update ProjectSetupView.onProjectChange()**

**File:** `app-frontend/src/views/modules/cadastral-standard/ProjectSetupView.vue`

**Current code (lines 468-475):**
```typescript
function onProjectChange() {
  console.log('[ProjectSetup] Project changed:', setupData.value.projectId)
  // Auto-populate from project if available
  if (selectedProject.value) {
    setupData.value.district = selectedProject.value.district || ''
    setupData.value.surveyDate = formatDateForInput(selectedProject.value.survey_date)
  }
}
```

**Fixed code:**
```typescript
function onProjectChange() {
  console.log('[ProjectSetup] Project changed:', setupData.value.projectId)
  
  // Auto-populate ALL fields from project if available
  if (selectedProject.value) {
    const project = selectedProject.value
    
    // Survey Information
    setupData.value.surveyType = project.survey_type || ''
    setupData.value.township = project.township || ''
    setupData.value.district = project.district || ''
    setupData.value.surveyDate = formatDateForInput(project.survey_date)
    setupData.value.surveyOf = project.designation || ''
    setupData.value.instruments = project.instruments || ''
    
    // Coordinate System
    setupData.value.loZone = project.central_meridian || null
    setupData.value.datum = project.datum || 'Cape Datum (Modified Clarke 1880)'
    setupData.value.workingDirectory = project.working_directory || ''
    
    console.log('[ProjectSetup] ✅ Auto-populated all fields from project:', project.name)
    console.log('[ProjectSetup]   - Survey Type:', setupData.value.surveyType)
    console.log('[ProjectSetup]   - District:', setupData.value.district)
    console.log('[ProjectSetup]   - Survey Date:', setupData.value.surveyDate)
    console.log('[ProjectSetup]   - Survey Of:', setupData.value.surveyOf)
    console.log('[ProjectSetup]   - Instruments:', setupData.value.instruments)
    console.log('[ProjectSetup]   - Lo Zone:', setupData.value.loZone)
    console.log('[ProjectSetup]   - Working Directory:', setupData.value.workingDirectory)
  }
}
```

---

### **Fix 2: Add Township Field to Backend**

**Current:** The `township` field is NOT in the database schema.

**File:** `app-backend/src/models/SurveyProject.js`

**Add to CREATE (line 29):**
```javascript
INSERT INTO survey_projects 
(name, surveyor_profile_id, project_id, client_name, district, township, survey_type, ...)
VALUES ($1, $2, $3, $4, $5, $6, $7, ...)
```

**Add to parameter list (line 32):**
```javascript
[name, surveyorId, projectId, clientName, district, township, surveyType, ...]
```

**Add to function signature (line 12):**
```javascript
static async create({
  name,
  surveyorId,
  projectId,
  clientName,
  district,
  township,  // ✅ ADD THIS
  surveyType,
  ...
})
```

---

### **Fix 3: Database Migration**

**New migration file:** `app-backend/migrations/XXX.do.sql`

```sql
-- Add township column to survey_projects table
ALTER TABLE survey_projects 
ADD COLUMN IF NOT EXISTS township VARCHAR(255);

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_survey_projects_township 
ON survey_projects(township);
```

---

## 📋 **Complete Fix Checklist**

### **Frontend Changes:**
- [ ] Update `ProjectSetupView.onProjectChange()` to load all fields
- [ ] Add console logging for debugging
- [ ] Test with existing project

### **Backend Changes:**
- [ ] Add `township` parameter to `SurveyProject.create()`
- [ ] Update INSERT query to include `township`
- [ ] Update `findAll()` to return `township`
- [ ] Update `findById()` to return `township`

### **Database Changes:**
- [ ] Create migration to add `township` column
- [ ] Run migration on database
- [ ] Verify column exists

### **API Changes:**
- [ ] Update `POST /survey-projects` route to accept `township`
- [ ] Update response to include `township`

---

## 🧪 **Testing Steps**

### **Test 1: Create New Project**
1. Create new project with all fields filled
2. Complete setup
3. Verify all fields saved to database
4. Check database: `SELECT * FROM survey_projects WHERE name = 'Test Project'`

### **Test 2: Load Existing Project**
1. Select existing project from dropdown
2. **Expected:** All fields auto-populate
3. **Verify:** Survey Type, District, Township, Survey Date, Survey Of, Instruments, Lo Zone, Working Directory
4. User should NOT need to re-enter anything

### **Test 3: Edit Project**
1. Select project
2. Modify a field (e.g., change District)
3. Complete setup
4. Reload project
5. **Expected:** Modified field is persisted

---

## 📊 **Data Flow (After Fix)**

```
User Selects Existing Project
    ↓
ProjectSetupView.onProjectChange() triggered
    ↓
selectedProject.value contains ALL project data from DB
    ↓
Auto-populate ALL setupData fields:
  - surveyType ✅
  - township ✅
  - district ✅
  - surveyDate ✅
  - surveyOf ✅
  - instruments ✅
  - loZone ✅
  - datum ✅
  - workingDirectory ✅
    ↓
User sees pre-filled form
    ↓
User clicks "Complete Setup & Start Workflow"
    ↓
Data flows to workflowState
    ↓
Workflow continues with all data available
```

---

## 🎯 **Expected User Experience (After Fix)**

### **Before (Current - BAD UX):**
1. User selects "Mutare1" project
2. Form shows:
   - Survey Type: **EMPTY** ❌
   - Township: **EMPTY** ❌
   - District: "Mutare" ✅ (only this is loaded)
   - Survey Date: "11/03/2025" ✅ (only this is loaded)
   - Survey Of: **EMPTY** ❌
   - Instruments: **EMPTY** ❌
   - Lo Zone: **EMPTY** ❌
3. User thinks: "I need to fill this in again" 😞
4. User re-enters all the data (wasted time!)

### **After (Fixed - GOOD UX):**
1. User selects "Mutare1" project
2. Form shows:
   - Survey Type: "Subdivision" ✅
   - Township: "Gweru Township" ✅
   - District: "Mutare" ✅
   - Survey Date: "11/03/2025" ✅
   - Survey Of: "LOTS 1 - 12 OF LOT 84..." ✅
   - Instruments: "Trimble R8GNSS Set..." ✅
   - Lo Zone: "31" ✅
   - Working Directory: "Documents/SurveyPro/Projects/Mutare1" ✅
3. User thinks: "Perfect! Everything is already here" 😊
4. User clicks "Complete Setup & Start Workflow" (no re-entry needed!)

---

## 🚀 **Priority**

**HIGH PRIORITY** - This is a critical UX issue that makes the app feel broken.

Users expect their data to be saved and auto-loaded. The current behavior suggests the app is not saving data properly, even though it is.

---

## 📝 **Summary**

### **Current State:**
- ✅ Backend DOES save all data
- ✅ CadastralStandardView DOES load data (but too late)
- ❌ ProjectSetupView only loads 2 fields
- ❌ User has to re-enter data every time

### **Root Cause:**
- `ProjectSetupView.onProjectChange()` is incomplete
- Missing `township` field in database
- Poor timing of data loading

### **Solution:**
- Update `onProjectChange()` to load ALL fields
- Add `township` to database schema
- Add console logging for debugging
- Test thoroughly

### **Impact:**
- **Before:** User wastes time re-entering data
- **After:** User sees pre-filled form, clicks Continue
- **Time saved:** ~2-3 minutes per project load
- **UX improvement:** Massive! App feels professional and polished

---

**Analyzed by:** Cascade AI  
**Date:** November 23, 2025  
**Status:** ⚠️ Fix Required - High Priority UX Issue
