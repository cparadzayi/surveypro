# Survey Plan Generation Feature - Implementation Summary

## Overview
Added Survey Plan generation step to the cadastral workflow, positioned between Area Computation and Report on Survey. This feature generates professional survey plans (General Plans, Diagrams, and Working Plans) using coordinate points and digitized land parcels.

## ✅ Completed

### 1. Backend Implementation
- **`surveyPlanGenerator.js`** - PDF generation utility
  - ✅ General Plan generation (developed/undeveloped portions)
  - ✅ Automatic scaling to fit parcels on page
  - ✅ Schedule of areas table
  - ✅ Legend with symbols
  - ✅ North arrow
  - ✅ Surveyor's certificate
  - ✅ Title block with project metadata
  - ⏳ Diagram generation (placeholder)
  - ⏳ Working Plan generation (placeholder)

- **`surveyPlans.js`** - API routes
  - ✅ `POST /api/survey-plans/general-plan` - Generate General Plan
  - ✅ `GET /api/survey-plans/preview` - Preview plan data
  - ⏳ `POST /api/survey-plans/diagram` - Generate Diagram (501 Not Implemented)
  - ⏳ `POST /api/survey-plans/working-plan` - Generate Working Plan (501 Not Implemented)

- **`server.js`** - Route registration
  - ✅ Registered `/api/survey-plans` prefix

- **`landParcel.js`** - Model updates
  - ✅ Compute areas on-demand using PostGIS functions
  - ✅ `ST_Area(geom)` for area_m2 and area_ha
  - ✅ `ST_Perimeter(geom)` for perimeter_m
  - ✅ `ST_Centroid(geom)` for centroid coordinates

### 2. Workflow Configuration
- **`cadastralWorkflow.ts`**
  - ✅ Added `survey_plan` step (order 9)
  - ✅ Updated `report_on_survey` to require `survey_plan`
  - ✅ Updated `dsg_certificate` order to 11

- **`cadastral.ts`** (types)
  - ✅ Added `'survey-plan'` to `currentStep` type union

### 3. Database Fixes
- **Migration 073** - Removed generated columns
  - ✅ Dropped `area_m2`, `area_ha`, `perimeter_m`, `centroid_y`, `centroid_x`
  - ✅ Values now computed on-demand

- **Migration 074** - Dropped parcel triggers
  - ✅ Removed triggers trying to populate non-existent columns

- **Migration 075** - Dropped import tracking trigger
  - ✅ Removed `import_id` reference trigger

## 🚧 Remaining Tasks

### 1. Frontend Component
Create **`SurveyPlanView.vue`** in `app-frontend/src/views/modules/cadastral-standard/`

**Required Features:**
- Plan type selector (3 options):
  - 📋 General Plan (Developed Portion)
  - 📋 General Plan (Undeveloped Portion)
  - 📊 Diagram (coming soon)
  - 🗺️ Working Plan (coming soon)

- Form inputs:
  - Scale (dropdown: 1:500, 1:1000, 1:2000, 1:5000)
  - Surveyor name (pre-filled from project)
  - License number (pre-filled from surveyor profile)
  - Survey date (date picker)
  - Notes (textarea, multiple lines)
  - Sheet number (text input, default "1 of 1")

- Preview section:
  - Show parcel count
  - Show total area (ha and m²)
  - List of parcels with stand numbers and areas

- Action buttons:
  - **Generate Plan** (primary) - Downloads PDF
  - **Preview Data** (secondary) - Shows summary
  - **Continue to Report on Survey** (success)

### 2. Frontend Service
Create **`surveyPlans.ts`** in `app-frontend/src/services/`

```typescript
export interface GeneralPlanRequest {
  project_id: number
  plan_type: 'developed' | 'undeveloped'
  scale?: string
  surveyor_name?: string
  license_number?: string
  survey_date?: string
  notes?: string[]
  sheet_number?: string
}

export async function generateGeneralPlan(data: GeneralPlanRequest): Promise<Blob>
export async function getPreviewData(projectId: number): Promise<PreviewData>
```

### 3. Integrate into CadastralStandardView
Update **`CadastralStandardView.vue`** to include the Survey Plan step:

```vue
<!-- Add after area-computation section -->
<section v-else-if="workflowState.currentStep === 'survey-plan'" class="workflow-section">
  <SurveyPlanView
    :project-id="selectedProject?.id"
    :workflow-state="workflowState"
    @plan-generated="handlePlanGenerated"
    @continue="handleContinue"
  />
</section>
```

### 4. Template Analysis
Analyze the two template PDFs to extract:
- Page layout dimensions
- Title block format and positioning
- Legend symbols and styling
- Schedule of areas table format
- Surveyor certificate wording
- Border and margin specifications
- Font sizes and styles

**Template Files:**
- `cadastral-standard/stand 2283 General Plan undeveloped portion template.pdf`
- `cadastral-standard/3b General Plan developed portion 20250511-Model.pdf`

### 5. Enhanced Features (Future)
- **Diagram Generation:**
  - Show all measurements (distances and bearings)
  - Include traverse closure information
  - Add dimension lines and labels
  
- **Working Plan Generation:**
  - Field reference format
  - Simplified layout for field use
  - Include only essential information

- **Multi-sheet Support:**
  - Automatic pagination for large projects
  - Sheet index/overview
  - Continuation markers

## API Endpoints

### Generate General Plan
```http
POST /api/survey-plans/general-plan
Authorization: Bearer <token>
Content-Type: application/json

{
  "project_id": 4,
  "plan_type": "undeveloped",
  "scale": "1:1000",
  "surveyor_name": "John Doe",
  "license_number": "LS-12345",
  "survey_date": "2025-12-13",
  "notes": [
    "All coordinates in Cape Lo 31 (EPSG:22291)",
    "Areas calculated from digitized boundaries"
  ],
  "sheet_number": "1 of 1"
}

Response: PDF file (application/pdf)
```

### Preview Plan Data
```http
GET /api/survey-plans/preview?project_id=4
Authorization: Bearer <token>

Response:
{
  "ok": true,
  "data": {
    "project": { ... },
    "parcel_count": 2,
    "coordinate_point_count": 542,
    "total_area_ha": "1.2345",
    "total_area_m2": "12345.00",
    "parcels": [
      { "id": 1, "stand": "2474", "area_ha": 0.6172, "area_m2": 6172.50 },
      { "id": 2, "stand": "2475", "area_ha": 0.6173, "area_m2": 6173.00 }
    ]
  }
}
```

## Testing Checklist

- [ ] Backend server restarts without errors
- [ ] `/api/survey-plans/general-plan` endpoint accessible
- [ ] `/api/survey-plans/preview` returns correct data
- [ ] PDF generates with correct parcels and areas
- [ ] Areas display correctly in UI (not 0.00 m²)
- [ ] QGIS digitizing works without trigger errors
- [ ] Workflow step appears in navigation
- [ ] Step requires area_computation to be completed
- [ ] Report on Survey requires survey_plan to be completed

## Next Steps

1. **Restart backend server** to load new routes
2. **Create SurveyPlanView.vue** component
3. **Create surveyPlans.ts** service
4. **Integrate into CadastralStandardView.vue**
5. **Test end-to-end workflow**
6. **Analyze template PDFs** for exact formatting
7. **Refine PDF generation** to match templates

## Notes

- General Plan generation uses PDFKit for PDF creation
- Coordinates are automatically transformed from Cape Lo 31 (EPSG:22291) to PDF coordinates
- Areas are computed on-demand from PostGIS geometry
- Scale is applied automatically to fit parcels on page
- North arrow and legend are included by default
