# 📋 Cadastral Workflow Architecture - Comprehensive Guide

## 🎯 Overview

This document outlines the **NEW** 8-step cadastral workflow architecture that integrates project setup as Step 0 and ensures ALL workflow products are automatically saved to the project folder.

---

## 🏗️ **New 8-Step Workflow**

### **Step 0: Project Setup & Verification** ⚙️ ← **NEW!**
**Purpose:** Mainstream project configuration as part of the workflow

**What it does:**
- ✅ Configure project name, district, central meridian
- ✅ Set and verify working directory
- ✅ Select surveyor and survey information
- ✅ Choose control points
- ✅ Verify project folder structure exists/create it

**Why it's now Step 0:**
1. **Context clarity** - Always know which project you're working on
2. **Working directory verified** before any file operations
3. **No reference problems** - Everything in one linear workflow
4. **Better UX** - Single workflow from start to finish
5. **Auto-save guaranteed** - Working directory set before generating products

**Products saved:** None (setup step)

---

### **Step 1: Import CSV** 📥
**Purpose:** Upload and validate coordinate data

**Products saved:**
- ✅ **Raw CSV backup** → `{working_dir}/input/{ProjectName}_imported_{date}.csv`
  - Exact copy of imported data
  - Allows re-importing if needed
  - Preserves original data format

**File location:** `C:\Users\{User}\Documents\SurveyPro\Projects\{ProjectName}\input\`

---

### **Step 2: Field Book** 📖
**Purpose:** Generate electronic field book (3 decimals)

**Products saved:**
- ✅ **Field Book PDF** → `{working_dir}/output/field-book/{ProjectName}_FieldBook_{date}.pdf`

**File location:** `C:\Users\{User}\Documents\SurveyPro\Projects\{ProjectName}\output\field-book\`

---

### **Step 3: Calculations Part 1** 🧮
**Purpose:** Field computations and adjustments

**Products saved:**
- ✅ **Calculations Part 1 PDF** → `{working_dir}/output/calculations/{ProjectName}_CalculationsPart1_{date}.pdf`
- ✅ **Coordinate List PDF** → `{working_dir}/output/coordinate-list/{ProjectName}_CoordinateList_{date}.pdf`

**Note:** Both PDFs generated together, both auto-saved

**File locations:**
- `C:\Users\{User}\Documents\SurveyPro\Projects\{ProjectName}\output\calculations\`
- `C:\Users\{User}\Documents\SurveyPro\Projects\{ProjectName}\output\coordinate-list\`

---

### **Step 4: Coordinate List** 📋
**Purpose:** Final coordinate list verification (2 decimals)

**Products saved:**
- Already saved in Step 3 (generated together with Calculations Part 1)
- If re-generated: New version saved with timestamp

---

### **Step 5: Calculations Part 2 (Areas & Consistency)** 📐
**Purpose:** Area computations, parcel boundaries, consistencies

**Products saved:**
- ✅ **Area & Consistency PDF (standalone)** → `{working_dir}/output/complete-reports/{ProjectName}_AreaConsistency_{date}.pdf`
- ✅ **Merged PDF (Calcs Part 1 + Areas)** → `{working_dir}/output/complete-reports/{ProjectName}_CompleteReport_{date}.pdf`

**File location:** `C:\Users\{User}\Documents\SurveyPro\Projects\{ProjectName}\output\complete-reports\`

**Two PDFs created:**
1. **Standalone Area & Consistency** - Can be viewed independently
2. **Merged Complete Report** - Calculations Part 1 with Area & Consistency appended, continuous page numbering

---

### **Step 6: Report on Survey** 📄
**Purpose:** Standalone survey report

**Products saved:**
- ✅ **Report on Survey PDF** → `{working_dir}/output/reports/{ProjectName}_ReportOnSurvey_{date}.pdf`

**File location:** `C:\Users\{User}\Documents\SurveyPro\Projects\{ProjectName}\output\reports\`

---

### **Step 7: DSG Certificate** 🏆
**Purpose:** Final certificate generation

**Products saved:**
- ✅ **DSG Certificate PDF** → `{working_dir}/output/certificates/{ProjectName}_DSGCertificate_{date}.pdf`

**File location:** `C:\Users\{User}\Documents\SurveyPro\Projects\{ProjectName}\output\certificates\`

---

## 📁 **Complete Project Folder Structure**

```
C:/Users/{Username}/Documents/SurveyPro/Projects/{ProjectName}/
│
├── input/                                  ← RAW DATA BACKUPS
│   ├── {Project}_imported_2025-11-17.csv  (Original CSV data)
│   └── {Project}_control_points.json       (Control point selections)
│
├── data/                                   ← QGIS/GIS FILES (if applicable)
│   └── ...
│
├── qgis/                                   ← QGIS PROJECT FILES
│   └── ...
│
└── output/                                 ← ALL GENERATED PRODUCTS
    │
    ├── field-book/                         ← FIELD BOOK PDFs
    │   ├── {Project}_FieldBook_2025-11-17.pdf
    │   └── {Project}_FieldBook_2025-11-18.pdf (if re-generated)
    │
    ├── calculations/                       ← CALCULATIONS PART 1 PDFs
    │   ├── {Project}_CalculationsPart1_2025-11-17.pdf
    │   └── Calculations_Part1_Pages_1-135_2025-11-17.pdf (alternative naming)
    │
    ├── coordinate-list/                    ← COORDINATE LIST PDFs
    │   ├── {Project}_CoordinateList_2025-11-17.pdf
    │   └── Coordinate_List_Pages_136-142_2025-11-17.pdf
    │
    ├── complete-reports/                   ← MERGED & AREA PDFs
    │   ├── {Project}_AreaConsistency_2025-11-17.pdf (standalone)
    │   └── {Project}_CompleteReport_2025-11-17.pdf (merged with page numbers)
    │
    ├── reports/                            ← REPORT ON SURVEY PDFs
    │   └── {Project}_ReportOnSurvey_2025-11-17.pdf
    │
    └── certificates/                       ← DSG CERTIFICATES
        └── {Project}_DSGCertificate_2025-11-17.pdf
