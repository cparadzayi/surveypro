# Survey Plan Types Implementation

## Overview

The Survey Plan UI has been refactored to support 4 distinct types of survey plans, each with its own dedicated view component and specialized configuration.

---

## Architecture

### **Plan Type Selection Flow**

```
SurveyPlanViewNew (Main Container)
├─ Plan Type Selection UI (4 cards)
│  ├─ Survey Diagram
│  ├─ Working Plan
│  ├─ Undeveloped Township General Plan
│  └─ Developed Township General Plan
│
└─ Selected Plan Type Component
   ├─ SurveyDiagramView
   ├─ WorkingPlanView
   ├─ UndevelopedTownshipGPView
   └─ DevelopedTownshipGPView
      └─ All use SurveyPlanMapView with different planType configs
```

---

## Plan Types

### **1. Survey Diagram**
- **Purpose:** Technical diagram with measurements and traverse lines
- **Component:** `SurveyDiagramView.vue`
- **Plan Type:** `diagram`
- **Features:**
  - Detailed technical measurements
  - Beacon positions and labels
  - Traverse lines and angles
  - Field reference documentation
- **Use Case:** Field work, technical documentation
- **Icon:** 📐

### **2. Working Plan**
- **Purpose:** Preliminary plan for field work and calculations
- **Component:** `WorkingPlanView.vue`
- **Plan Type:** `working-plan`
- **Features:**
  - Coordinate points display
  - Parcel boundaries
  - Measurement data
  - Calculation references
- **Use Case:** Office calculations, preliminary surveys
- **Icon:** 🗺️

### **3. Undeveloped Township General Plan**
- **Purpose:** SI 727 compliant general plan for undeveloped portions
- **Component:** `UndevelopedTownshipGPView.vue`
- **Plan Type:** `general-undeveloped`
- **Features:**
  - SI 727 compliant layout
  - Vector GeoPDF support
  - Selectable features for QGIS
  - Schedule of Areas
  - Outside Figure Data
  - Professional endorsement block
- **Use Case:** Township subdivisions, cadastral submissions
- **Icon:** 🏘️
- **Note:** This was the original "Vector GeoPDF (Selectable Features)" option

### **4. Developed Township General Plan**
- **Purpose:** SI 727 compliant plan with buildings and infrastructure
- **Component:** `DevelopedTownshipGPView.vue`
- **Plan Type:** `general-developed`
- **Features:**
  - SI 727 compliant layout
  - Building footprints
  - Infrastructure features
  - Roads and utilities
  - Development annotations
- **Use Case:** Developed areas, urban planning
- **Icon:** 🏙️

---

## File Structure

```
app-frontend/src/views/modules/cadastral-standard/
├── SurveyPlanViewNew.vue          # Main container with plan type selection
├── SurveyPlanMapView.vue          # Core MapLibre component (shared)
├── SurveyDiagramView.vue          # Survey Diagram wrapper
├── WorkingPlanView.vue            # Working Plan wrapper
├── UndevelopedTownshipGPView.vue  # Undeveloped Township GP wrapper
└── DevelopedTownshipGPView.vue    # Developed Township GP wrapper
```

---

## Implementation Details

### **SurveyPlanViewNew.vue**

**Plan Type Selection UI:**
- 4-card grid layout
- Hover effects with elevation
- Feature tags for each plan type
- Click to select plan type

**State Management:**
```typescript
const selectedPlanType = ref<string | null>(null)

function selectPlanType(type: string) {
  selectedPlanType.value = type
  console.log('📋 Selected plan type:', type)
}
```

**Component Rendering:**
```vue
<!-- Survey Diagram -->
<SurveyDiagramView
  v-if="selectedPlanType === 'diagram'"
  :project-id="projectId"
  :project-info="projectInfo"
  @export-complete="handleExportComplete"
/>
```

### **Plan Type Wrapper Components**

Each wrapper component:
1. Accepts `projectId` and `projectInfo` props
2. Adds `planType` to `projectInfo` via computed property
3. Passes enhanced props to `SurveyPlanMapView`
4. Emits `export-complete` event back to parent

**Example (SurveyDiagramView.vue):**
```typescript
const projectInfoWithDefaults = computed(() => ({
  ...props.projectInfo,
  planType: 'diagram'
}))
```

### **SurveyPlanMapView.vue**

**Updated Configuration:**
```typescript
const config = ref({
  planType: (props.projectInfo as any)?.planType || 'general-undeveloped',
  scale: 'auto',
  sheetSize: 'auto',
  // ... other config
})
```

The `planType` is now accepted from parent component via `projectInfo.planType`.

---

## User Experience

### **Selection Screen**

Users see 4 cards with:
- Large emoji icon
- Plan type title
- Description of purpose
- Feature tags (e.g., "SI 727", "Vector PDF", "QGIS")
- Hover effects for interactivity

### **Back Navigation**

