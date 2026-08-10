# Township General-Plan Scale Mandate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `planType`-keyed 1:500 scale mandate (currently: `general-developed` always forced to 1:500, `general-undeveloped` never capped) with an area-majority-keyed mandate (mandatory 1:500 only when the majority of a township's stands are ≤200m², applied identically to both plan types), per the Surveyor-General's relaxation of SI 727 Reg 32(3).

**Architecture:** One shared pure function, `resolveTownshipScaleMandate(parcels, thresholdM2)`, added to `app-shared/block-definitions.js` (already imported by both the PDF and DXF generators, guaranteeing they can never resolve the mandate differently for the same parcels). Each of the three places that currently hardcode the `planType === 'general-developed'` check — `pdfkitGeoPDF.js`, `dxfGenerator.js`, and the map-preview route `surveyPlanPreview.js` — is updated to compute the mandate from its own already-available parcel data and use that boolean instead. No changes to the escalation/retry machinery that picks a scale and paper size once the mandate boolean is known — removing the incorrect unconditional ceiling for large-stand `general-developed` plans lets that existing machinery pick a coarser scale on its own.

**Tech Stack:** Node.js (ESM), Jest (`--experimental-vm-modules`), Fastify routes, PostGIS (`ST_Area`).

## Global Constraints

- Backend is ESM (`"type": "module"`) — tests run via `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js <pattern>` (bare `npx jest` fails).
- The mandate applies only to `planType === 'general-developed'` or `'general-undeveloped'` — never to `'diagram'` or `'working-plan'`.
- A tie (equal counts on both sides of the 200m² threshold) resolves to the mandate (`mandatory500 = true`).
- Parcels flagged as Outside Figure (`properties.isOutsideFigure === true`, `properties.metadata?.isOutsideFigure === true`, or a `stand`/`designation` string containing "outside figure", case-insensitive) are excluded from the majority count.
- Manual scale overrides (`declaredS` in DXF, a `requestedScale`/`scale` value that resolves to a specific prescribed denominator in PDF) keep precedence over the mandate — unchanged from today.
- Do not modify `planType`'s other effects (title text, edge-label suppression for developed plans, tiling messaging) — only the scale-ceiling decision changes.

---

### Task 1: Shared area-majority scale-mandate helper

**Files:**
- Modify: `app-backend/src/utils/si727Constants.js` (add constant near `MIN_FIGURE_SIZE_MM2`, line 146)
- Modify: `app-shared/block-definitions.js` (add helper after `formatAreaValue`, which ends at line 421)
- Test: `app-backend/src/services/__tests__/block-definitions-scaleMandate.test.js` (new)

**Interfaces:**
- Produces: `TOWNSHIP_SCALE_MANDATE_THRESHOLD_M2` (number, value `200`) exported from `app-backend/src/utils/si727Constants.js`.
- Produces: `resolveTownshipScaleMandate(parcels, thresholdM2 = 200)` exported from `app-shared/block-definitions.js`. `parcels` is a GeoJSON `FeatureCollection`-shaped object (`{ features: [...] }`) or `undefined`/`null`. Returns `{ mandatory500: boolean }`.

- [ ] **Step 1: Write the failing tests**

Create `app-backend/src/services/__tests__/block-definitions-scaleMandate.test.js`:

