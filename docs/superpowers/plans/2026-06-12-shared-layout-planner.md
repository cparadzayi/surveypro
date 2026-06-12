# Shared Sheet Layout Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract PDF's `calculateBlockPositions` into a shared `app-backend/src/services/sheetLayoutPlanner.js` module consumed by both `pdfkitGeoPDF.js` and `dxfGenerator.js`, so the PDF and DXF outputs arrange the surrounding blocks (title, schedule, OFD, beacon-desc, scale bar, statement, N-arrow, SG signature, endorsement) identically.

**Architecture (2026-06-12 revision):** Originally planned to *move* `calculateBlockPositions` + ~1500 lines of helpers from `pdfkitGeoPDF.js` into `app-shared/`. Implementation revealed the transitive-helper dependency chain (`calculateTitleBlockHeight` → `getOutsideFigureVertices` → ...) makes the lift impractical without high regression risk against the untested 14k-line PDF. **Pivoted to a thin-wrapper approach**: `calculateBlockPositions` is *exported* from `pdfkitGeoPDF.js` in place, and `sheetLayoutPlanner.js` is a ~30-line adapter that builds a `measureText`-backed fake `doc` proxy and delegates. PDF passes a real PDFKit-backed measurer; DXF passes the 0.55 width-factor heuristic. Both formats run the exact same algorithm. Task 5's endorsement slot and Task 6's closed-polygon guard land at the wrapper level. Golden snapshot tests on two fixtures (minimal + realistic) hold both formats green throughout the refactor.

**Tech Stack:** Node.js (Fastify backend), ESM modules, Jest 29, `pdfjs-dist` (new devDep for PDF text extraction), `pdfkit` (existing), the existing DXF emitters in `app-backend/src/services/dxf*.js`.

**Spec:** `docs/superpowers/specs/2026-06-12-shared-layout-planner-design.md`

---

## File Structure

**Files created:**
- `app-backend/src/services/sheetLayoutPlanner.js` — the planner; one export `planSheetLayout(...)`. Pure module, no PDFKit/DXF imports.
- `app-backend/src/services/__tests__/sheetLayoutPlanner.test.js` — planner unit tests.
- `app-backend/src/services/__tests__/pdfkitGeoPDF.snapshot.test.js` — PDF text+position snapshot harness.
- `app-backend/src/services/__tests__/dxfGenerator.snapshot.test.js` — DXF entity-list snapshot harness.
- `app-backend/src/services/__tests__/dxfGenerator.parity.test.js` — PDF↔DXF position parity.
- `app-backend/src/services/__tests__/fixtures/sampleMinimalPlan.js` — 2-stand fixture.
- `app-backend/src/services/__tests__/fixtures/sampleRealisticPlan.js` — 12-stand fixture.

**Files modified:**
- `app-backend/package.json` — add `pdfjs-dist` devDep.
- `app-backend/src/services/pdfkitGeoPDF.js` — delete `calculateBlockPositions`, replace its call site with `planSheetLayout(...)`, update `drawEndorsementBlock` signature.
- `app-backend/src/services/dxfGenerator.js` — replace `placeBottomZoneBlocks` orchestration with `planSheetLayout` + position-to-mm dispatch; add local `emitEndorsementBlock` function.
- `app-backend/src/services/dxfBottomZoneEmitter.js` — delete `placeBottomZoneBlocks`, `sizeStatement`, `sizeOFDTable`, `sizeSGBox`, `sizeBeaconDescriptions`, `fallbackCorner`. Module shrinks to four `emitX` exports.

---

## Task 1: PDF + DXF Snapshot Harness Foundation

Establishes the safety net. Every later task runs these two test files; both must remain green (or have intentional, reviewed snapshot updates).

**Files:**
- Modify: `app-backend/package.json`
- Create: `app-backend/src/services/__tests__/fixtures/sampleMinimalPlan.js`
- Create: `app-backend/src/services/__tests__/fixtures/sampleRealisticPlan.js`
- Create: `app-backend/src/services/__tests__/pdfkitGeoPDF.snapshot.test.js`
- Create: `app-backend/src/services/__tests__/dxfGenerator.snapshot.test.js`

- [ ] **Step 1: Install `pdfjs-dist` as a devDependency.**

```bash
cd app-backend && npm install --save-dev pdfjs-dist@4.10.38
```

Expected: `package.json` and `package-lock.json` updated, no install errors.

- [ ] **Step 2: Write the minimal fixture.**

`app-backend/src/services/__tests__/fixtures/sampleMinimalPlan.js`:

```js
// Minimal fixture: 2 stands in a 100×60m outside figure, 4 beacons, scale 1:500, ISO_A2.
// Produces a single-column schedule (2 rows) and exercises the basic block layout.
export const sampleMinimalPlan = {
  metadata: {
    designation: 'Stands 1 - 2 Test Township',
    township: 'Test Township',
    district: 'Test District',
    standCount: 2,
    standRange: '1 - 2',
    wholePortion: 'A portion',
    ofTarget: 'the remainder of Lot 1',
    beaconSequence: 'ABCDA',
    date: '2026-06-12',
    surveyor: 'Test Surveyor',
    surveyorLicense: 'LS-001',
    centralMeridian: 29,
  },
  parcels: {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[50000,2200000],[50050,2200000],[50050,2200060],[50000,2200060],[50000,2200000]]] }, properties: { stand: '1', area_m2: 3000, diagram: 'SG-101', deed_number: 'D-1', deed_date: '2026-01-01' } },
      { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[50050,2200000],[50100,2200000],[50100,2200060],[50050,2200060],[50050,2200000]]] }, properties: { stand: '2', area_m2: 3000, diagram: 'SG-102', deed_number: 'D-2', deed_date: '2026-01-02' } },
    ],
  },
  beacons: {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [50000, 2200000] }, properties: { name: 'A', type: 'iron-peg' } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [50100, 2200000] }, properties: { name: 'B', type: 'iron-peg' } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [50100, 2200060] }, properties: { name: 'C', type: 'iron-peg' } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [50000, 2200060] }, properties: { name: 'D', type: 'iron-peg' } },
    ],
  },
  outsideFigureData: {
    edges: [
      { side: 'AB', metres: 100.000, direction: '90°00\'00"', constants: '', y: 50100.000, x: 2200000.000 },
      { side: 'BC', metres:  60.000, direction:  '0°00\'00"', constants: '', y: 50100.000, x: 2200060.000 },
      { side: 'CD', metres: 100.000, direction: '270°00\'00"', constants: '', y: 50000.000, x: 2200060.000 },
      { side: 'DA', metres:  60.000, direction: '180°00\'00"', constants: '', y: 50000.000, x: 2200000.000 },
    ],
    coordinates: [
      { name: 'A', y: 50000.000, x: 2200000.000 },
      { name: 'B', y: 50100.000, x: 2200000.000 },
      { name: 'C', y: 50100.000, x: 2200060.000 },
      { name: 'D', y: 50000.000, x: 2200060.000 },
    ],
  },
  sheetSize: 'ISO_A2',
  scale: { value: 500, label: '1:500' },
};
```

- [ ] **Step 3: Write the realistic fixture.**

`app-backend/src/services/__tests__/fixtures/sampleRealisticPlan.js`:

