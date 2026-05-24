# 🚀 Workflow Auto-Save - Quick Implementation Guide

## ✅ **What's Already Done**

1. ✅ **Workflow configuration updated** - Step 0 (Project Setup) added
2. ✅ **Auto-save service created** - `workflowProductStorage.ts` ready to use
3. ✅ **Path resolution fixed** - Relative → Absolute path conversion working
4. ✅ **Backend endpoints ready** - `/api/documents/save` exists and works
5. ✅ **Documentation complete** - Architecture fully documented

---

## 🎯 **What Needs to Be Done**

### **Priority 1: Integrate Auto-Save into Existing Steps** ⭐

#### **Step 1: Update CSV Import to Save Raw Data**

**File:** `app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue`

**Location:** After successful CSV import (around line ~1200)

**Add:**
```typescript
import { autoSaveStepProducts, pointsToCSV } from '../../../services/workflowProductStorage'

// After CSV import success
const csvContent = pointsToCSV(workflowState.importedPoints)
await autoSaveStepProducts({
  workingDirectory: workflowState.projectInfo.workingDirectory,
  projectName: workflowState.projectInfo.projectName || 'Survey_Project',
  stepId: 'import_csv',
  products: {
    rawCSV: csvContent
  }
})
```

---

#### **Step 2: Update Field Book Generation**

**File:** `app-frontend/src/views/modules/cadastral-standard/FieldBookView.vue` or wherever Field Book is generated

**Add after PDF generation:**
```typescript
import { autoSaveStepProducts } from '@/services/workflowProductStorage'

// After Field Book PDF generated
await autoSaveStepProducts({
  workingDirectory: workflowState.projectInfo.workingDirectory,
  projectName: workflowState.projectInfo.projectName,
  stepId: 'field_book',
  products: {
    fieldBook: fieldBookPdfBlob
  }
})
```

---

#### **Step 3: Update Calculations Part 1 (ALREADY PARTIALLY DONE)**

**File:** `app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue`

**Current code (lines 1468-1501):**
```typescript
// ✅ Save PDFs to project working directory
if (workflowState.projectInfo.workingDirectory) {
  // ... manual save code ...
}
```

**Replace with:**
```typescript
// ✅ Auto-save all products
if (workflowState.projectInfo.workingDirectory) {
  await autoSaveStepProducts({
    workingDirectory: workflowState.projectInfo.workingDirectory,
    projectName: workflowState.projectInfo.projectName || 'Survey_Project',
    stepId: 'calculations_part1',
    products: {
      calculationsPart1: result.calculationsPart1PDF,
      coordinateList: result.coordinateListPDF
    }
  })
}
```

---

#### **Step 4: Update Area & Consistency Generation**

**File:** `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue`

**Add after merge/generation (around line ~1560):**
```typescript
import { autoSaveStepProducts } from '@/services/workflowProductStorage'

// After generating merged PDF
await autoSaveStepProducts({
  workingDirectory: workflowState.value.projectInfo.workingDirectory,
  projectName: workflowState.value.projectInfo.projectName,
  stepId: 'calculations_part2',
  products: {
    areaConsistency: standaloneAreaPDF,  // if you have it
    mergedPDF: mergedPDFBlob
  }
})
```

---

### **Priority 2: Create Project Setup Step Component** ⭐

**Create new file:** `app-frontend/src/views/modules/cadastral-standard/ProjectSetupView.vue`

**Minimal working version:**

```vue
<template>
  <div class="max-w-4xl mx-auto p-6">
    <div class="bg-white shadow-lg rounded-lg p-8">
      <h1 class="text-2xl font-bold text-gray-900 mb-2">
        ⚙️ Project Setup & Configuration
      </h1>
      <p class="text-gray-600 mb-6">
        Set up your project information and working directory before starting the cadastral workflow.
      </p>

      <form @submit.prevent="completeSetup" class="space-y-6">
        <!-- Project Name -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Project Name *
          </label>
          <input
            v-model="setupData.projectName"
            type="text"
            required
            class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="e.g., Elon Estates Gwelo"
          />
        </div>

        <!-- District -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">
            District
          </label>
          <input
            v-model="setupData.district"
            type="text"
            class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="e.g., Gwelo"
          />
        </div>

        <!-- Working Directory -->
        <div>
          <WorkingDirectorySelector
            v-model="setupData.workingDirectory"
            :project-name="setupData.projectName || 'Project'"
            :district="setupData.district"
          />
        </div>

        <!-- Central Meridian -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Central Meridian (Lo)
          </label>
          <select
            v-model="setupData.centralMeridian"
            class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option :value="27">Lo 27</option>
            <option :value="29">Lo 29</option>
            <option :value="31" selected>Lo 31</option>
            <option :value="33">Lo 33</option>
          </select>
        </div>

        <!-- Submit Button -->
        <div class="flex justify-end space-x-4 pt-4">
          <button
            type="submit"
            class="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
          >
            ✅ Complete Setup & Proceed to Import CSV
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import WorkingDirectorySelector from '../../../components/cadastral/WorkingDirectorySelector.vue'

const emit = defineEmits<{
  complete: [setupData: any]
}>()

const setupData = ref({
  projectName: '',
  district: '',
  workingDirectory: '',
  centralMeridian: 31
})

function completeSetup() {
  if (!setupData.value.projectName) {
    alert('Please enter a project name')
    return
  }
  
  if (!setupData.value.workingDirectory) {
    alert('Please set a working directory')
    return
  }
  
  // Emit completion event
  emit('complete', setupData.value)
}
</script>
```