```js
import { describe, test, expect } from '@jest/globals'
import { resolveTownshipScaleMandate } from '../../../../app-shared/block-definitions.js'

function stand(areaM2, overrides = {}) {
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] },
    properties: { stand: '1', area_m2: areaM2, ...overrides },
  }
}

describe('resolveTownshipScaleMandate', () => {
  test('majority of stands <=200m2 -> mandatory500 true', () => {
    const parcels = { features: [stand(150), stand(180), stand(500)] }
    expect(resolveTownshipScaleMandate(parcels).mandatory500).toBe(true)
  })

  test('majority of stands >200m2 -> mandatory500 false', () => {
    const parcels = { features: [stand(500), stand(600), stand(150)] }
    expect(resolveTownshipScaleMandate(parcels).mandatory500).toBe(false)
  })

  test('exact tie resolves to mandatory500 true', () => {
    const parcels = { features: [stand(150), stand(500)] }
    expect(resolveTownshipScaleMandate(parcels).mandatory500).toBe(true)
  })

  test('a stand exactly at the threshold counts as <=200m2', () => {
    const parcels = { features: [stand(200), stand(500)] }
    // one at-or-below (200), one above (500) -> tie -> mandatory
    expect(resolveTownshipScaleMandate(parcels).mandatory500).toBe(true)
  })

  test('Outside Figure parcels are excluded from the count', () => {
    const parcels = {
      features: [
        stand(999999, { isOutsideFigure: true }),
        stand(500),
        stand(600),
        stand(700),
      ],
    }
    // Without exclusion the huge Outside Figure area wouldn't change the
    // count either way here, but its presence must not throw or be counted
    // as a 4th "large" stand skewing an otherwise-3-stand majority.
    expect(resolveTownshipScaleMandate(parcels).mandatory500).toBe(false)
  })

  test('Outside Figure detected via metadata.isOutsideFigure', () => {
    const parcels = {
      features: [
        stand(50, { metadata: { isOutsideFigure: true } }),
        stand(500),
      ],
    }
    // Only the 500m2 stand counts -> no majority <=200 -> false
    expect(resolveTownshipScaleMandate(parcels).mandatory500).toBe(false)
  })

  test('Outside Figure detected via stand name text', () => {
    const parcels = {
      features: [
        stand(50, { stand: 'Outside Figure' }),
        stand(500),
      ],
    }
    expect(resolveTownshipScaleMandate(parcels).mandatory500).toBe(false)
  })

  test('missing area_m2 falls back to shoelace area from geometry', () => {
    // A 10m x 10m square (100m2, <=200) with no area_m2 property at all.
    const noAreaStand = {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] },
      properties: { stand: '1' },
    }
    const largeStand = stand(500)
    const parcels = { features: [noAreaStand, largeStand] }
    // tie (100<=200, 500>200) -> mandatory true
    expect(resolveTownshipScaleMandate(parcels).mandatory500).toBe(true)
  })

  test('zero-area_m2 also falls back to shoelace (not treated as a valid 0)', () => {
    const zeroAreaStand = stand(0)
    // Same 10x10 geometry as `stand()` -> shoelace area is 100m2 (<=200)
    const parcels = { features: [zeroAreaStand] }
    expect(resolveTownshipScaleMandate(parcels).mandatory500).toBe(true)
  })

  test('no stands at all resolves to mandatory500 true (conservative default)', () => {
    expect(resolveTownshipScaleMandate({ features: [] }).mandatory500).toBe(true)
    expect(resolveTownshipScaleMandate(undefined).mandatory500).toBe(true)
  })

  test('custom thresholdM2 is respected', () => {
    const parcels = { features: [stand(300), stand(400)] }
    expect(resolveTownshipScaleMandate(parcels, 200).mandatory500).toBe(false)
    expect(resolveTownshipScaleMandate(parcels, 500).mandatory500).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js block-definitions-scaleMandate`