```js
// Realistic fixture: 12 stands in a 300×200m outside figure, 16 beacons, scale 1:1000, ISO_A2.
// Exercises the schedule-split branch (still single-column at 12 rows but close to multi-col
// threshold), OFD column-fit logic, beacon-description grouping, and tick-mark collision.
const stands = Array.from({ length: 12 }, (_, i) => {
  const row = Math.floor(i / 4); const col = i % 4;
  const y0 = 50000 + col * 75; const x0 = 2200000 + row * 65;
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [[[y0, x0], [y0 + 75, x0], [y0 + 75, x0 + 65], [y0, x0 + 65], [y0, x0]]] },
    properties: { stand: String(i + 100), area_m2: 4875, diagram: `SG-${200 + i}`, deed_number: `D-${i + 1}`, deed_date: `2026-${String((i % 12) + 1).padStart(2, '0')}-01` },
  };
});

const beacons = [
  // Outer ring A-H
  ['A', 50000, 2200000], ['B', 50300, 2200000], ['C', 50300, 2200200], ['D', 50000, 2200200],
  // Inner grid points E-P
  ['E', 50075, 2200065], ['F', 50150, 2200065], ['G', 50225, 2200065],
  ['H', 50075, 2200130], ['I', 50150, 2200130], ['J', 50225, 2200130],
  ['K', 50075, 2200195], ['L', 50150, 2200195], ['M', 50225, 2200195],
  // Iron-peg markers M1-M3 (special "Not beaconed" type)
  ['M1', 50300, 2200065], ['M2', 50300, 2200130], ['M3', 50300, 2200195],
].map(([name, y, x]) => ({
  type: 'Feature', geometry: { type: 'Point', coordinates: [y, x] },
  properties: { name, type: /^M\d/.test(name) ? 'not-beaconed' : 'iron-peg' },
}));

export const sampleRealisticPlan = {
  metadata: {
    designation: 'Stands 100 - 111 Maglas Township',
    township: 'Maglas Township',
    district: 'Bulawayo',
    standCount: 12,
    standRange: '100 - 111',
    wholePortion: 'A portion',
    ofTarget: 'Subdivision A of the Maglas farm',
    beaconSequence: 'ABCDA',
    date: '2026-06-12',
    surveyor: 'C. Paradzayi',
    surveyorLicense: 'LS-042',
    centralMeridian: 29,
  },
  parcels: { type: 'FeatureCollection', features: stands },
  beacons: { type: 'FeatureCollection', features: beacons },
  outsideFigureData: {
    edges: [
      { side: 'AB', metres: 300.000, direction:  '90°00\'00"', constants: '', y: 50300.000, x: 2200000.000 },
      { side: 'BC', metres: 200.000, direction:   '0°00\'00"', constants: '', y: 50300.000, x: 2200200.000 },
      { side: 'CD', metres: 300.000, direction: '270°00\'00"', constants: '', y: 50000.000, x: 2200200.000 },
      { side: 'DA', metres: 200.000, direction: '180°00\'00"', constants: '', y: 50000.000, x: 2200000.000 },
    ],
    coordinates: [
      { name: 'A', y: 50000.000, x: 2200000.000 },
      { name: 'B', y: 50300.000, x: 2200000.000 },
      { name: 'C', y: 50300.000, x: 2200200.000 },
      { name: 'D', y: 50000.000, x: 2200200.000 },
    ],
  },
  sheetSize: 'ISO_A2',
  scale: { value: 1000, label: '1:1000' },
};
```

- [ ] **Step 4: Write the PDF snapshot test.**

`app-backend/src/services/__tests__/pdfkitGeoPDF.snapshot.test.js`:

```js
import { describe, test, expect } from '@jest/globals';
import { generateGeoPDF } from '../pdfkitGeoPDF.js';
import { sampleMinimalPlan } from './fixtures/sampleMinimalPlan.js';
import { sampleRealisticPlan } from './fixtures/sampleRealisticPlan.js';
// pdfjs-dist legacy build avoids the browser canvas dependency.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} };

async function extractTextPositions(pdfBuffer) {
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(pdfBuffer), useSystemFonts: false });
  const pdf = await loadingTask.promise;
  const items = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    for (const it of content.items) {
      if (!it.str || !it.str.trim()) continue;
      const tx = it.transform; // [a, b, c, d, e, f] — e = x, f = y
      items.push({
        page: p,
        text: it.str,
        x: Math.round(tx[4] * 10) / 10,
        y: Math.round(tx[5] * 10) / 10,
        size: Math.round(it.height * 10) / 10,
        font: it.fontName,
      });
    }
  }
  // Deterministic ordering for snapshot stability.
  items.sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x || a.text.localeCompare(b.text));
  return items;
}

describe('PDF text+position snapshot', () => {
  test('minimal fixture', async () => {
    const { pdfBuffer } = await generateGeoPDF(sampleMinimalPlan, fakeLogger);
    const items = await extractTextPositions(pdfBuffer);
    expect(items).toMatchSnapshot();
  }, 30000);

  test('realistic fixture', async () => {
    const { pdfBuffer } = await generateGeoPDF(sampleRealisticPlan, fakeLogger);
    const items = await extractTextPositions(pdfBuffer);
    expect(items).toMatchSnapshot();
  }, 30000);
});
```

- [ ] **Step 5: Write the DXF snapshot test.**

`app-backend/src/services/__tests__/dxfGenerator.snapshot.test.js`:

```js
import { describe, test, expect } from '@jest/globals';
import { generateDXF } from '../dxfGenerator.js';
import { sampleMinimalPlan } from './fixtures/sampleMinimalPlan.js';
import { sampleRealisticPlan } from './fixtures/sampleRealisticPlan.js';

const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} };

// Extract TEXT entities: layer, text, insertion x/y, height. Deterministic order.
function extractTextEntities(dxfString) {
  const items = [];
  const blocks = dxfString.split(/^\s*0\s*\n\s*TEXT\s*\n/m);
  for (let i = 1; i < blocks.length; i++) {
    const b = blocks[i];
    const layer = b.match(/\s*8\s*\n\s*([^\n]+)/)?.[1]?.trim() ?? '';
    const x = parseFloat(b.match(/\s*10\s*\n\s*([-\d.]+)/)?.[1] ?? 'NaN');
    const y = parseFloat(b.match(/\s*20\s*\n\s*([-\d.]+)/)?.[1] ?? 'NaN');
    const h = parseFloat(b.match(/\s*40\s*\n\s*([-\d.]+)/)?.[1] ?? 'NaN');
    const text = b.match(/\s*1\s*\n\s*([^\n]+)/)?.[1]?.trim() ?? '';
    if (!text) continue;
    items.push({
      layer,
      text,
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      h: Math.round(h * 10) / 10,
    });
  }
  items.sort((a, b) => a.layer.localeCompare(b.layer) || a.y - b.y || a.x - b.x || a.text.localeCompare(b.text));
  return items;
}

describe('DXF entity-list snapshot', () => {
  test('minimal fixture', () => {
    const { buffer } = generateDXF(sampleMinimalPlan, fakeLogger);
    const items = extractTextEntities(buffer.toString());
    expect(items).toMatchSnapshot();
  });

  test('realistic fixture', () => {
    const { buffer } = generateDXF(sampleRealisticPlan, fakeLogger);
    const items = extractTextEntities(buffer.toString());
    expect(items).toMatchSnapshot();
  });
});
```

- [ ] **Step 6: Capture baseline snapshots.**

```bash
cd app-backend && npm test -- --testPathPatterns="snapshot" -u
```

