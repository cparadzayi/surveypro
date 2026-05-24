# 📁 PDF Document Storage & Navigation

## 📍 Where Are PDFs Stored?

All generated PDFs are organized in the project's working directory under the `output/` folder.

### **Directory Structure:**

```
C:/Users/User/Documents/SurveyPro/Projects/{ProjectName}/
├── data/                          (Survey data files)
├── qgis/                          (QGIS project files)
└── output/                        ← PDF documents stored here
    ├── field-book/                (Field Book PDFs)
    ├── calculations/              (Calculations Part 1 PDFs) ← HERE!
    ├── coordinate-list/           (Coordinate List PDFs)
    ├── complete-reports/          (Merged PDFs - Area & Consistency appended)
    ├── reports/                   (Report on Survey PDFs)
    └── certificates/              (DSG Certificate PDFs)
```

### **Calculations Part 1 PDF Location:**

```
{WorkingDirectory}/output/calculations/Calculations_Part1_{Timestamp}.pdf
```

**Example:**
```
C:/Users/User/Documents/SurveyPro/Projects/Elon_Estates_Gwelo_2025-10-28/
    output/calculations/Calculations_Part1_Pages_1-135_2025-11-16.pdf
```

## ✅ Clickable PDF Links

### **Feature Overview**

Each completed workflow step now shows a clickable PDF link that:
1. ✅ **Displays the PDF type** (e.g., "Calculations Part 1 PDF")
2. ✅ **Opens folder location** when clicked
3. ✅ **Copies path to clipboard** automatically
4. ✅ **Shows full path** in alert dialog

### **How It Works**

#### **Step Card Display:**

```
┌─────────────────────────────────────────┐
│  ✓ Calculations Part 1                  │
│                                          │
│  🧮 Field computations and adjustments  │
│                                          │
│  ✅ Completed 11/16/2025 10:52 PM       │
│  📍 542 points                           │
│  📄 Calculations Part 1 PDF  ← Clickable!│
│  🔘 5 control points                     │
│                                          │
│  [👁️ View] [✏️ Edit / Re-generate]      │
└─────────────────────────────────────────┘
```

#### **Click Behavior:**

**When you click on "📄 Calculations Part 1 PDF":**

1. **Clipboard Copy** - Path is automatically copied to clipboard
2. **Alert Shows** - Full folder path with instructions
3. **Console Logs** - Path logged for debugging

**Alert Message:**
```
📁 Document Location:

C:\Users\User\Documents\SurveyPro\Projects\
Elon_Estates_Gwelo_2025-10-28\output\calculations

ℹ️ Copy this path and paste it into File Explorer's
   address bar to open the folder.

💡 Tip: Press Ctrl+C to copy, then press Windows+E
   to open File Explorer.

✅ Path copied to clipboard!
```

### **Usage Instructions**

**Method 1: Direct Paste (Recommended)**
1. Click the PDF link
2. Path is auto-copied to clipboard
3. Press `Windows + E` to open File Explorer
4. Click the address bar (or press `Ctrl + L`)
5. Press `Ctrl + V` to paste the path
6. Press `Enter`

**Method 2: Manual Copy**
1. Click the PDF link
2. Copy the path from the alert dialog
3. Open File Explorer manually
4. Paste the path in the address bar

## 🗂️ PDF Folder Mapping

| Step | Document Type | Folder Path |
|------|--------------|-------------|
| **Field Book** | `field_book` | `output/field-book/` |
| **Calculations Part 1** | `calculations_part1` | `output/calculations/` |
| **Coordinate List** | `coordinate_list` | `output/coordinate-list/` |
| **Calculations Part 2** | `calculations_part2` | `output/complete-reports/` |
| **Report on Survey** | `report_on_survey` | `output/reports/` |
| **DSG Certificate** | `dsg_certificate` | `output/certificates/` |

## 🔄 **Automatic Save to Project Folder (NEW!)**

**When you generate any PDF (Field Book, Calculations Part 1, Coordinate List, etc.):**

1. ✅ **Downloaded** to your browser's Downloads folder (for immediate access)
2. ✅ **Auto-saved** to project working directory (for permanent storage)
3. ✅ **Directory created** automatically if it doesn't exist
4. ✅ **Console log** confirms successful save