Expected: FAIL — `resolveTownshipScaleMandate is not a function` (it doesn't exist yet).

- [ ] **Step 3: Add the constant**

In `app-backend/src/utils/si727Constants.js`, immediately after the `MIN_FIGURE_SIZE_MM2` declaration (line 146):

```js
// Regulation 32(2) - Minimum figure size
export const MIN_FIGURE_SIZE_MM2 = 650

// Surveyor-General relaxation (2026): the mandatory 1:500 General Plan scale
// applies only when the majority of a township's stands are at or below this
// area. Townships (developed or undeveloped) where the majority of stands
// exceed this threshold may use any SI 727 prescribed scale.
export const TOWNSHIP_SCALE_MANDATE_THRESHOLD_M2 = 200
```

- [ ] **Step 4: Add the shared helper**

In `app-shared/block-definitions.js`, immediately after `formatAreaValue`'s closing brace (line 421), before the "Edge side-length" comment block:

```js
/**
 * Determine whether a township General Plan must use exactly 1:500, per the
 * Surveyor-General's area-majority rule: mandatory only when the majority of
 * stands (excluding Outside Figure) have area <= thresholdM2. Ties resolve to
 * the mandate. Shared by pdfkitGeoPDF.js, dxfGenerator.js, and
 * surveyPlanPreview.js so all three can never resolve this rule differently
 * for the same parcels.
 */
export function resolveTownshipScaleMandate(parcels, thresholdM2 = 200) {
  const features = parcels?.features || []
  let atOrBelow = 0
  let above = 0
  for (const f of features) {
    const props = f?.properties || {}
    const isOutsideFigure =
      props.isOutsideFigure === true ||
      props.metadata?.isOutsideFigure === true ||
      String(props.stand || '').toLowerCase().includes('outside figure') ||
      String(props.designation || '').toLowerCase().includes('outside figure')
    if (isOutsideFigure) continue

    let area = Number(props.area_m2)
    if (!Number.isFinite(area) || area <= 0) {
      area = shoelaceAreaM2(f?.geometry?.coordinates?.[0])
    }
    if (area <= thresholdM2) atOrBelow++
    else above++
  }
  return { mandatory500: atOrBelow >= above }
}

function shoelaceAreaM2(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return 0
  let coords = ring
  // Unwrap double-nested [[ring]] the same way geopdf-vector.js does.
  if (Array.isArray(coords[0]) && Array.isArray(coords[0][0])) coords = coords[0]
  let a = 0
  for (let i = 0; i < coords.length; i++) {
    const [x1, y1] = coords[i]
    const [x2, y2] = coords[(i + 1) % coords.length]
    a += x1 * y2 - x2 * y1
  }
  return Math.abs(a / 2)
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js block-definitions-scaleMandate`
Expected: PASS (all 12 tests).

- [ ] **Step 6: Commit**

```bash
git add app-backend/src/utils/si727Constants.js app-shared/block-definitions.js app-backend/src/services/__tests__/block-definitions-scaleMandate.test.js
git commit -m "feat(scale): add area-majority township scale mandate helper"
```

---

### Task 2: Wire the mandate into the PDF generator

**Files:**
- Modify: `app-backend/src/services/pdfkitGeoPDF.js`
- Create: `app-backend/src/services/__tests__/fixtures/sampleDevelopedLargeStandsPlan.js`
- Create: `app-backend/src/services/__tests__/fixtures/sampleUndevelopedSmallStandsPlan.js`
- Test: `app-backend/src/services/__tests__/pdfkitGeoPDF.townshipScaleMandate.test.js` (new)

**Interfaces:**
- Consumes: `resolveTownshipScaleMandate(parcels, thresholdM2)` and `TOWNSHIP_SCALE_MANDATE_THRESHOLD_M2` from Task 1.
- Produces: `sampleDevelopedLargeStandsPlan` and `sampleUndevelopedSmallStandsPlan` fixture objects (same shape as the existing `sampleMaglasPlan` fixture: `{ metadata, parcels, beacons, outsideFigureData, sheetSize, planType }`), reused by Task 3's DXF tests.
- No change to `generateGeoPDF`'s public signature or return shape (`{ pdfBuffer, suggestedScale, scale, sheetSize, orientation, tileGrid, warnings }`).

> **Line-number note:** Steps 6-9 edit `pdfkitGeoPDF.js` in sequence, and Step 5 changes the file's total line count. Line numbers cited from Step 6 onward are where that code currently lives (verified before writing this plan) but will already have drifted by the time you reach them, because the earlier steps in this same task already shifted everything below their edit point. Treat the exact code snippet shown in each step as the authoritative anchor — locate it by matching that snippet's content, not by trusting the cited number once a prior step in this task has run.

- [ ] **Step 1: Create the "large stands" fixture**

Create `app-backend/src/services/__tests__/fixtures/sampleDevelopedLargeStandsPlan.js`:

```js
// Regression fixture: a dense, spatially-large 'general-developed' township
// (modelled on the real Shabani Mine surface-rights overlap case) where every
// stand is well above the Surveyor-General's 200m² relaxation threshold.
// Forcing this extent to 1:500 requires multi-sheet tiling; the natural
// auto-fit scale comfortably fits a single sheet. Used to verify the
// area-majority mandate lifts the old unconditional 1:500 ceiling for
// 'general-developed' plans once the majority of stands are large.

const STAND_COUNT = 30;
const standsPerRow = 6;
const standsPerCol = 5;
const standWidth = 300;   // metres -- 75,000 m^2 per stand, well above 200 m^2
const standHeight = 250;  // metres
const yBase = 50000;
const xBase = 2200000;

const stands = Array.from({ length: STAND_COUNT }, (_, i) => {
  const row = Math.floor(i / standsPerRow);
  const col = i % standsPerRow;
  const y0 = yBase + col * standWidth;
  const x0 = xBase + row * standHeight;
  const standNumber = 207 + i;
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [y0, x0],
        [y0 + standWidth, x0],
        [y0 + standWidth, x0 + standHeight],
        [y0, x0 + standHeight],
        [y0, x0],
      ]],
    },
    properties: {
      stand: String(standNumber),
      area_m2: standWidth * standHeight,
      diagramNumber: `SG-${6000 + i}`,
      diagram:       `SG-${6000 + i}`,
      deedNumber:    `D-${20000 + i}/2024`,
      deedDate:      '2024-06-15',
      surveyorGeneral: 'A. Mukandi',
      surveyor:        'A. Mukandi',
    },
  };
});

const ofW = standsPerRow * standWidth;
const ofH = standsPerCol * standHeight;
const ofYmin = yBase, ofYmax = yBase + ofW;
const ofXmin = xBase, ofXmax = xBase + ofH;

export const sampleDevelopedLargeStandsPlan = {
  metadata: {
    designation: 'Stands 207 - 236 Shabani Mine Surface',
    township: 'Shabani Mine Surface Township',
    district: 'Zvishavane',
    standCount: STAND_COUNT,
    standRange: '207 - 236',
    wholePortion: 'A portion',
    ofTarget: 'Subdivision A of Shabani Mine Surface Rights A',
    beaconSequence: 'ABCDEFA',
    date: '2026-06-16',
    surveyor: 'A. Mukandi',
    surveyorLicense: 'LS-100',
    centralMeridian: 29,
  },
  parcels: { type: 'FeatureCollection', features: stands },
  beacons: {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [ofYmin, ofXmin] }, properties: { name: 'A', type: 'iron-peg' } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [ofYmax, ofXmin] }, properties: { name: 'B', type: 'iron-peg' } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [ofYmax, ofXmax] }, properties: { name: 'C', type: 'iron-peg' } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [ofYmin, ofXmax] }, properties: { name: 'D', type: 'iron-peg' } },
    ],
  },
  outsideFigureData: {
    edges: [
      { side: 'AB', metres: ofW.toFixed(3), direction:  '90°00\'00"', constants: '', y: ofYmax, x: ofXmin },
      { side: 'BC', metres: ofH.toFixed(3), direction:   '0°00\'00"', constants: '', y: ofYmax, x: ofXmax },
      { side: 'CD', metres: ofW.toFixed(3), direction: '270°00\'00"', constants: '', y: ofYmin, x: ofXmax },
      { side: 'DA', metres: ofH.toFixed(3), direction: '180°00\'00"', constants: '', y: ofYmin, x: ofXmin },
    ],
    coordinates: [
      { name: 'A', y: ofYmin, x: ofXmin },
      { name: 'B', y: ofYmax, x: ofXmin },
      { name: 'C', y: ofYmax, x: ofXmax },
      { name: 'D', y: ofYmin, x: ofXmax },
    ],
  },
  sheetSize: 'ISO_A2',
  planType: 'general-developed',
};
```

- [ ] **Step 2: Create the "small stands" fixture**

Create `app-backend/src/services/__tests__/fixtures/sampleUndevelopedSmallStandsPlan.js`:

```js
// Regression fixture: a 'general-undeveloped' township where every stand is
// well below the Surveyor-General's 200m² relaxation threshold. Used to
// verify the area-majority mandate now forces exactly 1:500 for undeveloped
// plans too when stands are mostly small -- a new restriction: previously
// 'general-undeveloped' was never capped regardless of stand size.

const STAND_COUNT = 10;
const standsPerRow = 5;
const standWidth = 10;   // metres -- 150 m^2 per stand, below 200 m^2
const standHeight = 15;  // metres
const yBase = 50000;
const xBase = 2200000;

const stands = Array.from({ length: STAND_COUNT }, (_, i) => {
  const row = Math.floor(i / standsPerRow);
  const col = i % standsPerRow;
  const y0 = yBase + col * standWidth;
  const x0 = xBase + row * standHeight;
  const standNumber = 1 + i;
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [y0, x0],
        [y0 + standWidth, x0],
        [y0 + standWidth, x0 + standHeight],
        [y0, x0 + standHeight],
        [y0, x0],
      ]],
    },
    properties: {
      stand: String(standNumber),
      area_m2: standWidth * standHeight,
      diagramNumber: `SG-${7000 + i}`,
      diagram:       `SG-${7000 + i}`,
      deedNumber:    `D-${30000 + i}/2024`,
      deedDate:      '2024-06-15',
      surveyorGeneral: 'A. Mukandi',
      surveyor:        'A. Mukandi',
    },
  };
});

const ofW = standsPerRow * standWidth;
const ofH = 2 * standHeight;
const ofYmin = yBase, ofYmax = yBase + ofW;
const ofXmin = xBase, ofXmax = xBase + ofH;

export const sampleUndevelopedSmallStandsPlan = {
  metadata: {
    designation: 'Stands 1 - 10 Small Holdings',
    township: 'Small Holdings Township',
    district: 'Bulawayo',
    standCount: STAND_COUNT,
    standRange: '1 - 10',
    wholePortion: 'A portion',
    ofTarget: 'Subdivision B of Small Holdings',
    beaconSequence: 'ABCDEFA',
    date: '2026-06-16',
    surveyor: 'A. Mukandi',
    surveyorLicense: 'LS-100',
    centralMeridian: 29,
  },
  parcels: { type: 'FeatureCollection', features: stands },
  beacons: {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [ofYmin, ofXmin] }, properties: { name: 'A', type: 'iron-peg' } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [ofYmax, ofXmin] }, properties: { name: 'B', type: 'iron-peg' } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [ofYmax, ofXmax] }, properties: { name: 'C', type: 'iron-peg' } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [ofYmin, ofXmax] }, properties: { name: 'D', type: 'iron-peg' } },
    ],
  },
  outsideFigureData: {
    edges: [
      { side: 'AB', metres: ofW.toFixed(3), direction:  '90°00\'00"', constants: '', y: ofYmax, x: ofXmin },
      { side: 'BC', metres: ofH.toFixed(3), direction:   '0°00\'00"', constants: '', y: ofYmax, x: ofXmax },
      { side: 'CD', metres: ofW.toFixed(3), direction: '270°00\'00"', constants: '', y: ofYmin, x: ofXmax },
      { side: 'DA', metres: ofH.toFixed(3), direction: '180°00\'00"', constants: '', y: ofYmin, x: ofXmin },
    ],
    coordinates: [
      { name: 'A', y: ofYmin, x: ofXmin },
      { name: 'B', y: ofYmax, x: ofXmin },
      { name: 'C', y: ofYmax, x: ofXmax },
      { name: 'D', y: ofYmin, x: ofXmax },
    ],
  },
  sheetSize: 'ISO_A2',
  planType: 'general-undeveloped',
};
```

- [ ] **Step 3: Write the failing tests**

Create `app-backend/src/services/__tests__/pdfkitGeoPDF.townshipScaleMandate.test.js`:

```js
import { describe, test, expect } from '@jest/globals'
import { generateGeoPDF } from '../pdfkitGeoPDF.js'
import { sampleDevelopedLargeStandsPlan } from './fixtures/sampleDevelopedLargeStandsPlan.js'
import { sampleUndevelopedSmallStandsPlan } from './fixtures/sampleUndevelopedSmallStandsPlan.js'

describe('PDF township scale mandate (area-majority based)', () => {
  const logger = { info: () => {}, warn: () => {}, error: () => {} }

  test(
    'general-developed plan with majority >200m2 stands is no longer forced to 1:500 and needs no tiling',
    async () => {
      const result = await generateGeoPDF(sampleDevelopedLargeStandsPlan, logger)
      expect(result.scale).not.toBe('1:500')
      expect(result.tileGrid).toBeFalsy()
      expect(result.warnings.scheduleOfAreasOverlapsPolygon).toBeFalsy()
    },
    30000
  )

  test('general-undeveloped plan with majority <=200m2 stands is now forced to exactly 1:500', async () => {
    const result = await generateGeoPDF(sampleUndevelopedSmallStandsPlan, logger)
    expect(result.scale).toBe('1:500')
  })
})
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js pdfkitGeoPDF.townshipScaleMandate`
Expected: FAIL on both tests — the first because `result.tileGrid` is truthy (forcing 1:500 on a 1800m x 1250m extent requires multi-sheet tiling), the second because `result.scale` auto-maximizes to a scale finer than 1:500 for the tiny 50m x 30m extent (`general-undeveloped` is currently never capped).

- [ ] **Step 5: Remove the old planType-keyed ceiling and add the import**

In `app-backend/src/services/pdfkitGeoPDF.js`, update the import block (lines 13-14):

```js
import BLOCKS from "../../../app-shared/block-definitions.js";
import { computeScheduleColumnWidths, layoutScheduleColumnsFixedStandArea, SCHEDULE_TARGET_WIDTH_PT, edgeDistanceMetres, classifyBeaconGroups, resolveLoSystem, snapScaleBarSegment, chooseTickIntervalMetres, computeGridTickPositions, resolveTownshipScaleMandate } from "../../../app-shared/block-definitions.js";
```

And the `si727Constants.js` import (lines 6-12):

```js
import {
  SI727_PRESCRIBED_SCALES,
  SI727_SHEET_SIZES,
  SI727_MARGINS,
  GENERAL_PLAN_RECORD_STATEMENT,
  GENERAL_PLAN_MARGIN_FOOTER,
  TOWNSHIP_SCALE_MANDATE_THRESHOLD_M2,
} from "../utils/si727Constants.js";
```

Replace the comment block and constant at lines 10343-10361:

```js
/**
 * Calculate optimal scale based on extent and available map area
 * SI 727 Section 32(2): Prescribed scales
 * Honours requestedScale from intelligentPreview when provided.
 * Applies a 90% margin constraint: the outside figure must fit within 90% of
 * the drawing area so that no part or label extrudes into the margin zones.
 * If the initial scale violates this constraint, the next larger scale
 * denominator is tried until the constraint is satisfied.
 *
 * SI 727 Reg 32(3): a township general plan (developed or undeveloped) is
 * mandated at exactly 1:500 only when the majority of its stands are <=200m2
 * (Surveyor-General relaxation, see resolveTownshipScaleMandate in
 * app-shared/block-definitions.js). When the majority of stands exceed
 * 200m2, any SI 727 prescribed scale may be used -- the mandate no longer
 * depends on planType alone.
 */
```

(This deletes the old `SI727_MAX_DENOMINATOR_BY_PLAN` constant entirely — it's replaced by the `mandatory500` boolean threaded through from the caller.)

- [ ] **Step 6: Update `calculateOptimalScale`'s signature and mandate check**

Replace the function signature (line 10363):

```js
function calculateOptimalScale(extent, mapBounds, logger, requestedScale, forceMinDenominator = 0, planType = null, mandatory500 = false) {
```

Replace the `_exactMandateDenom` line and its comment (lines 10418-10425):

```js
    // SI 727 Reg 32(3): a township general plan is mandated at exactly 1:500
    // when mandatory500 is true (majority of stands <=200m2) -> never enlarge
    // it finer than 1:500 (the applyPlanTypeCeiling() cap below prevents
    // coarser, so it lands exactly on 1:500; if the figure is too big to fit
    // at 1:500 the cap flags needsTiling). When mandatory500 is false, the
    // plan may use any prescribed scale, so it is NOT floored here.
    const _exactMandateDenom = mandatory500 ? 500 : 0;
```

- [ ] **Step 7: Update the two `applyPlanTypeCeiling` call sites inside `calculateOptimalScale`**

Replace line 10482:

```js
      return applyPlanTypeCeiling(candidate, extent, mapBounds, planType, mandatory500, logger);
```

Replace line 10491:

```js
  return applyPlanTypeCeiling(largest, extent, mapBounds, planType, mandatory500, logger);
```

- [ ] **Step 8: Update `applyPlanTypeCeiling` itself**

Replace lines 10500-10501:

```js
function applyPlanTypeCeiling(scale, extent, mapBounds, planType, mandatory500, logger) {
  const maxDenom = mandatory500 ? 500 : Infinity;
```

(`planType` stays as a parameter — it's still used a few lines below in the log message `SI 727 Reg 32(3) ceiling for '${planType}'` — only the `maxDenom` computation changes.)

- [ ] **Step 9: Compute `mandatory500` at the `calculateOptimalScale` call site**

Replace lines 11180-11190:

```js
  // Calculate optimal scale based on extent and adjusted figure area.
  // _forceMinDenominator forces the scale above a given denominator (used when
  // a previous render reported needsScaleUp and the caller retries with a higher scale).
  // The 1:500 mandate now depends on stand-area majority, not planType alone
  // (Surveyor-General relaxation) -- computed once here from the same
  // `parcels` already in scope for this generation request.
  const _applyScaleMandate = planType === 'general-developed' || planType === 'general-undeveloped';
  const { mandatory500 } = resolveTownshipScaleMandate(parcels, TOWNSHIP_SCALE_MANDATE_THRESHOLD_M2);
  const optimalScale = calculateOptimalScale(
    calculatedExtent,
    figureBounds,
    logger,
    scale,
    _forceMinDenominator,
    planType,
    _applyScaleMandate && mandatory500
  );
```

- [ ] **Step 10: Run the tests to verify they pass**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js pdfkitGeoPDF.townshipScaleMandate`
Expected: PASS (both tests).

- [ ] **Step 11: Run the full PDF-related test suites to check for regressions**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js pdfkitGeoPDF`
Expected: PASS. If `pdfkitGeoPDF.snapshot.test.js` fails, inspect the diff by hand (per the standing project note that this snapshot silently looks like unrelated noise) — a scale-label or figure-position change in the snapshot fixtures is expected only if one of those fixtures happens to be `general-developed`/`general-undeveloped` with a stand-area mix that changes which side of the mandate it falls on. If the diff is exactly that, regenerate the snapshot (`-u` flag); if the diff touches unrelated fixtures or text positions, stop and investigate before regenerating.

- [ ] **Step 12: Commit**

```bash
git add app-backend/src/services/pdfkitGeoPDF.js app-backend/src/services/__tests__/fixtures/sampleDevelopedLargeStandsPlan.js app-backend/src/services/__tests__/fixtures/sampleUndevelopedSmallStandsPlan.js app-backend/src/services/__tests__/pdfkitGeoPDF.townshipScaleMandate.test.js
git commit -m "feat(pdf): base the 1:500 township scale mandate on stand-area majority, not planType"
```

(If the snapshot was regenerated in Step 11, `git add` it too and note that in the commit body.)

---

### Task 3: Wire the mandate into the DXF generator

**Files:**
- Modify: `app-backend/src/services/dxfGenerator.js`
- Test: `app-backend/src/services/__tests__/dxfGenerator.townshipScaleMandate.test.js` (new)

**Interfaces:**
- Consumes: `resolveTownshipScaleMandate` from Task 1; `sampleDevelopedLargeStandsPlan` and `sampleUndevelopedSmallStandsPlan` fixtures from Task 2.
- No change to `generateDXF`'s public signature or return shape (`{ buffer, warnings }`).

> **Line-number note:** Step 3 adds a line to the import block, which shifts Step 4's cited line numbers (606-621) down by one by the time you reach it. As in Task 2, match Step 4's code snippet by content, not by trusting the cited line number after Step 3 has already run.

- [ ] **Step 1: Write the failing tests**

Create `app-backend/src/services/__tests__/dxfGenerator.townshipScaleMandate.test.js`:

```js
import { describe, test, expect } from '@jest/globals'
import { generateDXF } from '../dxfGenerator.js'
import { sampleDevelopedLargeStandsPlan } from './fixtures/sampleDevelopedLargeStandsPlan.js'
import { sampleUndevelopedSmallStandsPlan } from './fixtures/sampleUndevelopedSmallStandsPlan.js'

describe('DXF township scale mandate (area-majority based)', () => {
  const logger = { info: () => {}, warn: () => {}, error: () => {} }

  test('general-developed plan with majority >200m2 stands is no longer forced to 1:500', () => {
    const { buffer } = generateDXF(sampleDevelopedLargeStandsPlan, logger)
    const text = buffer.toString('utf8')
    expect(text).not.toContain('SCALE 1:500')
  })

  test('general-undeveloped plan with majority <=200m2 stands is now forced to exactly 1:500', () => {
    const { buffer } = generateDXF(sampleUndevelopedSmallStandsPlan, logger)
    const text = buffer.toString('utf8')
    expect(text).toContain('SCALE 1:500')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js dxfGenerator.townshipScaleMandate`
Expected: FAIL on the first test — `generateDXF` currently forces `S = 500` unconditionally for `planType === 'general-developed'` regardless of stand area, so the buffer *does* contain `SCALE 1:500`. The second test currently passes by coincidence (an uncapped auto-fit on a tiny 50m x 30m extent will pick some fine scale, not necessarily 500) — confirm it fails for the right reason (text does not contain `SCALE 1:500`) before proceeding.

- [ ] **Step 3: Add the import**

In `app-backend/src/services/dxfGenerator.js`, update the `block-definitions.js` import (lines 23-38):

```js
import {
  TITLE_BLOCK,
  SCHEDULE_OF_AREAS,
  OUTSIDE_FIGURE_DATA,
  SURVEYOR_GENERAL_BOX,
  formatStandRanges,
  computeScheduleColumnWidths,
  layoutScheduleColumnsFixedStandArea,
  SCHEDULE_TARGET_WIDTH_PT,
  edgeDistanceMetres,
  classifyBeaconGroups,
  snapScaleBarSegment,
  resolveLoSystem,
  chooseTickIntervalMetres,
  computeGridTickPositions,
  resolveTownshipScaleMandate,
} from '../../../app-shared/block-definitions.js'
```

And the `si727Constants.js` import (line 77):

```js
import { selectFigureScale, GENERAL_PLAN_RECORD_STATEMENT, GENERAL_PLAN_MARGIN_FOOTER, TOWNSHIP_SCALE_MANDATE_THRESHOLD_M2 } from '../utils/si727Constants.js'
```

- [ ] **Step 4: Replace the scale-precedence branch**

Replace lines 606-621:

```js
  const _figFit = selectFigureScale({
    drawWidthM: drawW,
    drawHeightM: drawH,
    paperWmm: paper.w,
    paperHmm: paper.h,
  });
  // SI 727 Reg 32(3) scale precedence (fallback when no PDF scale is handed off):
  //   1. declaredS — a supplied scale (PDF handoff) honored verbatim → parity.
  //   2. Township general plan mandated at EXACTLY 1:500 when the majority of
  //      its stands are <=200m2 (Surveyor-General relaxation — mandatory500,
  //      resolveTownshipScaleMandate, app-shared/block-definitions.js). This
  //      no longer depends on planType alone: a 'general-undeveloped' plan
  //      with mostly small stands is now also mandated, and a
  //      'general-developed' plan with mostly large stands is no longer
  //      forced to 1:500 (tiles if the figure is too big to fit at 1:500).
  //   3. Otherwise — auto-maximize to the largest SI 727 scale that fits.
  const _applyScaleMandate = planType === 'general-developed' || planType === 'general-undeveloped';
  const { mandatory500 } = resolveTownshipScaleMandate(parcels, TOWNSHIP_SCALE_MANDATE_THRESHOLD_M2);
  let S;
  if (declaredS) {
    S = declaredS;
  } else if (_applyScaleMandate && mandatory500) {
    S = 500;
  } else {
    S = _figFit.S;
  }
  const { minScaleToFit, fitScale } = _figFit;
```

(`isDevelopedPlan` a few lines above, at line 538, is unrelated — it drives edge-label suppression for developed plans, not scale, and must not change.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js dxfGenerator.townshipScaleMandate`
Expected: PASS (both tests).

- [ ] **Step 6: Run the full DXF test suite to check for regressions**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js dxfGenerator`
Expected: PASS. Every existing `dxfGenerator.test.js` fixture passes an explicit `scale: '1:500'` (the `declaredS` path), which is unaffected by this change — a failure here would indicate the `declaredS` precedence was accidentally broken.

- [ ] **Step 7: Commit**

```bash
git add app-backend/src/services/dxfGenerator.js app-backend/src/services/__tests__/dxfGenerator.townshipScaleMandate.test.js
git commit -m "feat(dxf): base the 1:500 township scale mandate on stand-area majority, not planType"
```

---

### Task 4: Wire the mandate into the map-preview route

**Files:**
- Modify: `app-backend/src/routes/surveyPlanPreview.js`

**Interfaces:**
- Consumes: `resolveTownshipScaleMandate` and `TOWNSHIP_SCALE_MANDATE_THRESHOLD_M2` from Task 1.
- No change to the route's response shape — only how `maxDenominator` (an internal local variable) is computed.

This route has no existing test file and requires a live Postgres connection (`request.db`) with no mocking precedent elsewhere in this codebase, so this task is verified by a full-suite run (Task 5) plus careful manual review rather than a new test harness — the underlying rule is already fully unit-tested in Task 1, and this task only wires it in.

- [ ] **Step 1: Add the imports**

In `app-backend/src/routes/surveyPlanPreview.js`, update the `si727Constants.js` import (line 14):

```js
import { SI727_PRESCRIBED_SCALES, TOWNSHIP_SCALE_MANDATE_THRESHOLD_M2 } from '../utils/si727Constants.js'
```

Add a new import below it:

```js
import { resolveTownshipScaleMandate } from '../../../app-shared/block-definitions.js'
```

- [ ] **Step 2: Remove the early planType-only ceiling computation**

Replace lines 28-33:

```js
    const { projectId } = request.params
    const { scale, sheetSize, areaType, planType } = request.query
```

(This deletes the old `SI727_MAX_DENOM_BY_PLAN` map and the `maxDenominator` line that only considered `planType` — the replacement is computed further down once `parcels` is available, in Step 3.)

- [ ] **Step 3: Compute `maxDenominator` from the area majority once parcels are loaded**

Find the block ending the parcels construction (currently lines 89-123, ending with the `if (parcels.length === 0) { return reply.code(422)... }` guard) and insert immediately after its closing brace:

```js
      // Surveyor-General relaxation: the SI 727 Reg 32(3) mandatory 1:500
      // ceiling applies only when the majority of stands are <=200m2
      // (resolveTownshipScaleMandate, app-shared/block-definitions.js) --
      // shared with the PDF/DXF generators so this preview's suggested scale
      // and "too narrow" warning suppression match what will actually be
      // produced. `parcels` here already carries real PostGIS ST_Area values.
      const applyScaleMandate = planType === 'general-developed' || planType === 'general-undeveloped'
      const { mandatory500 } = resolveTownshipScaleMandate(
        { features: parcels.map(p => ({ properties: { area_m2: p.area_m2, stand: p.stand }, geometry: p.geometry })) },
        TOWNSHIP_SCALE_MANDATE_THRESHOLD_M2
      )
      const maxDenominator = (applyScaleMandate && mandatory500) ? 500 : Infinity
```

- [ ] **Step 4: Verify the file parses and the route still loads**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js --listTests 2>&1 | head -5`
Expected: no import/syntax errors reported. Also run: `node -e "import('./app-backend/src/routes/surveyPlanPreview.js').then(() => console.log('OK')).catch(e => { console.error(e); process.exit(1) })"` from the repo root.
Expected: prints `OK`.

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/routes/surveyPlanPreview.js
git commit -m "feat(preview): base the map-preview 1:500 scale ceiling on stand-area majority"
```

---

### Task 5: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full backend test suite**

Run: `cd app-backend && npm test`
Expected: PASS. Pay particular attention to `pdfkitGeoPDF.snapshot.test.js`, `sheetLayoutPlanner.parity.test.js`, `pdfkitGeoPDF.scheduleNoOverlap.test.js`, `dxfGenerator.test.js`, `dxfGenerator.integration.test.js`, and `dxfGenerator.titleBlock.test.js` — these are the suites most likely to touch `planType`/scale behavior.

- [ ] **Step 2: If any snapshot or fixed-expectation test fails, diagnose before updating it**

For each failure, confirm by hand that the new output reflects the intended rule change (a fixture using `general-developed`/`general-undeveloped` whose stand areas place it on the other side of the 200m² threshold) rather than an unrelated regression. Only then regenerate the snapshot (`-u`) or update the hardcoded expectation, and note which fixture and why in the commit message.

- [ ] **Step 3: Manually regenerate the reported Shabani Mine plan and inspect it**

If the original project data is available locally (`Surveyors/.../MAG1_SH1_Shabani_2026-06-16/`), regenerate its `general-developed` PDF through the normal app flow and visually confirm the Schedule of Areas no longer overlaps the figure, and note the resulting scale/sheet size in the verification notes.

- [ ] **Step 4: Commit any follow-up fixes from Steps 2-3**

```bash
git add -A
git commit -m "test: update fixtures/snapshots for area-majority township scale mandate"
```

(Skip this step entirely if Step 1 passed clean with no changes needed.)