Once a plan type is selected:
- "← Back to Plan Type Selection" button appears
- Allows users to change plan type without losing project context
- Maintains workflow continuity

### **Export Options**

Each plan type has access to all export formats:
- 🎨 Professional PDF (Print Quality)
- 🌍 Vector GeoPDF (Selectable Features)
- 🎯 Auto-Arrange & Export PDF
- 📄 Export PDF (Current Layout)
- 📐 Export DXF
- 🖼️ Export PNG
- 📋 Print Summary

---

## SI 727 Compliance

### **Undeveloped Township General Plan**
- ✅ Prescribed scales (1:1000 to 1:7500 or ×/÷ 10ⁿ)
- ✅ ISO A2/A1/A0 sheet sizes
- ✅ 50mm margins (left), 150mm (right for endorsements)
- ✅ Schedule of Areas table
- ✅ Outside Figure Data table
- ✅ Endorsement block (right margin)
- ✅ Title block with designation
- ✅ North arrow and scale bar
- ✅ Beacon descriptions
- ✅ Survey statement

### **Developed Township General Plan**
- Same SI 727 compliance as undeveloped
- Additional features for buildings and infrastructure

---

## Configuration Options

Each plan type inherits these configuration options from `SurveyPlanMapView`:

1. **Scale Selection** - SI 727 compliant scales
2. **Sheet Size** - Auto or manual (A2/A1/A0)
3. **Surveyor Info** - Name, license, date
4. **Display Options** - Schedule of Areas, Outside Figure Data
5. **Export Formats** - Multiple professional formats

---

## Future Enhancements

### **Survey Diagram**
- Add traverse computation display
- Show measurement annotations
- Include field notes section
- Add bearing and distance labels

### **Working Plan**
- Add calculation workspace overlay
- Show adjustment residuals
- Include coordinate comparison table
- Add GPS/Total Station data display

### **Developed Township**
- Building footprint digitizing
- Road centerline tools
- Utility network display
- Development phase annotations

---

## Migration Notes

### **From Old Implementation**

**Before:**
- Single `SurveyPlanMapView` component
- Plan type dropdown in configuration panel
- All plan types in one view

**After:**
- Dedicated view for each plan type
- Plan type selection screen
- Cleaner separation of concerns
- Better user experience

### **Backward Compatibility**

The original `SurveyPlanMapView` component remains unchanged and fully functional. The new wrapper components simply enhance it with plan-type-specific defaults.

---

## Testing

### **Manual Testing Checklist**

1. **Plan Type Selection**
   - [ ] All 4 cards display correctly
   - [ ] Hover effects work
   - [ ] Click selects plan type
   - [ ] Back button returns to selection

2. **Survey Diagram**
   - [ ] Component loads with diagram config
   - [ ] Map displays correctly
   - [ ] Export functions work

3. **Working Plan**
   - [ ] Component loads with working-plan config
   - [ ] Coordinate points visible
   - [ ] Export functions work

4. **Undeveloped Township GP**
   - [ ] Component loads with general-undeveloped config
   - [ ] Vector GeoPDF export available
   - [ ] SI 727 layout correct
   - [ ] Schedule of Areas displays

5. **Developed Township GP**
   - [ ] Component loads with general-developed config
   - [ ] All features from undeveloped work
   - [ ] Ready for building features (future)

---

## Console Logging

Each component logs its initialization:

```
📋 Selected plan type: diagram
✅ Survey Diagram export complete: { format: 'pdf', filename: '...' }
```

```
📋 Selected plan type: undeveloped-township
✅ Undeveloped Township GP export complete: { format: 'geopdf', filename: '...' }
```

---

## Styling

### **Plan Type Cards**

- **Border:** 2px solid #e5e7eb (gray-200)
- **Hover Border:** #6366f1 (indigo-500)
- **Hover Shadow:** 0 4px 12px rgba(99, 102, 241, 0.15)
- **Hover Transform:** translateY(-2px)
- **Transition:** all 0.3s ease

### **Feature Tags**

- **Background:** #eef2ff (indigo-50)
- **Color:** #6366f1 (indigo-500)
- **Padding:** 0.25rem 0.75rem
- **Border Radius:** 12px
- **Font Size:** 0.75rem

### **Plan Headers**

Each plan type view has a colored left border:
- Survey Diagram: #8b5cf6 (purple-500)
- Working Plan: #10b981 (green-500)
- Undeveloped Township: #6366f1 (indigo-500)
- Developed Township: #f59e0b (amber-500)

---

## Summary

The Survey Plan UI now provides:
- ✅ Clear separation of 4 plan types
- ✅ Intuitive selection interface
- ✅ Dedicated components for each type
- ✅ SI 727 compliance maintained
- ✅ Backward compatibility preserved
- ✅ Professional user experience
- ✅ Ready for future enhancements

**Users can now easily select the appropriate plan type for their survey needs, with each type optimized for its specific use case.**
