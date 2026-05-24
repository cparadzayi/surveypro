# Surveyor Management System Implementation Guide

## Overview
This document outlines the implementation of a database-backed surveyor management system to eliminate repetitive data entry across the SurveyPro application.

## Database Changes

### 1. Migration Created: `007.do.sql`
Location: `app-backend/migrations/007.do.sql`

**Tables Created:**
- `surveyors` - Stores surveyor information
- `survey_projects` - Stores project information linked to surveyors

**Run Migration:**
```bash
cd app-backend
npm run migrate
```

## Backend Implementation

### 2. Models Created
- `app-backend/src/models/Surveyor.js` - Surveyor CRUD operations
- `app-backend/src/models/SurveyProject.js` - Survey project CRUD operations

### 3. API Routes Created
- `app-backend/src/routes/surveyors.js` - Surveyor endpoints
- `app-backend/src/routes/survey-projects.js` - Survey project endpoints

**API Endpoints:**
- `GET /api/surveyors` - List all surveyors
- `GET /api/surveyors/:id` - Get surveyor by ID
- `POST /api/surveyors` - Create new surveyor
- `PUT /api/surveyors/:id` - Update surveyor
- `DELETE /api/surveyors/:id` - Soft delete surveyor

- `GET /api/survey-projects` - List all survey projects
- `GET /api/survey-projects/:id` - Get project by ID
- `POST /api/survey-projects` - Create new project
- `PUT /api/survey-projects/:id` - Update project
- `DELETE /api/survey-projects/:id` - Archive project

## Frontend Implementation

### 4. Composable Created
**File:** `app-frontend/src/composables/useSurveyors.ts`

Provides reactive state and methods for:
- Fetching surveyors
- Creating/updating/deleting surveyors
- Managing survey projects
- Dropdown options for surveyor selection

### 5. Component Created
**File:** `app-frontend/src/components/cadastral/SurveyorSelector.vue`

**Features:**
- Dropdown to select existing surveyor
- Auto-populates surveyor information (name, license, firm, address, phone)
- "+" button to add new surveyor inline
- Modal form for adding new surveyors
- Displays selected surveyor information

## Integration Steps

### Step 1: Update CadastralStandardView.vue

**Location:** `app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue`

**Changes needed at line ~158-232:**

1. **Import the component:**
```vue
<script setup lang="ts">
import SurveyorSelector from '../../components/cadastral/SurveyorSelector.vue'
import { ref } from 'vue'
import type { Surveyor } from '../../composables/useSurveyors'

const selectedSurveyorId = ref<number | null>(null)

const onSurveyorSelected = (surveyor: Surveyor | null) => {
  if (surveyor) {
    workflowState.surveyorInfo.landSurveyor = surveyor.name
    workflowState.surveyorInfo.licenseNumber = surveyor.license_number
    workflowState.surveyorInfo.firm = surveyor.firm || ''
    workflowState.surveyorInfo.address = surveyor.address || ''
  }
}
</script>
```

2. **Replace the surveyor information form section (lines 158-179):**

**OLD:**
```vue
<div>
  <label for="landSurveyor" class="block text-sm font-medium text-gray-700 mb-2">
    Land Surveyor Name
  </label>
  <input
    id="landSurveyor"
    v-model="workflowState.surveyorInfo.landSurveyor"
    type="text"
    class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
    placeholder="e.g., O Saunyama"
  />
</div>
```

**NEW:**
```vue
<!-- Surveyor Selector Component -->
<SurveyorSelector
  v-model="selectedSurveyorId"
  @surveyor-selected="onSurveyorSelected"
  class="mb-6"
/>
```

3. **Make auto-filled fields readonly:**
```vue
<!-- License Number (auto-filled, readonly) -->
<div>
  <label class="block text-sm font-medium text-gray-700 mb-2">
    License Number
  </label>
  <input
    v-model="workflowState.surveyorInfo.licenseNumber"
    type="text"
    readonly
    class="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-600"
    placeholder="Auto-filled from surveyor selection"
  />
</div>

<!-- Firm (auto-filled, readonly) -->
<div>
  <label class="block text-sm font-medium text-gray-700 mb-2">
    Surveying Firm
  </label>
  <input
    v-model="workflowState.surveyorInfo.firm"
    type="text"
    readonly
    class="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-600"
    placeholder="Auto-filled from surveyor selection"
  />
</div>

<!-- Address (auto-filled, readonly) -->
<div class="lg:col-span-2">
  <label class="block text-sm font-medium text-gray-700 mb-2">
    Surveying Firm Address
  </label>
  <textarea
    v-model="workflowState.surveyorInfo.address"
    rows="3"
    readonly
    class="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-600"
    placeholder="Auto-filled from surveyor selection"
  ></textarea>
</div>
```