```

---

## 🔄 **Auto-Save Architecture**

### **Workflow Product Storage Service**

**File:** `app-frontend/src/services/workflowProductStorage.ts`

**Key Functions:**

#### 1. `saveWorkflowProduct(workingDirectory, product)`
Saves a single product (CSV or PDF) to appropriate folder

#### 2. `saveWorkflowProducts(workingDirectory, products[])`
Batch saves multiple products at once

#### 3. `saveRawCSVData(workingDirectory, csvContent, projectName)`
Special handler for raw CSV backup

#### 4. `pointsToCSV(points)`
Converts imported points back to CSV format for backup

#### 5. `autoSaveStepProducts(options)`
**Main auto-save function** - Call this after completing any workflow step

**Usage Example:**
```typescript
import { autoSaveStepProducts, pointsToCSV } from '@/services/workflowProductStorage'

// After importing CSV
const csvContent = pointsToCSV(importedPoints)
await autoSaveStepProducts({
  workingDirectory: workflowState.projectInfo.workingDirectory,
  projectName: workflowState.projectInfo.projectName,
  stepId: 'import_csv',
  products: {
    rawCSV: csvContent
  }
})

// After generating Calculations Part 1
await autoSaveStepProducts({
  workingDirectory: workflowState.projectInfo.workingDirectory,
  projectName: workflowState.projectInfo.projectName,
  stepId: 'calculations_part1',
  products: {
    calculationsPart1: calculationsPart1Blob,
    coordinateList: coordinateListBlob
  }
})

