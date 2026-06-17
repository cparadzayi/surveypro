# SI 727 General Plan Layout - Implementation Status

## ✅ Completed Features

### 1. Backend - SI 727 Standards (100% Complete)
**Files:** `app-backend/src/utils/si727Constants.js`, `si727LayoutCalculator.js`, `beaconSymbolStandards.js`

- ✅ Sheet sizes (Small 500×400mm, Medium 800×500mm, Large 1000×800mm)
- ✅ Margins (Left 50mm, Right 150mm for SG endorsements, Top/Bottom 50mm)
- ✅ Prescribed scales (1:100 to 1:75000, SI 727 §32(2) compliant)
- ✅ Title block dimensions (60mm/80mm/100mm based on sheet size)
- ✅ Layout component calculations (beacon descriptions, schedule, scale bar, north arrow)
- ✅ Professional beacon symbol sizing (1.2-4.0mm diameter, scale-adaptive)
- ✅ Beacon label sizing (2.0-5.0mm height, scale-adaptive)
- ✅ Symbol specifications for screen/PDF/print/DWG/SVG formats

### 2. Backend - Survey Plan Preview API (100% Complete)
**File:** `app-backend/src/routes/surveyPlanPreview.js`

- ✅ GET `/api/survey-plan/preview/:projectId` endpoint
- ✅ Beacon label positioning with edge clearance (3.0m offset, 1.5m clearance)
- ✅ Point-in-polygon detection
- ✅ Distance-to-edge calculation
- ✅ Multi-stage label positioning algorithm
- ✅ Topology building
- ✅ Scale analysis and recommendations
- ✅ Sheet size determination
- ✅ Layout calculations
- ✅ Symbol specifications in response

### 3. Frontend - Beacon Labeling (100% Complete)
**File:** `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue`

- ✅ Dual labeling strategy (suffix inside parcels, full names outside)
- ✅ SVG beacon symbols (○ open circle for placed, ⊙ filled circle with dot for found)
- ✅ Professional symbol sizing from backend specs
- ✅ Adaptive label sizing based on zoom level
- ✅ Collision avoidance for outside-parcel labels
- ✅ Edge clearance implementation (labels positioned with 1.5m minimum clearance)

### 4. Frontend - Basic Overlays (80% Complete)
- ✅ Title block overlay (draggable)
- ✅ North arrow overlay (draggable)
- ✅ Schedule of Areas overlay (draggable, auto-populated from database)
- ✅ Layer toggle overlay
- ⚠️ Scale bar overlay (added to template, needs computed properties)

## 🚧 In Progress / Needs Completion

### 5. Frontend - Margin Guides (Template Added, Needs Logic)
**Status:** SVG template added, needs computed properties

**What's Added:**
```vue
<svg v-if="showMarginGuides && intelligentPreview" class="margin-guides">
  <!-- Sheet outline, margin lines, title block outline -->
</svg>
```

**What's Needed:**
```typescript
// Computed property to calculate margin guide positions
const marginGuides = computed(() => {
  if (!intelligentPreview.value || !mapContainer.value) return null
  
  const layout = intelligentPreview.value.layout
  const container = mapContainer.value
  
  // Convert mm to pixels based on map scale
  const mmToPixels = (mm: number) => {
    // Implementation needed
  }
  
  return {
    sheet: { x, y, width, height },
    left: { x, y1, y2 },
    right: { x, y1, y2 },
    top: { x1, x2, y },
    bottom: { x1, x2, y },
    titleBlock: { x, y, width, height }
  }
})
```

### 6. Frontend - Scale Bar (Template Added, Needs Logic)
**Status:** Template added, needs distance calculation

**What's Added:**
```vue
<div class="overlay scale-bar">
  <div class="scale-bar-ruler">
    <div class="scale-segment" v-for="i in 5"></div>
  </div>
  <div class="scale-bar-labels">
    <span>0</span>
    <span>{{ scaleBarDistance / 2 }}m</span>
    <span>{{ scaleBarDistance }}m</span>
  </div>
</div>
```

**What's Needed:**
```typescript
// Computed property for scale bar distance
const scaleBarDistance = computed(() => {
  if (!config.value.scale || config.value.scale === 'auto') return 100
  
  const scaleValue = parseInt(config.value.scale.split(':')[1])
  
  // Calculate appropriate distance based on scale
  // e.g., 1:1000 → 100m, 1:500 → 50m, 1:2500 → 250m
  if (scaleValue <= 500) return 50
  if (scaleValue <= 1000) return 100
  if (scaleValue <= 2500) return 250
  return 500
})
```

### 7. Frontend - Toggle Functions (Need Implementation)
**Status:** Buttons added, functions missing