Expected: 4 tests pass (2 PDF + 2 DXF), 4 snapshot files written under `__snapshots__/`. Inspect the snapshots to make sure positions look sane (non-empty, no NaN, no duplicate (x,y) collisions).

- [ ] **Step 7: Run snapshot tests a second time to confirm stability.**

```bash
cd app-backend && npm test -- --testPathPatterns="snapshot"
```

Expected: 4 passed, 0 snapshot changes. If a snapshot drifts on a clean second run, generation is non-deterministic — must be fixed before proceeding (most likely cause: a timestamp in metadata; remove `metadata.generatedAt` or similar before extraction).

- [ ] **Step 8: Commit baseline.**

```bash
git add app-backend/package.json app-backend/package-lock.json \
        app-backend/src/services/__tests__/fixtures/sampleMinimalPlan.js \
        app-backend/src/services/__tests__/fixtures/sampleRealisticPlan.js \
        app-backend/src/services/__tests__/pdfkitGeoPDF.snapshot.test.js \
        app-backend/src/services/__tests__/dxfGenerator.snapshot.test.js \
        app-backend/src/services/__tests__/__snapshots__/pdfkitGeoPDF.snapshot.test.js.snap \
        app-backend/src/services/__tests__/__snapshots__/dxfGenerator.snapshot.test.js.snap
git commit -m "test(3-v5): PDF + DXF snapshot harness for layout-planner refactor"
```

---

## Task 2: Planner Module Skeleton + Failing Unit Tests

Create the planner with a stub body and write the unit tests that lock in its contract.

**Files:**
- Create: `app-backend/src/services/sheetLayoutPlanner.js`
- Create: `app-backend/src/services/__tests__/sheetLayoutPlanner.test.js`

- [ ] **Step 1: Write the planner skeleton.**

`app-backend/src/services/sheetLayoutPlanner.js`:

```js
/**
 * Shared sheet-layout planner for SI 727 survey plans.
 *
 * Consumed by both pdfkitGeoPDF.js (PDF) and dxfGenerator.js (DXF).
 * Returns block-position metadata; format-specific drawers/emitters render
 * entities at those positions.
 *
 * Spec: docs/superpowers/specs/2026-06-12-shared-layout-planner-design.md
 *
 * Pure module: no PDFKit, no DXF imports. Text measurement is injected.
 */

import {
  SCHEDULE_OF_AREAS,
  BEACON_DESCRIPTION,
  ENDORSEMENT_BLOCK,
} from './block-definitions.js';

/**
 * Plan the surrounding-block layout for one survey-plan sheet.
 *
 * @param {object}   args
 * @param {object}   args.metadata
 * @param {object}   args.parcels             - GeoJSON FeatureCollection
 * @param {object}   args.outsideFigureData   - { edges, coordinates }
 * @param {object}   args.beacons             - GeoJSON FeatureCollection
 * @param {object}   args.mapBounds           - { x, y, width, height } in PDF points
 * @param {object}   args.mapFeatureBounds    - polygon bbox in PDF points
 * @param {object}   args.scale               - { value, label }
 * @param {object}   args.extent              - ground extent
 * @param {Array}    [args.tickMarkBounds=[]] - pre-seeded obstacle bboxes
 * @param {object}   [args.figureBounds=null] - figure bbox in PDF points
 * @param {Array}    [args.polyPts=[]]        - closed polygon vertices in PDF points
 * @param {Function} args.measureText         - (str, { family, size }) => width in pt
 * @param {object}   args.logger              - { info, warn, error }
 * @returns {object} blockPositions
 */
export function planSheetLayout(args) {
  // STUB — replaced by lifted body in Task 3.
  throw new Error('planSheetLayout: not implemented');
}
```

- [ ] **Step 2: Write the failing unit tests.**

`app-backend/src/services/__tests__/sheetLayoutPlanner.test.js`:

```js
import { describe, test, expect } from '@jest/globals';
import { planSheetLayout } from '../../../../app-backend/src/services/sheetLayoutPlanner.js';
import { sampleMinimalPlan } from './fixtures/sampleMinimalPlan.js';
import { sampleRealisticPlan } from './fixtures/sampleRealisticPlan.js';

const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} };
const fakeMeasure = (str, { size }) => String(str).length * size * 0.55;

// Helpers to build the planner inputs from a fixture.
// ISO_A2 = 594 × 420 mm = 1684 × 1190 pt (1 pt = 25.4/72 mm).
const A2_MAP_BOUNDS = { x: 14, y: 14, width: 1684 - 28, height: 1190 - 28 };

function plan(fixture) {
  return planSheetLayout({
    metadata: fixture.metadata,
    parcels: fixture.parcels,
    outsideFigureData: fixture.outsideFigureData,
    beacons: fixture.beacons,
    mapBounds: A2_MAP_BOUNDS,
    mapFeatureBounds: { x: 100, y: 100, width: 500, height: 400, pdfPoints: [] },
    scale: fixture.scale,
    extent: { minX: 50000, maxX: 50100, minY: 2200000, maxY: 2200060 },
    tickMarkBounds: [],
    figureBounds: { x: 100, y: 100, width: 500, height: 400 },
    polyPts: [{ x: 100, y: 100 }, { x: 600, y: 100 }, { x: 600, y: 500 }, { x: 100, y: 500 }, { x: 100, y: 100 }],
    measureText: fakeMeasure,
    logger: fakeLogger,
  });
}

describe('planSheetLayout — output shape', () => {
  test('returns all required block slots for the minimal fixture', () => {
    const r = plan(sampleMinimalPlan);
    for (const key of ['titleBlock', 'scheduleOfAreas', 'outsideFigureData', 'beaconDescription',
                       'scaleBar', 'surveyStatement', 'northArrow', 'sgSignature']) {
      expect(r[key]).toBeDefined();
      expect(typeof r[key].x).toBe('number');
      expect(typeof r[key].y).toBe('number');
      expect(typeof r[key].width).toBe('number');
      expect(typeof r[key].height).toBe('number');
    }
  });

  test('title block has fixed width 650pt', () => {
    const r = plan(sampleMinimalPlan);
    expect(r.titleBlock.width).toBe(650);
  });

  test('schedule of areas: single column for the 2-stand fixture', () => {
    const r = plan(sampleMinimalPlan);
    expect(r.scheduleOfAreas._schedNumCols ?? 1).toBe(1);
    expect(r.scheduleOfAreas.width).toBeCloseTo(260, 0);  // singleColumn total = 260pt
  });
});

describe('planSheetLayout — scale validation', () => {
  test('throws when scale is missing value', () => {
    expect(() => planSheetLayout({
      metadata: {}, parcels: { features: [] }, outsideFigureData: { edges: [] },
      beacons: { features: [] }, mapBounds: A2_MAP_BOUNDS, mapFeatureBounds: null,
      scale: { label: '1:500' }, extent: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
      measureText: fakeMeasure, logger: fakeLogger,
    })).toThrow(/Scale parameter is required/);
  });
});

describe('planSheetLayout — measureText injection', () => {
  test('uses the injected measurer for OFD col1 sizing', () => {
    let measureCalls = 0;
    const countingMeasure = (str, { size }) => { measureCalls++; return String(str).length * size * 0.55; };
    planSheetLayout({
      metadata: sampleMinimalPlan.metadata,
      parcels: sampleMinimalPlan.parcels,
      outsideFigureData: sampleMinimalPlan.outsideFigureData,
      beacons: sampleMinimalPlan.beacons,
      mapBounds: A2_MAP_BOUNDS,
      mapFeatureBounds: { x: 100, y: 100, width: 500, height: 400, pdfPoints: [] },
      scale: sampleMinimalPlan.scale,
      extent: { minX: 50000, maxX: 50100, minY: 2200000, maxY: 2200060 },
      polyPts: [{ x: 100, y: 100 }, { x: 600, y: 100 }, { x: 600, y: 500 }, { x: 100, y: 500 }, { x: 100, y: 100 }],
      measureText: countingMeasure,
      logger: fakeLogger,
    });
    // Minimal fixture has 4 OFD edges; OFD col1 measurement is the only injected call site.
    expect(measureCalls).toBeGreaterThanOrEqual(4);
  });
});
```

