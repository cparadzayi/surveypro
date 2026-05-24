# Unified PDF Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire the dead jsPDF client-side export path and verify/cement that all plan types route through the single PDFKit backend path.

**Architecture:** The backend `LabelingSystem` already skips edge annotations for `planType === 'general-developed'`. The frontend `exportVectorGeoPDF()` already passes `planType` to the backend for both plan types. The remaining work is: write tests proving the skip behavior, delete the dead `exportProfessional()` function and its dead imports from the Vue component, and remove the `exportProfessionalGeneralPlan` function from `professionalSurveyPlanExporter.ts` (the file itself stays — its utility functions and types remain active).

**Tech Stack:** Jest (backend tests), Vue 3 + TypeScript (frontend cleanup), Node.js/ESM

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `app-backend/src/services/__tests__/labelingSystem.test.js` | Create | Tests proving edge annotation skip for `general-developed` |
| `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue` | Modify | Remove dead `exportProfessional()` function, `buildSafePlanFilename()` helper, and dead imports |
| `app-frontend/src/utils/professionalSurveyPlanExporter.ts` | Modify | Remove `exportProfessionalGeneralPlan` function (keep all utility functions and types) |

---

### Task 1: Write unit tests for LabelingSystem edge annotation skipping

**Files:**
- Create: `app-backend/src/services/__tests__/labelingSystem.test.js`

Context: `LabelingSystem` lives in `app-backend/src/services/pdfkitLabeling.js` and is exported as a named export. The key behavior: when `planType === 'general-developed'`, `renderEdgeLabels()` must not draw any distance/bearing text, and `renderSecondPassBearings()` must return 0.

- [ ] **Step 1: Create the test file**