**Example Console Output:**
```
💾 Saving PDFs to project directory...
✅ Calculations Part 1 saved to: C:/Users/mataranyika/Documents/SurveyPro/Projects/Project_2025-11-16/output/calculations/Calculations_Part1_Pages_1-135_2025-11-16.pdf
✅ Coordinate List saved to: C:/Users/mataranyika/Documents/SurveyPro/Projects/Project_2025-11-16/output/coordinate-list/Coordinate_List_Pages_136-142_2025-11-16.pdf
```

**Now your PDFs are automatically organized and the clickable folder links will work immediately!** 🎉

## 📝 File Naming Conventions

### **Calculations Part 1:**
```
Calculations_Part1_Pages_{Start}-{End}_{Date}.pdf
```
**Example:**
```
Calculations_Part1_Pages_1-135_2025-11-16.pdf
```

### **Complete Reports (Merged):**
```
Complete_Report_{ProjectName}_{Timestamp}.pdf
```
**Example:**
```
Complete_Report_Elon_Estates_1731855234567.pdf
```

### **Field Book:**
```
Field_Book_{ProjectName}_{Timestamp}.pdf
```

### **Coordinate List:**
```
Coordinate_List_{ProjectName}_{Timestamp}.pdf
```

## 🔍 Finding PDFs Manually

### **Step-by-Step:**

1. **Open Project Selector** (top of workflow page)
2. **Note the Working Directory** shown under project selection
3. **Navigate in File Explorer:**
   ```
   {WorkingDirectory} → output → {document-folder}
   ```

### **Quick Navigation:**

**Windows Explorer:**
```
C:\Users\{YourUsername}\Documents\SurveyPro\Projects\{ProjectName}\output
```

**From Working Directory Selector:**
- The working directory path is shown when you select a project
- Example: `Documents/SurveyPro/Projects/Elon_Estates_Gwelo_2025-10-28`

## 💾 Document Persistence

### **Where Documents Are Saved:**

**Generated PDFs:**
- Saved to `{working_directory}/output/{document-type}/`
- Persisted on disk permanently
- Organized by document type

**Document Metadata:**
- Stored in PostgreSQL database
- Includes: document type, timestamp, file path, page count
- Linked to workflow state for each project

### **Database Schema:**

```sql
-- Workflow state stores document metadata
workflow_state {
  step_data: {
    "calculations-part1": {
      document_type: "calculations_part1",
      completed_at: "2025-11-16T10:52:00Z",
      point_count: 542,
      control_points_used: 5
    }
  }
}
```

## 🚀 Implementation Details

### **Frontend Component:**

**File:** `app-frontend/src/components/cadastral/WorkflowDashboard.vue`

**Key Functions:**

```typescript
/**
 * Get the folder path for a step's documents
 */
function getDocumentFolderPath(step: WorkflowStep): string {
  const folderMap: Record<string, string> = {
    'field_book': 'output/field-book',
    'calculations_part1': 'output/calculations', // ← Calculations Part 1
    'coordinate_list': 'output/coordinate-list',
    'calculations_part2': 'output/complete-reports',
    'report_on_survey': 'output/reports',
    'dsg_certificate': 'output/certificates'
  }
  
  const folder = folderMap[docType] || 'output'
  
  // ✅ FIX: Convert relative path to absolute using actual home directory
  const absoluteWorkingDir = makeAbsolutePath(workingDirectory)
  
  return `${absoluteWorkingDir}/${folder}`
}

/**
 * Open the document folder in file explorer
 */
function openDocumentFolder(step: WorkflowStep) {
  const folderPath = getDocumentFolderPath(step)
  const fullPath = folderPath.replace(/\//g, '\\') // Windows format
  
  // Copy to clipboard
  navigator.clipboard.writeText(fullPath)
  
  // Show alert with instructions
  alert(`📁 Document Location:\n\n${fullPath}\n\n...`)
}
```

### **Props Passed:**

```vue
<WorkflowDashboard
  :completed-steps="completedSteps"
  :current-step="workflowState.currentStep"
  :step-data="stepData"
  :working-directory="workflowState.projectInfo.workingDirectory" ← NEW!
  @step-click="handleStepClick"
  @action="handleStepAction"
/>
```

