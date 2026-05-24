# 📋 Cadastral Workflow - Official Step Definitions

**Last Updated:** November 19, 2025  
**Version:** 2.0 (Refactored - Removed Calculations Part 2)

---

## 🎯 Complete Workflow (6 Active Steps)

### **Step 0: Project Setup** 
**Type:** Manual (Required)  
**Component:** `ProjectSetupView.vue`  
**Status:** ✅ Implemented

**User Actions:**
- Select surveyor from database
- Select or create project
- Enter project details (name, district, description)
- Set central meridian (Lo 25/27/29/31/33)
- Set working directory

**Outputs:**
- Project linked to surveyor
- Working directory created
- Workflow state initialized

**Next Step:** Auto-advances to Control Point Selection

---

### **Step 1: Control Point Selection**
**Type:** Manual (Required)  
**Component:** `ControlPointSelectionView.vue`  
**Status:** ✅ Implemented

**User Actions:**
- Search control points database
- Select trig beacons (minimum 2 required)
- View selected points on map
- Save selection

**Outputs:**
- Control point IDs saved to workflow state
- Control point data stored in `step_data['control-point-selection']`

**Next Step:** Auto-advances to CSV Import

---

### **Step 2: CSV Import**
**Type:** Manual (Required)  
**Component:** `CadastralStandardView.vue` (CSV Import section)  
**Status:** ✅ Implemented

**User Actions:**
- Upload CSV file with survey points
- System validates and parses data
- Review imported points

**Outputs:**
- Survey points stored in workflow state
- CSV import record created in database
- Points saved to `step_data['import-csv']`

**Next Step:** 🤖 **AUTO-TRIGGERS** Field Book generation

**Automation Trigger:**
```javascript
// Line 1733-1744 in CadastralStandardView.vue
console.log('[Phase 2] 🤖 Starting automated workflow...');
await generateFieldBook();
```

---

### **Step 3: Field Book** 🤖
**Type:** Fully Automated  
**Component:** `CadastralStandardView.vue` (generateFieldBook function)  
**Status:** ✅ Implemented

**Automation:**
- ✅ Generates electronic field book PDF (3 decimal precision)
- ✅ Creates page references for cross-referencing
- ✅ Auto-saves PDF to working directory
- ✅ Downloads PDF automatically
- ✅ Stores metadata in database

**Outputs:**
- Field Book PDF (auto-downloaded)
- Page lookup table for calculations
- Metadata saved to `step_data['field-book']`

**Next Step:** 🤖 **AUTO-TRIGGERS** Calculations Part 1

**Automation Trigger:**
```javascript
// Line 2202-2214 in CadastralStandardView.vue
console.log('[Phase 2] 🤖 Auto-advancing to Calculations Part 1...');
workflowState.currentStep = 'calculations-part1';
await generateCalculationsPart1();
```

---

### **Step 4: Calculations Part 1** 🤖
**Type:** Fully Automated  
**Component:** `CadastralStandardView.vue` (generateCalculationsPart1 function)  
**Status:** ✅ Implemented

**Automation:**
- ✅ Generates Calculations Part 1 PDF
- ✅ Generates Coordinate List PDF (2 decimal precision)
- ✅ Performs duplicate point analysis
- ✅ Creates adjusted coordinates
- ✅ Fetches control point data from API
- ✅ Auto-saves both PDFs to working directory
- ✅ Downloads both PDFs automatically
- ✅ Stores adjusted coordinates in database

**Outputs:**
- Calculations Part 1 PDF (auto-downloaded)
- Coordinate List PDF (auto-downloaded)
- Adjusted coordinates (542 points in typical survey)
- Duplicate analyses
- Metadata saved to `step_data['calculations-part1']`

**Next Step:** 🤖 **AUTO-ADVANCES** to Area Computation

**Automation Trigger:**
```javascript
// Line 1620-1637 in CadastralStandardView.vue
console.log('[Phase 2] 🤖 Auto-advancing to Area Computation...');
workflowState.currentStep = 'area-computation';
```

---

### **Step 5: Area Computation** 🗺️
**Type:** Hybrid (Automated Loading + Manual Digitization)  
**Component:** `MapLibreAreaView.vue`  
**Status:** ✅ Implemented

**Automated Features:**
- ✅ Loads adjusted coordinates from database (survives refresh)
- ✅ Loads control points from API
- ✅ Loads existing parcels from database
- ✅ Displays satellite imagery (MapLibre GL JS)
- ✅ Transforms coordinates (Cape Lo → WGS84)
- ✅ Shows trig beacons with names (MANYANGA, MUNAKA, etc.)
- ✅ Auto-saves parcels to database on completion
- ✅ Calculates area, centroid, consistency in real-time