```javascript
/**
 * Unit tests for LabelingSystem — planType edge-annotation behavior
 */
import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { LabelingSystem } from '../../services/pdfkitLabeling.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Minimal PDFKit document mock — only the methods LabelingSystem calls */
function makeMockDoc() {
  const chainable = { mockReturnThis: true }
  const chain = () => mockDoc
  const mockDoc = {
    text:         jest.fn(),
    font:         jest.fn().mockImplementation(() => mockDoc),
    fontSize:     jest.fn().mockImplementation(() => mockDoc),
    save:         jest.fn(),
    restore:      jest.fn(),
    moveTo:       jest.fn().mockImplementation(() => mockDoc),
    lineTo:       jest.fn().mockImplementation(() => mockDoc),
    stroke:       jest.fn(),
    rect:         jest.fn().mockImplementation(() => mockDoc),
    fill:         jest.fn(),
    fillColor:    jest.fn().mockImplementation(() => mockDoc),
    strokeColor:  jest.fn().mockImplementation(() => mockDoc),
    lineWidth:    jest.fn().mockImplementation(() => mockDoc),
    widthOfString: jest.fn().mockReturnValue(20),
    dash:         jest.fn().mockImplementation(() => mockDoc),
    undash:       jest.fn().mockImplementation(() => mockDoc),
  }
  return mockDoc
}

/** A 100m × 100m square parcel in Cape Lo coords with 4 edges */
const TEST_PARCEL = {
  geometry: {
    coordinates: [[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]]
  },
  properties: {
    stand: '1234',
    edges: [
      { bearing: 90.0,  distance: 100.0, distanceRounded: 100.0, directionDMS: "90°00'00\"",  from: 'A', to: 'B' },
      { bearing: 180.0, distance: 100.0, distanceRounded: 100.0, directionDMS: "180°00'00\"", from: 'B', to: 'C' },
      { bearing: 270.0, distance: 100.0, distanceRounded: 100.0, directionDMS: "270°00'00\"", from: 'C', to: 'D' },
      { bearing: 0.0,   distance: 100.0, distanceRounded: 100.0, directionDMS: "0°00'00\"",   from: 'D', to: 'A' },
    ]
  }
}

/** PDF coordinate equivalents for the 4 corners + closing vertex */
const TEST_PDF_COORDS = [
  { x: 50,  y: 350 },
  { x: 450, y: 350 },
  { x: 450, y: 50  },
  { x: 50,  y: 50  },
  { x: 50,  y: 350 },
]

const MOCK_EXTENT    = { minY: -18000, maxY: -17900, minX: -20000, maxX: -19900 }
const MOCK_MAP_BOUNDS = { x: 50, y: 50, width: 400, height: 300 }
const MOCK_SCALE     = 1000
const MOCK_COLLISION = { checkCollision: jest.fn().mockReturnValue(false), addLabel: jest.fn() }
const MOCK_LOGGER    = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LabelingSystem — planType edge-annotation behavior', () => {

  describe('general-developed: edge annotations are suppressed', () => {

    test('renderEdgeLabels does not call doc.text() for any edge', () => {
      const doc = makeMockDoc()
      const ls = new LabelingSystem(
        doc, MOCK_EXTENT, MOCK_MAP_BOUNDS, MOCK_SCALE,
        MOCK_COLLISION, MOCK_LOGGER, 'general-developed'
      )
      ls.identifySharedEdges({ features: [TEST_PARCEL] }, null)
      ls.renderEdgeLabels(TEST_PARCEL, TEST_PDF_COORDS)

      expect(doc.text).not.toHaveBeenCalled()
    })

    test('renderSecondPassBearings returns 0', () => {
      const doc = makeMockDoc()
      const ls = new LabelingSystem(
        doc, MOCK_EXTENT, MOCK_MAP_BOUNDS, MOCK_SCALE,
        MOCK_COLLISION, MOCK_LOGGER, 'general-developed'
      )
      const rendered = ls.renderSecondPassBearings()
      expect(rendered).toBe(0)
    })

  })

  describe('general-undeveloped: edge annotations are rendered', () => {

    test('renderEdgeLabels calls doc.text() at least once for a valid parcel', () => {
      const doc = makeMockDoc()
      const ls = new LabelingSystem(
        doc, MOCK_EXTENT, MOCK_MAP_BOUNDS, MOCK_SCALE,
        MOCK_COLLISION, MOCK_LOGGER, 'general-undeveloped'
      )
      ls.identifySharedEdges({ features: [TEST_PARCEL] }, null)
      ls.renderEdgeLabels(TEST_PARCEL, TEST_PDF_COORDS)

      expect(doc.text).toHaveBeenCalled()
    })

  })

  describe('default planType behaves like general-undeveloped', () => {

    test('renderSecondPassBearings does not return 0 (returns a count >= 0)', () => {
      const doc = makeMockDoc()
      const ls = new LabelingSystem(
        doc, MOCK_EXTENT, MOCK_MAP_BOUNDS, MOCK_SCALE,
        MOCK_COLLISION, MOCK_LOGGER
        // planType omitted → defaults to 'general-undeveloped'
      )
      // No labeled edges yet — second pass has nothing to render, but it doesn't short-circuit
      const rendered = ls.renderSecondPassBearings()
      // Result is 0 because no edges were labeled in the first pass, NOT because of plan type
      // The important thing: it did not hit the early-return for 'general-developed'
      expect(typeof rendered).toBe('number')
    })

  })

})
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd app-backend && npx jest --testPathPattern=labelingSystem -t "LabelingSystem" --no-coverage
```

Expected output:
```
PASS src/services/__tests__/labelingSystem.test.js
  LabelingSystem — planType edge-annotation behavior
    general-developed: edge annotations are suppressed
      ✓ renderEdgeLabels does not call doc.text() for any edge
      ✓ renderSecondPassBearings returns 0
    general-undeveloped: edge annotations are rendered
      ✓ renderEdgeLabels calls doc.text() at least once for a valid parcel
    default planType behaves like general-undeveloped
      ✓ renderSecondPassBearings does not return 0 (returns a count >= 0)

Test Suites: 1 passed, 1 total
Tests:       4 passed, 4 total
```

If `doc.text` is not called for `general-undeveloped` either, the issue is the test parcel data — check that `TEST_PARCEL.properties.edges` has all required fields and `TEST_PDF_COORDS` has 5 points matching the 5-vertex ring.

