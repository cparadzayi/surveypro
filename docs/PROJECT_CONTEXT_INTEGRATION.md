# Project Context Integration - Cross-Module Data Sharing

## Overview
Implemented a shared project context store that allows the Cadastral Standard workflow to share selected project data with other modules like Areas2View, enabling seamless integration across the application.

---

## Architecture

### **Shared Store: `projectContext.ts`**

```typescript
// stores/projectContext.ts
import { ref, computed } from 'vue'
import type { SurveyProject } from '../composables/useSurveyors'

const currentProject = ref<SurveyProject | null>(null)
const currentProjectId = ref<number | null>(null)

export function useProjectContext() {
  const setCurrentProject = (project: SurveyProject | null) => {
    currentProject.value = project
    currentProjectId.value = project?.id || null
  }

  const clearCurrentProject = () => {
    currentProject.value = null
    currentProjectId.value = null
  }

  return {
    currentProject: computed(() => currentProject.value),
    currentProjectId: computed(() => currentProjectId.value),
    hasProject: computed(() => !!currentProject.value),
    setCurrentProject,
    clearCurrentProject
  }
}
```

---

## Implementation

### **1. Cadastral Standard Workflow (Producer)**

**File**: `CadastralStandardView.vue`

**Changes**:
```typescript
// Import project context
import { useProjectContext } from '../../../stores/projectContext'

// Initialize
const { setCurrentProject, clearCurrentProject } = useProjectContext()

// Set project when user selects it
function onProjectChange() {
  const project = surveyProjects.value.find(p => p.id === selectedProjectId.value)
  if (project) {
    // Share project with other modules
    setCurrentProject(project)
    
    // ... rest of existing logic
  }
}
```

**What it does**:
- When user selects a project in Cadastral Standard workflow
- Project data is stored in shared context
- Available to all other modules immediately

---

### **2. Areas2View (Consumer)**

**File**: `Areas2View.vue`

**Changes**:
```typescript
// Import project context
import { useProjectContext } from '../../../../stores/projectContext'

// Access shared project data
const { currentProject, currentProjectId, hasProject } = useProjectContext()
```

**UI Display**:
```vue
<!-- Show active project info -->
<div v-if="currentProject" class="bg-blue-50 border border-blue-200 rounded p-3">
  <div class="flex items-center gap-2 text-sm">
    <span class="font-semibold text-blue-900">📋 Active Project:</span>
    <span class="text-blue-800">{{ currentProject.name }}</span>
    <span v-if="currentProject.client_name">• Client: {{ currentProject.client_name }}</span>
    <span v-if="currentProject.district">• District: {{ currentProject.district }}</span>
  </div>
</div>

<!-- Show message when no project selected -->
<div v-else class="bg-amber-50 border border-amber-200 rounded p-3">
  <div class="text-sm text-amber-800">
    ℹ️ No project selected. Select a project in the Cadastral Standard workflow.
  </div>
</div>
```

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│         CADASTRAL STANDARD WORKFLOW (Producer)              │
├─────────────────────────────────────────────────────────────┤
│  1. User selects surveyor                                   │
│  2. User selects project                                    │
│  3. onProjectChange() called                                │
│  4. setCurrentProject(project) → Shared Store               │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│              PROJECT CONTEXT STORE (Shared)                 │
├─────────────────────────────────────────────────────────────┤
│  • currentProject: SurveyProject | null                     │
│  • currentProjectId: number | null                          │
│  • hasProject: boolean                                      │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│              AREAS2VIEW (Consumer)                          │
├─────────────────────────────────────────────────────────────┤
│  1. Imports useProjectContext()                             │
│  2. Reactive access to currentProject                       │
│  3. Displays project info in UI                             │
│  4. Can use project data for:                               │
│     - Filtering layers                                      │
│     - Auto-populating fields                                │
│     - Saving results to project                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Available Project Data

When a project is selected in Cadastral Standard, the following data is available to all modules:

```typescript
interface SurveyProject {
  id: number
  name: string
  surveyor_id: number
  surveyor_name?: string
  license_number?: string
  project_id?: number
  client_name?: string
  district?: string
  survey_type?: string
  survey_date?: string
  instruments?: string
  designation?: string
  working_directory?: string
  central_meridian?: number | null
  control_point_ids?: number[]
  control_points?: Array<{
    id: number
    monu_num: string
    monu_name: string
    point_order: number
  }>
  status: string
  created_at: string
  updated_at: string
}
```

---

## Usage Examples

### **Example 1: Display Project Info**
```vue
<template>
  <div v-if="currentProject">
    <h2>{{ currentProject.name }}</h2>
    <p>Client: {{ currentProject.client_name }}</p>
    <p>District: {{ currentProject.district }}</p>
  </div>
</template>

<script setup>
import { useProjectContext } from '@/stores/projectContext'
const { currentProject } = useProjectContext()
</script>
```

### **Example 2: Filter Data by Project**
```typescript
const { currentProjectId } = useProjectContext()

// Filter layers by project
const projectLayers = computed(() => {
  if (!currentProjectId.value) return []
  return allLayers.value.filter(l => l.project_id === currentProjectId.value)
})
```

### **Example 3: Auto-populate Fields**
```typescript
const { currentProject } = useProjectContext()

watch(currentProject, (project) => {
  if (project) {
    // Auto-fill form fields
    formData.value.district = project.district
    formData.value.surveyDate = project.survey_date
    formData.value.centralMeridian = project.central_meridian
  }
})
```