**Manual User Actions:**
- Click survey points to digitize parcel boundaries
- Enter parcel designation
- Complete polygon (minimum 3 points)
- Repeat for multiple parcels

**Outputs:**
- Land parcels saved to `area_parcels` table
- Area calculations (m² or hectares)
- Centroid coordinates
- Consistency analysis (ΣdY, ΣdX)

**Next Step:** ⚠️ **NO AUTO-ADVANCE** - User must manually navigate

**Automation Gap:** Need to add auto-advance when parcels are saved

---

### **Step 6: Report on Survey** ❌
**Type:** Not Implemented  
**Component:** Not created yet  
**Status:** ❌ Placeholder

**Expected Features:**
- Generate final survey report PDF
- Compile all previous documents
- Add surveyor's certificate
- Submit to Surveyor General

**Next Step:** DSG Certificate

---

### **Step 7: DSG Certificate** ❌
**Type:** Not Implemented  
**Component:** Not created yet  
**Status:** ❌ Placeholder

**Expected Features:**
- Generate Director of Surveyor General certificate
- Final approval document
- Workflow completion

---

## 🗑️ Deprecated Components

### **CalculationsPart2View.vue** (REMOVED)
- **Status:** Deprecated and removed from codebase
- **Replaced By:** MapLibreAreaView.vue (Step 5: Area Computation)
- **Reason:** MapLibreAreaView provides superior functionality with satellite imagery
- **Action:** File can be safely deleted (see `CLEANUP_CALCULATIONS_PART2.md`)

---

## 🔄 Alternative Workflows

### **QGIS Export** (Optional)
**Component:** `QGISExportView.vue`  
**Status:** ✅ Implemented (alternative to MapLibreAreaView)

**Use Case:** Professional GIS users who prefer QGIS for parcel digitization

**Workflow:**
1. Export coordinates to PostGIS database
2. Open QGIS and connect to PostGIS
3. Digitize parcels in QGIS (more advanced tools)
4. Save parcels back to database
5. Return to SurveyPro and click "Continue"
6. Advances to Area Computation to view results

**Note:** This is an alternative, not a required step

---

## 📊 Automation Summary

| Step | Type | Automation Level |
|------|------|------------------|
| 0. Project Setup | Manual | 0% (user input required) |
| 1. Control Points | Manual | 0% (user selection required) |
| 2. CSV Import | Manual | 50% (parsing automated) |
| 3. Field Book | **Automated** | **100%** ✅ |
| 4. Calculations Part 1 | **Automated** | **100%** ✅ |
| 5. Area Computation | Hybrid | 75% (loads data, user digitizes) |
| 6. Report on Survey | Not Implemented | N/A |
| 7. DSG Certificate | Not Implemented | N/A |

**Overall Automation:** 50% (3 of 6 active steps fully/partially automated)

---

## 🎯 Workflow State Persistence

All workflow data persists across browser refreshes:

### **Database Storage:**
- `survey_projects` - Project metadata
- `workflow_state` - Step completion and data
- `step_data['control-point-selection']` - Selected control points
- `step_data['import-csv']` - Imported survey points
- `step_data['field-book']` - Field book metadata
- `step_data['calculations-part1']` - Adjusted coordinates, duplicate analyses
- `area_parcels` - Digitized land parcels

### **Auto-Loaded on Refresh:**
- ✅ Project information
- ✅ Surveyor information
- ✅ Control points (from API)
- ✅ Imported survey points
- ✅ Adjusted coordinates
- ✅ Land parcels
- ✅ Workflow step progress

**Result:** No need to re-import CSV or re-digitize parcels after refresh!

---

## 🚀 Quick Start Guide

### **New Survey Project:**
1. **Login** → Dashboard shows your projects
2. **Create Project** → Fill in details
3. **Select Control Points** → Choose trig beacons
4. **Upload CSV** → Survey points file
5. **Wait** → Field Book and Calculations auto-generate (2-3 minutes)
6. **Digitize Parcels** → Click points on satellite map
7. **Complete** → Report on Survey (when implemented)

### **Resume Existing Project:**
1. **Login** → Dashboard
2. **Click Project** → Auto-loads all data
3. **Continue** → Pick up where you left off
4. All data restored automatically!

---

**Maintained by:** Cascade AI  
**Last Refactored:** November 19, 2025  
**Next Review:** When Report on Survey is implemented