### **HTML Template:**

```vue
<div v-if="getStepMetadata(step)?.document_type" class="text-xs">
  <button
    @click.stop="openDocumentFolder(step)"
    class="text-indigo-600 hover:text-indigo-800 hover:underline"
    :title="`Click to open folder: ${getDocumentFolderPath(step)}`"
  >
    <span>📄</span>
    <span>{{ formatDocumentType(metadata.document_type) }}</span>
  </button>
</div>
```

## 🎯 Use Cases

### **1. Quick Access to Calculations Part 1**

**Scenario:** Need to select Calculations Part 1 PDF for merging

**Steps:**
1. Look at workflow dashboard
2. Click "📄 Calculations Part 1 PDF" link
3. Path copied to clipboard
4. Open File Explorer (`Windows + E`)
5. Paste path in address bar (`Ctrl + V`)
6. Select the PDF file

### **2. Verification After Generation**

**Scenario:** Just generated Calculations Part 1, want to verify it

**Steps:**
1. Generation completes
2. Workflow dashboard updates with green checkmark
3. Click the PDF link
4. Navigate to folder
5. Open PDF to verify

### **3. Email PDF to Client**

**Scenario:** Need to send Calculations Part 1 to client

**Steps:**
1. Click PDF link to open folder
2. Right-click PDF file
3. Select "Send to → Mail recipient"
4. Or attach manually in email client

### **4. Backup/Archive**

**Scenario:** Backing up project documents

**Steps:**
1. Click any PDF link
2. Navigate up one level to `/output/`
3. Copy entire `/output/` folder
4. Paste to backup location

## 📊 Benefits

### **User Experience:**

✅ **One-Click Navigation** - Direct access to folder  
✅ **Auto Clipboard Copy** - No manual copying needed  
✅ **Visual Feedback** - Hover effects show clickability  
✅ **Clear Instructions** - Alert explains how to use path  
✅ **Consistent UX** - Same behavior for all document types

### **Developer Benefits:**

✅ **Centralized Logic** - Single function handles all paths  
✅ **Type Safety** - TypeScript ensures correct folder mapping  
✅ **Easy Maintenance** - Add new document types by updating `folderMap`  
✅ **Cross-Platform** - Path formatting adapts to OS

## 🔧 Troubleshooting

### **"Working directory not set"**

**Cause:** No project selected or working directory not configured

**Solution:**
1. Select a project from dropdown
2. Or set working directory in project settings
3. Refresh the page

### **"Folder not found"** or **Relative Path Issue**

**Cause:** Working directory stored as relative path instead of absolute

**Issue:** Path shows as `Documents\SurveyPro\...` instead of `C:\Users\{Username}\Documents\...`

**Solution (FIXED):**
The system now automatically:
1. Fetches the actual system home directory from backend on component mount
2. Converts relative paths to absolute paths using the real home directory
3. Displays full absolute path in Windows format

**Technical Details:**
- Frontend calls `/api/system/info` to get `homeDirectory` (e.g., `C:\Users\YourUsername`)
- Caches the result for performance
- Uses `makeAbsolutePath()` utility to convert relative → absolute paths
- Example: `Documents/SurveyPro/...` → `C:/Users/YourUsername/Documents/SurveyPro/...`

### **Clipboard copy fails**

**Cause:** Browser doesn't support clipboard API

**Solution:**
- Manually copy path from alert dialog
- Use modern browser (Chrome, Edge, Firefox)
- Check browser permissions

## 📚 Related Documentation

- **PDF Export Implementation:** `COMPLETE_PDF_EXPORT_IMPLEMENTATION.md`
- **PDF Merging:** `PDF_APPEND_WITH_CONTINUED_NUMBERING.md`
- **Export Options:** `MERGED_PDF_EXPORT_OPTIONS.md`
- **Backend Endpoint:** `BACKEND_SAVE_PDF_ENDPOINT.md`
- **Workflow Configuration:** `app-frontend/src/config/cadastralWorkflow.ts`

---

**Summary:** Calculations Part 1 PDFs are stored in `{working_directory}/output/calculations/` and you can quickly access this folder by clicking the "📄 Calculations Part 1 PDF" link in the workflow dashboard, which automatically copies the path to your clipboard!