### **Example 4: Conditional Features**
```vue
<template>
  <div>
    <button v-if="hasProject" @click="saveToProject">
      Save to {{ currentProject.name }}
    </button>
    <div v-else class="warning">
      Please select a project first
    </div>
  </div>
</template>

<script setup>
import { useProjectContext } from '@/stores/projectContext'
const { currentProject, hasProject } = useProjectContext()

function saveToProject() {
  // Save data associated with current project
  api.post('/data', {
    project_id: currentProject.value.id,
    // ... other data
  })
}
</script>
```

---

## Benefits

### **1. Single Source of Truth**
- Project data managed in one place
- No duplicate project selection UI needed
- Consistent project context across modules

### **2. Seamless Integration**
- Modules automatically aware of active project
- No manual data passing between components
- Reactive updates when project changes

### **3. Better UX**
- Users don't re-select project in each module
- Clear indication of active project
- Contextual features based on project

### **4. Maintainability**
- Centralized project state management
- Easy to add new consumers
- Simple API: `useProjectContext()`

---

## Future Enhancements

### **1. Project-Specific Layer Filtering**
```typescript
// In LayerSelect component
const { currentProjectId } = useProjectContext()

// Only show layers from current project
const filteredLayers = computed(() => {
  if (!currentProjectId.value) return allLayers.value
  return allLayers.value.filter(l => l.project_id === currentProjectId.value)
})
```

### **2. Auto-Save to Project Directory**
```typescript
const { currentProject } = useProjectContext()

async function exportData() {
  const workingDir = currentProject.value?.working_directory
  if (workingDir) {
    // Save to project's working directory
    await api.post('/export', {
      path: `${workingDir}/output/areas/`,
      filename: 'area-computation.pdf'
    })
  }
}
```

### **3. Project-Aware Search**
```typescript
// Search only within current project's data
const { currentProjectId } = useProjectContext()

async function searchPoints(query: string) {
  return api.get('/search', {
    params: {
      q: query,
      project_id: currentProjectId.value
    }
  })
}
```

### **4. Project History/Breadcrumbs**
```vue
<div class="breadcrumbs">
  <span>Projects</span>
  <span v-if="currentProject"> › {{ currentProject.name }}</span>
  <span> › Areas v2</span>
</div>
```

---

## Testing

### **Test 1: Project Selection Flow**
1. Navigate to Cadastral Standard workflow
2. Select a surveyor
3. Select a project (e.g., "Elon Estates Gwelo")
4. Navigate to Lite → Areas v2
5. **Expected**: Blue banner shows "📋 Active Project: Elon Estates Gwelo"

### **Test 2: No Project Selected**
1. Navigate directly to Lite → Areas v2 (without selecting project)
2. **Expected**: Amber banner shows "ℹ️ No project selected..."

### **Test 3: Project Change**
1. Select Project A in Cadastral Standard
2. Navigate to Areas v2 → See Project A
3. Go back to Cadastral Standard
4. Select Project B
5. Navigate to Areas v2 → See Project B (updated)

### **Test 4: Reactive Updates**
1. Open Areas v2 in one browser tab
2. Open Cadastral Standard in another tab
3. Change project in Cadastral Standard
4. **Expected**: Areas v2 updates automatically (if using same Vue app instance)

---

## Migration Guide

### **For Existing Modules**

To add project context to any module:

1. **Import the composable**:
```typescript
import { useProjectContext } from '@/stores/projectContext'
```

2. **Access project data**:
```typescript
const { currentProject, currentProjectId, hasProject } = useProjectContext()
```

3. **Use in template**:
```vue
<div v-if="currentProject">
  Working with: {{ currentProject.name }}
</div>
```

4. **Use in logic**:
```typescript
watch(currentProjectId, (projectId) => {
  if (projectId) {
    loadProjectData(projectId)
  }
})
```

---

## Related Files

- **Store**: `app-frontend/src/stores/projectContext.ts`
- **Producer**: `app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue`
- **Consumer**: `app-frontend/src/views/modules/lite/areas2/Areas2View.vue`
- **Types**: `app-frontend/src/composables/useSurveyors.ts` (SurveyProject interface)

---

## Notes

- The store uses Vue's reactivity system (ref + computed)
- Project context persists during app session
- Context is cleared when user logs out (implement in auth logic)
- Can be extended to store other shared workflow data
- Compatible with Pinia if needed for persistence

---

## Troubleshooting

### **Issue: Project not showing in Areas2View**
**Cause**: Project not set in Cadastral Standard workflow  
**Solution**: Select a project in Cadastral Standard first

### **Issue: Project data is stale**
**Cause**: Project changed but component not reactive  
**Solution**: Ensure using computed properties from `useProjectContext()`

### **Issue: Multiple project contexts**
**Cause**: Using different Vue app instances  
**Solution**: Ensure single app instance or use Pinia for cross-instance state

---

## Summary

✅ **Implemented**: Shared project context store  
✅ **Producer**: Cadastral Standard sets project on selection  
✅ **Consumer**: Areas2View displays and uses project data  
✅ **Benefits**: Single source of truth, seamless integration, better UX  
✅ **Extensible**: Easy to add more consumers and features