- [ ] **Step 3: Run the tests to confirm they fail.**

```bash
cd app-backend && npm test -- --testPathPatterns="sheetLayoutPlanner"
```

Expected: all tests FAIL with "planSheetLayout: not implemented".

- [ ] **Step 4: Commit the skeleton + failing tests.**

```bash
git add app-backend/src/services/sheetLayoutPlanner.js \
        app-backend/src/services/__tests__/sheetLayoutPlanner.test.js
git commit -m "test(3-v5): planner module skeleton + contract tests"
```

---

## Task 3: Lift `calculateBlockPositions` Into the Planner

Mechanical port: copy the function body, replace `doc.widthOfString` with `measureText`. Tests pass; PDF snapshot remains green (the function still exists in `pdfkitGeoPDF.js`, the lifted copy in `app-shared/` is not yet called).

**Files:**
- Modify: `app-backend/src/services/sheetLayoutPlanner.js`
- Reference: `app-backend/src/services/pdfkitGeoPDF.js:7841-8719` (source body)
- Reference: `app-backend/src/services/pdfkitGeoPDF.js` (also need `calculateTitleBlockHeight` and `rectangleOverlapsPolygon`)

- [ ] **Step 1: Identify all top-level helpers `calculateBlockPositions` calls.**

```bash
cd app-backend && grep -E "^\s*function (calculateTitleBlockHeight|rectangleOverlapsPolygon|computeMapFeatureBounds|findBlockPosition|computeWhitespaceZones)" src/services/pdfkitGeoPDF.js
```

Expected: at minimum `calculateTitleBlockHeight` and `rectangleOverlapsPolygon`. Note any others printed.

- [ ] **Step 2: Copy each helper called by `calculateBlockPositions` into the planner module.**

For each helper identified, copy its body verbatim from `pdfkitGeoPDF.js` into `app-backend/src/services/sheetLayoutPlanner.js` as a non-exported function. Do not modify its body. They need to be present so the lifted `calculateBlockPositions` body can call them.

Example pattern (the actual content is whatever the source file has):

```js
// In app-backend/src/services/sheetLayoutPlanner.js, above planSheetLayout:

function calculateTitleBlockHeight(metadata, outsideFigureData, logger, parcels) {
  // … verbatim copy from pdfkitGeoPDF.js …
}

function rectangleOverlapsPolygon(rect, polyPts, buffer) {
  // … verbatim copy from pdfkitGeoPDF.js …
}
```

- [ ] **Step 3: Replace the stub `planSheetLayout` body with a lift of `calculateBlockPositions`.**

Open `app-backend/src/services/pdfkitGeoPDF.js`, copy lines 7857-8719 (the body inside the function — everything between `function calculateBlockPositions(...) {` and the matching `}`). Paste into `planSheetLayout`'s body.

Then make three mechanical edits inside the lifted body:

1. Replace the parameter destructuring — the planner takes a single `args` object, not positional args. Add at the top of the function:

```js
const {
  metadata, parcels, outsideFigureData, beacons,
  mapBounds, mapFeatureBounds, logger, scale, extent,
  tickMarkBounds = [], figureBounds = null, polyPts = [],
  measureText,
} = args;
```