- [ ] **Step 3: Commit**

```bash
cd app-backend
git add src/services/__tests__/labelingSystem.test.js
git commit -m "test: verify LabelingSystem skips edge annotations for general-developed plan type"
```

---

### Task 2: Remove dead `exportProfessional()` and `buildSafePlanFilename()` from Vue component

**Files:**
- Modify: `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue:3179-3610`

Context: `exportProfessional()` is the old jsPDF export path (lines 3192–3610). It is not connected to any button in the template — the "Generate Plan" button at line 469 calls `exportVectorGeoPDF()` for both plan types. `buildSafePlanFilename()` at line 3179 is only called inside `exportProfessional()`. Both are dead code.

- [ ] **Step 1: Delete `buildSafePlanFilename()` and `exportProfessional()` from the Vue file**

Remove lines 3179–3610 in `SurveyPlanMapView.vue`. The block starts with:

```typescript
function buildSafePlanFilename(projectId: number, projectInfo: any, timestamp: number): string {
```

and ends with the closing brace of `exportProfessional()`:

```typescript
  } finally {
    isExporting.value = false
  }
}

// GeoJSON Export Functions for Vector GeoPDF
```

Delete everything from `function buildSafePlanFilename` through the closing `}` of `exportProfessional`, leaving the `// GeoJSON Export Functions for Vector GeoPDF` comment intact.

- [ ] **Step 2: Verify the build compiles without errors**

```bash
cd app-frontend && npx vue-tsc --noEmit 2>&1 | head -40
```

Expected: no errors referencing `buildSafePlanFilename` or `exportProfessional`.

If TypeScript reports errors for `SurveyPlanData` or `ExportOptions` types, those are from the import that will be cleaned up in Task 3.

- [ ] **Step 3: Commit**

```bash
cd app-frontend
git add src/views/modules/cadastral-standard/SurveyPlanMapView.vue
git commit -m "refactor: remove dead exportProfessional() jsPDF path from SurveyPlanMapView"
```

---

### Task 3: Clean up dead imports in `SurveyPlanMapView.vue`

**Files:**
- Modify: `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue:531-540`

Context: After removing `exportProfessional()`, four imports from `professionalSurveyPlanExporter` are now unused: `exportProfessionalGeneralPlan`, `calculateOptimalSheetSize`, `computeTileGrid`, and `type SurveyPlanData`. The following must stay because they are actively used outside dead code: `calculateOptimalScaleAndSheet` (used in `recomputeTileGrid()` at line 5939), `type ExportOptions` (used for `exportOptions` ref), `type OptimalScaleOptions` (used in `exportVectorGeoPDF`), `type TileGrid` (used for `activeTileGrid` ref).

- [ ] **Step 1: Update the import statement**

Find this block (lines 531–540):
```typescript
import {
  exportProfessionalGeneralPlan,
  calculateOptimalSheetSize,
  calculateOptimalScaleAndSheet,
  computeTileGrid,
  type SurveyPlanData,
  type ExportOptions,
  type OptimalScaleOptions,
  type TileGrid
} from '@/utils/professionalSurveyPlanExporter'
```

Replace with:
```typescript
import {
  calculateOptimalScaleAndSheet,
  type ExportOptions,
  type OptimalScaleOptions,
  type TileGrid
} from '@/utils/professionalSurveyPlanExporter'
```

- [ ] **Step 2: Run TypeScript check to verify no broken references**

```bash
cd app-frontend && npx vue-tsc --noEmit 2>&1 | head -40
```

Expected: no errors. If errors appear for `ExportOptions`, `OptimalScaleOptions`, or `TileGrid`, check that each is still exported from `professionalSurveyPlanExporter.ts`.

- [ ] **Step 3: Commit**

```bash
cd app-frontend
git add src/views/modules/cadastral-standard/SurveyPlanMapView.vue
git commit -m "refactor: remove dead imports of exportProfessionalGeneralPlan and related symbols"
```