### Step 2: Update CalculationsPart1View.vue

**Location:** `app-frontend/src/views/modules/cadastral-standard/CalculationsPart1View.vue`

**Changes needed at line ~404-430:**

1. **Import and add surveyor selector:**
```vue
<script setup lang="ts">
import SurveyorSelector from '../../components/cadastral/SurveyorSelector.vue'
// ... other imports
</script>

<template>
  <!-- Replace surveyor name input with SurveyorSelector -->
  <SurveyorSelector
    v-model="selectedSurveyorId"
    @surveyor-selected="onSurveyorSelected"
    class="mb-4"
  />
</template>
```

### Step 3: Update useCadastralWorkflow.ts

**Location:** `app-frontend/src/composables/useCadastralWorkflow.ts`

**Add license number and firm to surveyorInfo:**
```typescript
surveyorInfo: {
  landSurveyor: '',
  licenseNumber: '',  // ADD THIS
  firm: '',           // ADD THIS
  address: '',
  surveyDate: '',
  surveyOf: '',
  instruments: ''
}
```

## Testing Checklist

### Backend Testing
1. ✅ Run migration: `npm run migrate`
2. ✅ Restart backend: `npm run dev`
3. ✅ Test API endpoints with Postman/curl:
   - Create surveyor
   - List surveyors
   - Update surveyor
   - Delete surveyor

### Frontend Testing
1. ✅ Start frontend: `npm run dev`
2. ✅ Navigate to Cadastral Standard module
3. ✅ Test surveyor selector:
   - Select existing surveyor
   - Verify auto-population of fields
   - Add new surveyor via "+" button
   - Verify new surveyor appears in dropdown
4. ✅ Complete workflow with selected surveyor
5. ✅ Verify surveyor info appears in generated PDFs

## Benefits

### Before:
- Manual entry of surveyor name, license, firm, address for every project
- Risk of typos and inconsistencies
- Time-consuming data entry

### After:
- One-time surveyor setup
- Select from dropdown
- Auto-populate all surveyor information
- Consistent data across all projects
- Centralized surveyor management

## Sample Data

To add sample surveyors for testing:

```sql
INSERT INTO surveyors (name, license_number, firm, address, phone, email)
VALUES 
  ('O Saunyama', 'LS-2019-001', 'Saunyama Surveyors', E'BOX A1262\nAVONDALE\nHARARE', '+263 4 123456', 'o.saunyama@example.com'),
  ('John Doe', 'LS-2020-045', 'Precision Surveys Ltd', E'123 Main Street\nBulawayo', '+263 9 987654', 'john@precision.com');
```

## Next Steps

1. Run the migration
2. Restart backend server
3. Update the Vue components as outlined above
4. Test the integration
5. Add sample surveyors for testing
6. Roll out to other modules that use surveyor information

## Files Modified/Created

### Backend
- ✅ `migrations/007.do.sql` (NEW)
- ✅ `src/models/Surveyor.js` (NEW)
- ✅ `src/models/SurveyProject.js` (NEW)
- ✅ `src/routes/surveyors.js` (NEW)
- ✅ `src/routes/survey-projects.js` (NEW)

### Frontend
- ✅ `src/composables/useSurveyors.ts` (NEW)
- ✅ `src/components/cadastral/SurveyorSelector.vue` (NEW)
- ⏳ `src/views/modules/cadastral-standard/CadastralStandardView.vue` (TO UPDATE)
- ⏳ `src/views/modules/cadastral-standard/CalculationsPart1View.vue` (TO UPDATE)
- ⏳ `src/composables/useCadastralWorkflow.ts` (TO UPDATE)

## Support

For issues or questions, refer to:
- Backend API documentation
- Vue 3 Composition API documentation
- PostgreSQL documentation
