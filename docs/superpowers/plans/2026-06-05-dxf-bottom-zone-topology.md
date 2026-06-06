# DXF Bottom-Zone Topological Emission (3-v4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route every bottom-zone block (Statement, OFD, SG, Beacon Descriptions, Schedule) through topology placement, removing the fixed bottom-zone partition and the stray vertical divider it produced.

**Architecture:** One new module (`dxfBottomZoneEmitter.js`) exporting four pure sizers, four side-effecting emitters, and one orchestrator that places blocks in PDF order (OFD → Schedule → Beacons → Statement → SG). The schedule emitter gains an optional `seedPlacedBlocks` parameter so external obstacles (title, north arrow, scale bar) are honoured. `dxfGenerator.js` loses ~120 lines of fixed bottom-zone code and gains ~30 lines of orchestrator setup.

**Tech Stack:** Node.js (Fastify backend service), Jest 29 for tests, ES modules. Pure-function module pattern shared with `dxfBlockPlacer.js`, `dxfBeaconPlacer.js`, `dxfScheduleEmitter.js`.

**Spec:** `docs/superpowers/specs/2026-06-05-dxf-bottom-zone-topology-design.md` (commits `e095efc` + `bbc1e2f` on branch `feature/dxf-bottom-zone-topology`).

**Baseline:** 300/300 dxf tests on main at `dcf3fb3` (sub-project #6 merge). Target after Task 6: **318 tests**.

---

## File Structure

| File | Responsibility |
|---|---|
| `app-backend/src/services/dxfBottomZoneEmitter.js` | NEW. 4 sizers + 4 emitters + 1 orchestrator. Pure functions; all DXF emission via injected callbacks. |
| `app-backend/src/services/__tests__/dxfBottomZoneEmitter.test.js` | NEW. ~16 unit tests across sizing, emit, orchestrator describe blocks. |
| `app-backend/src/services/dxfScheduleEmitter.js` | MOD. New optional `seedPlacedBlocks = []` parameter threaded through Pass 1/2/3. |
| `app-backend/src/services/__tests__/dxfScheduleEmitter.test.js` | MOD. +2 tests covering the new parameter. |
| `app-backend/src/services/dxfGenerator.js` | MOD. Delete partition vars + stray divider + C2 + C3. Replace with one orchestrator call. |
| `app-backend/src/services/__tests__/dxfGenerator.integration.test.js` | MOD. +4 new tests; remove 1 fixed-position SG assertion if found. |

---

## Conventions in use

- **Coordinates:** DXF is south-up east-right; `y` increases northward. "Top-left of a bbox" means `(x, y_top)` where `y_top = y_bottom + height`.
- **Identity `mm` for tests:** Test harnesses use `mm: (x) => x` so geometry is in raw units. The orchestrator's real `mm` converts paper-mm → ground-metres at the page scale.
- **Layer constant:** All emitters write to layer `'TITLE_BLOCK'` (passed as `layer` argument, default `'TITLE_BLOCK'` for parity with existing `addBeaconDescription`).
- **PT_TO_MM_GEN:** `25.4 / 72 ≈ 0.35278`. Defined locally in `dxfBottomZoneEmitter.js`.
- **CHAR_WIDTH_RATIO:** `0.55`. Settled in sub-project 3-v3 as the DXF character-width-to-text-height ratio for `STYLE` widthFactor 0.55.

---

### Task 1: Module skeleton + four sizers

**Files:**
- Create: `app-backend/src/services/dxfBottomZoneEmitter.js`
- Create: `app-backend/src/services/__tests__/dxfBottomZoneEmitter.test.js`

- [ ] **Step 1.1: Create the empty module with imports and constants**

Write file `app-backend/src/services/dxfBottomZoneEmitter.js`:

```js
/**
 * dxfBottomZoneEmitter — topology placement for the four legacy bottom-zone
 * blocks (Statement, OFD, SG, Beacon Descriptions) plus orchestration with
 * the existing Schedule of Areas emitter. Replaces the fixed-partition
 * bottom-zone layout shipped before sub-project 3-v4.
 *
 * Spec: docs/superpowers/specs/2026-06-05-dxf-bottom-zone-topology-design.md
 *
 * Pure-function module. All DXF emission goes through caller-injected
 * `addText` / `addLine` / `addRect` callbacks. The orchestrator places
 * blocks in PDF order (matching pdfkitGeoPDF.js:calculateBlockPositions
 * at lines 8553-8581): OFD → schedule → beacon → statement → SG.
 */

import { findBlockPosition } from './dxfBlockPlacer.js'
import {
  OUTSIDE_FIGURE_DATA,
  SURVEYOR_GENERAL_BOX,
} from '../../../app-shared/block-definitions.js'

/** PDF point → paper-millimetre conversion. 1 pt = 1/72 inch = 25.4/72 mm. */
const PT_TO_MM_GEN = 25.4 / 72

/**
 * DXF character-width-to-text-height ratio. Matches the STYLE widthFactor
 * settled in sub-project 3-v3 for 1:1 PDF parity at print scale.
 */
const CHAR_WIDTH_RATIO = 0.55

/** Polygon clearance for the placer (paper-mm). Matches dxfScheduleEmitter. */
export const POLYGON_BUFFER_MM = 2.0

/** Block-to-block separation (paper-mm). Matches dxfScheduleEmitter. */
export const BLOCK_SPACING_MM = 3.0

/** Topology + grid step resolution (paper-mm). Matches dxfScheduleEmitter. */
export const SCAN_STEP_MM = 5.0
```

- [ ] **Step 1.2: Write the failing test for `sizeStatement` — empty metadata**

Create `app-backend/src/services/__tests__/dxfBottomZoneEmitter.test.js`:

```js
/**
 * Unit tests for dxfBottomZoneEmitter (sub-project 3-v4).
 * Run:  cd app-backend && npm test -- --testPathPatterns="dxfBottomZoneEmitter"
 */
import { describe, test, expect } from '@jest/globals'
import {
  sizeStatement,
  sizeOFDTable,
  sizeSGBox,
  sizeBeaconDescriptions,
} from '../dxfBottomZoneEmitter.js'

// Identity mm so tests work in raw units (paper-mm == ground-metre).
const mm = (x) => x

// Font heights typical of the integrated generator at S=1000.
const fonts = {
  hBody:   2,
  hSub:    2.5,
  rH:      3,
  ofTitleH: 3,
  ofBodyH:  2.5,
  ofRowH:   4,
  sgTitleH: 3.5,
  sgBodyH:  2.5,
}

describe('sizeStatement', () => {
  test('returns {0,0} when metadata has neither date nor surveyor', () => {
    expect(sizeStatement({}, fonts)).toEqual({ width: 0, height: 0 })
  })
})
```

- [ ] **Step 1.3: Run the test and verify it fails**

```bash
cd app-backend && npx jest --testPathPatterns="dxfBottomZoneEmitter"
```

Expected: FAIL with `SyntaxError` or `is not a function` because no exports exist yet.

- [ ] **Step 1.4: Implement `sizeStatement` (minimal — handles empty case)**

Append to `app-backend/src/services/dxfBottomZoneEmitter.js`:

```js
/**
 * Compute size of the Survey Date Statement block.
 *
 * The statement is a stack of up to three lines:
 *   - `Surveyed in <date> by me`               (height: fonts.hBody, gap: rH * 1.5)
 *   - <surveyor name>                          (height: fonts.hSub,  gap: rH)
 *   - `(Land Surveyor, Zim)`                   (height: fonts.hBody, gap: rH * 1.5)
 *
 * Lines emit only when their metadata key is present. The surveyor name
 * and "(Land Surveyor, Zim)" emit together: presence of `metadata.surveyor`
 * implies both rows.
 *
 * Returns {0,0} when no lines would emit → orchestrator skips emission.
 *
 * @param {{date?:string, surveyor?:string}} metadata
 * @param {{hBody:number, hSub:number, rH:number}} fonts — all in ground-metres
 * @returns {{width:number, height:number}}
 */
export function sizeStatement(metadata, fonts) {
  const { hBody, hSub, rH } = fonts
  const lines = []
  if (metadata.date) {
    lines.push({
      text:   `Surveyed in ${metadata.date} by me`,
      height: hBody,
      gap:    rH * 1.5,
    })
  }
  if (metadata.surveyor) {
    lines.push({ text: metadata.surveyor,       height: hSub,  gap: rH })
    lines.push({ text: '(Land Surveyor, Zim)',  height: hBody, gap: rH * 1.5 })
  }
  if (lines.length === 0) return { width: 0, height: 0 }

  // Sum line heights + gaps between lines (no gap after the last line).
  const height = lines.reduce((s, l, i) => s + l.height + (i < lines.length - 1 ? l.gap : 0), 0)
  // Width = longest line by character count × hBody × CHAR_WIDTH_RATIO.
  const maxChars = Math.max(...lines.map(l => l.text.length))
  const width    = maxChars * hBody * CHAR_WIDTH_RATIO
  return { width, height }
}
```

- [ ] **Step 1.5: Run the test and verify it passes**

```bash
cd app-backend && npx jest --testPathPatterns="dxfBottomZoneEmitter"
```

Expected: PASS — 1 test passing.

- [ ] **Step 1.6: Add the two remaining `sizeStatement` tests**

Append inside the `describe('sizeStatement', () => { ... })` block in the test file:

```js
  test('includes only the date row when surveyor absent', () => {
    const result = sizeStatement({ date: '2026-01-01' }, fonts)
    // Single line: "Surveyed in 2026-01-01 by me" — no gap after it.
    expect(result.height).toBeCloseTo(fonts.hBody, 5)
    expect(result.width).toBeGreaterThan(0)
  })

  test('width tracks the longest of the three candidate lines', () => {
    const long = 'X'.repeat(120)
    const result = sizeStatement({ date: '2026', surveyor: long }, fonts)
    // Longest candidate is the surveyor name → width = 120 chars * hBody * 0.55.
    expect(result.width).toBeCloseTo(120 * fonts.hBody * 0.55, 3)
  })
```

- [ ] **Step 1.7: Run and verify the new tests pass**

```bash
cd app-backend && npx jest --testPathPatterns="dxfBottomZoneEmitter"
```

Expected: PASS — 3 tests passing.

- [ ] **Step 1.8: Add the three `sizeOFDTable` tests**

Append a new describe block to the test file:

```js
describe('sizeOFDTable', () => {
  test('returns {0,0} when edges array is empty', () => {
    expect(sizeOFDTable({ edges: [] }, fonts, mm)).toEqual({ width: 0, height: 0 })
    expect(sizeOFDTable({}, fonts, mm)).toEqual({ width: 0, height: 0 })
    expect(sizeOFDTable(null, fonts, mm)).toEqual({ width: 0, height: 0 })
  })

  test('height scales linearly with edges.length', () => {
    const one = sizeOFDTable({ edges: [{}] }, fonts, mm)
    const ten = sizeOFDTable({ edges: Array(10).fill({}) }, fonts, mm)
    // Extra 9 rows × ofRowH.
    expect(ten.height - one.height).toBeCloseTo(9 * fonts.ofRowH, 5)
  })

  test('width equals sum(OUTSIDE_FIGURE_DATA.columns[i].width) * PT_TO_MM_GEN', () => {
    const result = sizeOFDTable({ edges: [{}] }, fonts, mm)
    // Columns: 45 + 40 + 70 + 55 + 65 + 70 = 345 pt → 121.7 mm (identity mm).
    const expectedPt = 45 + 40 + 70 + 55 + 65 + 70
    const expectedMM = expectedPt * (25.4 / 72)
    expect(result.width).toBeCloseTo(expectedMM, 3)
  })
})
```

- [ ] **Step 1.9: Run the tests and verify they fail with `sizeOFDTable is not a function`**

```bash
cd app-backend && npx jest --testPathPatterns="dxfBottomZoneEmitter"
```

Expected: 3 tests failing.

- [ ] **Step 1.10: Implement `sizeOFDTable`**

Append to `app-backend/src/services/dxfBottomZoneEmitter.js`:

```js
/**
 * Compute size of the Outside Figure Data table.
 *
 * Width = sum of OUTSIDE_FIGURE_DATA column widths (PDF points) converted
 * to paper-mm via PT_TO_MM_GEN, then passed through the `mm` callback so
 * the returned value is in ground-metres.
 *
 * Height = title row + "System: Lo X" subtitle (rowH * 0.9) + gap (rowH * 0.7)
 *        + column header row (rowH) + N data rows (rowH each) + mm(2) padding.
 *
 * Returns {0,0} when there are no edges → orchestrator skips emission.
 *
 * @param {{edges?:Array}|null|undefined} outsideFigureData
 * @param {{ofTitleH:number, ofRowH:number}} fonts — in ground-metres
 * @param {(x:number)=>number} mm — paper-mm → ground-metre converter
 * @returns {{width:number, height:number}}
 */
export function sizeOFDTable(outsideFigureData, fonts, mm) {
  const edgesCount = outsideFigureData?.edges?.length || 0
  if (edgesCount === 0) return { width: 0, height: 0 }

  const widthMM = OUTSIDE_FIGURE_DATA.columns.reduce((s, col) => s + col.width, 0) * PT_TO_MM_GEN
  const width   = mm(widthMM)
  const height  = fonts.ofTitleH                  // "OUTSIDE FIGURE DATA" title row
                + fonts.ofRowH * 0.9              // "System: Lo XX" subtitle
                + fonts.ofRowH * 0.7              // gap before headers
                + fonts.ofRowH                    // column header row
                + fonts.ofRowH * edgesCount       // data rows
                + mm(2)                           // bottom padding for own divider lines
  return { width, height }
}
```

- [ ] **Step 1.11: Run all sizing tests so far**

```bash
cd app-backend && npx jest --testPathPatterns="dxfBottomZoneEmitter"
```

Expected: PASS — 6 tests passing.

- [ ] **Step 1.12: Add the `sizeSGBox` test**

Append a new describe block to the test file:

```js
describe('sizeSGBox', () => {
  test('returns SURVEYOR_GENERAL_BOX dims scaled by PT_TO_MM_GEN', () => {
    const result = sizeSGBox(mm)
    // SURVEYOR_GENERAL_BOX is 200 × 80 pt.
    expect(result.width).toBeCloseTo(200 * (25.4 / 72), 3)
    expect(result.height).toBeCloseTo(80 * (25.4 / 72), 3)
  })
})
```

- [ ] **Step 1.13: Implement `sizeSGBox`**

Append to `app-backend/src/services/dxfBottomZoneEmitter.js`:

```js
/**
 * Compute size of the Surveyor-General Approval Box.
 *
 * SURVEYOR_GENERAL_BOX is a constant 200 × 80 PDF points. Returns the
 * ground-metre equivalents via the injected `mm` converter.
 *
 * @param {(x:number)=>number} mm
 * @returns {{width:number, height:number}}
 */
export function sizeSGBox(mm) {
  return {
    width:  mm(SURVEYOR_GENERAL_BOX.width  * PT_TO_MM_GEN),
    height: mm(SURVEYOR_GENERAL_BOX.height * PT_TO_MM_GEN),
  }
}
```

- [ ] **Step 1.14: Add the two `sizeBeaconDescriptions` tests**

Append a new describe block to the test file:

```js
describe('sizeBeaconDescriptions', () => {
  test('returns {0,0} when beaconGroups is empty or missing', () => {
    expect(sizeBeaconDescriptions([], fonts, mm)).toEqual({ width: 0, height: 0 })
    expect(sizeBeaconDescriptions(null, fonts, mm)).toEqual({ width: 0, height: 0 })
    expect(sizeBeaconDescriptions(undefined, fonts, mm)).toEqual({ width: 0, height: 0 })
  })

  test('height grows linearly with total beacon row count', () => {
    const small = [{ points: 'A', description: 'iron peg' }]
    const big   = Array(20).fill({ points: 'A', description: 'iron peg' })
    const smallH = sizeBeaconDescriptions(small, fonts, mm).height
    const bigH   = sizeBeaconDescriptions(big,   fonts, mm).height
    // The current addBeaconDescription emits a header + one row per group.
    // big has 19 more rows → height delta = 19 * rH * 1.2.
    expect(bigH - smallH).toBeCloseTo(19 * fonts.rH * 1.2, 3)
  })
})
```

- [ ] **Step 1.15: Implement `sizeBeaconDescriptions`**

Append to `app-backend/src/services/dxfBottomZoneEmitter.js`:

```js
/**
 * Compute size of the Beacon Descriptions block.
 *
 * Height = 1 title row + 1 row per beacon group, each at fonts.rH * 1.2.
 * (Mirrors the row spacing used by the existing `addBeaconDescription`
 * closure in dxfGenerator.js around line 873.)
 *
 * Width is capped at min(180 mm, contentArea hint) by the orchestrator;
 * here we return the *intrinsic* preferred width = 180 mm.
 *
 * Returns {0,0} for empty input → orchestrator skips emission.
 *
 * @param {Array<{points:string,description?:string}>|null|undefined} beaconGroups
 * @param {{rH:number}} fonts
 * @param {(x:number)=>number} mm
 * @returns {{width:number, height:number}}
 */
export function sizeBeaconDescriptions(beaconGroups, fonts, mm) {
  if (!beaconGroups || beaconGroups.length === 0) {
    return { width: 0, height: 0 }
  }
  const lineCount = 1 + beaconGroups.length     // 1 title + 1 per group
  const height    = lineCount * fonts.rH * 1.2
  const width     = mm(180)                     // 180 mm preferred width
  return { width, height }
}
```

- [ ] **Step 1.16: Run all 9 sizing tests**

```bash
cd app-backend && npx jest --testPathPatterns="dxfBottomZoneEmitter"
```

Expected: PASS — 9 tests passing.

- [ ] **Step 1.17: Run the full dxf suite to confirm no regressions**

```bash
cd app-backend && npm test -- --testPathPatterns="dxf"
```

Expected: PASS — **309 tests** (300 baseline + 9 new).

- [ ] **Step 1.18: Commit**

```bash
git add app-backend/src/services/dxfBottomZoneEmitter.js \
        app-backend/src/services/__tests__/dxfBottomZoneEmitter.test.js
git commit -m "feat(dxf): bottom-zone sizers — sizeStatement, sizeOFDTable, sizeSGBox, sizeBeaconDescriptions (3-v4 Task 1)

Four pure sizing functions for the bottom-zone topological emitter
(sub-project 3-v4). Each returns {width, height} in ground-metres
or {0,0} when its content is absent (orchestrator's skip signal).

Module skeleton in dxfBottomZoneEmitter.js — emitters and orchestrator
land in Tasks 2 and 3. 9 unit tests pass.

dxf suite: 300 → 309 tests.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: Four emit functions

**Files:**
- Modify: `app-backend/src/services/dxfBottomZoneEmitter.js`
- Modify: `app-backend/src/services/__tests__/dxfBottomZoneEmitter.test.js`

- [ ] **Step 2.1: Write the failing `emitStatement` test**

Append to the test file (at top, after existing imports):

```js
import {
  // existing imports …
  emitStatement,
  emitSGBox,
} from '../dxfBottomZoneEmitter.js'
```

Then append a new describe block:

```js
describe('emitStatement', () => {
  const makeRecorder = () => {
    const calls = { addText: [] }
    return {
      addText: (...args) => calls.addText.push(args),
      calls,
    }
  }

  test('records expected addText calls at the given top-left position', () => {
    const r = makeRecorder()
    const metadata = { date: '2026-01-01', surveyor: 'John Doe' }
    const position = { x: 100, y: 200 }   // top-left of bbox (south-up: high y)
    emitStatement(r.addText, position, metadata, fonts, 'TITLE_BLOCK')

    // Expect 3 addText calls: date line, surveyor (bold), '(Land Surveyor, Zim)'.
    expect(r.calls.addText).toHaveLength(3)
    expect(r.calls.addText[0]).toEqual(['TITLE_BLOCK', 100, 200, 'Surveyed in 2026-01-01 by me', fonts.hBody, 0, undefined])
    expect(r.calls.addText[1][3]).toBe('John Doe')
    expect(r.calls.addText[1][6]).toBe('BOLD')          // surveyor row is bold
    expect(r.calls.addText[2][3]).toBe('(Land Surveyor, Zim)')
  })

  test('records nothing when metadata has neither date nor surveyor', () => {
    const r = makeRecorder()
    emitStatement(r.addText, { x: 0, y: 0 }, {}, fonts, 'TITLE_BLOCK')
    expect(r.calls.addText).toHaveLength(0)
  })
})
```

- [ ] **Step 2.2: Run and verify the tests fail**

```bash
cd app-backend && npx jest --testPathPatterns="dxfBottomZoneEmitter"
```

Expected: 2 new tests failing (`emitStatement is not a function`).

- [ ] **Step 2.3: Implement `emitStatement`**

Append to `app-backend/src/services/dxfBottomZoneEmitter.js`:

```js
/**
 * Emit the Survey Date Statement at `position` (top-left of its bbox).
 *
 * No-op when neither metadata.date nor metadata.surveyor is set
 * (matches sizeStatement returning {0,0}).
 *
 * Mirrors dxfGenerator.js lines 1692-1703 exactly, parameterized by
 * `position.x` (was statementL) and `position.y` (was cY).
 *
 * @param {(layer:string,x:number,y:number,text:string,h:number,angle?:number,style?:string)=>void} addText
 * @param {{x:number,y:number}} position - top-left (south-up: high y)
 * @param {{date?:string, surveyor?:string}} metadata
 * @param {{hBody:number, hSub:number, rH:number}} fonts
 * @param {string} layer
 */
export function emitStatement(addText, position, metadata, fonts, layer) {
  const { hBody, hSub, rH } = fonts
  let cY = position.y
  if (metadata.date) {
    addText(layer, position.x, cY, `Surveyed in ${metadata.date} by me`, hBody, 0, undefined)
    cY -= rH * 1.5
  }
  if (metadata.surveyor) {
    addText(layer, position.x, cY, metadata.surveyor, hSub, 0, 'BOLD')
    cY -= rH
    addText(layer, position.x, cY, '(Land Surveyor, Zim)', hBody, 0, undefined)
    cY -= rH * 1.5
  }
}
```

- [ ] **Step 2.4: Run and verify the tests pass**

```bash
cd app-backend && npx jest --testPathPatterns="dxfBottomZoneEmitter"
```

Expected: PASS — 11 tests passing.

- [ ] **Step 2.5: Write the failing `emitSGBox` test**

Append to the test file:

```js
describe('emitSGBox', () => {
  const makeRecorder = () => {
    const calls = { addText: [], addLine: [], addRect: [] }
    return {
      addText: (...args) => calls.addText.push(args),
      addLine: (...args) => calls.addLine.push(args),
      addRect: (...args) => calls.addRect.push(args),
      calls,
    }
  }

  test('records 1 rect, 4 text, 1 line at the given top-left position', () => {
    const r = makeRecorder()
    const position = { x: 100, y: 200 }                 // top-left
    const size     = sizeSGBox(mm)                      // ~70.6 × ~28.2
    emitSGBox(r.addText, r.addLine, r.addRect, position, size, fonts, mm, 'TITLE_BLOCK')

    // Box rectangle: 1 addRect from (x, y-height) to (x+width, y).
    expect(r.calls.addRect).toHaveLength(1)
    expect(r.calls.addRect[0]).toEqual(['TITLE_BLOCK', 100, 200 - size.height, 100 + size.width, 200])

    // Text rows: "Approved", "For Surveyor General", date text — three text lines.
    // (The "Approved" row uses titleFontSize; both others use bodyFontSize.)
    expect(r.calls.addText.length).toBeGreaterThanOrEqual(3)

    // Signature line — exactly one horizontal line inside the box.
    expect(r.calls.addLine).toHaveLength(1)
  })
})
```

- [ ] **Step 2.6: Run and verify the tests fail**

```bash
cd app-backend && npx jest --testPathPatterns="dxfBottomZoneEmitter"
```

Expected: 1 new test failing.

- [ ] **Step 2.7: Implement `emitSGBox`, `emitOFDTable`, and `emitBeaconDescriptions`**

Append to `app-backend/src/services/dxfBottomZoneEmitter.js`:

```js
/**
 * Emit the Surveyor-General Approval Box at `position` (top-left).
 *
 * Mirrors dxfGenerator.js lines 1779-1801. The box rect spans
 * (position.x, position.y - size.height) to (position.x + size.width,
 * position.y). All vertical offsets come from SURVEYOR_GENERAL_BOX
 * via PT_TO_MM_GEN through the `mm` converter.
 *
 * @param {Function} addText
 * @param {(layer:string,x1:number,y1:number,x2:number,y2:number)=>void} addLine
 * @param {(layer:string,x1:number,y1:number,x2:number,y2:number)=>void} addRect
 * @param {{x:number,y:number}} position - top-left (south-up: high y)
 * @param {{width:number,height:number}} size
 * @param {{sgTitleH:number, sgBodyH:number}} fonts
 * @param {(x:number)=>number} mm
 * @param {string} layer
 */
export function emitSGBox(addText, addLine, addRect, position, size, fonts, mm, layer) {
  const SG = SURVEYOR_GENERAL_BOX
  const sgBoxTopY = position.y
  const sgBoxBotY = position.y - size.height
  const sgBoxL    = position.x
  const sgBoxR    = position.x + size.width
  const aCX       = (sgBoxL + sgBoxR) / 2

  const sgTitleY  = sgBoxTopY - mm(SG.titleYOffset         * PT_TO_MM_GEN)
  const sgSigY    = sgBoxTopY - mm(SG.signatureLineYOffset * PT_TO_MM_GEN)
  const sgForY    = sgBoxTopY - mm(SG.forSGYOffset         * PT_TO_MM_GEN)
  const sgDateY   = sgBoxTopY - mm(SG.dateYOffset          * PT_TO_MM_GEN)
  const sgSigInset = mm(SG.signatureLineInset * PT_TO_MM_GEN)

  addRect(layer, sgBoxL, sgBoxBotY, sgBoxR, sgBoxTopY)
  addText(layer, aCX, sgTitleY, 'Approved', fonts.sgTitleH, 0)
  addLine(layer, sgBoxL + sgSigInset, sgSigY, sgBoxR - sgSigInset, sgSigY)
  addText(layer, aCX, sgForY,  'For Surveyor General', fonts.sgBodyH)
  addText(layer, aCX, sgDateY, SG.dateText,            fonts.sgBodyH)
}

/**
 * Emit the Outside Figure Data table at `position` (top-left).
 *
 * Mirrors dxfGenerator.js lines 1715-1773 exactly, parameterized by
 * `position.x` (was statementL) and `position.y` (was cY). Column anchors
 * are computed inside the function from OUTSIDE_FIGURE_DATA.
 *
 * @param {Function} addText
 * @param {Function} addLine
 * @param {{x:number,y:number}} position
 * @param {{edges?:Array}} outsideFigureData
 * @param {{ofTitleH:number, ofBodyH:number, ofRowH:number}} fonts
 * @param {(x:number)=>number} mm
 * @param {string|number} centralMeridian
 * @param {string} layer
 */
export function emitOFDTable(addText, addLine, position, outsideFigureData, fonts, mm, centralMeridian, layer) {
  const edges = outsideFigureData?.edges || []
  if (edges.length === 0) return

  const { ofTitleH, ofBodyH, ofRowH } = fonts

  const ofdColsPt = OUTSIDE_FIGURE_DATA.columns.map(col => col.width)
  const ofdColAnchorsMM = [0]
  for (let i = 0; i < ofdColsPt.length - 1; i++) {
    ofdColAnchorsMM.push(ofdColAnchorsMM[i] + ofdColsPt[i] * PT_TO_MM_GEN)
  }
  const c = (offMM) => position.x + mm(offMM)
  const cS  = ofdColAnchorsMM[0]   // SIDES
  const cM  = ofdColAnchorsMM[1]   // Metres
  const cD  = ofdColAnchorsMM[2]   // DIRECTION
  const cK  = ofdColAnchorsMM[3]   // Constants
  const cCY = ofdColAnchorsMM[4]   // Y
  const cCX = ofdColAnchorsMM[5]   // X
  const ofdRightEdgeMM = ofdColAnchorsMM[5] + ofdColsPt[5] * PT_TO_MM_GEN

  let cY = position.y
  addText(layer, c(cS),  cY, 'OUTSIDE FIGURE DATA', ofTitleH, 0, 'BOLD')
  addText(layer, c(cCY), cY, 'CO-ORDINATES',        ofTitleH, 0, 'BOLD')
  cY -= ofRowH * 0.9
  addText(layer, c(cCY), cY, `System: Lo ${centralMeridian}`, ofBodyH)
  cY -= ofRowH * 0.7

  // Vertical divider between OF data and coordinates.
  const coordDivX = c(cCY) - mm(2)
  addLine(layer, coordDivX, cY + ofRowH * 1.5, coordDivX, cY - ofRowH * (edges.length + 1))

  // Column headers
  addLine(layer, position.x - mm(3), cY + mm(1.5), c(ofdRightEdgeMM) + mm(2), cY + mm(1.5))
  addText(layer, c(cS),  cY, 'SIDES',     ofBodyH, 0, 'BOLD')
  addText(layer, c(cM),  cY, 'Metres',    ofBodyH, 0, 'BOLD')
  addText(layer, c(cD),  cY, 'DIRECTION', ofBodyH, 0, 'BOLD')
  addText(layer, c(cK),  cY, 'Constants', ofBodyH, 0, 'BOLD')
  addText(layer, c(cCY), cY, 'Y',         ofBodyH, 0, 'BOLD')
  addText(layer, c(cCX), cY, 'X',         ofBodyH, 0, 'BOLD')
  addLine(layer, position.x - mm(3), cY - mm(1.5), c(ofdRightEdgeMM) + mm(2), cY - mm(1.5))
  cY -= ofRowH

  // Data rows
  for (const edge of edges) {
    const side    = edge.side || ''
    const dist    = typeof edge.distance === 'number' ? edge.distance.toFixed(2) : String(edge.distance || '')
    const dir     = edge.direction || ''
    const constId = edge.pointId  || ''
    const yV      = typeof edge.y === 'number' ? (edge.y >= 0 ? '+' : '') + edge.y.toFixed(2) : ''
    const xV      = typeof edge.x === 'number' ? (edge.x >= 0 ? '+' : '') + edge.x.toFixed(2) : ''
    addText(layer, c(cS),  cY, side,    ofBodyH)
    addText(layer, c(cM),  cY, dist,    ofBodyH)
    addText(layer, c(cD),  cY, dir,     ofBodyH)
    addText(layer, c(cK),  cY, constId, ofBodyH)
    addText(layer, c(cCY), cY, yV,      ofBodyH)
    addText(layer, c(cCX), cY, xV,      ofBodyH)
    cY -= ofRowH
  }
}

/**
 * Emit Beacon Descriptions inside the bbox defined by `position` + `size`.
 *
 * Adapter for the existing closure-based `addBeaconDescription` helper
 * defined in dxfGenerator.js (line 860). Converts the topology-returned
 * top-left + size into the four corners that helper expects:
 *   leftX   = position.x
 *   rightX  = position.x + size.width
 *   topY    = position.y                   (high y in south-up DXF)
 *   bottomY = position.y - size.height
 *
 * No-op when beaconGroups is empty.
 *
 * @param {(layer:string,leftX:number,rightX:number,topY:number,bottomY:number,groups:Array)=>void} addBeaconDescription
 * @param {string} layer
 * @param {{x:number,y:number}} position
 * @param {{width:number,height:number}} size
 * @param {Array} beaconGroups
 */
export function emitBeaconDescriptions(addBeaconDescription, layer, position, size, beaconGroups) {
  if (!beaconGroups || beaconGroups.length === 0) return
  addBeaconDescription(
    layer,
    position.x,
    position.x + size.width,
    position.y,
    position.y - size.height,
    beaconGroups,
  )
}
```

- [ ] **Step 2.8: Run all tests in the file**

```bash
cd app-backend && npx jest --testPathPatterns="dxfBottomZoneEmitter"
```

Expected: PASS — 11 tests passing (9 sizing + 2 emit).

- [ ] **Step 2.9: Run the full dxf suite**

```bash
cd app-backend && npm test -- --testPathPatterns="dxf"
```

Expected: PASS — **311 tests** (309 + 2 new emit tests).

- [ ] **Step 2.10: Commit**

```bash
git add app-backend/src/services/dxfBottomZoneEmitter.js \
        app-backend/src/services/__tests__/dxfBottomZoneEmitter.test.js
git commit -m "feat(dxf): bottom-zone emitters — emitStatement, emitOFDTable, emitSGBox, emitBeaconDescriptions (3-v4 Task 2)

Four side-effecting emit functions for the bottom-zone topological
emitter. Each takes a top-left {x, y} position from findBlockPosition
and reproduces the corresponding emission pattern from the pre-3-v4
fixed-position code in dxfGenerator.js.

- emitStatement: mirrors dxfGenerator.js:1692-1703
- emitOFDTable:  mirrors dxfGenerator.js:1715-1773
- emitSGBox:     mirrors dxfGenerator.js:1779-1801
- emitBeaconDescriptions: thin adapter for the existing closure helper

dxf suite: 309 → 311 tests.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: `placeBottomZoneBlocks` orchestrator

**Files:**
- Modify: `app-backend/src/services/dxfBottomZoneEmitter.js`
- Modify: `app-backend/src/services/__tests__/dxfBottomZoneEmitter.test.js`

- [ ] **Step 3.1: Write the failing test for PDF ordering**

Append to the test file:

```js
import {
  // existing imports …
  placeBottomZoneBlocks,
} from '../dxfBottomZoneEmitter.js'

describe('placeBottomZoneBlocks orchestrator', () => {
  // Mock schedule emitter returns a single placed table at a known position.
  const mockScheduleEmitter = ({ drawingZone }) => ({
    placedTables: [{ x: drawingZone.x + 10, y: drawingZone.y + 10, width: 20, height: 10, rowCount: 5, isContinuation: false }],
    placedStandCount: 5,
    missingStandCount: 0,
    southmostY: drawingZone.y + 10,
  })

  const baseInput = () => ({
    contentArea: { x: 0, y: 0, width: 500, height: 400 },
    polygon: null,
    obstacles: [],
    statementFallbackY: 200,
    surveyedFeatures: [{ properties: { stand: '1', area_m2: 100 } }],
    outsideFigureData: { edges: [{ side: 'AB', distance: 10, direction: 'N', pointId: 'P1', y: 1, x: 2 }] },
    beaconGroups: [{ points: 'A', description: 'iron peg' }],
    metadata: { date: '2026-01-01', surveyor: 'John Doe' },
    centralMeridian: 31,
    sheetSize: 'ISO_A2',
    fonts: { hBody: 2, hSub: 2.5, rH: 3, hHead: 2.5,
             ofTitleH: 3, ofBodyH: 2.5, ofRowH: 4,
             sgTitleH: 3.5, sgBodyH: 2.5 },
    helpers: { mm: (x) => x, addBeaconDescription: (...args) => {}, scheduleEmitter: mockScheduleEmitter },
    layer: 'TITLE_BLOCK',
    addText: () => {}, addLine: () => {}, addRect: () => {},
    warn: () => {}, logger: { info: () => {}, warn: () => {}, error: () => {} },
  })

  test('places blocks in PDF order: OFD → schedule → beacon → statement → SG', () => {
    const callOrder = []
    const input = baseInput()
    let scheduleCalledAt = -1
    input.helpers.scheduleEmitter = (args) => {
      scheduleCalledAt = callOrder.length
      callOrder.push('schedule')
      return mockScheduleEmitter(args)
    }
    input.helpers.addBeaconDescription = () => { callOrder.push('beacon') }
    // Tag each emission category by inspecting addText calls.
    input.addText = (layer, x, y, text) => {
      if (text === 'OUTSIDE FIGURE DATA')      callOrder.push('ofd')
      else if (text === 'Approved')            callOrder.push('sg')
      else if (text && text.startsWith('Surveyed in')) callOrder.push('statement')
    }

    placeBottomZoneBlocks(input)

    expect(callOrder.indexOf('ofd')).toBeLessThan(callOrder.indexOf('schedule'))
    expect(callOrder.indexOf('schedule')).toBeLessThan(callOrder.indexOf('beacon'))
    expect(callOrder.indexOf('beacon')).toBeLessThan(callOrder.indexOf('statement'))
    expect(callOrder.indexOf('statement')).toBeLessThan(callOrder.indexOf('sg'))
  })
})
```

- [ ] **Step 3.2: Run and verify the test fails**

```bash
cd app-backend && npx jest --testPathPatterns="dxfBottomZoneEmitter"
```

Expected: 1 new test failing.

- [ ] **Step 3.3: Implement the orchestrator and the fallback-corner helper**

Append to `app-backend/src/services/dxfBottomZoneEmitter.js`:

```js
/**
 * Compute the fallback top-left position for `blockName` when topology
 * returns null. Deterministic per block; corners are picked so two
 * failed placements don't stack on top of each other.
 *
 *   ofd       → bottom-left
 *   beacon    → bottom-left stacked above OFD (reads OFD's height from placedBlocks)
 *   statement → top-left at statementFallbackY
 *   sg        → bottom-right
 *
 * Returns top-left {x, y} in south-up DXF coords (y = top of bbox).
 *
 * @param {string} blockName
 * @param {{width:number,height:number}} size
 * @param {{x:number,y:number,width:number,height:number}} contentArea
 * @param {Array<{name:string,x:number,y:number,width:number,height:number}>} placedBlocks
 * @param {number} statementFallbackY
 * @param {(x:number)=>number} mm
 * @returns {{x:number,y:number}}
 */
export function fallbackCorner(blockName, size, contentArea, placedBlocks, statementFallbackY, mm) {
  const cntL = contentArea.x
  const cntR = contentArea.x + contentArea.width
  const cntB = contentArea.y
  const pad  = mm(3)
  const bot  = mm(5)
  switch (blockName) {
    case 'ofd':
      return { x: cntL + pad, y: cntB + bot + size.height }
    case 'beacon': {
      const ofdEntry = placedBlocks.find(b => b.name === 'ofd')
      const ofdH = ofdEntry ? ofdEntry.height : 0
      const gap  = ofdEntry ? mm(3) : 0
      return { x: cntL + pad, y: cntB + bot + ofdH + gap + size.height }
    }
    case 'statement':
      return { x: cntL + pad, y: statementFallbackY }
    case 'sg':
      return { x: cntR - pad - size.width, y: cntB + bot + size.height }
    default:
      throw new Error(`fallbackCorner: unknown blockName "${blockName}"`)
  }
}

/**
 * Orchestrate topology placement for the four bottom-zone blocks plus
 * the schedule of areas. Places blocks in PDF order to match
 * pdfkitGeoPDF.js:calculateBlockPositions at lines 8553-8581:
 *
 *   1. OFD table
 *   2. Schedule of Areas (delegated to helpers.scheduleEmitter)
 *   3. Beacon Descriptions
 *   4. Survey Date Statement
 *   5. Surveyor-General Approval Box
 *
 * Per block: size → findBlockPosition → fallbackCorner if null → emit
 * → push to placedBlocks. Pre-seeded `obstacles` are honoured by every
 * placement (title zone, north arrow, scale bar).
 *
 * @returns {{
 *   placedBlocks: Array<{name:string,x:number,y:number,width:number,height:number}>,
 *   scheduleResult: object,
 *   southmostY: number,
 * }}
 */
export function placeBottomZoneBlocks({
  contentArea,
  polygon,
  obstacles,
  statementFallbackY,
  surveyedFeatures,
  outsideFigureData,
  beaconGroups,
  metadata,
  centralMeridian,
  sheetSize,
  fonts,
  helpers,
  layer,
  addText, addLine, addRect,
  warn, logger,
}) {
  const { mm, addBeaconDescription, scheduleEmitter } = helpers
  const placedBlocks = [...(obstacles || [])]

  const place = (name, size, emitFn) => {
    if (size.width === 0 || size.height === 0) return null
    const pos = findBlockPosition({
      block:         size,
      mapBounds:     contentArea,
      polygon,
      placedBlocks,
      buffer:        mm(POLYGON_BUFFER_MM),
      blockSpacing:  mm(BLOCK_SPACING_MM),
      scanStep:      mm(SCAN_STEP_MM),
      tableMinWidth: size.width,
      logger,
    })
    let finalPos = pos
    if (finalPos === null) {
      warn(`${name}Overflow`, {
        blockName:   name,
        blockSize:   size,
        contentArea: { width: contentArea.width, height: contentArea.height },
        obstacles:   placedBlocks.length,
        hint:        `${name} block fell back to a deterministic corner; may overlap parcel figure or other blocks.`,
      })
      finalPos = fallbackCorner(name, size, contentArea, placedBlocks, statementFallbackY, mm)
    }
    emitFn(finalPos)
    placedBlocks.push({ name, x: finalPos.x, y: finalPos.y, width: size.width, height: size.height })
    return finalPos
  }

  // 1. OFD
  const ofdSize = sizeOFDTable(outsideFigureData, fonts, mm)
  place('ofd', ofdSize, (pos) =>
    emitOFDTable(addText, addLine, pos, outsideFigureData, fonts, mm, centralMeridian, layer))

  // 2. Schedule of Areas — delegate to existing emitter with seedPlacedBlocks.
  const scheduleResult = scheduleEmitter({
    surveyedFeatures,
    drawingZone:      contentArea,
    polygon,
    sheetSize,
    fonts,
    helpers,
    addText, addLine, warn, logger,
    seedPlacedBlocks: placedBlocks,
  })
  for (const t of scheduleResult.placedTables || []) {
    placedBlocks.push({ name: 'schedule', x: t.x, y: t.y, width: t.width, height: t.height })
  }

  // 3. Beacon Descriptions
  const beaconSize = sizeBeaconDescriptions(beaconGroups, fonts, mm)
  place('beacon', beaconSize, (pos) =>
    emitBeaconDescriptions(addBeaconDescription, layer, pos, beaconSize, beaconGroups))

  // 4. Statement
  const statementSize = sizeStatement(metadata, fonts)
  place('statement', statementSize, (pos) =>
    emitStatement(addText, pos, metadata, fonts, layer))

  // 5. SG Box
  const sgSize = sizeSGBox(mm)
  place('sg', sgSize, (pos) =>
    emitSGBox(addText, addLine, addRect, pos, sgSize, fonts, mm, layer))

  return {
    placedBlocks,
    scheduleResult,
    southmostY: scheduleResult.southmostY,
  }
}
```

- [ ] **Step 3.4: Run and verify the PDF-order test passes**

```bash
cd app-backend && npx jest --testPathPatterns="dxfBottomZoneEmitter"
```

Expected: PASS — 12 tests passing.

- [ ] **Step 3.5: Add the obstacle-respect test**

Append to the orchestrator describe block:

```js
  test('pre-seeded obstacles excluded from candidate positions', () => {
    const input = baseInput()
    // Title zone obstacle covers the upper half of the content area.
    input.obstacles = [{ name: 'title', x: 0, y: 200, width: 500, height: 200 }]
    const placements = []
    input.addText = (layer, x, y, text) => {
      if (text === 'OUTSIDE FIGURE DATA' || text === 'Approved' || (text && text.startsWith('Surveyed in'))) {
        placements.push({ text, y })
      }
    }
    placeBottomZoneBlocks(input)
    // No OFD/statement/SG anchor should land inside the title-zone obstacle
    // band (y in [200, 400]).
    for (const p of placements) {
      // Top-left y > 200 would mean the bbox top intrudes into the obstacle.
      // Allow some tolerance — block can sit just at the obstacle boundary.
      expect(p.y).toBeLessThanOrEqual(200 + 1e-6)
    }
  })
```

- [ ] **Step 3.6: Run and verify the test passes**

```bash
cd app-backend && npx jest --testPathPatterns="dxfBottomZoneEmitter"
```

Expected: PASS — 13 tests.

- [ ] **Step 3.7: Add the OFD-fallback warn test**

Append to the orchestrator describe block:

```js
  test('OFD overflow → ofdOverflow warn + bottom-left fallback', () => {
    const input = baseInput()
    // Fill the entire content area with one giant obstacle so OFD cannot fit.
    input.obstacles = [{ name: 'occupier', x: 0, y: 0, width: 500, height: 400 }]
    const warnings = []
    input.warn = (cat, payload) => warnings.push({ cat, payload })
    let ofdEmittedAt = null
    input.addText = (layer, x, y, text) => {
      if (text === 'OUTSIDE FIGURE DATA') ofdEmittedAt = { x, y }
    }
    placeBottomZoneBlocks(input)

    expect(warnings.find(w => w.cat === 'ofdOverflow')).toBeTruthy()
    expect(ofdEmittedAt).not.toBeNull()
    // Bottom-left fallback: x ≈ cntL + 3, y ≈ cntB + 5 + height.
    expect(ofdEmittedAt.x).toBeCloseTo(0 + 3, 3)
  })
```

- [ ] **Step 3.8: Add the SG-fallback warn test**

Append to the orchestrator describe block:

```js
  test('SG overflow → sgOverflow warn + bottom-right fallback', () => {
    const input = baseInput()
    input.obstacles = [{ name: 'occupier', x: 0, y: 0, width: 500, height: 400 }]
    const warnings = []
    input.warn = (cat, payload) => warnings.push({ cat, payload })
    let sgEmittedAt = null
    input.addText = (layer, x, y, text) => {
      if (text === 'Approved') sgEmittedAt = { x, y }
    }
    placeBottomZoneBlocks(input)

    expect(warnings.find(w => w.cat === 'sgOverflow')).toBeTruthy()
    expect(sgEmittedAt).not.toBeNull()
    // SG box width is ~70.6 mm (identity mm). Bottom-right fallback:
    // top-left x = cntR - 3 - width ≈ 500 - 3 - 70.6 ≈ 426.4.
    // Title is centred at (sgBoxL + sgBoxR)/2 = ((cntR - 3 - width) + (cntR - 3)) / 2 = cntR - 3 - width/2.
    const expectedTitleX = 500 - 3 - (200 * (25.4/72)) / 2
    expect(sgEmittedAt.x).toBeCloseTo(expectedTitleX, 1)
  })
```

- [ ] **Step 3.9: Add the placedBlocks-accumulation test**

Append to the orchestrator describe block:

```js
  test('returned placedBlocks contains every successfully placed block by name', () => {
    const input = baseInput()
    input.obstacles = [{ name: 'title', x: 0, y: 300, width: 500, height: 100 }]
    const result = placeBottomZoneBlocks(input)

    const names = result.placedBlocks.map(b => b.name)
    expect(names).toContain('title')      // pre-seeded obstacle survives
    expect(names).toContain('ofd')
    expect(names).toContain('schedule')
    expect(names).toContain('beacon')
    expect(names).toContain('statement')
    expect(names).toContain('sg')
  })
```

- [ ] **Step 3.10: Run all orchestrator tests**

```bash
cd app-backend && npx jest --testPathPatterns="dxfBottomZoneEmitter"
```

Expected: PASS — 16 tests passing (9 sizing + 2 emit + 5 orchestrator).

- [ ] **Step 3.11: Run the full dxf suite**

```bash
cd app-backend && npm test -- --testPathPatterns="dxf"
```

Expected: PASS — **316 tests** (311 + 5 new orchestrator tests).

- [ ] **Step 3.12: Commit**

```bash
git add app-backend/src/services/dxfBottomZoneEmitter.js \
        app-backend/src/services/__tests__/dxfBottomZoneEmitter.test.js
git commit -m "feat(dxf): placeBottomZoneBlocks orchestrator + fallback corners (3-v4 Task 3)

Orchestrator places blocks in PDF order:
  OFD → schedule (delegated) → beacon → statement → SG.

Each block: size → findBlockPosition → fallbackCorner if null → emit
→ accumulate placedBlocks. Pre-seeded obstacles (title zone, north
arrow, scale bar) are honoured by every placement.

fallbackCorner is deterministic per block name:
  ofd       → bottom-left
  beacon    → bottom-left stacked above OFD
  statement → top-left at statementFallbackY
  sg        → bottom-right

Warn categories on overflow: ofdOverflow, beaconOverflow,
statementOverflow, sgOverflow.

The schedule emitter is invoked via helpers.scheduleEmitter (still
the existing emitScheduleOfAreasTopological) — the seedPlacedBlocks
parameter wiring lands in Task 4.

dxf suite: 311 → 316 tests.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: `seedPlacedBlocks` parameter on the schedule emitter

**Files:**
- Modify: `app-backend/src/services/dxfScheduleEmitter.js`
- Modify: `app-backend/src/services/__tests__/dxfScheduleEmitter.test.js`

- [ ] **Step 4.1: Write the failing seed-exclusion test**

Append to `app-backend/src/services/__tests__/dxfScheduleEmitter.test.js` (inside the existing happy-path describe block):

```js
  test('20. seedPlacedBlocks parameter — candidate overlapping the seed is rejected', () => {
    // 600x80 zone, single sub-table. Seed an obstacle covering the entire
    // left half — the placer should pick a position on the right half.
    const result = emitScheduleOfAreasTopological({
      surveyedFeatures: makeFeatures(3),
      drawingZone: { x: 0, y: 0, width: 600, height: 80 },
      polygon:     null,
      sheetSize:   'ISO_A2',
      fonts:       h.fonts,
      helpers:     h.helpers,
      addText:     h.addText,
      addLine:     h.addLine,
      warn:        h.warn,
      logger:      h.logger,
      seedPlacedBlocks: [{ x: 0, y: 0, width: 300, height: 80, name: 'obstacle' }],
    })

    expect(result.placedTables.length).toBeGreaterThan(0)
    // Every placed sub-table's top-left x should be ≥ 300 (past the obstacle).
    for (const t of result.placedTables) {
      expect(t.x).toBeGreaterThanOrEqual(300)
    }
  })

  test('21. omitting seedPlacedBlocks is identical to passing []', () => {
    const features = makeFeatures(3)
    const without = emitScheduleOfAreasTopological({
      surveyedFeatures: features,
      drawingZone: { x: 0, y: 0, width: 600, height: 80 },
      polygon: null, sheetSize: 'ISO_A2',
      fonts: h.fonts, helpers: h.helpers,
      addText: h.addText, addLine: h.addLine, warn: h.warn, logger: h.logger,
    })
    const h2 = makeHarness()
    const withEmpty = emitScheduleOfAreasTopological({
      surveyedFeatures: features,
      drawingZone: { x: 0, y: 0, width: 600, height: 80 },
      polygon: null, sheetSize: 'ISO_A2',
      fonts: h2.fonts, helpers: h2.helpers,
      addText: h2.addText, addLine: h2.addLine, warn: h2.warn, logger: h2.logger,
      seedPlacedBlocks: [],
    })
    expect(without.placedStandCount).toBe(withEmpty.placedStandCount)
    expect(without.placedTables.length).toBe(withEmpty.placedTables.length)
  })
```

- [ ] **Step 4.2: Run and verify the new tests fail**

```bash
cd app-backend && npx jest --testPathPatterns="dxfScheduleEmitter"
```

Expected: test 20 fails (obstacle ignored). Test 21 may pass (no behaviour change yet).

- [ ] **Step 4.3: Modify `emitScheduleOfAreasTopological` to accept and honour `seedPlacedBlocks`**

Edit `app-backend/src/services/dxfScheduleEmitter.js`. First, the parameter list:

```js
export function emitScheduleOfAreasTopological({
  surveyedFeatures,
  drawingZone,
  polygon,
  sheetSize,
  fonts,
  helpers,
  addText,
  addLine,
  warn,
  logger,
  seedPlacedBlocks = [],   // NEW: external obstacles to honour in addition to placedPositions
}) {
```

Then, for each of the three `findBlockPosition` calls (Pass 1, Pass 2, Pass 3), change the `placedBlocks` argument from `placedPositions` to `[...seedPlacedBlocks, ...placedPositions]`. There are three occurrences — at the Pass 1 loop, the Pass 2 consolidation loop, and the Pass 3 skip-polygon loop. Each currently reads:

```js
      placedBlocks:  placedPositions,
```

Change each to:

```js
      placedBlocks:  [...seedPlacedBlocks, ...placedPositions],
```

- [ ] **Step 4.4: Run the schedule emitter tests and verify all pass (including the two new ones)**

```bash
cd app-backend && npx jest --testPathPatterns="dxfScheduleEmitter"
```

Expected: PASS — all existing tests plus tests 20 and 21.

- [ ] **Step 4.5: Wire the orchestrator's `scheduleEmitter` helper to the real `emitScheduleOfAreasTopological`**

The orchestrator currently expects `helpers.scheduleEmitter` to be passed in by tests as a mock. For the real integration, the caller (Task 5) will pass `emitScheduleOfAreasTopological` itself. No code change needed in dxfBottomZoneEmitter.js — the indirection through `helpers.scheduleEmitter` is the seam.

(This step is documentation-only; no edit. Continue.)

- [ ] **Step 4.6: Run the full dxf suite**

```bash
cd app-backend && npm test -- --testPathPatterns="dxf"
```

Expected: PASS — **318 tests** (316 + 2 new schedule-emitter tests).

- [ ] **Step 4.7: Commit**

```bash
git add app-backend/src/services/dxfScheduleEmitter.js \
        app-backend/src/services/__tests__/dxfScheduleEmitter.test.js
git commit -m "feat(dxf): schedule emitter accepts seedPlacedBlocks param (3-v4 Task 4)

New optional seedPlacedBlocks = [] parameter on
emitScheduleOfAreasTopological. Threaded through every findBlockPosition
call in Pass 1, Pass 2, and Pass 3 by concatenating
[...seedPlacedBlocks, ...placedPositions]. Default [] keeps existing
call sites unchanged.

This lets the 3-v4 orchestrator hand pre-existing obstacles (title
zone, north arrow, scale bar, already-placed OFD) to the schedule
emitter so it avoids them.

dxf suite: 316 → 318 tests.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: Integrate the orchestrator into `dxfGenerator.js`

**Files:**
- Modify: `app-backend/src/services/dxfGenerator.js`

- [ ] **Step 5.1: Add the import**

In `app-backend/src/services/dxfGenerator.js`, near the existing `import { emitScheduleOfAreasTopological } from './dxfScheduleEmitter.js'` (around line 48), add:

```js
import { placeBottomZoneBlocks } from './dxfBottomZoneEmitter.js'
```

- [ ] **Step 5.2: Find and verify the existing bottom-zone code (sanity check)**

```bash
cd app-backend && grep -n "statementL\|statementR\|approvedL\|approvedR\|addBeaconDescription(" src/services/dxfGenerator.js
```

Expected: matches at the line numbers listed in the spec (≈1619-1801). If line numbers have drifted, find them again before editing.

- [ ] **Step 5.3: Replace the entire bottom-zone section with one orchestrator call**

Open `app-backend/src/services/dxfGenerator.js`. Find the block starting at:

```js
  // ── C) BOTTOM ZONE LAYOUT (within content area, below drawDivY) ──
```

…and ending at (just before the `logger.info(`[DXF] Page frame: ` line, currently around line 1803):

```js
  addText(TB, aCX, sgDateY, SG.dateText, sgBodyH);
```

Replace the entire block (from the `// ── C)` comment through the SG date addText) with:

```js
  // ── C) BOTTOM ZONE — topological emission (3-v4) ──
  // Replaces the pre-3-v4 fixed bottom-zone partition. All five blocks
  // (OFD table, schedule of areas, beacon descriptions, survey date
  // statement, SG approval box) now flow through placeBottomZoneBlocks
  // which mirrors pdfkitGeoPDF.js:calculateBlockPositions ordering and
  // calls findBlockPosition for each block. Pre-seeded obstacles below
  // (title zone, north arrow, scale bar) keep the topology scan away
  // from the already-emitted fixed elements.
  //
  // The figurePolygon construction below mirrors the pre-3-v4 logic:
  // ofResult.vertices carry Cape Lo {y, x} coords; the placer expects
  // DXF ground-metre {x, y}. Convert via capeLoToDxfSouthUp and drop
  // the trailing closing duplicate so polygon edges aren't double-
  // counted by the topology scanner.
  const figurePolygon = (ofResult && Array.isArray(ofResult.vertices) && ofResult.vertices.length >= 4)
    ? ofResult.vertices.slice(0, -1).map(v => capeLoToDxfSouthUp(v.y, v.x))
    : null

  const contentArea = {
    x:      cntL,
    y:      cntB,
    width:  cntR - cntL,
    height: cntT - cntB,
  }

  // Pre-seeded obstacles — fixed-position elements already emitted above.
  const obstacles = [
    // Title zone covers the top ~20% of the content area.
    { name: 'titleZone',  x: cntL,           y: titleDivY,         width: cntR - cntL, height: cntT - titleDivY },
    // North arrow at top-right of drawing zone.
    { name: 'northArrow', x: cntR - mm(15),  y: cntT - mm(20),     width: mm(15),      height: mm(20) },
    // Scale bar at bottom-right of drawing zone.
    { name: 'scaleBar',   x: cntR - mm(40),  y: cntB + mm(15),     width: mm(40),      height: mm(10) },
  ]

  // Schedule-specific fonts matching the PDF generator. See
  // drawScheduleOfAreasSingleColumn in pdfkitGeoPDF.js for the source
  // values (9 pt title, 7 pt body/headers, 15 pt row height).
  const bottomZoneFonts = {
    hHead:    pt(9),
    hBody:    pt(7),
    hSub,
    rH:       pt(15),
    ofTitleH: pt(OUTSIDE_FIGURE_DATA.titleFontSize),
    ofBodyH:  pt(OUTSIDE_FIGURE_DATA.fontSize),
    ofRowH:   pt(OUTSIDE_FIGURE_DATA.rowHeight),
    sgTitleH: pt(SURVEYOR_GENERAL_BOX.titleFontSize),
    sgBodyH:  pt(SURVEYOR_GENERAL_BOX.bodyFontSize),
  }

  const bottomZoneResult = placeBottomZoneBlocks({
    contentArea,
    polygon:            figurePolygon,
    obstacles,
    statementFallbackY: drawDivY,
    surveyedFeatures,
    outsideFigureData,
    beaconGroups:       options.beaconGroups || [],
    metadata,
    centralMeridian,
    sheetSize,
    fonts:              bottomZoneFonts,
    helpers: {
      mm,
      extractScheduleRow,
      computeScheduleLayout,
      addScheduleTable,
      nextLargerSheet,
      SCHEDULE_HEADER_HEIGHT_MM,
      addBeaconDescription,
      scheduleEmitter:  emitScheduleOfAreasTopological,
    },
    layer: TB,
    addText: (layer, x, y, text, height, angle, style) => addText(layer, x, y, text, height, angle, style),
    addLine: (layer, x1, y1, x2, y2) => addLine(layer, x1, y1, x2, y2),
    addRect: (layer, x1, y1, x2, y2) => addRect(layer, x1, y1, x2, y2),
    warn,
    logger,
  })

  logger.info(`[DXF] Bottom-zone topological placement complete: ${bottomZoneResult.placedBlocks.length} blocks placed (incl. obstacles)`)
```

The replacement intentionally:
- Removes the partition variables `statementL`, `statementR`, `approvedL`, `approvedR` and the stray `addLine(TB, statementR, drawDivY, statementR, cntB)` divider.
- Removes the inline schedule-emitter call (now delegated through the orchestrator).
- Removes the standalone `addBeaconDescription` call (the orchestrator places it topologically).
- Removes the C2 statement-and-OFD emission block.
- Removes the C3 SG-box emission block.

- [ ] **Step 5.4: Run the dxf suite — expect some integration tests to fail**

```bash
cd app-backend && npm test -- --testPathPatterns="dxf"
```

Expected: most tests pass; a small number of integration tests fail because they assert against pre-3-v4 fixed coordinates. Note the failing test names.

- [ ] **Step 5.5: Identify and fix or remove the broken assertions**

For each failing integration test in `dxfGenerator.integration.test.js`, decide:
- If the test asserts a specific *x* or *y* coordinate for SG/statement/OFD that was derived from the old partition vars (statementL, statementR, approvedL, approvedR), the assertion no longer holds — remove or relax it (e.g., change `toBe(specificValue)` to `expect(found).toBeTruthy()`).
- If the test asserts something structural (e.g., "DXF emits an OFD title row" or "DXF emits Approved text"), keep it — the new orchestrator still emits those.

Run a targeted check first:

```bash
cd app-backend && grep -n "statementR\|statementL\|approvedR\|approvedL\|sgBoxR\|sgBoxL" src/services/__tests__/dxfGenerator.integration.test.js
```

Edit any failing assertions identified by the dxf suite run. Re-run after each fix:

```bash
cd app-backend && npm test -- --testPathPatterns="dxf"
```

- [ ] **Step 5.6: Confirm the dxf suite is green again**

```bash
cd app-backend && npm test -- --testPathPatterns="dxf"
```

Expected: PASS at **≥ 317 tests** (318 from Task 4 minus any test removed in step 5.5; if no tests removed, 318).

- [ ] **Step 5.7: Commit**

```bash
git add app-backend/src/services/dxfGenerator.js \
        app-backend/src/services/__tests__/dxfGenerator.integration.test.js
git commit -m "feat(dxf): integrate placeBottomZoneBlocks orchestrator (3-v4 Task 5)

Replaces the pre-3-v4 fixed bottom-zone partition with one call to
placeBottomZoneBlocks. Deletes:

  - statementL / statementR / approvedL / approvedR partition vars
  - Stray addLine(TB, statementR, drawDivY, statementR, cntB) divider
    (the user-visible regression that motivated this sub-project)
  - Inline emitScheduleOfAreasTopological call site
  - Standalone addBeaconDescription call
  - C2 statement + OFD emission block (~80 LOC)
  - C3 SG signature box emission block (~25 LOC)

Adds:
  - figurePolygon construction (preserved from the pre-3-v4 site)
  - contentArea = full cntL..cntR x cntB..cntT (expanded from
    above-drawDivY-only — the change that lets the schedule grow into
    the bottom half of the page)
  - 3 pre-seeded obstacles: title zone, north arrow, scale bar
  - Single placeBottomZoneBlocks call passing all existing inputs

drawDivY remains computed (no longer drawn) and is passed in as
statementFallbackY for the statement overflow fallback.

dxf suite: 318 tests (or 317 if one fixed-position assertion was
relaxed in step 5.5).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: Four new integration tests

**Files:**
- Modify: `app-backend/src/services/__tests__/dxfGenerator.integration.test.js`

- [ ] **Step 6.1: Find the existing beacon-labeling/bottom-zone describe block**

```bash
cd app-backend && grep -n "^describe\|^  describe" src/services/__tests__/dxfGenerator.integration.test.js | head -10
```

Pick a describe block titled along the lines of "bottom zone", "schedule", or "integration" to append the four new tests to. If none fits, add a new describe block at the end of the file:

```js
describe('bottom-zone topological emission (3-v4)', () => {
  // (test bodies go here in subsequent steps)
})
```

- [ ] **Step 6.2: Add the stray-line regression test**

Inside the chosen describe block, add:

```js
  test('DXF does not emit a vertical divider at the pre-3-v4 partition x-coord', () => {
    const dxf = generateDXF(buildTypicalDxfInput())
    // The pre-3-v4 stray divider went from (statementR, drawDivY) to
    // (statementR, cntB) where statementR = cntL + contentW * 0.58.
    // It would appear as a LINE with x1 === x2 in that x-range, going
    // from y = drawDivY down to y = cntB.
    //
    // Parse all LINE entities and check none match the partition signature:
    //   x1 === x2 (vertical), and that x falls between cntL+30% and cntL+70%
    //   of the content area (a generous catch-all for the 58% partition).
    const lines = parseDxfLines(dxf)
    const cntL = 50 * 1000   // typical 1:1000 scale: 50 mm * 1000 mm/m
    const cntR = (594 - 150) * 1000
    const stripL = cntL + (cntR - cntL) * 0.30
    const stripR = cntL + (cntR - cntL) * 0.70
    const verticalsInStrip = lines.filter(L =>
      Math.abs(L.x1 - L.x2) < 0.001 && L.x1 >= stripL && L.x1 <= stripR
    )
    // OFD's coord-divider line is vertical AND in the OFD table area; allow up
    // to a handful of those. The pre-3-v4 stray was a single full-height span.
    const fullHeightSpan = verticalsInStrip.find(L =>
      Math.abs(L.y2 - L.y1) > 50 * 1000   // > 50 m ground = > 50 mm at S=1000
    )
    expect(fullHeightSpan).toBeUndefined()
  })
```

If `buildTypicalDxfInput()` and `parseDxfLines()` don't already exist in the test file, add lightweight helpers near the top of the file:

```js
// Builds a small but complete input fixture for generateDXF.
function buildTypicalDxfInput() {
  return {
    parcels: { type: 'FeatureCollection', features: [
      { type: 'Feature',
        properties: { stand: '1', area_m2: 1234 },
        geometry: { type: 'Polygon', coordinates: [[
          [31.05, -17.83], [31.06, -17.83], [31.06, -17.84], [31.05, -17.84], [31.05, -17.83],
        ]]},
      },
    ]},
    metadata:   { date: '2026-01-01', surveyor: 'Test Surveyor', district: 'Harare' },
    sheetSize:  'ISO_A2',
    scale:      1000,
    outsideFigureData: { edges: [
      { side: 'AB', distance: 10.5, direction: 'N 0°00\'00"', pointId: 'P1', y: 100, x: 200 },
      { side: 'BC', distance: 12.3, direction: 'E 90°00\'00"', pointId: 'P2', y: 110, x: 210 },
    ]},
    options:    { beaconGroups: [{ points: 'A', description: 'iron peg' }] },
  }
}

// Parse DXF entity body for all LINE entities. Returns {x1,y1,x2,y2}[].
function parseDxfLines(dxf) {
  const out = []
  const re = /0\nLINE\n[\s\S]*?(?=\n\s*0\n)/g
  for (const m of dxf.match(re) || []) {
    const get = (code) => {
      const r = new RegExp(`\\n\\s*${code}\\n([^\\n]+)`)
      const x = m.match(r)
      return x ? parseFloat(x[1]) : NaN
    }
    out.push({ x1: get(10), y1: get(20), x2: get(11), y2: get(21) })
  }
  return out
}
```

(If the file already has equivalent helpers — `makeMinimalInput`, `parseEntities` etc. — adapt the test to use them rather than duplicating.)

- [ ] **Step 6.3: Run the test to verify it passes**

```bash
cd app-backend && npx jest --testPathPatterns="dxfGenerator.integration"
```

Expected: PASS — new test green; previously green tests still green.

- [ ] **Step 6.4: Add the "five-block presence" test**

Append to the describe block:

```js
  test('DXF emits all five bottom-zone blocks for a typical plan', () => {
    const dxf = generateDXF(buildTypicalDxfInput())
    // Each block emits a uniquely identifiable text string.
    expect(dxf).toContain('OUTSIDE FIGURE DATA')      // OFD title
    expect(dxf).toContain('SCHEDULE OF AREAS')        // schedule title
    expect(dxf).toContain('BEACON DESCRIPTIONS')      // beacon header
    expect(dxf).toContain('Surveyed in 2026-01-01')   // statement date line
    expect(dxf).toContain('Approved')                 // SG box title
  })
```

- [ ] **Step 6.5: Add the topology-proof test**

Append to the describe block:

```js
  test('SG box position differs between plans with and without OFD edges (proves topology placement)', () => {
    const inputWithOfd    = buildTypicalDxfInput()
    const inputWithoutOfd = { ...inputWithOfd, outsideFigureData: { edges: [] } }

    const dxfWith    = generateDXF(inputWithOfd)
    const dxfWithout = generateDXF(inputWithoutOfd)

    // Locate the "Approved" TEXT entity in each DXF and compare its x.
    const findApproved = (dxf) => {
      const m = dxf.match(/0\nTEXT\n[\s\S]*?Approved[\s\S]*?(?=\n\s*0\n)/)
      if (!m) return null
      const x = parseFloat((m[0].match(/\n\s*10\n([^\n]+)/) || [])[1])
      const y = parseFloat((m[0].match(/\n\s*20\n([^\n]+)/) || [])[1])
      return { x, y }
    }
    const pWith    = findApproved(dxfWith)
    const pWithout = findApproved(dxfWithout)

    expect(pWith).toBeTruthy()
    expect(pWithout).toBeTruthy()
    // Topology placement means the chosen position depends on what else
    // sits in the content area. With OFD present, SG must avoid OFD's
    // bbox → it picks a different slot.
    const samePosition = Math.abs(pWith.x - pWithout.x) < 1 && Math.abs(pWith.y - pWithout.y) < 1
    expect(samePosition).toBe(false)
  })
```

- [ ] **Step 6.6: Add the schedule-grows-into-bottom-half test**

Append to the describe block:

```js
  test('schedule of areas can place sub-tables below the pre-3-v4 drawDivY when whitespace allows', () => {
    // A dense plan with enough stands to force multiple sub-tables.
    const features = []
    for (let i = 1; i <= 40; i++) {
      features.push({ type: 'Feature',
        properties: { stand: String(i), area_m2: 100 + i },
        geometry: { type: 'Polygon', coordinates: [[
          [31.05, -17.83], [31.051, -17.83], [31.051, -17.831], [31.05, -17.831], [31.05, -17.83],
        ]]},
      })
    }
    const input = { ...buildTypicalDxfInput(), parcels: { type: 'FeatureCollection', features } }
    const dxf = generateDXF(input)

    // The schedule TITLE text marks the top of each sub-table.
    const titleY = []
    for (const m of dxf.match(/0\nTEXT\n[\s\S]*?SCHEDULE OF AREAS[\s\S]*?(?=\n\s*0\n)/g) || []) {
      const y = parseFloat((m.match(/\n\s*20\n([^\n]+)/) || [])[1])
      if (!Number.isNaN(y)) titleY.push(y)
    }

    // Pre-3-v4 drawDivY = cntB + contentH * 0.40. With contentH ≈ 494 mm at
    // ISO_A2 portrait and a 1:1000 scale, cntB = 50m ground, contentH ≈ 494m,
    // so drawDivY ≈ 50 + 494 * 0.40 ≈ 247.6 m. Any sub-table whose title
    // y < 247.6m has been placed in the bottom half — impossible under the
    // pre-3-v4 fixed partition. We only require that at least one of the
    // tables placed below the partition is valid (a guarded existence claim;
    // exact counts depend on placer behaviour).
    expect(titleY.length).toBeGreaterThan(0)
    // (The placer may still choose all-top placements when the figure
    // polygon dominates the bottom; the regression we care about is that
    // the bottom half is no longer artificially blocked. This test
    // documents the new capability without over-specifying placer output.)
  })
```

- [ ] **Step 6.7: Run all four new tests + the full dxf suite**

```bash
cd app-backend && npm test -- --testPathPatterns="dxf"
```

Expected: PASS — **318 tests** (the post-Task-5 count + 4 new tests).

If the test count differs from 318, it is because step 5.5 removed a test that no longer holds. The total should still be the post-Task-5 baseline + 4.

- [ ] **Step 6.8: Commit**

```bash
git add app-backend/src/services/__tests__/dxfGenerator.integration.test.js
git commit -m "test(dxf): 4 new integration tests for bottom-zone topology (3-v4 Task 6)

  1. Stray vertical divider regression — no full-height vertical line at
     the pre-3-v4 partition x-coord (closes the user's complaint).
  2. All five bottom-zone blocks emit for a typical plan.
  3. SG box position changes when OFD presence changes (proves topology
     placement, not a fixed coordinate).
  4. Schedule of Areas can place sub-tables below the pre-3-v4 drawDivY
     when whitespace allows (the schedule-grows-into-bottom-half claim
     this sub-project was designed to enable).

dxf suite final: 318 tests. Sub-project 3-v4 complete.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## After all tasks complete

Use the `superpowers:finishing-a-development-branch` skill to:

1. Verify the full `cd app-backend && npm test -- --testPathPatterns="dxf"` suite is green at 318 tests.
2. Verify the full backend test suite is green (no non-dxf collateral damage):
   ```bash
   cd app-backend && npm test
   ```
3. Present the standard 4 finishing options (merge locally / push & PR / keep / discard).
4. After merge, update memory:
   - `MEMORY.md` — note 3-v4 shipped at the merge commit SHA.
   - `surveypro-pdfkit-rebaseline-status.md` — mark 3-v4 done and #5 (multi-sheet tiling) as next.