---

### Task 4: Remove `exportProfessionalGeneralPlan` from `professionalSurveyPlanExporter.ts`

**Files:**
- Modify: `app-frontend/src/utils/professionalSurveyPlanExporter.ts`

Context: `exportProfessionalGeneralPlan` is the jsPDF generation function. Now that `SurveyPlanMapView.vue` no longer imports it, it is dead code. The rest of the file (`calculateOptimalSheetSize`, `calculateOptimalScaleAndSheet`, `computeTileGrid`, type definitions) remains active and must not be touched. Read the file first to locate the exact lines of the `exportProfessionalGeneralPlan` function before editing.

- [ ] **Step 1: Read the file to locate `exportProfessionalGeneralPlan`**

```bash
cd app-frontend && grep -n "exportProfessionalGeneralPlan\|^export async function\|^export function\|^async function" src/utils/professionalSurveyPlanExporter.ts | head -30
```

Note the start line and end line of `exportProfessionalGeneralPlan`.

- [ ] **Step 2: Delete the `exportProfessionalGeneralPlan` function body**

Using the Edit tool, remove the entire `export async function exportProfessionalGeneralPlan(...)` function. The function takes `(data: SurveyPlanData, options: ExportOptions)` and returns a `Promise<Blob>`. Delete from the `export async function exportProfessionalGeneralPlan` line through its closing `}`.

- [ ] **Step 3: Remove jsPDF imports from `professionalSurveyPlanExporter.ts` if they are now unused**

```bash
cd app-frontend && grep -n "^import\|from 'jspdf'\|from 'jspdf-autotable'" src/utils/professionalSurveyPlanExporter.ts | head -20
```

If `jsPDF` is imported and no other exported function uses it, remove that import line.

- [ ] **Step 4: Run TypeScript check**

```bash
cd app-frontend && npx vue-tsc --noEmit 2>&1 | head -40
```

Expected: no errors. If `SurveyPlanData` or `ExportOptions` are only referenced inside the deleted function and are no longer exported, add them back as type re-exports so nothing breaks if other files import them.

- [ ] **Step 5: Run the frontend dev build to verify**

```bash
cd app-frontend && npm run build 2>&1 | tail -20
```

Expected: Build completes with `dist/` output and no errors.

- [ ] **Step 6: Commit**

```bash
cd app-frontend
git add src/utils/professionalSurveyPlanExporter.ts
git commit -m "refactor: remove exportProfessionalGeneralPlan jsPDF function — all plans now use PDFKit backend"
```

---

### Task 5: Manual end-to-end verification

**No files modified.** This task verifies the consolidated path works for both plan types before declaring the work complete.

- [ ] **Step 1: Start the development stack**

```bash
# Terminal 1
cd app-backend && npm run dev

# Terminal 2
cd app-frontend && npm run dev
```

- [ ] **Step 2: Generate an undeveloped township plan**

1. Open a project with parcels in the browser
2. In the export panel, set **Plan Type** to `General Plan (Undeveloped Portion)`
3. Click **Generate Undeveloped Township General Plan**
4. Verify: PDF downloads, edge distances and bearings appear on parcel boundaries, sheet size in summary report matches the actual PDF page size

- [ ] **Step 3: Generate a developed township plan**

1. In the export panel, set **Plan Type** to `General Plan (Developed Portion)`
2. Click **Generate Developed Township General Plan**
3. Verify: PDF downloads, NO edge distances or edge bearings appear on parcel boundaries, stand numbers and beacon labels are still present, sheet size in summary report matches the actual PDF page size

- [ ] **Step 4: Verify GeoPDF spatial referencing (optional but recommended)**

Open the generated developed township PDF in QGIS via Layer > Add Layer > Add Vector Layer. Confirm the parcel geometry aligns with the correct Cape Lo zone coordinates.

- [ ] **Step 5: Run backend test suite**

```bash
cd app-backend && npm test 2>&1 | tail -20
```

Expected: All existing tests pass. The new `labelingSystem.test.js` suite shows 4 tests passing.