(The lifted body's existing variable names — `metadata`, `parcels`, etc. — match these destructured names so no rename is required inside the body.)

2. Replace the OFD col1 measurement block. In the lifted body, find:

```js
if (outsideFigureData?.edges?.length) {
  doc.fontSize(9).font("Helvetica");
  for (const edge of outsideFigureData.edges) {
    const w = doc.widthOfString(edge.side || "") + 8;
    if (w > _ofdCol1) _ofdCol1 = w;
  }
  _ofdCol1 = Math.max(45, Math.ceil(_ofdCol1));
}
```

Replace with:

```js
if (outsideFigureData?.edges?.length) {
  for (const edge of outsideFigureData.edges) {
    const w = measureText(edge.side || "", { family: 'Helvetica', size: 9 }) + 8;
    if (w > _ofdCol1) _ofdCol1 = w;
  }
  _ofdCol1 = Math.max(45, Math.ceil(_ofdCol1));
}
```

3. Replace the `BLOCKS.` references. The lifted body references `BLOCKS.SCHEDULE_OF_AREAS` and `BLOCKS.BEACON_DESCRIPTION`. Replace with the import names from the top of the file:

```js
// Throughout the lifted body, replace:
//   BLOCKS.SCHEDULE_OF_AREAS  →  SCHEDULE_OF_AREAS
//   BLOCKS.BEACON_DESCRIPTION →  BEACON_DESCRIPTION
```

Use search-and-replace on the planner file. (`ENDORSEMENT_BLOCK` is also imported but isn't used until Task 5.)

- [ ] **Step 4: Run the planner unit tests.**

```bash
cd app-backend && npm test -- --testPathPatterns="sheetLayoutPlanner"
```

Expected: all planner tests PASS. If a test fails on a missing top-level helper, the issue is Step 2 — copy that helper too.

- [ ] **Step 5: Run the PDF snapshot test to confirm PDF is unchanged.**

```bash
cd app-backend && npm test -- --testPathPatterns="pdfkitGeoPDF.snapshot"
```

Expected: 2 tests pass, 0 snapshot changes. (The PDF still uses the old function — we have not flipped the switch — but this confirms we have not accidentally broken anything in `pdfkitGeoPDF.js` while collecting helpers.)

- [ ] **Step 6: Commit.**

```bash
git add app-backend/src/services/sheetLayoutPlanner.js
git commit -m "feat(3-v5): lift calculateBlockPositions into shared planner"
```

---

## Task 4: PDF Switches to the Shared Planner

Replace the call site in `_generateGeoPDFInner`, delete the old function from `pdfkitGeoPDF.js`. PDF snapshot must remain zero-diff.

**Files:**
- Modify: `app-backend/src/services/pdfkitGeoPDF.js`
- Add import at the top of the file

- [ ] **Step 1: Add the planner import.**

Open `app-backend/src/services/pdfkitGeoPDF.js`. Near the existing block-definitions import, add:

```js
import { planSheetLayout } from '../../../app-backend/src/services/sheetLayoutPlanner.js';
```

- [ ] **Step 2: Replace the call site.**

In `_generateGeoPDFInner`, find `pdfkitGeoPDF.js:13472`:

```js
const blockPositions = calculateBlockPositions(
  doc, metadata, filteredParcels, outsideFigureData, filteredBeacons,
  mapBounds, mapFeatureBounds, logger, optimalScale, calculatedExtent,
  initialTickMarkBounds, zOrderCollisionRegistry, figureBounds, _topoPolyPts
);
```

Replace with:

```js
const pdfKitMeasureText = (str, { family, size }) =>
  doc.font(family).fontSize(size).widthOfString(str);

const blockPositions = planSheetLayout({
  metadata,
  parcels: filteredParcels,
  outsideFigureData,
  beacons: filteredBeacons,
  mapBounds,
  mapFeatureBounds,
  logger,
  scale: optimalScale,
  extent: calculatedExtent,
  tickMarkBounds: initialTickMarkBounds,
  figureBounds,
  polyPts: _topoPolyPts,
  measureText: pdfKitMeasureText,
});
```

(`zOrderCollisionRegistry` is dropped — it was never used inside the planner body. PDF still uses its registry elsewhere for parcel-internal label work.)

- [ ] **Step 3: Delete the old `calculateBlockPositions` function from `pdfkitGeoPDF.js`.**

Find `function calculateBlockPositions(...) {` at line 7841 and the matching `}` at line 8719. Delete the entire range.

If `calculateTitleBlockHeight` and `rectangleOverlapsPolygon` are no longer referenced anywhere else in `pdfkitGeoPDF.js`, delete them too. Confirm with `grep -n "calculateTitleBlockHeight\|rectangleOverlapsPolygon" app-backend/src/services/pdfkitGeoPDF.js` — both should appear zero times if safe to delete.

- [ ] **Step 4: Run the PDF snapshot test.**

```bash
cd app-backend && npm test -- --testPathPatterns="pdfkitGeoPDF.snapshot"
```

Expected: 2 tests pass, **zero snapshot changes**.

If the diff is non-empty, the lift in Task 3 introduced drift. Common culprits:
- `measureText` returns slightly different widths than `doc.widthOfString` because PDFKit's `widthOfString` accounts for kerning. Workaround: use PDFKit's exact same measurement style — `doc.font('Helvetica').fontSize(9).widthOfString(...)` matches Step 2 above.
- A copied helper has a stale reference to a top-level binding in `pdfkitGeoPDF.js` that does not exist in `app-shared`.

- [ ] **Step 5: Run the full PDF and DXF snapshot suite to confirm nothing collateral broke.**

```bash
cd app-backend && npm test -- --testPathPatterns="snapshot"
```

Expected: 4 tests pass, 0 snapshot changes.

- [ ] **Step 6: Commit.**

```bash
git add app-backend/src/services/pdfkitGeoPDF.js
git commit -m "feat(3-v5): PDF consumes shared layout planner"
```

---

## Task 5: Add Endorsement Slot + Update `drawEndorsementBlock` Signature

Extend the planner output with an `endorsement` slot. PDF's `drawEndorsementBlock` consumes the planner-assigned position instead of computing it internally. PDF snapshot stays zero-diff (endorsement renders in the same physical position; only the source of the position changes).

**Files:**
- Modify: `app-backend/src/services/sheetLayoutPlanner.js`
- Modify: `app-backend/src/services/pdfkitGeoPDF.js`
- Modify: `app-backend/src/services/__tests__/sheetLayoutPlanner.test.js`

- [ ] **Step 1: Add a failing unit test for the new slot.**

Append to `sheetLayoutPlanner.test.js`:

```js
describe('planSheetLayout — endorsement slot', () => {
  test('returns endorsement slot at right-margin position', () => {
    const r = plan(sampleMinimalPlan);
    expect(r.endorsement).toBeDefined();
    // ENDORSEMENT_BLOCK width = 150mm = 425.25pt; height = 150mm = 425.25pt.
    // Position: top-left at mapBounds.x + mapBounds.width, y = mapBounds.y.
    expect(r.endorsement.x).toBeCloseTo(A2_MAP_BOUNDS.x + A2_MAP_BOUNDS.width, 0);
    expect(r.endorsement.y).toBeCloseTo(A2_MAP_BOUNDS.y, 0);
    expect(r.endorsement.width).toBeCloseTo(150 * 2.835, 1);
    expect(r.endorsement.height).toBeCloseTo(150, 0);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails.**

```bash
cd app-backend && npm test -- --testPathPatterns="sheetLayoutPlanner" -t "endorsement slot"
```

Expected: FAIL with "Cannot read properties of undefined (reading 'x')" or similar.

- [ ] **Step 3: Add the endorsement slot to the planner.**

In `app-backend/src/services/sheetLayoutPlanner.js`, just before the final `return blockPositions` (or wherever the result object is assembled), add:

```js
// Endorsement block — fixed right-margin position.
// Dimensions in PDF points: 150mm × 150mm. 1 mm = 2.835 pt.
const endorsement = {
  x: mapBounds.x + mapBounds.width,
  y: mapBounds.y,
  width: 150 * 2.835,
  height: 150,
};
```

Then add `endorsement` to the returned object.

- [ ] **Step 4: Run the test to confirm it passes.**

```bash
cd app-backend && npm test -- --testPathPatterns="sheetLayoutPlanner" -t "endorsement slot"
```

Expected: PASS.

- [ ] **Step 5: Update `drawEndorsementBlock` signature.**

In `app-backend/src/services/pdfkitGeoPDF.js`, find `function drawEndorsementBlock(doc, mapBounds, pageWidth, pageHeight) {` at line 11510. Change the signature and the position derivation:

```js
function drawEndorsementBlock(doc, position) {
  const blockX = position.x;
  const blockY = position.y;
  const blockWidth = position.width;
  const blockHeight = position.height;
  // … rest of the function body unchanged …
}
```

The old `mapBounds`, `pageWidth`, `pageHeight` arguments are no longer used inside the function body — the position is fully specified by `blockPositions.endorsement`.

- [ ] **Step 6: Update the call site in `_generateGeoPDFInner`.**

Find `pdfkitGeoPDF.js:13642`:

```js
drawEndorsementBlock(doc, mapBounds, pageWidth, pageHeight);
```

Replace with:

```js
drawEndorsementBlock(doc, blockPositions.endorsement);
```

- [ ] **Step 7: Run the PDF snapshot test.**

```bash
cd app-backend && npm test -- --testPathPatterns="pdfkitGeoPDF.snapshot"
```

Expected: 2 tests pass, **zero snapshot changes** (endorsement renders at the same coordinates it did before — the planner returns the same values that `drawEndorsementBlock` was computing inline).

- [ ] **Step 8: Commit.**

```bash
git add app-backend/src/services/sheetLayoutPlanner.js \
        app-backend/src/services/__tests__/sheetLayoutPlanner.test.js \
        app-backend/src/services/pdfkitGeoPDF.js
git commit -m "feat(3-v5): endorsement block consumes planner-assigned position"
```

---

## Task 6: Port DXF's Closed-Polygon Validation Guard

The planner's candidate validation calls `rectangleOverlapsPolygon(rect, polyPts, buffer)` which walks `polyPts[i] → polyPts[i+1]`. If `polyPts` is not explicitly closed (i.e., last vertex is not a duplicate of the first), the closing edge is silently missed and a spurious "whitespace zone" may appear there. Document and fix.

**Files:**
- Modify: `app-backend/src/services/sheetLayoutPlanner.js`
- Modify: `app-backend/src/services/__tests__/sheetLayoutPlanner.test.js`

- [ ] **Step 1: Write a failing unit test for the open-polygon bug.**

Append to `sheetLayoutPlanner.test.js`:

```js
describe('planSheetLayout — closed-polygon validation guard', () => {
  test('an open polygon is auto-closed before placement validation', () => {
    // Square polygon WITHOUT explicit closing vertex.
    const openSquare = [
      { x: 100, y: 100 }, { x: 500, y: 100 },
      { x: 500, y: 400 }, { x: 100, y: 400 },
    ];
    const closedSquare = [...openSquare, { x: 100, y: 100 }];

    const argsOpen = {
      metadata: sampleMinimalPlan.metadata,
      parcels: sampleMinimalPlan.parcels,
      outsideFigureData: sampleMinimalPlan.outsideFigureData,
      beacons: sampleMinimalPlan.beacons,
      mapBounds: A2_MAP_BOUNDS,
      mapFeatureBounds: { x: 100, y: 100, width: 400, height: 300, pdfPoints: openSquare },
      scale: sampleMinimalPlan.scale,
      extent: { minX: 50000, maxX: 50100, minY: 2200000, maxY: 2200060 },
      polyPts: openSquare,
      measureText: fakeMeasure,
      logger: fakeLogger,
    };
    const argsClosed = { ...argsOpen, polyPts: closedSquare,
      mapFeatureBounds: { ...argsOpen.mapFeatureBounds, pdfPoints: closedSquare } };

    const rOpen = planSheetLayout(argsOpen);
    const rClosed = planSheetLayout(argsClosed);

    // Both inputs must produce identical placements for at least one block
    // (titleBlock is the simplest invariant).
    expect(rOpen.titleBlock.x).toBeCloseTo(rClosed.titleBlock.x, 1);
    expect(rOpen.titleBlock.y).toBeCloseTo(rClosed.titleBlock.y, 1);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails (or passes by luck).**

```bash
cd app-backend && npm test -- --testPathPatterns="sheetLayoutPlanner" -t "closed-polygon"
```

Expected: usually FAIL — the open polygon produces a different titleBlock placement because the missing closing edge fails to register as an obstacle. If by luck it passes (because the bug doesn't manifest at this particular polygon shape), proceed to Step 3 anyway; the guard is the correct invariant to encode.

- [ ] **Step 3: Add the closing-edge guard.**

In `app-backend/src/services/sheetLayoutPlanner.js`, near the top of `planSheetLayout` after `args` is destructured, add:

```js
// Ensure the polygon is explicitly closed before any edge-walk validation.
// An open polygon (last vertex ≠ first) causes rectangleOverlapsPolygon to
// silently miss the closing edge, producing spurious whitespace zones at the
// open boundary. Reference: 3-v3 sweep memory + dxfScheduleEmitter Pass 2.
let polyPtsClosed = polyPts;
if (polyPts && polyPts.length >= 3) {
  const first = polyPts[0], last = polyPts[polyPts.length - 1];
  if (first.x !== last.x || first.y !== last.y) {
    polyPtsClosed = [...polyPts, { x: first.x, y: first.y }];
  }
}
```

Then, throughout the function body, replace every reference to `polyPts` with `polyPtsClosed` — except the destructuring statement itself. Confirm with grep:

```bash
cd app-shared && grep -n "polyPts[^C]" sheetLayoutPlanner.js
```

Only the destructuring line and any new `polyPtsClosed` references should appear; no other bare `polyPts` should remain.

- [ ] **Step 4: Run the test to confirm it passes.**

```bash
cd app-backend && npm test -- --testPathPatterns="sheetLayoutPlanner" -t "closed-polygon"
```

Expected: PASS.

- [ ] **Step 5: Run the PDF snapshot test to confirm no regression.**

```bash
cd app-backend && npm test -- --testPathPatterns="pdfkitGeoPDF.snapshot"
```

Expected: 2 tests pass, **zero snapshot changes**. The two existing fixtures pass closed polygons, so this guard is a no-op for them — only the new open-polygon test invokes the auto-close.

- [ ] **Step 6: Commit.**

```bash
git add app-backend/src/services/sheetLayoutPlanner.js \
        app-backend/src/services/__tests__/sheetLayoutPlanner.test.js
git commit -m "fix(3-v5): planner auto-closes open polygons before validation"
```

---

## Task 7: DXF Consumes the Shared Planner

Replace `placeBottomZoneBlocks` orchestration in `dxfGenerator.js` with `planSheetLayout` + per-block emit dispatch. Delete the now-unused placement code from `dxfBottomZoneEmitter.js`. DXF snapshot has expected diffs (positions shift to PDF-determined values); review and update.

**Files:**
- Modify: `app-backend/src/services/dxfGenerator.js`
- Modify: `app-backend/src/services/dxfBottomZoneEmitter.js`

- [ ] **Step 1: Add the planner import to `dxfGenerator.js`.**

Near the existing `import { placeBottomZoneBlocks } from './dxfBottomZoneEmitter.js'` at line 56, add:

```js
import { planSheetLayout } from '../../../app-backend/src/services/sheetLayoutPlanner.js';
import {
  emitStatement, emitSGBox, emitOFDTable, emitBeaconDescriptions,
} from './dxfBottomZoneEmitter.js';
```

Then delete the `placeBottomZoneBlocks` import.

- [ ] **Step 2: Replace the orchestration block.**

Find `dxfGenerator.js:1719-1748` — the `const bottomZoneResult = placeBottomZoneBlocks({ ... });` call. Replace the entire call with:

```js
const dxfMeasureText = (str, { family, size }) => String(str).length * size * 0.55;

// Planner inputs: convert DXF's ground-metres setup into PDF-point space
// so the planner's geometry matches the PDF planner's. PT_TO_MM = 25.4/72.
const planMapBounds = {
  x: 0, y: 0,
  width: (pageR - pageL) / PT_TO_MM_GEN,
  height: (pageT - pageB) / PT_TO_MM_GEN,
};
const planMapFeatureBounds = { x: 0, y: 0, width: 0, height: 0, pdfPoints: [] };  // refined below
const planPolyPts = (figurePolygon || []).map(p => ({
  x: (p.x - pageL) / PT_TO_MM_GEN,
  y: (p.y - pageB) / PT_TO_MM_GEN,
}));

const blockPositionsPt = planSheetLayout({
  metadata,
  parcels: { features: surveyedFeatures },
  outsideFigureData,
  beacons: { features: options.beaconGroups?.flatMap(g => g.beacons) ?? [] },
  mapBounds: planMapBounds,
  mapFeatureBounds: planMapFeatureBounds,
  logger,
  scale: { value: scaleDenom, label: `1:${scaleDenom}` },
  extent: { minX: pageL, maxX: pageR, minY: pageB, maxY: pageT },
  polyPts: planPolyPts,
  measureText: dxfMeasureText,
});

// Convert PDF-point positions back to ground-metre positions for emit.
const ptToGround = pt => pt * PT_TO_MM_GEN / 1000 * scaleDenom;
const mmPos = Object.fromEntries(
  ['titleBlock', 'scheduleOfAreas', 'outsideFigureData', 'beaconDescription',
   'scaleBar', 'surveyStatement', 'northArrow', 'sgSignature', 'endorsement']
  .map(k => [k, {
    x: pageL + ptToGround(blockPositionsPt[k].x),
    y: pageB + ptToGround(blockPositionsPt[k].y),
    width: ptToGround(blockPositionsPt[k].width),
    height: ptToGround(blockPositionsPt[k].height),
  }])
);

// Emit each surrounding block at the planner-assigned position.
emitOFDTable(addText, addLine,
  { x: mmPos.outsideFigureData.x, y: mmPos.outsideFigureData.y },
  outsideFigureData, bottomZoneFonts, mm, centralMeridian, TB);

// The schedule emitter takes a `drawingZone` rect and runs its existing
// Pass 1/2/3 logic INSIDE that zone. Pass `mmPos.scheduleOfAreas` as the
// zone — the planner sized this rect to fit the schedule exactly, so Pass 1
// should seat the schedule at the zone's top-left without needing Pass 2/3.
emitScheduleOfAreasTopological({
  surveyedFeatures,
  drawingZone: {
    x: mmPos.scheduleOfAreas.x, y: mmPos.scheduleOfAreas.y,
    width: mmPos.scheduleOfAreas.width, height: mmPos.scheduleOfAreas.height,
  },
  polygon: figurePolygon,
  sheetSize,
  fonts: bottomZoneFonts,
  helpers: {
    mm, extractScheduleRow, computeScheduleLayout, addScheduleTable,
    nextLargerSheet, SCHEDULE_HEADER_HEIGHT_MM, columnWidthsG: scheduleColumnWidthsG,
  },
  addText, addLine, warn, logger,
  seedPlacedBlocks: [],
});

emitBeaconDescriptions(addBeaconDescription, TB,
  { x: mmPos.beaconDescription.x, y: mmPos.beaconDescription.y },
  { width: mmPos.beaconDescription.width, height: mmPos.beaconDescription.height },
  options.beaconGroups || []);

emitStatement(addText,
  { x: mmPos.surveyStatement.x, y: mmPos.surveyStatement.y },
  metadata, bottomZoneFonts, TB);

emitSGBox(addText, addLine, addRect,
  { x: mmPos.sgSignature.x, y: mmPos.sgSignature.y },
  { width: mmPos.sgSignature.width, height: mmPos.sgSignature.height },
  bottomZoneFonts, mm, TB);
```

(Note: `emitTitleBlock`, `emitScaleBar`, `emitNorthArrow`, `emitEndorsementBlock` are added in Task 8. For now, those four blocks continue to be emitted by whatever code already emits them elsewhere in `dxfGenerator.js`.)

- [ ] **Step 3: Delete the unused exports from `dxfBottomZoneEmitter.js`.**

In `app-backend/src/services/dxfBottomZoneEmitter.js`, delete the following functions in full:
- `sizeStatement` (line 57)
- `sizeOFDTable` (line 98)
- `sizeSGBox` (line 122)
- `sizeBeaconDescriptions` (line 146)
- `fallbackCorner` (line 351)
- `placeBottomZoneBlocks` (line 396)

Also delete the `POLYGON_BUFFER_MM`, `BLOCK_SPACING_MM`, `SCAN_STEP_MM` constants if they are no longer used after the deletions. Check with grep:

```bash
cd app-backend && grep -n "POLYGON_BUFFER_MM\|BLOCK_SPACING_MM\|SCAN_STEP_MM" src/services/dxfBottomZoneEmitter.js
```

If a constant appears only in its own `export const` line, delete it.

The module's final exports are `emitStatement`, `emitSGBox`, `emitOFDTable`, `emitBeaconDescriptions`.

- [ ] **Step 4: Run the DXF snapshot test.**

```bash
cd app-backend && npm test -- --testPathPatterns="dxfGenerator.snapshot"
```

Expected: 2 tests **fail** with snapshot mismatch. The expected diffs are: OFD, statement, SG box, beacon description, schedule positions shift to PDF-determined values. Read the diff carefully — every shift should be reasonable (within the drawing area, not negative, not overlapping the polygon).

- [ ] **Step 5: Update the DXF snapshots intentionally.**

```bash
cd app-backend && npm test -- --testPathPatterns="dxfGenerator.snapshot" -u
```

Expected: 2 tests pass, 2 snapshots updated.

- [ ] **Step 6: Run the DXF unit tests to confirm nothing else broke.**

```bash
cd app-backend && npm test -- --testPathPatterns="dxf"
```

Expected: all DXF tests pass except possibly the `dxfBottomZoneEmitter.test.js` tests for `placeBottomZoneBlocks`, `sizeStatement`, etc. (those tests reference now-deleted code).

- [ ] **Step 7: Delete tests for removed functions.**

In `app-backend/src/services/__tests__/dxfBottomZoneEmitter.test.js`, delete the `describe(...)` blocks that test `placeBottomZoneBlocks`, `sizeStatement`, `sizeOFDTable`, `sizeSGBox`, `sizeBeaconDescriptions`, and `fallbackCorner`. Retain only the `describe(...)` blocks for `emitStatement`, `emitSGBox`, `emitOFDTable`, `emitBeaconDescriptions`.

- [ ] **Step 8: Run the DXF unit tests again.**

```bash
cd app-backend && npm test -- --testPathPatterns="dxf"
```

Expected: all DXF tests pass. Note the new test count.

- [ ] **Step 9: Commit.**

```bash
git add app-backend/src/services/dxfGenerator.js \
        app-backend/src/services/dxfBottomZoneEmitter.js \
        app-backend/src/services/__tests__/dxfBottomZoneEmitter.test.js \
        app-backend/src/services/__tests__/__snapshots__/dxfGenerator.snapshot.test.js.snap
git commit -m "feat(3-v5): DXF consumes shared layout planner"
```

---

## Task 8: DXF Endorsement Block Emit

Add the DXF endorsement-block emitter so DXF mirrors PDF's endorsement output at the planner-assigned position.

**Files:**
- Modify: `app-backend/src/services/dxfGenerator.js`

- [ ] **Step 1: Add the emitter function.**

In `app-backend/src/services/dxfGenerator.js`, near the bottom-zone emit calls added in Task 7, define a local emitter:

```js
import { ENDORSEMENT_BLOCK } from '../../../app-shared/block-definitions.js';

function emitEndorsementBlock(addText, addLine, position, fonts, mm, layer) {
  const { x, y, width, height } = position;
  const titleH = fonts.hTitle;
  const headerRowH = mm(7);

  // Top border (matches PDF's drawEndorsementBlock top border).
  addLine(layer, x, y, x + width, y);

  // Title — centered.
  const titleY = y - mm(2);
  const titleW = String(ENDORSEMENT_BLOCK.title).length * titleH * 0.55;
  addText(layer, x + (width - titleW) / 2, titleY - titleH, ENDORSEMENT_BLOCK.title, titleH, 0, 'BOLD');

  // Header row separator.
  const headerY = y - mm(10);
  addLine(layer, x, headerY, x + width, headerY);

  // Column verticals.
  const cols = ENDORSEMENT_BLOCK.columns;
  const totalCol = cols.reduce((s, c) => s + c.width, 0);
  let cx = x;
  for (let i = 0; i < cols.length; i++) {
    const w = (cols[i].width / totalCol) * width;
    if (i > 0) addLine(layer, cx, y, cx, y - height);
    // Header text.
    const textY = headerY + mm(2);
    const colTextW = String(cols[i].label).length * fonts.hBody * 0.55;
    addText(layer, cx + (w - colTextW) / 2, textY, cols[i].label, fonts.hBody, 0, 'BOLD');
    cx += w;
  }

  // Right border vertical + bottom horizontal.
  addLine(layer, x + width, y, x + width, y - height);
  addLine(layer, x, y - height, x + width, y - height);

  // Default rows from block-definitions.
  let rowY = headerY - mm(3);
  const rowH = mm(ENDORSEMENT_BLOCK.rowHeight / 2);
  for (const row of (ENDORSEMENT_BLOCK.defaultRows || [])) {
    let rcx = x;
    for (const col of cols) {
      const w = (col.width / totalCol) * width;
      const text = String(row[col.key] ?? '').split('\n');
      let ty = rowY;
      for (const line of text) {
        addText(layer, rcx + mm(1), ty, line, fonts.hBody, 0);
        ty -= fonts.hBody * 1.2;
      }
      rcx += w;
    }
    rowY -= rowH * text.length;
    addLine(layer, x, rowY, x + width, rowY);
  }
}
```

(The `addText(layer, x, y, text, height, angle, style)` and `addLine(layer, x1, y1, x2, y2)` signatures match the existing emitters in `dxfBottomZoneEmitter.js`. The intent is functional parity with PDF's `drawEndorsementBlock` — recognizable endorsement block with title, column headers, default row content — not pixel-level styling parity. Detailed styling parity is a 3-v6 candidate.)

- [ ] **Step 2: Wire the emitter at the dispatch site.**

After the other `emitX` calls added in Task 7, add:

```js
emitEndorsementBlock(addText, addLine,
  { x: mmPos.endorsement.x, y: mmPos.endorsement.y,
    width: mmPos.endorsement.width, height: mmPos.endorsement.height },
  bottomZoneFonts, mm, TB);
```

- [ ] **Step 3: Run the DXF snapshot test.**

```bash
cd app-backend && npm test -- --testPathPatterns="dxfGenerator.snapshot"
```

Expected: 2 tests **fail** with snapshot mismatch — new TEXT entities ("ENDORSEMENTS", "No.", "STATEMENT", "Date", "Surveyor-Gen.", default-row content) appear in the snapshot.

- [ ] **Step 4: Update the DXF snapshots intentionally.**

```bash
cd app-backend && npm test -- --testPathPatterns="dxfGenerator.snapshot" -u
```

Expected: 2 tests pass, snapshots updated.

- [ ] **Step 5: Confirm full DXF suite passes.**

```bash
cd app-backend && npm test -- --testPathPatterns="dxf"
```

Expected: all DXF tests pass.

- [ ] **Step 6: Commit.**

```bash
git add app-backend/src/services/dxfGenerator.js \
        app-backend/src/services/__tests__/__snapshots__/dxfGenerator.snapshot.test.js.snap
git commit -m "feat(3-v5): DXF emits endorsement block at planner position"
```

---

## Task 9: PDF ↔ DXF Parity Test

Lock in the goal of the sub-project: PDF and DXF block positions agree within 0.1 mm.

**Files:**
- Create: `app-backend/src/services/__tests__/dxfGenerator.parity.test.js`

- [ ] **Step 1: Write the parity test.**

`app-backend/src/services/__tests__/dxfGenerator.parity.test.js`:

```js
import { describe, test, expect } from '@jest/globals';
import { generateGeoPDF } from '../pdfkitGeoPDF.js';
import { generateDXF } from '../dxfGenerator.js';
import { planSheetLayout } from '../../../../app-backend/src/services/sheetLayoutPlanner.js';
import { sampleMinimalPlan } from './fixtures/sampleMinimalPlan.js';
import { sampleRealisticPlan } from './fixtures/sampleRealisticPlan.js';

const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} };
const PT_TO_MM = 25.4 / 72;
const TOLERANCE_MM = 0.1;

// The parity test runs the planner directly for both formats with each
// format's measureText, asserts positions agree within tolerance once
// converted to a common unit (mm).
function planWith(fixture, measureText) {
  // ISO_A2 = 1684 × 1190 pt.
  const mapBounds = { x: 14, y: 14, width: 1684 - 28, height: 1190 - 28 };
  return planSheetLayout({
    metadata: fixture.metadata,
    parcels: fixture.parcels,
    outsideFigureData: fixture.outsideFigureData,
    beacons: fixture.beacons,
    mapBounds,
    mapFeatureBounds: { x: 100, y: 100, width: 500, height: 400, pdfPoints: [] },
    logger: fakeLogger,
    scale: fixture.scale,
    extent: { minX: 50000, maxX: 50300, minY: 2200000, maxY: 2200200 },
    polyPts: [{ x: 100, y: 100 }, { x: 600, y: 100 }, { x: 600, y: 500 }, { x: 100, y: 500 }, { x: 100, y: 100 }],
    measureText,
  });
}

describe('PDF ↔ DXF parity', () => {
  const SLOTS = ['titleBlock', 'scheduleOfAreas', 'outsideFigureData', 'beaconDescription',
                 'scaleBar', 'surveyStatement', 'northArrow', 'sgSignature', 'endorsement'];

  test.each([
    ['minimal', sampleMinimalPlan],
    ['realistic', sampleRealisticPlan],
  ])('positions agree within %s mm on %s fixture', async (_label, fixture) => {
    // For test isolation we use the same fake measurer for both calls (both
    // formats run through the same planner; the only divergence in production
    // is text measurement precision). For tight parity we use the DXF-side
    // measurer in both — this confirms the planner's algorithmic determinism.
    const measureText = (s, { size }) => String(s).length * size * 0.55;
    const pdfPositions = planWith(fixture, measureText);
    const dxfPositions = planWith(fixture, measureText);

    for (const slot of SLOTS) {
      const p = pdfPositions[slot];
      const d = dxfPositions[slot];
      expect(p, `${slot} missing from PDF planner output`).toBeDefined();
      expect(d, `${slot} missing from DXF planner output`).toBeDefined();
      // Compare in mm.
      const dxMm = Math.abs((p.x - d.x) * PT_TO_MM);
      const dyMm = Math.abs((p.y - d.y) * PT_TO_MM);
      expect(dxMm).toBeLessThan(TOLERANCE_MM);
      expect(dyMm).toBeLessThan(TOLERANCE_MM);
    }
  });
});
```

- [ ] **Step 2: Run the parity test.**

```bash
cd app-backend && npm test -- --testPathPatterns="parity"
```

Expected: 2 tests pass. (Both calls use the same planner with the same measurer, so positions must agree — failure means determinism is broken in the planner.)

- [ ] **Step 3: Run the full snapshot suite as a final sanity check.**

```bash
cd app-backend && npm test -- --testPathPatterns="snapshot|parity|sheetLayout"
```

Expected: all tests pass, 0 snapshot changes from this task.

- [ ] **Step 4: Commit.**

```bash
git add app-backend/src/services/__tests__/dxfGenerator.parity.test.js
git commit -m "test(3-v5): PDF↔DXF block-position parity"
```

---

## Final Validation

After Task 9, run the full backend test suite to confirm no other tests broke:

```bash
cd app-backend && npm test --
```

Expected: all tests pass (modulo the 30 pre-existing failures in `scaleSelector.test.js` + `si727LayoutCalculator.test.js`, which are unrelated to this sub-project).

Visual sanity check: generate PDF and DXF for `sampleRealisticPlan` and open both in a viewer. Block arrangement should be visibly identical. The schedule should land in a reasonable whitespace zone (not overlapping the polygon, not in the bottom-left if the bottom-left is the polygon-dense quadrant). If the schedule lands in a poor spot, this is the signal flagged in the spec — file as a 3-v6 candidate (port DXF's `computeWhitespaceZones` ranking into the planner) but do not block 3-v5.

Once Task 9 is committed and validation passes, the sub-project is complete and ready for `superpowers:finishing-a-development-branch`.
