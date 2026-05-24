# Cadastral Workflow Persistence - Phase 1 Implementation Guide

## Overview

Phase 1 adds database persistence to the cadastral workflow, enabling:
- ✅ Auto-save workflow progress to survey projects
- ✅ Resume work from any saved state
- ✅ Track completed steps and metadata
- ✅ Store document generation references

## Backend Changes

### Migration
- **File**: `migrations/023.do.sql`
- **Purpose**: Adds `workflow_state` JSONB column to `survey_projects` table
- **Run**: `npm run migrate` in `app-backend` directory

### API Endpoints

#### GET `/api/survey-projects/:id/workflow`
Retrieve workflow state for a project.

**Response:**
```json
{
  "ok": true,
  "workflow_state": {
    "completed_steps": ["import_csv", "field_book"],
    "current_step": "calculations_part1",
    "step_data": {
      "import_csv": {
        "coordinate_count": 45,
        "completed_at": "2025-11-11T14:30:00Z"
      }
    },
    "generated_documents": {},
    "can_finalize": false
  }
}
```

#### PATCH `/api/survey-projects/:id/workflow`
Update workflow state.

**Request Body:**
```json
{
  "step": "import_csv",
  "action": "complete",
  "metadata": {
    "coordinate_count": 45,
    "points": [...]
  }
}
```

**Actions:**
- `complete` - Mark step as completed
- `set_current` - Change current step
- `update` - Update metadata without marking complete
- `add_document` - Store document reference
- `reset_step` - Remove from completed steps

## Frontend Changes

### Updated Composable: `useCadastralWorkflow.ts`

#### New Functions

##### 1. Link Workflow to Project
```typescript
const { linkToProject } = useCadastralWorkflow()

// In your component's setup or mounted hook
onMounted(() => {
  const selectedProjectId = localStorage.getItem('selectedProject')
  if (selectedProjectId) {
    linkToProject(parseInt(selectedProjectId))
  }
})
```

##### 2. Load Saved State
```typescript
const { loadWorkflowState } = useCadastralWorkflow()

// Load workflow state when opening a project
async function openProject(projectId: number) {
  try {
    const state = await loadWorkflowState(projectId)
    console.log('Loaded workflow:', state)
    // workflowState.importedPoints will be restored automatically
    // workflowState.currentStep will be set to saved step
  } catch (error) {
    console.error('Failed to load workflow:', error)
  }
}
```

##### 3. Auto-Save on Progress
```typescript
// Auto-saves when points are imported
setImportedPoints(parsedPoints)  // Automatically saves to DB

// Manually mark step complete
await completeCurrentStep({
  page_count: 10,
  precision: 3
})

// Update step metadata
await updateCurrentStep({
  notes: 'Adjusted for closure error'
})
```

##### 4. Document Tracking
```typescript
const { addGeneratedDocument } = useCadastralWorkflow()

// After generating a PDF
await addGeneratedDocument(
  'field_book_pdf',
  '/api/documents/project-21/field-book.pdf',
  {
    page_count: 12,
    generated_at: new Date().toISOString()
  }
)
```

## Integration Steps

### Step 1: Run Migration
```bash
cd app-backend
npm run migrate
```

### Step 2: Update CadastralStandardView.vue

Add this to your component setup:

```typescript
import { useCadastralWorkflow } from '@/composables/useCadastralWorkflow'
import { onMounted, watch } from 'vue'

const { 
  workflowState, 
  linkToProject, 
  loadWorkflowState,
  setCurrentStep 
} = useCadastralWorkflow()

// Link to project on mount
onMounted(async () => {
  const selectedProject = localStorage.getItem('selectedProject')
  if (selectedProject) {
    const projectData = JSON.parse(selectedProject)
    
    // Link workflow to project
    linkToProject(projectData.id)
    
    // Load saved workflow state
    try {
      await loadWorkflowState(projectData.id)
      console.log('✅ Workflow state restored')
    } catch (error) {
      console.log('ℹ️ No saved workflow state, starting fresh')
    }
  }
})

// Auto-save when step changes
watch(() => workflowState.currentStep, (newStep) => {
  setCurrentStep(newStep)
})
```

### Step 3: Test the Flow

1. **Create a new project** in the dashboard
2. **Navigate to Cadastral Standard** module
3. **Import CSV coordinates** - should auto-save
4. **Refresh the page** - coordinates should be restored
5. **Check backend logs** - should see workflow save messages

## Example Usage Patterns

### Pattern 1: Import & Save
```typescript
// In CSV import handler
async function handleCSVImport(file: File) {
  const points = await parseCSV(file)
  
  // This auto-saves to database
  setImportedPoints(points)
  
  // Move to next step
  await setCurrentStep('field-book')
}
```

### Pattern 2: Generate Document & Track
```typescript
// After generating field book PDF
async function generateFieldBook() {
  buildFieldBook()
  
  const pdf = await createFieldBookPDF()
  const url = await uploadPDF(pdf)
  
  // Track document
  await addGeneratedDocument('field_book', url, {
    page_count: pdf.pageCount
  })
  
  // Mark step complete
  await completeCurrentStep({
    page_count: pdf.pageCount,
    precision: 3
  })
}
```

### Pattern 3: Resume Workflow
```typescript
// When user returns to a project
onMounted(async () => {
  const projectId = route.params.projectId
  
  try {
    const state = await loadWorkflowState(projectId)
    
    if (state.completed_steps.includes('import_csv')) {
      // Skip import, show edit options
      showEditOptions.value = true
    }
    
    if (state.current_step === 'calculations_part1') {
      // Jump directly to calculations
      activeTab.value = 'calculations'
    }
  } catch (error) {
    // New workflow, start from beginning
  }
})
```

## Testing Checklist

- [ ] Migration runs without errors
- [ ] Backend responds to GET `/api/survey-projects/:id/workflow`
- [ ] Backend responds to PATCH `/api/survey-projects/:id/workflow`
- [ ] Frontend can link to a project
- [ ] Frontend can load saved state
- [ ] Imported points are auto-saved
- [ ] Workflow state persists across page refreshes
- [ ] Console logs show save/load messages

## Next Steps (Phase 2)

- [ ] Add visual indicators for completed steps
- [ ] Enable jumping to any accessible step
- [ ] Add step validation (check prerequisites)
- [ ] Show "View/Edit" buttons for completed steps
- [ ] Add progress percentage calculation

## Troubleshooting

### Issue: Workflow not saving
**Check:**
1. Is `projectId` set? (Call `linkToProject()`)
2. Is user authenticated?
3. Check browser console for error messages
4. Check backend logs for PATCH errors

### Issue: State not loading
**Check:**
1. Does project exist in database?
2. Has workflow state been saved before?
3. Check network tab for 404/403 errors
4. Verify project ownership

### Issue: Points not restoring
**Check:**
1. Are points saved in correct format?
2. Check `step_data.import_csv.points` in database
3. Verify date parsing (surveyDate conversion)

## Support

For issues or questions:
1. Check backend logs: `npm run dev` in `app-backend`
2. Check browser console for errors
3. Verify database schema: `\d survey_projects` in psql