**What's Needed:**
```typescript
function toggleMarginGuides() {
  showMarginGuides.value = !showMarginGuides.value
  console.log(`[SurveyPlanMap] Margin guides: ${showMarginGuides.value ? 'ON' : 'OFF'}`)
}

function togglePrintLayout() {
  printLayoutMode.value = !printLayoutMode.value
  
  if (printLayoutMode.value) {
    // Enter print layout mode
    showMarginGuides.value = true
    showOverlays.value = true
    // Adjust map to fit within drawing area (excluding margins)
    // Position overlays at SI 727 specified locations
  } else {
    // Exit print layout mode
    // Restore interactive mode
  }
  
  console.log(`[SurveyPlanMap] Print layout mode: ${printLayoutMode.value ? 'ON' : 'OFF'}`)
}
```

### 8. Frontend - Reset Overlay Positions (Needs Update)
**Status:** Existing function needs scaleBar position

**Current:**
```typescript
function resetOverlayPositions() {
  overlayPositions.value = {
    titleBlock: { x: 20, y: 20 },
    layerToggle: { x: 20, y: 200 },
    northArrow: { x: window.innerWidth - 120, y: 20 },
    scheduleOfAreas: { x: 20, y: 400 }
  }
}
```

**Needs:**
```typescript
function resetOverlayPositions() {
  overlayPositions.value = {
    titleBlock: { x: 20, y: 20 },
    layerToggle: { x: 20, y: 200 },
    northArrow: { x: window.innerWidth - 120, y: 20 },
    scaleBar: { x: window.innerWidth - 320, y: window.innerHeight - 100 }, // ← Add this
    scheduleOfAreas: { x: 20, y: 400 }
  }
}
```

### 9. Frontend - Print Layout Mode (Not Started)
**Status:** Button added, full implementation needed

**Features Needed:**
- Adjust map viewport to fit within SI 727 drawing area
- Position overlays at regulation-specified locations
- Hide interactive controls
- Apply print-ready styling
- Optional: Generate PDF with proper margins and layout

### 10. Frontend - Styling (Needs Addition)
**Status:** CSS classes referenced but not defined

**Needed Styles:**
```css
/* Scale Bar */
.scale-bar {
  background: white;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 10px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.scale-bar-title {
  font-size: 12px;
  font-weight: bold;
  margin-bottom: 5px;
}

.scale-bar-ruler {
  display: flex;
  height: 10px;
  border: 1px solid #333;
}

.scale-segment {
  flex: 1;
  border-right: 1px solid #333;
}

.scale-segment:last-child {
  border-right: none;
}

.scale-bar-labels {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  margin-top: 2px;
}

/* Margin Guides */
.margin-guides {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1000;
}

/* Control Button Active State */
.control-btn.active {
  background: #4ECDC4;
  color: white;
}
```

## 📋 Implementation Checklist

### Phase 1: Complete Computed Properties (30 min)
- [ ] Add `scaleBarDistance` computed property
- [ ] Add `marginGuides` computed property
- [ ] Test with different scales and sheet sizes

### Phase 2: Add Toggle Functions (15 min)
- [ ] Implement `toggleMarginGuides()`
- [ ] Implement `togglePrintLayout()`
- [ ] Update `resetOverlayPositions()` to include scaleBar
- [ ] Test toggle functionality

### Phase 3: Add Styling (15 min)
- [ ] Add scale bar CSS
- [ ] Add margin guides CSS
- [ ] Add active button state CSS
- [ ] Test visual appearance

### Phase 4: Print Layout Mode (45 min)
- [ ] Calculate SI 727 compliant overlay positions
- [ ] Adjust map viewport to drawing area
- [ ] Apply print-ready styling
- [ ] Test with different sheet sizes
- [ ] Optional: PDF export with proper layout

### Phase 5: Testing & Refinement (30 min)
- [ ] Test with Small/Medium/Large sheet sizes
- [ ] Test with different scales (1:500, 1:1000, 1:2500)
- [ ] Verify margin measurements are accurate
- [ ] Verify scale bar shows correct distances
- [ ] Test print layout mode
- [ ] Document usage

## 🎯 Expected Final Result

When complete, users will have:

1. **📐 Margin Guides Toggle** - Visual guides showing SI 727 margins (50mm left/top/bottom, 150mm right)
2. **📏 Scale Bar** - Adaptive scale bar showing distances based on map scale
3. **📄 Print Layout Mode** - One-click switch to print-ready layout with proper margins
4. **🎨 Professional Appearance** - All elements positioned according to SI 727 regulations
5. **💾 Export Ready** - Layout suitable for PDF/PNG/DXF export

## 📝 Notes

- TypeScript errors are expected until computed properties are added
- The template structure is complete and correct
- Backend is fully functional and tested
- Focus on frontend computed properties and functions next
- Print layout mode can be implemented incrementally

## 🔗 Related Files

- Backend: `app-backend/src/utils/si727*.js`, `beaconSymbolStandards.js`
- Backend Route: `app-backend/src/routes/surveyPlanPreview.js`
- Frontend: `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue`
- Documentation: This file

---

**Last Updated:** 2025-12-14
**Status:** 80% Complete - Template done, logic needed
**Next Step:** Implement computed properties for marginGuides and scaleBarDistance
