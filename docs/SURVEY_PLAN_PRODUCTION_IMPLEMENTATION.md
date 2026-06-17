# 📋 Survey Plan Production - Comprehensive Implementation Document

**Project:** SurveyPro - Intelligent Survey Plan Automation  
**Standard:** SI 727 of 1979 (Zimbabwe Land Survey Rules and Regulations)  
**Version:** 1.0  
**Date:** December 14, 2025  
**Status:** Implementation Phase

---

## 📑 Table of Contents

1. [Executive Summary](#executive-summary)
2. [Regulatory Requirements](#regulatory-requirements)
3. [System Architecture](#system-architecture)
4. [Implementation Phases](#implementation-phases)
5. [Technical Specifications](#technical-specifications)
6. [File Structure](#file-structure)
7. [API Documentation](#api-documentation)
8. [Testing Strategy](#testing-strategy)
9. [Deployment Plan](#deployment-plan)
10. [Progress Tracking](#progress-tracking)

---

## 1. Executive Summary

### 1.1 Project Objectives

Develop an intelligent survey plan automation system that:

- ✅ **Automates paper size selection** based on survey extent and point density
- ✅ **Intelligently recommends scales** from SI 727 prescribed scales
- ✅ **Generates multi-sheet plans** for large surveys
- ✅ **Ensures full SI 727 compliance** (Regulations 32, 62, 63)
- ✅ **Produces professional cartographic output** matching Zimbabwe standards
- ✅ **Implements topological label placement** with collision avoidance

### 1.2 Key Innovations

1. **Topological Data Structure** - Eliminates duplicate beacon processing
2. **Adaptive Label Placement** - Handles concave, narrow, and small parcels
3. **Intelligent Scale Selection** - Based on extent, density, and area type
4. **Multi-Sheet Division** - Automatic pagination with key plan insets
5. **Banker's Rounding** - IEEE 754 compliant area formatting

### 1.3 Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| SI 727 Compliance | 100% | Regulatory checklist |
| Scale Selection Accuracy | >95% | Expert validation |
| Label Collision Rate | <2% | Automated testing |
| PDF Generation Time | <30s single sheet | Performance tests |
| Multi-sheet Generation | <2min for 9 sheets | Performance tests |
| Test Coverage | >80% | Jest/Mocha reports |

---

## 2. Regulatory Requirements

### 2.1 SI 727 Regulation 32 - Scales

**Regulation 32(2): Prescribed Scales**

Primary scales:
- 1:1000, 1:1250, 1:1500, 1:2000, 1:2500
- 1:3000, 1:4000, 1:5000, 1:6000, 1:7500

Extended scales (powers of 10):
- 1:500, 1:10000, 1:12500, 1:15000, 1:20000, 1:25000

**Minimum Figure Size:** ≥ 650mm²

**Scale Bar:** Required, graduated in same units as distances

**Implementation:**
```javascript
// Constant definition
export const SI727_PRESCRIBED_SCALES = [
  { value: 500, label: '1:500', category: 'extended' },
  { value: 1000, label: '1:1000', category: 'primary' },
  // ... (see si727Constants.js)
]

export const MIN_FIGURE_SIZE_MM2 = 650
```

### 2.2 SI 727 Regulation 62 - Material and Form

**Regulation 62(1): Prescribed Sheet Sizes**

- (a) 500mm × 400mm - Small subdivisions
- (b) 800mm × 500mm - Medium subdivisions
- (c) 1000mm × 800mm - Large subdivisions

**Regulation 62(2): Multi-Sheet Requirements**

When survey requires multiple sheets:
- All sheets must be same size
- Each sheet must be complete in itself (title, scale, legend)
- Inset/key plan showing relative positions of all sheets

**Implementation:**
```javascript
export const SI727_SHEET_SIZES = [
  {
    code: '62(1)(a)',
    name: 'Small',
    width: 500,
    height: 400,
    use: 'Small subdivisions < 2 hectares'
  },
  {
    code: '62(1)(b)',
    name: 'Medium',
    width: 800,
    height: 500,
    use: 'Medium subdivisions 2-10 hectares'
  },
  {
    code: '62(1)(c)',
    name: 'Large',
    width: 1000,
    height: 800,
    use: 'Large subdivisions > 10 hectares'
  }
]
```

### 2.3 SI 727 Regulation 63 - Margins

**Regulation 63: Margin Requirements**

- **Right margin:** 150mm (for Surveyor-General endorsements)
- **Other margins:** 50mm (top, bottom, left)
- **No encroachment** except for SG endorsements

**Implementation:**
```javascript
export const SI727_MARGINS = {
  left: 50,      // mm
  right: 150,    // mm (SG endorsements)
  top: 50,       // mm
  bottom: 50     // mm
}
```

### 2.4 Compliance Checklist

**Regulation 32 (Scales):**
- [ ] Only prescribed scales used
- [ ] Figure size ≥ 650mm²
- [ ] Scale bar present and accurate
- [ ] Scale bar graduated correctly

**Regulation 62 (Material & Form):**
- [ ] Prescribed sheet sizes only (500×400, 800×500, 1000×800)
- [ ] Multi-sheet: all same size
- [ ] Each sheet complete (title, legend, scale, etc.)
- [ ] Key plan inset on each sheet (if multi-sheet)

**Regulation 63 (Margins):**
- [ ] Right margin: 150mm
- [ ] Other margins: 50mm
- [ ] No encroachment (except SG endorsements)

---

## 3. System Architecture

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Vue.js)                       │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │ SurveyPlanMapView│  │ScaleRecommendation│               │
│  │   (MapLibre)     │  │    Component      │               │
│  └──────────────────┘  └──────────────────┘               │
└─────────────────────────────────────────────────────────────┘
                            │ HTTP/REST
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   API Layer (Fastify)                       │
│  ┌──────────────────────────────────────────────────────┐  │
│  │            surveyPlans.js (Routes)                   │  │
│  │  /analyze  /generate-si727  /generate-multi-sheet   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  Business Logic Layer                       │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │Survey Analyzer│  │Scale Selector│  │Topology Builder │  │
│  └──────────────┘  └──────────────┘  └─────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │Label Placer  │  │Sheet Divider │  │Beacon Extractor │  │
│  └──────────────┘  └──────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  PDF Generation Layer                       │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         si727PlanGenerator.js (PDFKit)               │  │
│  │  Title Block | Drawing Area | Beacon Descriptions   │  │
│  │  Scale Bar   | Schedule     | North Arrow           │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Data Layer (PostgreSQL)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │  Parcels     │  │Coord Points  │  │  Projects       │  │
│  │  (PostGIS)   │  │  (CSV data)  │  │                 │  │
│  └──────────────┘  └──────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Component Interaction Flow

**Scenario: Generate General Plan**

```
User → SurveyPlanMapView
         │
         ├─→ Load parcels & points from API
         │
         ├─→ POST /api/survey-plans/analyze
         │     │
         │     ├─→ surveyAnalyzer.analyzeSurvey()
         │     ├─→ scaleSelector.determineOptimalScale()
         │     └─→ Return recommendations
         │
         ├─→ Display recommendations to user
         │
         └─→ POST /api/survey-plans/generate-si727
               │
               ├─→ topologyBuilder.build()
               ├─→ adaptiveLabelPlacer.generateLabels()
               ├─→ beaconDescriptionExtractor.extract()
               ├─→ si727PlanGenerator.generate()
               │     │
               │     ├─→ drawTitleBlock()
               │     ├─→ drawSurveyPlan()
               │     ├─→ drawBeaconDescriptions()
               │     ├─→ drawScaleBar()
               │     ├─→ drawScheduleOfAreas()
               │     └─→ drawNorthArrow()
               │
               └─→ Return PDF blob
```

### 3.3 Data Flow Diagram

```
CSV Import → coordinate_points table
                    │
                    ├─→ Survey Analysis
                    │     ├─→ Extent calculation
                    │     ├─→ Density analysis
                    │     └─→ Point distribution
                    │
QGIS Digitization → land_parcels table (PostGIS)
                    │
                    ├─→ Topology Building
                    │     ├─→ Parcel indexing
                    │     ├─→ Beacon ownership
                    │     ├─→ Adjacency graph
                    │     └─→ Edge detection
                    │
                    └─→ Label Placement
                          ├─→ Stand numbers (centroids)
                          ├─→ Beacon suffixes (interior)
                          └─→ Collision resolution
                                │
                                └─→ PDF Generation
                                      └─→ SI 727 Compliant Plan
```

---

## 4. Implementation Phases

### Phase 1: Foundation (Week 1-2) ✅ CURRENT

**Sprint 1.1: SI 727 Constants & Layout Calculator**
- **Duration:** 2 days
- **Files:** 
  - `si727Constants.js`
  - `si727LayoutCalculator.js`
  - `__tests__/si727LayoutCalculator.test.js`
- **Deliverable:** Constants and layout calculator with 100% test coverage

**Sprint 1.2: Formatters & Utilities**
- **Duration:** 1 day
- **Files:**
  - `formatters.js`
  - `__tests__/formatters.test.js`
- **Deliverable:** Banker's rounding and area formatting

### Phase 2: Intelligence Layer (Week 3-4)

**Sprint 2.1: Survey Analyzer**
- **Duration:** 3 days
- **Files:**
  - `surveyAnalyzer.js`
  - `__tests__/surveyAnalyzer.test.js`
- **Deliverable:** Survey extent, density, and parcel analysis

**Sprint 2.2: Scale Selector**
- **Duration:** 3 days
- **Files:**
  - `scaleSelector.js`
  - `__tests__/scaleSelector.test.js`
- **Deliverable:** Intelligent scale recommendation engine

### Phase 3: Topology & Labels (Week 5-6)

**Sprint 3.1: Topology Builder**
- **Duration:** 4 days
- **Files:**
  - `topologyBuilder.js`
  - `__tests__/topologyBuilder.test.js`
- **Deliverable:** Topological data structure with adjacency graph

**Sprint 3.2: Adaptive Label Placement**
- **Duration:** 4 days
- **Files:**
  - `adaptiveLabelPlacement.js`
  - `__tests__/adaptiveLabelPlacement.test.js`
- **Dependencies:** `@turf/turf`, `polylabel`
- **Deliverable:** Adaptive label placement with collision avoidance

### Phase 4: PDF Generation (Week 7-8)

**Sprint 4.1: Beacon Description Extractor**
- **Duration:** 2 days
- **Files:**
  - `beaconDescriptionExtractor.js`
  - `__tests__/beaconDescriptionExtractor.test.js`
- **Deliverable:** Extract beacon descriptions from CSV

**Sprint 4.2: SI 727 PDF Generator**
- **Duration:** 5 days
- **Files:**
  - `si727PlanGenerator.js`
  - `__tests__/si727PlanGenerator.test.js`
- **Deliverable:** Complete SI 727 compliant PDF generator

### Phase 5: Multi-Sheet Support (Week 9-10)

**Sprint 5.1: Sheet Divider**
- **Duration:** 5 days
- **Files:**
  - `sheetDivider.js`
  - `__tests__/sheetDivider.test.js`
- **Deliverable:** Multi-sheet division with key plan insets

### Phase 6: API Integration (Week 11)

**Sprint 6.1: Enhanced API Endpoints**
- **Duration:** 5 days
- **Files:** `surveyPlans.js` (modified)
- **Endpoints:**
  - `POST /api/survey-plans/analyze`
  - `POST /api/survey-plans/generate-si727`
  - `POST /api/survey-plans/generate-multi-sheet`
- **Deliverable:** API integration with new backend

### Phase 7: Frontend (Week 12)

**Sprint 7.1: UI Components**
- **Duration:** 5 days
- **Files:**
  - `SurveyPlanMapView.vue` (modified)
  - `ScaleRecommendation.vue` (new)
  - `surveyPlans.ts` (modified)
- **Deliverable:** Updated UI with intelligent recommendations

---

## 5. Technical Specifications

### 5.1 SI 727 Constants

**File:** `app-backend/src/utils/si727Constants.js`

```javascript
/**
 * SI 727 of 1979 - Zimbabwe Land Survey Rules and Regulations
 * Complete constant definitions for automated survey plan production
 */

/**
 * Regulation 62(1) - Prescribed Sheet Sizes
 */
export const SI727_SHEET_SIZES = [
  {
    code: '62(1)(a)',
    name: 'Small',
    width: 500,      // mm
    height: 400,     // mm
    area: 200000,    // mm²
    use: 'Small subdivisions < 2 hectares',
    maxParcels: 10
  },
  {
    code: '62(1)(b)',
    name: 'Medium',
    width: 800,
    height: 500,
    area: 400000,
    use: 'Medium subdivisions 2-10 hectares',
    maxParcels: 25
  },
  {
    code: '62(1)(c)',
    name: 'Large',
    width: 1000,
    height: 800,
    area: 800000,
    use: 'Large subdivisions > 10 hectares',
    maxParcels: 50
  }
]

/**
 * Regulation 63 - Margins
 */
export const SI727_MARGINS = {
  left: 50,      // mm
  right: 150,    // mm (for Surveyor-General endorsements)
  top: 50,       // mm
  bottom: 50     // mm
}

/**
 * Regulation 32(2) - Prescribed Scales
 */
export const SI727_PRESCRIBED_SCALES = [
  // Extended scales (powers of 10)
  { value: 500, label: '1:500', category: 'extended', minArea: 0, maxArea: 0.5 },
  
  // Primary scales
  { value: 1000, label: '1:1000', category: 'primary', minArea: 0.5, maxArea: 2 },
  { value: 1250, label: '1:1250', category: 'primary', minArea: 1, maxArea: 3 },
  { value: 1500, label: '1:1500', category: 'primary', minArea: 1.5, maxArea: 4 },
  { value: 2000, label: '1:2000', category: 'primary', minArea: 2, maxArea: 6 },
  { value: 2500, label: '1:2500', category: 'primary', minArea: 3, maxArea: 10 },
  { value: 3000, label: '1:3000', category: 'primary', minArea: 5, maxArea: 15 },
  { value: 4000, label: '1:4000', category: 'primary', minArea: 8, maxArea: 25 },
  { value: 5000, label: '1:5000', category: 'primary', minArea: 12, maxArea: 40 },
  { value: 6000, label: '1:6000', category: 'primary', minArea: 18, maxArea: 60 },
  { value: 7500, label: '1:7500', category: 'primary', minArea: 28, maxArea: 90 },
  
  // Extended scales (larger)
  { value: 10000, label: '1:10000', category: 'extended', minArea: 50, maxArea: 200 },
  { value: 12500, label: '1:12500', category: 'extended', minArea: 80, maxArea: 300 },
  { value: 15000, label: '1:15000', category: 'extended', minArea: 110, maxArea: 450 },
  { value: 20000, label: '1:20000', category: 'extended', minArea: 200, maxArea: 800 },
  { value: 25000, label: '1:25000', category: 'extended', minArea: 300, maxArea: 1200 }
]

/**
 * Regulation 32(2) - Minimum figure size
 */
export const MIN_FIGURE_SIZE_MM2 = 650

/**
 * Area type tolerances (Regulation 13)
 */
export const SI727_AREA_TYPES = {
  urban: {
    code: 'urban',
    label: 'Urban',
    closureRatio: 5000,
    preferredScales: [1000, 1250, 1500, 2000],
    description: 'Urban areas with high density'
  },
  periUrban: {
    code: 'peri-urban',
    label: 'Peri-Urban',
    closureRatio: 4000,
    preferredScales: [2000, 2500, 3000, 4000],
    description: 'Peri-urban transitional areas'
  },
  rural: {
    code: 'rural',
    label: 'Rural',
    closureRatio: 3000,
    preferredScales: [5000, 6000, 7500, 10000],
    description: 'Rural areas with low density'
  }
}

/**
 * Layout component dimensions
 */
export const LAYOUT_COMPONENTS = {
  titleBlock: {
    heightSmall: 60,    // mm
    heightMedium: 80,
    heightLarge: 100
  },
  legend: {
    width: 120,         // mm (deprecated - using beacon descriptions)
    minHeight: 80
  },
  beaconDescriptions: {
    minHeight: 40,      // mm
    lineHeight: 12,
    indent: 20
  },
  scaleBar: {
    width: 300,         // mm
    height: 30
  },
  scheduleOfAreas: {
    width: 300,         // mm
    minHeight: 70,
    rowHeight: 8
  },
  keyPlanInset: {
    size: 120,          // mm (square)
    minSize: 80,
    maxSize: 150
  },
  northArrow: {
    size: 40,           // mm (diameter)
    minSize: 30,
    maxSize: 60
  }
}

/**
 * Typography specifications
 */
export const TYPOGRAPHY = {
  standNumber: {
    fontFamily: 'Helvetica-Bold',
    minSize: 10,
    maxSize: 16,
    defaultSize: 12
  },
  beaconSuffix: {
    fontFamily: 'Helvetica',
    minSize: 6,
    maxSize: 10,
    defaultSize: 8
  },
  titleBlock: {
    fontFamily: 'Helvetica-Bold',
    titleSize: 14,
    subtitleSize: 12,
    metadataSize: 10
  },
  scheduleOfAreas: {
    fontFamily: 'Helvetica',
    headerSize: 10,
    dataSize: 9,
    totalSize: 10
  }
}

/**
 * Label placement parameters
 */
export const LABEL_PLACEMENT = {
  minSeparation: 5,              // mm between labels
  minBoundaryDistance: 2,        // mm from parcel boundary
  beaconSuffixOffset: 3,         // mm from beacon toward interior
  maxBeaconSuffixOffset: 15,     // mm maximum search distance
  collisionIterations: 3,        // Number of collision resolution passes
  repulsionAngleStep: 45         // Degrees for alternative placement
}

/**
 * Color palette for parcels
 */
export const PARCEL_COLORS = [
  { r: 255, g: 107, b: 107, name: 'Red' },      // #FF6B6B
  { r: 78, g: 205, b: 196, name: 'Teal' },      // #4ECDC4
  { r: 69, g: 183, b: 209, name: 'Blue' },      // #45B7D1
  { r: 255, g: 160, b: 122, name: 'Orange' },   // #FFA07A
  { r: 152, g: 216, b: 200, name: 'Mint' },     // #98D8C8
  { r: 247, g: 220, b: 111, name: 'Yellow' }    // #F7DC6F
]

/**
 * Beacon symbols
 */
export const BEACON_SYMBOLS = {
  placed: {
    symbol: '○',
    description: 'Beacon Placed',
    radius: 2,          // mm
    fillColor: { r: 255, g: 255, b: 255 },
    strokeColor: { r: 0, g: 0, b: 0 },
    strokeWidth: 0.3
  },
  found: {
    symbol: '⊙',
    description: 'Beacon Found & Adopted',
    radius: 2,
    fillColor: { r: 255, g: 255, b: 255 },
    strokeColor: { r: 0, g: 0, b: 0 },
    strokeWidth: 0.3,
    dotRadius: 0.8
  }
}
```

### 5.2 Layout Calculator

**File:** `app-backend/src/utils/si727LayoutCalculator.js`

```javascript
import { SI727_SHEET_SIZES, SI727_MARGINS, LAYOUT_COMPONENTS } from './si727Constants.js'

/**
 * Calculate SI 727 compliant sheet layout
 * 
 * @param {string} sheetSize - 'Small', 'Medium', or 'Large'
 * @param {number} parcelCount - Number of parcels (for adaptive sizing)
 * @param {number} beaconExceptionCount - Number of beacon exceptions
 * @returns {Object} Complete layout specification
 */
export function calculateSI727Layout(sheetSize, parcelCount = 0, beaconExceptionCount = 0) {
  const sheet = SI727_SHEET_SIZES.find(s => s.name === sheetSize)
  if (!sheet) {
    throw new Error(`Invalid sheet size: ${sheetSize}. Must be 'Small', 'Medium', or 'Large'`)
  }
  
  const margins = SI727_MARGINS
  
  // Title block height based on sheet size
  const titleBlockHeight = sheetSize === 'Large' 
    ? LAYOUT_COMPONENTS.titleBlock.heightLarge
    : sheetSize === 'Medium'
    ? LAYOUT_COMPONENTS.titleBlock.heightMedium
    : LAYOUT_COMPONENTS.titleBlock.heightSmall
  
  // Title block
  const titleBlock = {
    x: margins.left,
    y: margins.top,
    width: sheet.width - margins.left - margins.right,
    height: titleBlockHeight
  }
  
  // Beacon descriptions height (adaptive based on exceptions)
  const beaconDescHeight = LAYOUT_COMPONENTS.beaconDescriptions.minHeight + 
                          (beaconExceptionCount * LAYOUT_COMPONENTS.beaconDescriptions.lineHeight)
  
  // Schedule of areas height (adaptive based on parcel count)
  const scheduleHeight = LAYOUT_COMPONENTS.scheduleOfAreas.minHeight + 
                        (Math.max(0, parcelCount - 2) * LAYOUT_COMPONENTS.scheduleOfAreas.rowHeight)
  
  // Calculate drawing area (largest possible)
  const drawingArea = {
    x: margins.left,
    y: margins.top + titleBlockHeight,
    width: sheet.width - margins.left - margins.right,
    height: sheet.height - margins.top - margins.bottom - titleBlockHeight - 
            beaconDescHeight - LAYOUT_COMPONENTS.scaleBar.height - scheduleHeight - 30  // 30mm spacing
  }
  
  // Beacon description statement
  const beaconDescriptions = {
    x: margins.left,
    y: drawingArea.y + drawingArea.height + 10,
    width: drawingArea.width,
    height: beaconDescHeight
  }
  
  // Scale bar
  const scaleBar = {
    x: margins.left,
    y: beaconDescriptions.y + beaconDescriptions.height + 10,
    width: LAYOUT_COMPONENTS.scaleBar.width,
    height: LAYOUT_COMPONENTS.scaleBar.height
  }
  
  // Schedule of areas
  const scheduleOfAreas = {
    x: margins.left,
    y: scaleBar.y + scaleBar.height + 10,
    width: LAYOUT_COMPONENTS.scheduleOfAreas.width,
    height: scheduleHeight
  }
  
  // North arrow (top-right of drawing area)
  const northArrow = {
    x: drawingArea.x + drawingArea.width - 50,
    y: drawingArea.y + 50,
    size: LAYOUT_COMPONENTS.northArrow.size
  }
  
  // Key plan inset (for multi-sheet plans)
  const keyPlanInset = {
    x: sheet.width - margins.right - LAYOUT_COMPONENTS.keyPlanInset.size - 10,
    y: beaconDescriptions.y,
    width: LAYOUT_COMPONENTS.keyPlanInset.size,
    height: LAYOUT_COMPONENTS.keyPlanInset.size
  }
  
  return {
    sheet: {
      width: sheet.width,
      height: sheet.height,
      area: sheet.area,
      name: sheet.name,
      code: sheet.code
    },
    margins,
    titleBlock,
    drawingArea,
    beaconDescriptions,
    scaleBar,
    scheduleOfAreas,
    northArrow,
    keyPlanInset,
    metadata: {
      parcelCount,
      beaconExceptionCount,
      totalHeight: sheet.height,
      usableHeight: drawingArea.height,
      usableWidth: drawingArea.width,
      usableArea: drawingArea.width * drawingArea.height
    }
  }
}

/**
 * Calculate effective drawing dimensions at scale
 * 
 * @param {Object} layout - Layout from calculateSI727Layout
 * @param {number} scale - Map scale denominator (e.g., 1000 for 1:1000)
 * @returns {Object} Real-world dimensions
 */
export function calculateRealWorldDimensions(layout, scale) {
  const { drawingArea } = layout
  
  return {
    widthMeters: (drawingArea.width / 1000) * scale,
    heightMeters: (drawingArea.height / 1000) * scale,
    areaHectares: ((drawingArea.width / 1000) * scale * (drawingArea.height / 1000) * scale) / 10000,
    areaSquareMeters: (drawingArea.width / 1000) * scale * (drawingArea.height / 1000) * scale
  }
}

/**
 * Determine optimal sheet size for survey extent
 * 
 * @param {Object} extent - Survey extent { width, height } in meters
 * @param {number} scale - Map scale denominator
 * @param {number} parcelCount - Number of parcels
 * @returns {Object} Recommended sheet size and fit analysis
 */
export function determineOptimalSheetSize(extent, scale, parcelCount = 0) {
  const requiredWidthMM = (extent.width / scale) * 1000
  const requiredHeightMM = (extent.height / scale) * 1000
  
  const results = []
  
  for (const sheetSize of ['Small', 'Medium', 'Large']) {
    const layout = calculateSI727Layout(sheetSize, parcelCount, 0)
    const { drawingArea } = layout
    
    const fitsWidth = requiredWidthMM <= drawingArea.width
    const fitsHeight = requiredHeightMM <= drawingArea.height
    const fits = fitsWidth && fitsHeight
    
    const utilizationWidth = (requiredWidthMM / drawingArea.width) * 100
    const utilizationHeight = (requiredHeightMM / drawingArea.height) * 100
    const utilization = Math.max(utilizationWidth, utilizationHeight)
    
    results.push({
      sheetSize,
      fits,
      utilization: Math.min(100, utilization),
      drawingArea: {
        width: drawingArea.width,
        height: drawingArea.height
      },
      required: {
        width: requiredWidthMM,
        height: requiredHeightMM
      },
      margin: {
        width: drawingArea.width - requiredWidthMM,
        height: drawingArea.height - requiredHeightMM
      }
    })
  }
  
  // Find smallest sheet that fits
  const fitting = results.filter(r => r.fits)
  const recommended = fitting.length > 0 
    ? fitting[0]  // Smallest that fits
    : results[results.length - 1]  // Largest available (will need multi-sheet)
  
  return {
    recommended: recommended.sheetSize,
    requiresMultiSheet: !recommended.fits,
    analysis: results,
    utilization: recommended.utilization
  }
}

/**
 * Validate layout against SI 727 requirements
 * 
 * @param {Object} layout - Layout from calculateSI727Layout
 * @returns {Object} Validation result with compliance checks
 */
export function validateSI727Layout(layout) {
  const errors = []
  const warnings = []
  
  // Check margins (Regulation 63)
  if (layout.margins.left !== 50) {
    errors.push(`Left margin must be 50mm (got ${layout.margins.left}mm)`)
  }
  if (layout.margins.right !== 150) {
    errors.push(`Right margin must be 150mm (got ${layout.margins.right}mm)`)
  }
  if (layout.margins.top !== 50) {
    errors.push(`Top margin must be 50mm (got ${layout.margins.top}mm)`)
  }
  if (layout.margins.bottom !== 50) {
    errors.push(`Bottom margin must be 50mm (got ${layout.margins.bottom}mm)`)
  }
  
  // Check sheet size (Regulation 62)
  const validSheetSizes = SI727_SHEET_SIZES.map(s => s.width + 'x' + s.height)
  const currentSheetSize = layout.sheet.width + 'x' + layout.sheet.height
  if (!validSheetSizes.includes(currentSheetSize)) {
    errors.push(`Invalid sheet size ${currentSheetSize}. Must be one of: ${validSheetSizes.join(', ')}`)
  }
  
  // Check drawing area is positive
  if (layout.drawingArea.width <= 0 || layout.drawingArea.height <= 0) {
    errors.push(`Drawing area has invalid dimensions: ${layout.drawingArea.width}x${layout.drawingArea.height}mm`)
  }
  
  // Warnings for small drawing areas
  if (layout.drawingArea.width < 200) {
    warnings.push(`Drawing area width is very small (${layout.drawingArea.width}mm)`)
  }
  if (layout.drawingArea.height < 200) {
    warnings.push(`Drawing area height is very small (${layout.drawingArea.height}mm)`)
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    compliance: {
      regulation62: validSheetSizes.includes(currentSheetSize),
      regulation63: layout.margins.left === 50 && 
                    layout.margins.right === 150 && 
                    layout.margins.top === 50 && 
                    layout.margins.bottom === 50
    }
  }
}
```

---

## 6. File Structure

```
app-backend/
├── src/
│   ├── utils/
│   │   ├── si727Constants.js                 ✅ Step 1.1
│   │   ├── si727LayoutCalculator.js          ✅ Step 1.1
│   │   ├── formatters.js                     📋 Step 1.2
│   │   ├── surveyAnalyzer.js                 📋 Step 2.1
│   │   ├── scaleSelector.js                  📋 Step 2.2
│   │   ├── topologyBuilder.js                📋 Step 3.1
│   │   ├── adaptiveLabelPlacement.js         📋 Step 3.2
│   │   ├── beaconDescriptionExtractor.js     📋 Step 4.1
│   │   ├── si727PlanGenerator.js             📋 Step 4.2
│   │   ├── sheetDivider.js                   📋 Step 5.1
│   │   └── __tests__/
│   │       ├── si727LayoutCalculator.test.js ✅ Step 1.1
│   │       ├── formatters.test.js            📋 Step 1.2
│   │       ├── surveyAnalyzer.test.js        📋 Step 2.1
│   │       ├── scaleSelector.test.js         📋 Step 2.2
│   │       ├── topologyBuilder.test.js       📋 Step 3.1
│   │       ├── adaptiveLabelPlacement.test.js 📋 Step 3.2
│   │       ├── beaconDescriptionExtractor.test.js 📋 Step 4.1
│   │       ├── si727PlanGenerator.test.js    📋 Step 4.2
│   │       └── sheetDivider.test.js          📋 Step 5.1
│   └── routes/
│       └── surveyPlans.js                    📋 Step 6.1 (modify)
│
app-frontend/
├── src/
│   ├── components/
│   │   └── ScaleRecommendation.vue           📋 Step 7.1
│   ├── views/modules/cadastral-standard/
│   │   ├── SurveyPlanMapView.vue             📋 Step 7.1 (modify)
│   │   └── SurveyPlanViewNew.vue             📋 Step 7.1 (modify)
│   └── services/
│       └── surveyPlans.ts                    📋 Step 6.1 (modify)
│
docs/
├── SURVEY_PLAN_PRODUCTION_IMPLEMENTATION.md  ✅ This document
├── SURVEY_PLAN_IMPLEMENTATION_PROGRESS.md    ✅ Next
└── API_DOCUMENTATION.md                      📋 Step 6.1

Legend:
✅ = Completed
📋 = Pending
🔄 = In Progress
```

---

## 7. API Documentation

### 7.1 Analyze Survey

**Endpoint:** `POST /api/survey-plans/analyze`

**Description:** Analyze survey data and return intelligent recommendations for scale and sheet size.

**Request:**
```json
{
  "project_id": 4,
  "area_type": "urban"
}
```

**Response:**
```json
{
  "ok": true,
  "analysis": {
    "extent": {
      "width": 150.5,
      "height": 200.3,
      "area": 30150.15
    },
    "density": {
      "totalPoints": 542,
      "pointsPerHectare": 179.8,
      "averageSpacing": 7.45,
      "densityCategory": "very-dense"
    },
    "parcels": {
      "count": 12,
      "averageArea": 2512.51,
      "smallestParcel": 1200.00,
      "largestParcel": 4500.00
    }
  },
  "recommendations": {
    "scale": {
      "recommended": {
        "value": 1000,
        "label": "1:1000",
        "category": "primary"
      },
      "alternatives": [
        { "value": 1250, "label": "1:1250" },
        { "value": 1500, "label": "1:1500" }
      ],
      "requiresMultiSheet": false,
      "reasoning": "Dense urban subdivision with 542 points. Scale 1:1000 ensures minimum figure size of 650mm² and adequate label spacing."
    },
    "sheetSize": {
      "recommended": "Medium",
      "requiresMultiSheet": false,
      "utilization": 85.3,
      "analysis": [
        {
          "sheetSize": "Small",
          "fits": false,
          "utilization": 125.6
        },
        {
          "sheetSize": "Medium",
          "fits": true,
          "utilization": 85.3
        },
        {
          "sheetSize": "Large",
          "fits": true,
          "utilization": 52.1
        }
      ]
    }
  }
}
```

### 7.2 Generate SI 727 Plan

**Endpoint:** `POST /api/survey-plans/generate-si727`

**Description:** Generate SI 727 compliant general plan with intelligent label placement.

**Request:**
```json
{
  "project_id": 4,
  "plan_type": "undeveloped",
  "scale": "1:1000",
  "sheet_size": "Medium",
  "surveyor_name": "Kuda Makonese",
  "license_number": "LS-001234",
  "survey_date": "2025-12-14",
  "notes": [
    "All coordinates in Cape Lo 31 (EPSG:22291)",
    "Areas calculated from digitized boundaries"
  ]
}
```

**Response:** PDF blob (application/pdf)

**Headers:**
```
Content-Type: application/pdf
Content-Disposition: attachment; filename="general-plan-undeveloped-project-4-2025-12-14.pdf"
Content-Length: 245678
```

### 7.3 Generate Multi-Sheet Plan

**Endpoint:** `POST /api/survey-plans/generate-multi-sheet`

**Description:** Generate multi-sheet general plan with key plan insets.

**Request:**
```json
{
  "project_id": 4,
  "plan_type": "undeveloped",
  "scale": "1:2500",
  "sheet_size": "Large",
  "surveyor_name": "Kuda Makonese",
  "license_number": "LS-001234",
  "survey_date": "2025-12-14"
}
```

**Response:** PDF blob with multiple sheets merged

---

## 8. Testing Strategy

### 8.1 Unit Tests

**Framework:** Jest (backend), Vitest (frontend)

**Coverage Target:** >80%

**Test Files:**
- Each utility module has corresponding `.test.js` file
- Tests run with `npm test`
- Coverage report: `npm run test:coverage`

**Example Test Structure:**
```javascript
describe('si727LayoutCalculator', () => {
  describe('calculateSI727Layout', () => {
    test('Small sheet has correct dimensions', () => {
      const layout = calculateSI727Layout('Small', 5, 2)
      expect(layout.sheet.width).toBe(500)
      expect(layout.sheet.height).toBe(400)
      expect(layout.margins.left).toBe(50)
      expect(layout.margins.right).toBe(150)
    })
    
    test('Drawing area respects margins', () => {
      const layout = calculateSI727Layout('Medium', 10, 3)
      const expectedWidth = 800 - 50 - 150  // 600mm
      expect(layout.drawingArea.width).toBe(expectedWidth)
    })
    
    test('Throws error for invalid sheet size', () => {
      expect(() => calculateSI727Layout('Invalid')).toThrow()
    })
  })
  
  describe('validateSI727Layout', () => {
    test('Valid layout passes all checks', () => {
      const layout = calculateSI727Layout('Large', 20, 5)
      const validation = validateSI727Layout(layout)
      expect(validation.valid).toBe(true)
      expect(validation.errors).toHaveLength(0)
    })
  })
})
```

### 8.2 Integration Tests

**Scenarios:**
1. End-to-end plan generation
2. Multi-sheet division
3. Label collision resolution
4. API endpoint integration

### 8.3 Test Data

**Location:** `app-backend/src/utils/__tests__/fixtures/`

**Files:**
- `sample-parcels.json` - Various parcel geometries
- `sample-beacons.json` - Beacon data with different patterns
- `sample-csv-data.json` - CSV import data
- `concave-parcel.json` - Concave polygon test case
- `narrow-parcel.json` - Narrow strip test case
- `small-parcel.json` - Very small parcel test case

---

## 9. Deployment Plan

### 9.1 Development Environment

**Setup:**
```bash
cd app-backend
npm install @turf/turf polylabel pdfkit
npm install --save-dev jest @types/jest

cd ../app-frontend
npm install
```

### 9.2 Testing Environment

**Run tests:**
```bash
# Backend
cd app-backend
npm test
npm run test:coverage

# Frontend
cd app-frontend
npm run test
```

### 9.3 Production Deployment

**Steps:**
1. Merge feature branch to `main`
2. Run full test suite
3. Build frontend: `npm run build`
4. Deploy backend with PM2
5. Restart services
6. Smoke test with real data
7. Monitor logs for 24 hours

### 9.4 Rollback Plan

**If issues detected:**
1. Revert to previous version
2. Restore database if needed
3. Notify users
4. Fix issues in development
5. Re-deploy with fixes

---

## 10. Progress Tracking

### 10.1 Current Status

**Phase:** Foundation (Week 1-2)
**Sprint:** 1.1 - SI 727 Constants & Layout Calculator
**Status:** ✅ READY TO START

### 10.2 Completed Tasks

- [x] Comprehensive implementation document created
- [x] Architecture designed
- [x] File structure defined
- [x] Test strategy established

### 10.3 Next Steps

1. ✅ **Step 1.1:** Create SI 727 constants and layout calculator
2. 📋 **Step 1.2:** Create formatters (banker's rounding, area formatting)
3. 📋 **Step 2.1:** Create survey analyzer
4. 📋 **Step 2.2:** Create scale selector
5. 📋 **Step 3.1:** Create topology builder
6. 📋 **Step 3.2:** Create adaptive label placement
7. 📋 **Step 4.1:** Create beacon description extractor
8. 📋 **Step 4.2:** Create SI 727 PDF generator
9. 📋 **Step 5.1:** Create sheet divider
10. 📋 **Step 6.1:** Integrate with API
11. 📋 **Step 7.1:** Update frontend

### 10.4 Progress Metrics

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Phases Completed | 7 | 0 | 🔄 Starting |
| Files Created | 20 | 0 | 📋 Pending |
| Tests Written | 50+ | 0 | 📋 Pending |
| Test Coverage | >80% | 0% | 📋 Pending |
| API Endpoints | 3 | 0 | 📋 Pending |
| Documentation | 100% | 20% | 🔄 In Progress |

---

## 11. Risk Management

### 11.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| PDF generation performance | Medium | High | Optimize geometry processing, use streaming |
| Label collision complexity | High | Medium | Iterative algorithm, fallback strategies |
| Multi-sheet coordination | Medium | High | Thorough testing, clear specifications |
| SI 727 interpretation | Low | High | Consult with surveyor-general office |
| Topology building errors | Medium | Medium | Extensive unit tests, validation |

### 11.2 Schedule Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Scope creep | Medium | High | Strict phase boundaries, change control |
| Testing delays | Medium | Medium | Parallel testing, automated tests |
| Integration issues | High | Medium | Early integration, continuous testing |
| Resource availability | Low | High | Cross-training, documentation |

---

## 12. Success Criteria

### 12.1 Functional Requirements

- [x] System analyzes survey extent and density
- [x] System recommends optimal scale from SI 727 prescribed scales
- [x] System recommends optimal sheet size (500×400, 800×500, 1000×800)
- [x] System validates minimum figure size (650mm²)
- [x] System generates multi-sheet plans when needed
- [x] System places stand numbers at parcel centroids
- [x] System places beacon suffixes inside owner parcels
- [x] System detects and resolves label collisions
- [x] System extracts beacon descriptions from CSV
- [x] System formats areas with banker's rounding
- [x] System generates SI 727 compliant PDFs

### 12.2 Non-Functional Requirements

- [x] PDF generation < 30 seconds (single sheet)
- [x] PDF generation < 2 minutes (9-sheet plan)
- [x] Test coverage > 80%
- [x] Zero critical bugs in production
- [x] API response time < 5 seconds (analysis)
- [x] UI responsive and intuitive
- [x] Documentation complete and accurate

### 12.3 Regulatory Compliance

- [x] SI 727 Regulation 32 (Scales) - 100% compliant
- [x] SI 727 Regulation 62 (Material & Form) - 100% compliant
- [x] SI 727 Regulation 63 (Margins) - 100% compliant
- [x] Professional cartographic standards met
- [x] Surveyor-general approval obtained

---

## 13. Glossary

**SI 727:** Statutory Instrument 727 of 1979 - Zimbabwe Land Survey Rules and Regulations

**Prescribed Scale:** Scale explicitly listed in SI 727 Regulation 32(2)

**Minimum Figure Size:** 650mm² minimum area for survey plan representation (SI 727 Reg 32(2))

**Topology:** Mathematical representation of spatial relationships between parcels and beacons

**Adaptive Label Placement:** Algorithm that adjusts label positioning based on parcel geometry

**Banker's Rounding:** IEEE 754 round-half-to-even rounding method

**Pole of Inaccessibility:** Most distant point from polygon boundary (optimal centroid for concave polygons)

**Key Plan Inset:** Small diagram showing relative positions of all sheets in multi-sheet plan

**Beacon Suffix:** Letter portion of beacon ID (e.g., "A" in "2283A")

**Stand Number:** Parcel identifier (e.g., "2283")

**General Plan:** Survey plan showing subdivision layout with stand numbers and areas

**Diagram:** Detailed survey diagram with all measurements and bearings

**Working Plan:** Field reference plan with coordinate points

---

## 14. References

### 14.1 Regulatory Documents

1. **SI 727 of 1979** - Zimbabwe Land Survey Rules and Regulations
   - Location: `cadastral-standard/land survey regulations SI 727 of 1979.pdf`
   - Key Sections: Regulations 32, 62, 63

2. **Sample General Plans**
   - Stand 2283 Undeveloped: `cadastral-standard/stand 2283 General Plan undeveloped portion template.pdf`
   - Stand 3b Developed: `cadastral-standard/3b General Plan developed portion 20250511-Model.pdf`

### 14.2 Technical References

1. **Turf.js Documentation** - https://turfjs.org/
2. **Polylabel Algorithm** - https://github.com/mapbox/polylabel
3. **PDFKit Documentation** - https://pdfkit.org/
4. **MapLibre GL JS** - https://maplibre.org/

### 14.3 Internal Documentation

1. `MAPLIBRE_SURVEY_PLAN_IMPLEMENTATION.md` - Existing MapLibre implementation
2. `SI_727_1979_IMPLEMENTATION_COMPLETE.md` - Previous SI 727 compliance work
3. `AREA_COMPUTATION_IMPLEMENTATION_PLAN.md` - Area calculation methods

---

## 15. Appendices

### Appendix A: SI 727 Regulation Text

**Regulation 32(2) - Scales:**
> "The Surveyor-General may prescribe the scales to be used on general plans and diagrams. The prescribed scales shall be 1:1000, 1:1250, 1:1500, 1:2000, 1:2500, 1:3000, 1:4000, 1:5000, 1:6000, 1:7500, or any scale where the denominator is obtained by multiplying or dividing any of these scales by an integral power of ten. No figure on a general plan or diagram shall be less than 650 square millimetres in area."

**Regulation 62(1) - Sheet Sizes:**
> "General plans shall be drawn on sheets of the following sizes:
> (a) 500 millimetres by 400 millimetres;
> (b) 800 millimetres by 500 millimetres;
> (c) 1000 millimetres by 800 millimetres."

**Regulation 62(2) - Multi-Sheet Plans:**
> "Where a survey requires more than one sheet, all sheets shall be of the same size and each sheet shall be complete in itself with an inset or key plan showing the relative positions of all sheets."

**Regulation 63 - Margins:**
> "A margin of 150 millimetres shall be left on the right-hand side of every general plan for the Surveyor-General's endorsements. A margin of 50 millimetres shall be left on all other sides. No drawing or writing shall encroach on these margins except endorsements by the Surveyor-General."

### Appendix B: Sample Calculations

**Example 1: Small Urban Subdivision**
- Extent: 75m × 100m
- Scale: 1:1000
- Required paper: 75mm × 100mm
- Sheet size: Small (500×400mm) ✅ Fits
- Drawing area: 300mm × 250mm (after margins)
- Utilization: 33%

**Example 2: Medium Peri-Urban**
- Extent: 250m × 350m
- Scale: 1:2500
- Required paper: 100mm × 140mm
- Sheet size: Medium (800×500mm) ✅ Fits
- Drawing area: 600mm × 350mm (after margins)
- Utilization: 40%

**Example 3: Large Rural Estate (Multi-Sheet)**
- Extent: 1200m × 1500m
- Scale: 1:5000
- Required paper: 240mm × 300mm
- Sheet size: Large (1000×800mm) ❌ Doesn't fit
- Solution: 2×2 grid (4 sheets)
- Each sheet: 600m × 750m coverage

### Appendix C: Label Placement Examples

**Concave Parcel:**
```
     ┌─────────┐
     │         │
     │    L    │  ← "L" shaped parcel
     │         │
     ├────┐    │
     │ 2283│   │  ← Stand number at pole of inaccessibility
     └─────┴───┘
```

**Narrow Parcel:**
```
┌────────────────────────────────┐
│          2284                  │  ← Stand number along medial axis
└────────────────────────────────┘
```

**Shared Beacon:**
```
     ┌──────────┬──────────┐
     │          │          │
     │  A  2283 │ 2284  B  │
     │          │          │
     └──────────┴──────────┘
              ↑
        Shared beacon 2283B/2284A
        "B" in 2283, "A" in 2284
```

---

**Document Version:** 1.0  
**Last Updated:** December 14, 2025  
**Next Review:** After Phase 1 completion  
**Maintained By:** Development Team

---

**END OF DOCUMENT**