// After generating Area & Consistency
await autoSaveStepProducts({
  workingDirectory: workflowState.projectInfo.workingDirectory,
  projectName: workflowState.projectInfo.projectName,
  stepId: 'calculations_part2',
  products: {
    areaConsistency: areaConsistencyBlob,
    mergedPDF: mergedPDFBlob
  }
})
```

---

## 🎨 **User Experience Flow**

### **Starting a New Project:**

1. **Navigate to Cadastral Workflow**
2. **Step 0: Project Setup** is displayed first
   - Form shows:
     - Project Name
     - District
     - Central Meridian
     - Working Directory selector (with recommended path)
     - Surveyor selector
     - Survey date
     - Control points selector
   - User fills out information
   - Click "Complete Setup & Proceed to Import"
   - **Step 0 marked complete**
   - Working directory verified/created
   - Proceeds to Step 1

3. **Step 1: Import CSV**
   - Upload CSV file
   - System validates data
   - ✅ **Auto-saves raw CSV to `/input/` folder**
   - Step marked complete
   - Proceeds to Step 2

4. **Step 2: Field Book**
   - Click "Generate Field Book"
   - PDF generated
   - ✅ **Downloaded to browser Downloads folder**
   - ✅ **Auto-saved to `/output/field-book/` folder**
   - Console confirms: "✅ Field Book saved to: C:\..."
   - Step marked complete

5. **Step 3: Calculations Part 1**
   - Fill in surveyor information
   - Click "Generate Calculations Part 1"
   - Two PDFs generated (Calcs Part 1 + Coordinate List)
   - ✅ **Both downloaded to browser**
   - ✅ **Both auto-saved to respective folders**
   - Console confirms both saves
   - Step marked complete

6. **Step 5: Area & Consistency**
   - Import GeoJSON or draw parcels
   - Click "Generate Area & Consistency PDF"
   - Two options appear:
     - "Download Standalone PDF"
     - "Merge with Calculations Part 1"
   - User selects merge option
   - ✅ **Standalone PDF saved to `/output/complete-reports/`**
   - ✅ **Merged PDF saved to `/output/complete-reports/`**
   - Both have continuous page numbering
   - Step marked complete

### **Accessing Saved Products:**

**Method 1: Workflow Dashboard (NEW!)**
- Click on completed step card
- PDF link shown (e.g., "📄 Calculations Part 1 PDF")
- Click link → Path copied to clipboard
- Alert shows full path
- Paste into File Explorer → Navigate to folder

**Method 2: Direct File Explorer**
- Open File Explorer
- Navigate to `C:\Users\{You}\Documents\SurveyPro\Projects\{ProjectName}\`
- Browse `output/` subfolders
- All generated PDFs are there, organized by type

**Method 3: Re-download from App**
- Click "View" button on completed step
- PDF preview modal opens
- Click "Download" to download again
- Click "Open Folder" to navigate to saved location

---

## 🔧 **Implementation Requirements**

### **Frontend Changes Needed:**

1. **Update CadastralStandardView.vue:**
   ```typescript
   // Import the new service
   import { autoSaveStepProducts, pointsToCSV } from '@/services/workflowProductStorage'
   
   // After CSV import
   const csvContent = pointsToCSV(workflowState.importedPoints)
   await autoSaveStepProducts({
     workingDirectory: workflowState.projectInfo.workingDirectory,
     projectName: workflowState.projectInfo.projectName,
     stepId: 'import_csv',
     products: { rawCSV: csvContent }
   })
   
   // After Field Book generation
   await autoSaveStepProducts({
     workingDirectory: workflowState.projectInfo.workingDirectory,
     projectName: workflowState.projectInfo.projectName,
     stepId: 'field_book',
     products: { fieldBook: fieldBookBlob }
   })
   
   // After Calculations Part 1
   await autoSaveStepProducts({
     workingDirectory: workflowState.projectInfo.workingDirectory,
     projectName: workflowState.projectInfo.projectName,
     stepId: 'calculations_part1',
     products: {
       calculationsPart1: calculationsPart1Blob,
       coordinateList: coordinateListBlob
     }
   })
   ```

2. **Update MapLibreAreaView.vue:**
   ```typescript
   // After generating Area & Consistency + Merge
   await autoSaveStepProducts({
     workingDirectory: workflowState.projectInfo.workingDirectory,
     projectName: workflowState.projectInfo.projectName,
     stepId: 'calculations_part2',
     products: {
       areaConsistency: standaloneBlob,
       mergedPDF: mergedBlob
     }
   })
   ```

3. **Create Project Setup Step Component:**
   - New file: `ProjectSetupView.vue`
   - Shows form with all project configuration fields
   - Validates working directory
   - Creates project folder structure on completion
   - Saves project metadata to database

4. **Update Workflow Navigation:**
   - Update `CadastralStandardView.vue` to show Step 0 first
   - Add routing for `/project-setup` step
   - Update step indicators to show 8 steps instead of 7

### **Backend Changes Needed:**

1. **Update survey-projects.js:**
   ```javascript
   // Add 'project_setup' to required steps
   const requiredSteps = [
     'project_setup',      // NEW!
     'import_csv',
     'field_book',
     'calculations_part1',
     'coordinate_list',
     'calculations_part2',
     'report_on_survey',
     'dsg_certificate'
   ]
   ```

2. **No other backend changes needed:**
   - `/api/documents/save` endpoint already exists ✅
   - `/api/system/info` endpoint already exists ✅
   - Directory creation already handled ✅

---

## 📊 **Benefits of New Architecture**

### **For Users:**
1. ✅ **Clear workflow** - Step 0 sets context for entire workflow
2. ✅ **No lost work** - All products automatically saved
3. ✅ **Easy access** - Clickable folder links work immediately
4. ✅ **Organized files** - Logical folder structure
5. ✅ **Backup included** - Raw CSV data preserved
6. ✅ **Versioning** - Timestamps allow multiple versions
7. ✅ **Offline access** - All files saved locally

### **For Developers:**
1. ✅ **Single source of truth** - Project info in workflow state
2. ✅ **No reference problems** - Everything linked properly
3. ✅ **Consistent patterns** - Same auto-save for all products
4. ✅ **Easy to extend** - Add new products easily
5. ✅ **Better testing** - Can verify files saved correctly
6. ✅ **Audit trail** - All file operations logged

### **For Data Integrity:**
1. ✅ **Raw data preserved** - Original CSV never lost
2. ✅ **Reproducible** - Can regenerate from raw data
3. ✅ **Traceable** - Timestamps show generation sequence
4. ✅ **Recoverable** - Files persist even if browser crashes

---

## 🚀 **Migration Strategy**

### **Phase 1: Add Auto-Save (DONE)**
- ✅ Created `workflowProductStorage.ts` service
- ✅ Updated `cadastralWorkflow.ts` with Step 0
- ✅ Documentation created

### **Phase 2: Update Existing Steps (NEXT)**
- Update CSV import to save raw data
- Update Field Book generation to auto-save
- Update Calculations Part 1 to auto-save both PDFs
- Update Area & Consistency to auto-save merged PDF

### **Phase 3: Create Project Setup Step**
- Build `ProjectSetupView.vue` component
- Integrate into workflow navigation
- Update backend to handle `project_setup` step

### **Phase 4: Testing & Refinement**
- Test with real projects
- Verify all files saved correctly
- Check folder structure creation
- Validate clickable links work

### **Phase 5: User Documentation**
- Update user manual
- Create video tutorial
- Add in-app help tooltips

---

## 📝 **Next Steps for Implementation**

1. **Review this architecture** with team/stakeholders
2. **Create ProjectSetupView.vue** component
3. **Update CadastralStandardView.vue** to show Step 0 first
4. **Integrate auto-save** into each workflow step
5. **Test thoroughly** with sample projects
6. **Update user documentation**
7. **Deploy to production**

---

## 🎯 **Success Criteria**

- [ ] Step 0 (Project Setup) appears first in workflow
- [ ] Raw CSV data saved to `/input/` folder after import
- [ ] Field Book PDF saved to `/output/field-book/` folder
- [ ] Calculations Part 1 + Coordinate List saved to respective folders
- [ ] Area & Consistency PDFs (both standalone and merged) saved
- [ ] All folder structures created automatically
- [ ] Clickable PDF links navigate to correct folders
- [ ] Console logs confirm successful saves
- [ ] Files persist across browser refreshes
- [ ] Multiple versions can coexist (timestamped)

---

**This new architecture ensures that every workflow product is preserved, organized, and easily accessible for users to work with outside the application!** 🎉