---

### **Priority 3: Update Cadastral View to Show Step 0**

**File:** `app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue`

**Add to template (around line ~105):**
```vue
<!-- Project Setup Step (Step 0) -->
<div v-if="workflowState.currentStep === 'project-setup'">
  <ProjectSetupView
    @complete="handleProjectSetupComplete"
  />
</div>
```

**Add to script:**
```typescript
import ProjectSetupView from './ProjectSetupView.vue'

async function handleProjectSetupComplete(setupData: any) {
  // Save setup data to workflow state
  workflowState.projectInfo.projectName = setupData.projectName
  workflowState.projectInfo.district = setupData.district
  workflowState.projectInfo.workingDirectory = setupData.workingDirectory
  workflowState.projectInfo.centralMeridian = setupData.centralMeridian
  
  // Mark step as complete
  await completeCurrentStep({
    project_name: setupData.projectName,
    district: setupData.district,
    working_directory: setupData.workingDirectory,
    central_meridian: setupData.centralMeridian
  })
  
  // Move to next step (Import CSV)
  workflowState.currentStep = 'csv-import'
  
  console.log('✅ Project setup complete. Ready to import CSV.')
}
```

---

### **Priority 4: Update Backend to Recognize Step 0**

**File:** `app-backend/src/routes/survey-projects.js`

**Update required steps array (around line ~366):**
```javascript
const requiredSteps = [
  'project_setup',         // ← ADD THIS
  'import_csv',
  'field_book',
  'calculations_part1',
  'coordinate_list',
  'calculations_part2',
  'report_on_survey',
  'dsg_certificate'
]
```

---

## 🧪 **Testing Checklist**

After implementing the changes:

- [ ] Step 0 (Project Setup) appears first in workflow
- [ ] Can fill out project info and complete Step 0
- [ ] CSV import saves raw CSV to `/input/` folder
- [ ] Field Book saves to `/output/field-book/` folder
- [ ] Calculations Part 1 + Coordinate List save to respective folders
- [ ] Area & Consistency saves merged PDF
- [ ] All folders created automatically
- [ ] Clickable PDF links work and show correct paths
- [ ] Console logs show successful saves
- [ ] Can find all files in File Explorer
- [ ] Files persist after closing browser

---

## 🎨 **Quick Start for Testing**

1. **Start fresh:**
   - Clear any existing project data
   - Refresh the application

2. **Test new flow:**
   - Navigate to Cadastral Workflow
   - Should see "Project Setup" as Step 0
   - Fill out form, click Complete
   - Should proceed to Import CSV (Step 1)
   - Import CSV - check console for "✅ Raw CSV saved"
   - Generate Field Book - check console for save confirmation
   - Generate Calculations - check console for both PDFs saved
   - Generate Area & Consistency - check merged PDF saved

3. **Verify files exist:**
   - Open File Explorer
   - Navigate to working directory
   - Check `/input/` folder - CSV should be there
   - Check `/output/` subfolders - PDFs should be there

---

## 📝 **Console Output You Should See**

When everything is working:

```
💾 [Product Storage] Auto-saving products for step: import_csv
💾 [Product Storage] Saving raw-data: Elon_Estates_imported_2025-11-17.csv
✅ [Product Storage] Saved raw-data to: C:/Users/mataranyika/Documents/SurveyPro/Projects/Elon_Estates_2025-11-17/input/Elon_Estates_imported_2025-11-17.csv
✅ [Product Storage] Saved 1/1 products successfully

💾 [Product Storage] Auto-saving products for step: field_book
💾 [Product Storage] Saving field-book: Elon_Estates_FieldBook_2025-11-17.pdf
✅ [Product Storage] Saved field-book to: C:/Users/mataranyika/Documents/SurveyPro/Projects/Elon_Estates_2025-11-17/output/field-book/Elon_Estates_FieldBook_2025-11-17.pdf
✅ [Product Storage] Saved 1/1 products successfully

💾 [Product Storage] Auto-saving products for step: calculations_part1
💾 [Product Storage] Batch saving 2 products...
💾 [Product Storage] Saving calculations-part1: Elon_Estates_CalculationsPart1_2025-11-17.pdf
✅ [Product Storage] Saved calculations-part1 to: C:/Users/mataranyika/Documents/SurveyPro/Projects/Elon_Estates_2025-11-17/output/calculations/Elon_Estates_CalculationsPart1_2025-11-17.pdf
💾 [Product Storage] Saving coordinate-list: Elon_Estates_CoordinateList_2025-11-17.pdf
✅ [Product Storage] Saved coordinate-list to: C:/Users/mataranyika/Documents/SurveyPro/Projects/Elon_Estates_2025-11-17/output/coordinate-list/Elon_Estates_CoordinateList_2025-11-17.pdf
✅ [Product Storage] Saved 2/2 products successfully
```

---

## 🎯 **Summary**

**Your comprehensive workflow architecture is ready!**

- ✅ **Step 0** added for project setup
- ✅ **Auto-save service** created for all products
- ✅ **Full documentation** provided
- ⏳ **Integration** needed in existing components
- ⏳ **ProjectSetupView** component to be created
- ⏳ **Testing** to verify everything works

**Next action:** Start with Priority 1 (integrate auto-save into existing steps) and test each step as you go!

**All your workflow products will be automatically saved, organized, and accessible! 🎉**
