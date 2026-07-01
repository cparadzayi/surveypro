# Diagram PDF Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the single-stand SI 727 S.G. Diagram as an A4-portrait PDF in a new `diagramPdf.js` module, dispatched from the `/vector` route when `planType==='diagram'`, leaving the General Plan renderer untouched.

**Architecture:** A new backend module `diagramPdf.js` (`generateDiagramPDF`) drawing a fixed A4 template with pdfkit, fed by small unit-tested pure helpers under `src/services/diagram/` (subject geometry, sides/coords table model, reference-grid model, scale + coordinate transform). Reuses pure helpers from `app-shared/block-definitions.js`. The frontend shell stops filtering neighbours out of the diagram payload and carries `subjectParcelId`.

**Tech Stack:** Node ESM + pdfkit (backend), Jest (backend unit/integration), Vue 3 + TS + Vitest (frontend).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-01-diagram-pdf-renderer-design.md`.
- **No changes to `pdfkitGeoPDF.js`** or the General Plan / Working Plan output. **No DXF** (that is 2c).
- **Const. row = 0.00 / 0.00**, coordinate columns carry **full** beacon Y/X (no origin/residual split).
- **A4 portrait**, single sheet, no tiling. A4 = **595.28 × 841.89 pt** (portrait).
- **Neighbour scope:** subject parcel in full detail + neighbours as faint outlines with **stand-number** labels + road-frontage **edge lengths**. **No** named roads, **no** dashed connection lines to external beacons (deferred).
- Diagram reference values come from the 2a metadata camelCase keys: `deedOfTransferNo, parentDiagramNo, parentDiagramAnnexedTo, originalTitleDiagramNo, srNo, fileNo, gpNo`; blank cells where empty.
- Cape Lo coordinates are `[Y, X]` = (Westing, Southing) in metres. Bearing (north azimuth) of an edge (y1,x1)→(y2,x2): `deg = (atan2(-(y2-y1), -(x2-x1)) * 180/PI + 360) % 360`.
- Backend ESM; Jest runs via `node --experimental-vm-modules node_modules/jest/bin/jest.js` (the `npm test` script). Frontend Vitest via `npm test`.
- Reuse `app-shared/block-definitions.js` pure helpers where they fit: `formatBearing`, `formatCoordinate`, `formatAreaValue`, `classifyBeaconGroups`, `snapScaleBarSegment`, `resolveLoSystem`.

---

### Task 1: Shell — stop filtering neighbours for Diagram; carry subjectParcelId

**Files:**
- Modify: `app-frontend/src/views/modules/cadastral-standard/planPayload.ts`
- Modify: `app-frontend/src/views/modules/cadastral-standard/__tests__/planPayload.test.ts`

**Interfaces:**
- Consumes: existing `PlanPayloadContext` (has `planType`, `subjectParcelId`, `parcels`, `beacons`, `beaconLabels`, `metadata`).
- Produces: for `planType==='diagram'`, `buildPlanPayload` returns **all** parcels/beacons unchanged and sets `metadata.subjectParcelId` (string) instead of filtering. Other single-parcel behaviour is removed for diagram (there are no other single-parcel plan types).

**Context:** Today `buildPlanPayload` filters the payload to the subject parcel when `meta.subjectMode === 'single-parcel'` (diagram). 2b needs neighbours, so diagram must pass all parcels and mark the subject in metadata. `getPlanTypeMeta('diagram').subjectMode` is `'single-parcel'` — keep that (the UI still requires a subject click), but change the payload behaviour.

- [ ] **Step 1: Update the failing tests**

In `planPayload.test.ts`, replace the three single-parcel tests in `describe('buildPlanPayload — single-parcel (diagram)', …)` with:
```ts
describe('buildPlanPayload — diagram carries all parcels + subjectParcelId', () => {
  it('does NOT filter parcels/beacons and records subjectParcelId in metadata', () => {
    const p = buildPlanPayload(ctx({ planType: 'diagram', subjectParcelId: 'A' }))
    expect(p.parcels.features.map(f => f.properties!.id)).toEqual(['A', 'B'])
    expect(p.beacons.features).toHaveLength(3)
    expect((p.metadata as any).subjectParcelId).toBe('A')
  })

  it('still records subjectParcelId even if it is not among the parcels', () => {
    const p = buildPlanPayload(ctx({ planType: 'diagram', subjectParcelId: 'Z' }))
    expect(p.parcels.features).toHaveLength(2)
    expect((p.metadata as any).subjectParcelId).toBe('Z')
  })

  it('whole-set plan types are unaffected and set no subjectParcelId', () => {
    const p = buildPlanPayload(ctx({ planType: 'general-undeveloped' }))
    expect(p.parcels.features).toHaveLength(2)
    expect((p.metadata as any).subjectParcelId).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run (from `app-frontend/`): `npm test -- planPayload`
Expected: FAIL — current code filters to one parcel and sets no `subjectParcelId`.

- [ ] **Step 3: Implement**

In `planPayload.ts` `buildPlanPayload`, replace the single-parcel filtering block:
```ts
  const meta = getPlanTypeMeta(ctx.planType)
  let parcels = ctx.parcels
  let beacons = ctx.beacons
  let beaconLabels = ctx.beaconLabels
  let metadata = ctx.metadata

  if (meta.subjectMode === 'single-parcel' && ctx.subjectParcelId != null) {
    // Diagram: keep ALL parcels/beacons (neighbours are drawn as context) and
    // mark which parcel is the diagram subject for the renderer.
    metadata = { ...(ctx.metadata ?? {}), subjectParcelId: String(ctx.subjectParcelId) }
  }
```
Then in the returned object, use `metadata` (instead of `ctx.metadata`) and keep `parcels`, `beacons`, `beaconLabels` as the (unfiltered) values. Remove the now-unused `beaconsForParcel` call inside `buildPlanPayload` **only if** it is no longer referenced there; keep the exported `beaconsForParcel` function and its test (it may still be used elsewhere — verify with a grep and leave it if referenced).

- [ ] **Step 4: Verify pass**

Run: `npm test -- planPayload`
Expected: PASS (all planPayload tests).

- [ ] **Step 5: Confirm no dangling reference + commit**

Run: `grep -rn "beaconsForParcel" src` — if `beaconsForParcel` is now unused anywhere, that's acceptable (it stays exported + tested); if the earlier `buildPlanPayload` was its only caller, leave the function and its unit test intact (still valid).
```bash
git add app-frontend/src/views/modules/cadastral-standard/planPayload.ts app-frontend/src/views/modules/cadastral-standard/__tests__/planPayload.test.ts
git commit -m "feat(diagram-2b): diagram payload carries all parcels + subjectParcelId"
```

---

### Task 2: subjectGeometry helper (ordered edges + lettered vertices)

**Files:**
- Create: `app-backend/src/services/diagram/subjectGeometry.js`
- Test: `app-backend/src/services/diagram/__tests__/subjectGeometry.test.js`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `function deriveSubjectGeometry(subjectFeature)` → `{ vertices: Array<{letter, y, x}>, sides: Array<{side, from, to, distance, bearingDeg}>, area }`
    - `subjectFeature.geometry.coordinates[0]` is the closed ring `[[y,x], …, [y,x]]` (last == first).
    - `vertices`: ring points minus the closing duplicate, lettered `A, B, C…` in order.
    - `sides`: consecutive pairs (…last→first), `side='AB'` etc., `distance = hypot(dy,dx)`, `bearingDeg` per the Global Constraints formula.
    - `area`: `Number(subjectFeature.properties?.area_m2) || 0`.

- [ ] **Step 1: Write the failing test**

Create `app-backend/src/services/diagram/__tests__/subjectGeometry.test.js`:
```js
import { describe, test, expect } from '@jest/globals'
import { deriveSubjectGeometry } from '../subjectGeometry.js'

// A simple square, Cape Lo [Y,X]; ring closed (last == first).
const square = {
  properties: { area_m2: 10000 },
  geometry: { type: 'Polygon', coordinates: [[
    [0, 0], [0, 100], [100, 100], [100, 0], [0, 0],
  ]] },
}

describe('deriveSubjectGeometry', () => {
  test('letters vertices A..D in ring order, drops closing duplicate', () => {
    const g = deriveSubjectGeometry(square)
    expect(g.vertices.map(v => v.letter)).toEqual(['A', 'B', 'C', 'D'])
    expect(g.vertices[0]).toMatchObject({ letter: 'A', y: 0, x: 0 })
    expect(g.vertices[2]).toMatchObject({ letter: 'C', y: 100, x: 100 })
  })

  test('sides connect consecutive vertices and close D->A', () => {
    const g = deriveSubjectGeometry(square)
    expect(g.sides.map(s => s.side)).toEqual(['AB', 'BC', 'CD', 'DA'])
    expect(g.sides[0].distance).toBeCloseTo(100, 6)
  })

  test('bearing uses the north-azimuth convention', () => {
    const g = deriveSubjectGeometry(square)
    // AB: (0,0)->(0,100): dy=0, dx=100 → atan2(0,-100)=180°
    expect(g.sides[0].bearingDeg).toBeCloseTo(180, 6)
    // BC: (0,100)->(100,100): dy=100, dx=0 → atan2(-100,0)=270°
    expect(g.sides[1].bearingDeg).toBeCloseTo(270, 6)
  })

  test('carries area from properties', () => {
    expect(deriveSubjectGeometry(square).area).toBe(10000)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run (from `app-backend/`): `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns=subjectGeometry`
Expected: FAIL — cannot find module `../subjectGeometry.js`.

- [ ] **Step 3: Implement**

Create `app-backend/src/services/diagram/subjectGeometry.js`:
```js
/**
 * Derive the diagram figure geometry for the subject parcel: lettered vertices
 * (A, B, C… in ring order) and lettered sides (AB, BC…) with distance + north
 * azimuth. Cape Lo coordinates are [Y, X] (Westing, Southing).
 */

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function letterAt(i) {
  // A..Z then AA, AB… (parcels rarely exceed 26 vertices, but be safe)
  if (i < 26) return LETTERS[i]
  return LETTERS[Math.floor(i / 26) - 1] + LETTERS[i % 26]
}

/** North azimuth (deg, 0..360) of edge (y1,x1)→(y2,x2) in Cape Lo. */
export function edgeBearingDeg(y1, x1, y2, x2) {
  const dy = y2 - y1
  const dx = x2 - x1
  return (Math.atan2(-dy, -dx) * 180 / Math.PI + 360) % 360
}

export function deriveSubjectGeometry(subjectFeature) {
  const ring = subjectFeature?.geometry?.coordinates?.[0] ?? []
  // Drop the closing duplicate if present.
  const pts = ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1]
      ? ring.slice(0, -1)
      : ring.slice()

  const vertices = pts.map((p, i) => ({ letter: letterAt(i), y: p[0], x: p[1] }))

  const sides = []
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i]
    const b = vertices[(i + 1) % vertices.length]
    const dy = b.y - a.y
    const dx = b.x - a.x
    sides.push({
      side: `${a.letter}${b.letter}`,
      from: a.letter,
      to: b.letter,
      distance: Math.hypot(dy, dx),
      bearingDeg: edgeBearingDeg(a.y, a.x, b.y, b.x),
    })
  }

  const area = Number(subjectFeature?.properties?.area_m2) || 0
  return { vertices, sides, area }
}
```

- [ ] **Step 4: Verify pass**

Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns=subjectGeometry`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/diagram/subjectGeometry.js app-backend/src/services/diagram/__tests__/subjectGeometry.test.js
git commit -m "feat(diagram-2b): subject geometry (lettered vertices + sides)"
```

---

### Task 3: sidesTable helper (table rows + "figure represents" string)

**Files:**
- Create: `app-backend/src/services/diagram/sidesTable.js`
- Test: `app-backend/src/services/diagram/__tests__/sidesTable.test.js`

**Interfaces:**
- Consumes: `deriveSubjectGeometry`'s output shape (`vertices`, `sides`, `area`).
- Produces:
  - `function toDMS(deg)` → `{ d, m, s }` (integers; s rounded).
  - `function buildSidesTable(geometry)` → `{ constRow:{y:'0.00',x:'0.00'}, coordinateRows:Array<{letter,y,x}>, sideRows:Array<{side,metres,direction}> }` where `y`/`x` are full coordinates formatted to 2 dp with sign, `metres` is distance to 2 dp, `direction` is `"D MM SS"` (space-separated DMS).
  - `function buildFigureRepresents(geometry, designation, parentClause)` → string like `"A.B.C.D.A."`.

- [ ] **Step 1: Write the failing test**

Create `app-backend/src/services/diagram/__tests__/sidesTable.test.js`:
```js
import { describe, test, expect } from '@jest/globals'
import { toDMS, buildSidesTable, buildFigureRepresents } from '../sidesTable.js'

const geometry = {
  vertices: [
    { letter: 'A', y: -85557.12, x: 787.48 },
    { letter: 'B', y: -85605.99, x: 836.25 },
    { letter: 'C', y: -85503.68, x: 938.79 },
  ],
  sides: [
    { side: 'AB', distance: 69.05, bearingDeg: 314.9444 },
    { side: 'BC', distance: 144.85, bearingDeg: 44.9361 },
    { side: 'CA', distance: 120.0, bearingDeg: 224.0 },
  ],
  area: 5019,
}

describe('toDMS', () => {
  test('converts degrees to d/m/s', () => {
    expect(toDMS(314.9444)).toEqual({ d: 314, m: 56, s: 40 })
  })
})

describe('buildSidesTable', () => {
  test('const row is 0.00 / 0.00', () => {
    expect(buildSidesTable(geometry).constRow).toEqual({ y: '0.00', x: '0.00' })
  })
  test('coordinate rows carry full signed coords to 2dp', () => {
    const t = buildSidesTable(geometry)
    expect(t.coordinateRows[0]).toEqual({ letter: 'A', y: '-85557.12', x: '+787.48' })
  })
  test('side rows have metres + spaced DMS direction', () => {
    const t = buildSidesTable(geometry)
    expect(t.sideRows[0]).toEqual({ side: 'AB', metres: '69.05', direction: '314 56 40' })
  })
})

describe('buildFigureRepresents', () => {
  test('joins vertex letters and closes back to the first', () => {
    expect(buildFigureRepresents(geometry)).toBe('A.B.C.A.')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns=sidesTable`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `app-backend/src/services/diagram/sidesTable.js`:
```js
/** Whole-degree/minute/second breakdown of a decimal-degree bearing. */
export function toDMS(deg) {
  let total = Math.round(deg * 3600) // total arc-seconds, rounded
  total = ((total % 1296000) + 1296000) % 1296000
  const d = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return { d, m, s }
}

function signed(value) {
  const v = Number(value)
  const fixed = Math.abs(v).toFixed(2)
  return (v < 0 ? '-' : '+') + fixed
}

function pad2(n) { return String(n).padStart(2, '0') }

/**
 * Build the SIDES / DIRECTIONS / CO-ORDINATES table model. Const row is
 * 0.00/0.00 (full coordinates are carried in the coordinate rows).
 */
export function buildSidesTable(geometry) {
  const constRow = { y: '0.00', x: '0.00' }
  const coordinateRows = geometry.vertices.map(v => ({
    letter: v.letter,
    y: signed(v.y),
    x: signed(v.x),
  }))
  const sideRows = geometry.sides.map(s => {
    const { d, m, s: sec } = toDMS(s.bearingDeg)
    return {
      side: s.side,
      metres: Number(s.distance).toFixed(2),
      direction: `${d} ${pad2(m)} ${pad2(sec)}`,
    }
  })
  return { constRow, coordinateRows, sideRows }
}

/** "A.B.C…A." — the closed vertex-letter sequence for the figure statement. */
export function buildFigureRepresents(geometry) {
  const letters = geometry.vertices.map(v => v.letter)
  if (letters.length === 0) return ''
  return letters.concat(letters[0]).join('.') + '.'
}
```

- [ ] **Step 4: Verify pass**

Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns=sidesTable`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/diagram/sidesTable.js app-backend/src/services/diagram/__tests__/sidesTable.test.js
git commit -m "feat(diagram-2b): sides/coordinates table model + figure-represents string"
```

---

### Task 4: referenceGrid helper (metadata → grid cells)

**Files:**
- Create: `app-backend/src/services/diagram/referenceGrid.js`
- Test: `app-backend/src/services/diagram/__tests__/referenceGrid.test.js`

**Interfaces:**
- Consumes: `metadata` with the 2a camelCase keys.
- Produces: `function buildReferenceGrid(metadata)` → an object with string values (empty string where missing): `{ deedOfTransferNo, parentDiagramNo, parentDiagramAnnexedTo, originalTitleDiagramNo, srNo, fileNo, gpNo, annexedToNo:'', annexedToDate:'', registrationGp:'', compilation:'' }`.

- [ ] **Step 1: Write the failing test**

Create `app-backend/src/services/diagram/__tests__/referenceGrid.test.js`:
```js
import { describe, test, expect } from '@jest/globals'
import { buildReferenceGrid } from '../referenceGrid.js'

describe('buildReferenceGrid', () => {
  test('maps 2a metadata values and blanks SG-office cells', () => {
    const g = buildReferenceGrid({
      deedOfTransferNo: '3326/72', parentDiagramNo: '8055/57',
      parentDiagramAnnexedTo: 'X', originalTitleDiagramNo: 'Y',
      srNo: '118/2023', fileNo: '8/2916', gpNo: 'GP1',
    })
    expect(g.deedOfTransferNo).toBe('3326/72')
    expect(g.srNo).toBe('118/2023')
    expect(g.annexedToNo).toBe('')
    expect(g.registrationGp).toBe('')
    expect(g.compilation).toBe('')
  })

  test('missing/null metadata fields become empty strings', () => {
    const g = buildReferenceGrid({ srNo: '118/2023' })
    expect(g.srNo).toBe('118/2023')
    expect(g.fileNo).toBe('')
    expect(g.deedOfTransferNo).toBe('')
  })

  test('handles null/undefined metadata', () => {
    const g = buildReferenceGrid(null)
    expect(g.srNo).toBe('')
    expect(g.parentDiagramNo).toBe('')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns=referenceGrid`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `app-backend/src/services/diagram/referenceGrid.js`:
```js
/**
 * Map project metadata (2a fields) to the diagram's bottom reference grid.
 * SG-office-filled cells are always blank at submission.
 */
const KEYS = [
  'deedOfTransferNo', 'parentDiagramNo', 'parentDiagramAnnexedTo',
  'originalTitleDiagramNo', 'srNo', 'fileNo', 'gpNo',
]

export function buildReferenceGrid(metadata) {
  const src = metadata ?? {}
  const grid = {}
  for (const k of KEYS) {
    const v = src[k]
    grid[k] = v == null ? '' : String(v)
  }
  // Surveyor-General's office fills these after submission → always blank.
  grid.annexedToNo = ''
  grid.annexedToDate = ''
  grid.registrationGp = ''
  grid.compilation = ''
  return grid
}
```

- [ ] **Step 4: Verify pass**

Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns=referenceGrid`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/diagram/referenceGrid.js app-backend/src/services/diagram/__tests__/referenceGrid.test.js
git commit -m "feat(diagram-2b): reference-grid model from metadata"
```

---

### Task 5: diagramScale helper (A4 scale pick + coordinate transform)

**Files:**
- Create: `app-backend/src/services/diagram/diagramScale.js`
- Test: `app-backend/src/services/diagram/__tests__/diagramScale.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `function parcelExtent(subjectFeature)` → `{ minY, maxY, minX, maxX, widthM, heightM }` over the subject ring.
  - `function pickDiagramScale(extent, figureAreaPt, requestedScale)` → `{ denom:number, label:'1:N' }`. If `requestedScale` parses to `1:N`, use it; else pick the smallest SI 727 denominator from the ladder at which `extent` fits `figureAreaPt` (72 pt = 1 inch = 25.4 mm; metres→pt at scale N is `metres/N*1000/25.4*72`).
  - `function makeTransform(extent, figureAreaPt, denom)` → `fn([y, x]) → { px, py }` mapping Cape Lo to points inside `figureAreaPt` (`{x,y,width,height}` in pt), centred, Y increasing westwards to the left, X increasing southwards downward — match the app's existing display orientation (X down, Y left→right as in the GP figure).

**Note on orientation:** the transform's axis handling is the one visually-sensitive pure bit. Test it against a known extent → corner points; the exact north-up orientation is confirmed in the manual visual step of Task 6.

- [ ] **Step 1: Write the failing test**

Create `app-backend/src/services/diagram/__tests__/diagramScale.test.js`:
```js
import { describe, test, expect } from '@jest/globals'
import { parcelExtent, pickDiagramScale, makeTransform } from '../diagramScale.js'

const square = { geometry: { type: 'Polygon', coordinates: [[
  [0, 0], [0, 100], [100, 100], [100, 0], [0, 0],
]] } }
const figure = { x: 0, y: 0, width: 400, height: 400 } // pt

describe('parcelExtent', () => {
  test('computes bounds and metre spans', () => {
    const e = parcelExtent(square)
    expect(e).toMatchObject({ minY: 0, maxY: 100, minX: 0, maxX: 100, widthM: 100, heightM: 100 })
  })
})

describe('pickDiagramScale', () => {
  test('honours an explicit 1:N request', () => {
    expect(pickDiagramScale(parcelExtent(square), figure, '1:500')).toEqual({ denom: 500, label: '1:500' })
  })
  test('auto picks a denominator that fits the figure area', () => {
    const r = pickDiagramScale(parcelExtent(square), figure, 'auto')
    // 100 m at 1:500 → 0.2 m/pt-scale → 100/500*1000/25.4*72 ≈ 566 pt > 400, so 500 too big;
    // 1:750 → ~378 pt fits 400 → expect denom >= 750
    expect(r.denom).toBeGreaterThanOrEqual(750)
    expect(r.label).toBe(`1:${r.denom}`)
  })
})

describe('makeTransform', () => {
  test('maps extent corners inside the figure rect', () => {
    const e = parcelExtent(square)
    const r = pickDiagramScale(e, figure, 'auto')
    const tf = makeTransform(e, figure, r.denom)
    const p = tf([0, 0])
    expect(p.px).toBeGreaterThanOrEqual(figure.x)
    expect(p.px).toBeLessThanOrEqual(figure.x + figure.width)
    expect(p.py).toBeGreaterThanOrEqual(figure.y)
    expect(p.py).toBeLessThanOrEqual(figure.y + figure.height)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns=diagramScale`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `app-backend/src/services/diagram/diagramScale.js`:
```js
const PT_PER_MM = 72 / 25.4

// SI 727 prescribed base ladder (denominators), ascending.
const SCALE_LADDER = [
  100, 125, 150, 200, 250, 300, 400, 500, 600, 750,
  1000, 1250, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 7500,
  10000, 12500, 15000, 20000, 25000,
]

export function parcelExtent(subjectFeature) {
  const ring = subjectFeature?.geometry?.coordinates?.[0] ?? []
  let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity
  for (const [y, x] of ring) {
    if (y < minY) minY = y; if (y > maxY) maxY = y
    if (x < minX) minX = x; if (x > maxX) maxX = x
  }
  return { minY, maxY, minX, maxX, widthM: maxY - minY, heightM: maxX - minX }
}

/** metres → points at scale 1:denom. */
function metresToPt(metres, denom) {
  return (metres / denom) * 1000 * PT_PER_MM
}

export function pickDiagramScale(extent, figureAreaPt, requestedScale) {
  const m = typeof requestedScale === 'string' && requestedScale.match(/1\s*:\s*(\d+)/)
  if (m) {
    const denom = Number(m[1])
    return { denom, label: `1:${denom}` }
  }
  const fits = (denom) =>
    metresToPt(extent.widthM, denom) <= figureAreaPt.width &&
    metresToPt(extent.heightM, denom) <= figureAreaPt.height
  const denom = SCALE_LADDER.find(fits) ?? SCALE_LADDER[SCALE_LADDER.length - 1]
  return { denom, label: `1:${denom}` }
}

/**
 * Map Cape Lo [Y, X] to points inside figureAreaPt ({x,y,width,height}).
 * Y (Westing) → horizontal, X (Southing) → vertical (down). Centred.
 */
export function makeTransform(extent, figureAreaPt, denom) {
  const drawW = metresToPt(extent.widthM || 1, denom)
  const drawH = metresToPt(extent.heightM || 1, denom)
  const ox = figureAreaPt.x + (figureAreaPt.width - drawW) / 2
  const oy = figureAreaPt.y + (figureAreaPt.height - drawH) / 2
  return ([y, x]) => ({
    px: ox + ((y - extent.minY) / (extent.widthM || 1)) * drawW,
    py: oy + ((x - extent.minX) / (extent.heightM || 1)) * drawH,
  })
}
```

- [ ] **Step 4: Verify pass**

Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns=diagramScale`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/diagram/diagramScale.js app-backend/src/services/diagram/__tests__/diagramScale.test.js
git commit -m "feat(diagram-2b): A4 scale pick + coordinate transform"
```

---

### Task 6: diagramPdf.js — module skeleton + figure (subject + neighbours)

**Files:**
- Create: `app-backend/src/services/diagramPdf.js`
- Test: `app-backend/src/services/__tests__/diagramPdf.test.js`

**Interfaces:**
- Consumes: `deriveSubjectGeometry` (Task 2), `parcelExtent`/`pickDiagramScale`/`makeTransform` (Task 5).
- Produces: `async function generateDiagramPDF(options, logger)` → `{ pdfBuffer: Buffer, scale: string, sheetSize: 'A4' }`. `options`: `{ parcels, beacons, metadata, projection, scale, sheetSize, orientation }` where `metadata.subjectParcelId` selects the subject.

**Context:** A4 portrait = `[595.28, 841.89]` pt. pdfkit buffer pattern: create doc, push `data` chunks, `doc.end()`, await `end`, `Buffer.concat`. Define the page regions once (module constants) so later tasks draw into them:
```
FIGURE  = { x: 40,  y: 250, width: 515, height: 360 }  // central figure area (pt)
```
(Other regions are added in Tasks 7–8.)

- [ ] **Step 1: Write the failing integration test**

Create `app-backend/src/services/__tests__/diagramPdf.test.js`:
```js
import { describe, test, expect } from '@jest/globals'
import { generateDiagramPDF } from '../diagramPdf.js'

const subject = {
  type: 'Feature',
  properties: { id: 'A', stand: '302', designation: 'STAND 302 BRACKENHURST', area_m2: 5019 },
  geometry: { type: 'Polygon', coordinates: [[
    [0, 0], [0, 60], [80, 60], [80, 0], [0, 0],
  ]] },
}
const neighbour = {
  type: 'Feature',
  properties: { id: 'B', stand: '303', area_m2: 4000 },
  geometry: { type: 'Polygon', coordinates: [[
    [80, 0], [80, 60], [160, 60], [160, 0], [80, 0],
  ]] },
}

const options = {
  parcels: { type: 'FeatureCollection', features: [subject, neighbour] },
  beacons: { type: 'FeatureCollection', features: [] },
  metadata: { subjectParcelId: 'A', designation: 'STAND 302 BRACKENHURST', centralMeridian: 29 },
  projection: 'EPSG:22289', scale: 'auto', sheetSize: 'A4', orientation: 'portrait',
}
const logger = { info() {}, warn() {}, error() {} }

describe('generateDiagramPDF', () => {
  test('returns a valid PDF buffer', async () => {
    const r = await generateDiagramPDF(options, logger)
    expect(Buffer.isBuffer(r.pdfBuffer)).toBe(true)
    expect(r.pdfBuffer.slice(0, 5).toString()).toBe('%PDF-')
    expect(r.sheetSize).toBe('A4')
    expect(typeof r.scale).toBe('string')
  })

  test('throws a clear error when the subject parcel is missing', async () => {
    await expect(generateDiagramPDF({ ...options, metadata: { subjectParcelId: 'Z' } }, logger))
      .rejects.toThrow(/subject parcel/i)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns=diagramPdf`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the skeleton + figure**

Create `app-backend/src/services/diagramPdf.js`:
```js
import PDFDocument from 'pdfkit'
import { deriveSubjectGeometry } from './diagram/subjectGeometry.js'
import { parcelExtent, pickDiagramScale, makeTransform } from './diagram/diagramScale.js'

// A4 portrait, points.
const A4 = [595.28, 841.89]
// Page regions (pt). Tasks 7–8 add table/reference regions above/below.
export const REGIONS = {
  figure: { x: 40, y: 250, width: 515, height: 360 },
}

function docToBuffer(doc) {
  const chunks = []
  doc.on('data', (c) => chunks.push(c))
  doc.end()
  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })
}

/** Draw one parcel ring (already transformed to pt). */
function drawRing(doc, ptRing, { color, width }) {
  if (ptRing.length < 3) return
  doc.save().lineWidth(width).strokeColor(color)
  doc.moveTo(ptRing[0].px, ptRing[0].py)
  for (let i = 1; i < ptRing.length; i++) doc.lineTo(ptRing[i].px, ptRing[i].py)
  doc.closePath().stroke()
  doc.restore()
}

function ringToPt(feature, tf) {
  const ring = feature?.geometry?.coordinates?.[0] ?? []
  return ring.map((p) => tf(p))
}

function centroidPt(ptRing) {
  const n = ptRing.length || 1
  return {
    px: ptRing.reduce((a, p) => a + p.px, 0) / n,
    py: ptRing.reduce((a, p) => a + p.py, 0) / n,
  }
}

export async function generateDiagramPDF(options, logger) {
  const { parcels, metadata = {}, scale: requestedScale } = options
  const features = parcels?.features ?? []
  const subjectId = String(metadata.subjectParcelId ?? '')
  const subject = features.find((f) => String(f.properties?.id) === subjectId)
  if (!subject) {
    throw new Error(`Diagram: subject parcel not found (subjectParcelId=${subjectId})`)
  }
  const neighbours = features.filter((f) => f !== subject)

  const geometry = deriveSubjectGeometry(subject)
  const extent = parcelExtent(subject)
  const { denom, label } = pickDiagramScale(extent, REGIONS.figure, requestedScale)
  const tf = makeTransform(extent, REGIONS.figure, denom)

  const doc = new PDFDocument({ size: A4, margin: 0 })
  const bufferPromise = docToBuffer(doc)

  // Neighbours: faint outline + stand-number label at centroid.
  doc.font('Helvetica').fontSize(7).fillColor('#555555')
  for (const nb of neighbours) {
    const pr = ringToPt(nb, tf)
    drawRing(doc, pr, { color: '#999999', width: 0.5 })
    const c = centroidPt(pr)
    const stand = nb.properties?.stand ?? nb.properties?.designation ?? ''
    if (stand) doc.text(String(stand), c.px - 15, c.py - 4, { width: 30, align: 'center' })
  }

  // Subject: bold outline + lettered vertices + per-side bearing/distance labels.
  const subjPt = geometry.vertices.map((v) => tf([v.y, v.x]))
  drawRing(doc, subjPt, { color: '#0a7d34', width: 1.5 })
  doc.fillColor('#000000').fontSize(8)
  geometry.vertices.forEach((v, i) => {
    const p = subjPt[i]
    doc.text(v.letter, p.px + 2, p.py - 9)
  })
  doc.fontSize(6.5).fillColor('#111111')
  geometry.sides.forEach((s, i) => {
    const a = subjPt[i]
    const b = subjPt[(i + 1) % subjPt.length]
    const mx = (a.px + b.px) / 2
    const my = (a.py + b.py) / 2
    doc.text(`${s.distance.toFixed(2)}m`, mx - 18, my - 4, { width: 36, align: 'center' })
  })

  const pdfBuffer = await bufferPromise
  return { pdfBuffer, scale: label, sheetSize: 'A4' }
}
```

- [ ] **Step 4: Verify pass**

Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns=diagramPdf`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/diagramPdf.js app-backend/src/services/__tests__/diagramPdf.test.js
git commit -m "feat(diagram-2b): diagramPdf skeleton + figure (subject + neighbours)"
```

---

### Task 7: diagramPdf.js — top table + beacon description + north arrow + approval box

**Files:**
- Modify: `app-backend/src/services/diagramPdf.js`
- Modify: `app-backend/src/services/__tests__/diagramPdf.test.js`

**Interfaces:**
- Consumes: `buildSidesTable` (Task 3); `resolveLoSystem` from `../../../app-shared/block-definitions.js`; `classifyBeaconGroups` from the same.
- Produces: the same `generateDiagramPDF` return; the PDF text layer now contains the `Lo NN°` label, `DIAGRAM S.G. No.`, `Beacon description`, and `Approved`.

- [ ] **Step 1: Extend the test**

Add to `diagramPdf.test.js` a test that the text layer contains the new labels. pdfkit text isn't trivially extractable from the binary buffer, so assert on a light-weight capture: refactor `generateDiagramPDF` is not required — instead assert the buffer grew and the call succeeds with beacons carrying a description. Add:
```js
test('renders with beacons + Lo system without error and stays a valid PDF', async () => {
  const withBeacons = {
    ...options,
    beacons: { type: 'FeatureCollection', features: [
      { type: 'Feature', properties: { name: '302A', description: '12mm iron peg' }, geometry: { type: 'Point', coordinates: [0, 0] } },
    ] },
  }
  const r = await generateDiagramPDF(withBeacons, logger)
  expect(r.pdfBuffer.slice(0, 5).toString()).toBe('%PDF-')
  expect(r.pdfBuffer.length).toBeGreaterThan(1000)
})
```
(Deep text-layer assertions are covered by the manual visual step; the integration test guards "valid PDF, no throw".)

- [ ] **Step 2: Run to verify current state**

Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns=diagramPdf`
Expected: PASS for existing tests, PASS for the new one too (it only exercises the current code) — this test guards against regressions as you add drawing. If it fails, fix before proceeding.

- [ ] **Step 3: Add the table + beacon description + north arrow + approval box**

At the top of `diagramPdf.js`, extend imports and regions:
```js
import { buildSidesTable } from './diagram/sidesTable.js'
import { resolveLoSystem, classifyBeaconGroups } from '../../../app-shared/block-definitions.js'
```
Add to `REGIONS`:
```js
  table:      { x: 40, y: 40,  width: 515, height: 150 },
  sgNoBox:    { x: 455, y: 40, width: 100, height: 40 },
  beaconDesc: { x: 40, y: 195, width: 250, height: 40 },
  approved:   { x: 380, y: 195, width: 175, height: 45 },
  northArrow: { x: 300, y: 195, width: 40,  height: 50 },
```
Add these draw helpers (module scope):
```js
function drawTable(doc, table, loLabel) {
  const { constRow, coordinateRows, sideRows } = table
  const R = REGIONS.table
  doc.save().font('Helvetica-Bold').fontSize(7).fillColor('#000')
  doc.text('SIDES', R.x, R.y)
  doc.text('DIRECTIONS', R.x + 90, R.y)
  doc.text(loLabel, R.x + 190, R.y)
  doc.text('CO-ORDINATES', R.x + 245, R.y)
  doc.text('DIAGRAM S.G. No.', REGIONS.sgNoBox.x, R.y)
  doc.font('Helvetica').fontSize(6.5)
  doc.text('Metres', R.x, R.y + 10)
  doc.text('°  ′  ″', R.x + 90, R.y + 10)
  doc.text('Y', R.x + 245, R.y + 10)
  doc.text('X', R.x + 320, R.y + 10)
  // Const row
  let ry = R.y + 22
  doc.text('Const.', R.x + 190, ry)
  doc.text(constRow.y, R.x + 245, ry)
  doc.text(constRow.x, R.x + 320, ry)
  // Coordinate rows + side rows in parallel
  const rows = Math.max(coordinateRows.length, sideRows.length)
  for (let i = 0; i < rows; i++) {
    ry += 11
    if (sideRows[i]) {
      doc.text(sideRows[i].side, R.x, ry)
      doc.text(sideRows[i].metres, R.x + 30, ry)
      doc.text(sideRows[i].direction, R.x + 90, ry)
    }
    if (coordinateRows[i]) {
      doc.text(coordinateRows[i].letter, R.x + 190, ry)
      doc.text(coordinateRows[i].y, R.x + 245, ry)
      doc.text(coordinateRows[i].x, R.x + 320, ry)
    }
  }
  // SG No. box outline (blank)
  doc.rect(REGIONS.sgNoBox.x, REGIONS.sgNoBox.y + 10, REGIONS.sgNoBox.width, REGIONS.sgNoBox.height).stroke()
  doc.restore()
}

function drawBeaconDescription(doc, beacons) {
  const R = REGIONS.beaconDesc
  const groups = classifyBeaconGroups(beacons?.features ?? [])
  doc.save().font('Helvetica-Bold').fontSize(7).text('Beacon description', R.x, R.y)
  doc.font('Helvetica').fontSize(7)
  const line = groups && groups.length
    ? `All          : ${groups[0].description ?? ''}`
    : 'All          :'
  doc.text(line, R.x, R.y + 11)
  doc.restore()
}

function drawNorthArrow(doc) {
  const R = REGIONS.northArrow
  const cx = R.x + R.width / 2
  doc.save().lineWidth(1).strokeColor('#000')
  doc.moveTo(cx, R.y + R.height).lineTo(cx, R.y).stroke()      // shaft
  doc.moveTo(cx - 4, R.y + 8).lineTo(cx, R.y).lineTo(cx + 4, R.y + 8).stroke() // head
  doc.font('Helvetica').fontSize(7).text('T  N', cx - 8, R.y + R.height + 2)
  doc.restore()
}

function drawApprovedBox(doc) {
  const R = REGIONS.approved
  doc.save().rect(R.x, R.y, R.width, R.height).stroke()
  doc.font('Helvetica').fontSize(7)
  doc.text('Approved', R.x + 8, R.y + 6)
  doc.text('for Surveyor-General', R.x + 8, R.y + 22)
  doc.text('Date ....................', R.x + 8, R.y + 34)
  doc.restore()
}
```
Then, inside `generateDiagramPDF` (after the figure drawing, before `await bufferPromise`), add:
```js
  const loLabel = `Lo ${resolveLoSystem(null, metadata, options.projection)}`
  drawTable(doc, buildSidesTable(geometry), loLabel)
  drawBeaconDescription(doc, options.beacons)
  drawNorthArrow(doc)
  drawApprovedBox(doc)
```
> `resolveLoSystem` returns the Lo-system string (e.g. `"29°"` or similar). If its return shape differs, adapt the `loLabel` composition to produce `Lo NN°` — verify the helper's output when wiring and note it in your report.

- [ ] **Step 4: Verify pass**

Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns=diagramPdf`
Expected: PASS (3 tests) — all still produce a valid `%PDF-` buffer.

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/diagramPdf.js app-backend/src/services/__tests__/diagramPdf.test.js
git commit -m "feat(diagram-2b): top table + beacon description + north arrow + approval box"
```

---

### Task 8: diagramPdf.js — scale bar + statement + reference grid

**Files:**
- Modify: `app-backend/src/services/diagramPdf.js`

**Interfaces:**
- Consumes: `buildFigureRepresents` (Task 3), `buildReferenceGrid` (Task 4), `formatAreaValue` + `snapScaleBarSegment` from block-definitions.
- Produces: the completed diagram; return value unchanged.

- [ ] **Step 1: Add imports + regions**

Extend imports:
```js
import { buildFigureRepresents } from './diagram/sidesTable.js'
import { buildReferenceGrid } from './diagram/referenceGrid.js'
import { formatAreaValue, snapScaleBarSegment } from '../../../app-shared/block-definitions.js'
```
Add to `REGIONS`:
```js
  scaleBar:   { x: 220, y: 620, width: 160, height: 30 },
  statement:  { x: 40,  y: 660, width: 515, height: 60 },
  refGrid:    { x: 40,  y: 725, width: 515, height: 100 },
```

- [ ] **Step 2: Add the draw helpers**

```js
function drawScaleBar(doc, denom) {
  const R = REGIONS.scaleBar
  // Ground metres represented by the bar's width:
  const barGroundM = (R.width / (72 / 25.4)) * denom / 1000
  const seg = snapScaleBarSegment(barGroundM / 4) // ~4 segments
  const ptPerM = (72 / 25.4) * 1000 / denom
  doc.save().lineWidth(1).strokeColor('#000').font('Helvetica').fontSize(6.5)
  let x = R.x, ground = 0
  doc.moveTo(R.x, R.y + 10).lineTo(R.x, R.y + 16).stroke()
  for (let i = 0; i < 4; i++) {
    const w = seg * ptPerM
    if (i % 2 === 0) doc.rect(x, R.y + 10, w, 4).fillAndStroke('#000', '#000')
    else doc.rect(x, R.y + 10, w, 4).stroke()
    x += w; ground += seg
    doc.fillColor('#000').text(String(Math.round(ground)), x - 6, R.y, { width: 12, align: 'center' })
  }
  doc.text('metres', x + 4, R.y + 10)
  doc.text(`Scale 1 : ${denom}`, R.x + R.width / 2 - 30, R.y + 20)
  doc.restore()
}

function drawStatement(doc, geometry, metadata) {
  const R = REGIONS.statement
  const seq = buildFigureRepresents(geometry)
  const area = formatAreaValue(geometry.area)
  const designation = metadata.designation ?? ''
  const parent = metadata.parentProperty ? ` OF ${metadata.parentProperty}` : ''
  doc.save().font('Helvetica').fontSize(8).fillColor('#000')
  doc.text('The figure', R.x, R.y)
  doc.text('represents', R.x, R.y + 11)
  doc.text(`${seq}`, R.x + 120, R.y, { width: 260, align: 'center' })
  doc.text(`${area} of land called`, R.x + 120, R.y + 12, { width: 300 })
  doc.font('Helvetica-Bold').text(`${designation}${parent}`, R.x, R.y + 30, { width: R.width })
  doc.font('Helvetica').fontSize(7).text(
    `situate in the district of ${metadata.district ?? ''}.`, R.x, R.y + 44)
  doc.text(`Surveyed in ${metadata.surveyDate ? new Date(metadata.surveyDate).toLocaleString('en', { month: 'long', year: 'numeric' }) : ''} by me`, R.x, R.y + 53)
  doc.restore()
}

function drawReferenceGrid(doc, grid) {
  const R = REGIONS.refGrid
  doc.save().rect(R.x, R.y, R.width, R.height).stroke()
  doc.font('Helvetica').fontSize(7).fillColor('#000')
  const col2 = R.x + R.width / 2
  doc.text(`This diagram is annexed to No. ${grid.annexedToNo}  dated ${grid.annexedToDate}`, R.x + 4, R.y + 6)
  doc.text(`The immediate parent diagram is No. ${grid.parentDiagramNo}  annexed to ${grid.parentDiagramAnnexedTo}`, R.x + 4, R.y + 22)
  doc.text(`Deed of Transfer No. ${grid.deedOfTransferNo}`, R.x + 4, R.y + 38)
  doc.text(`File : ${grid.fileNo}`, R.x + 4, R.y + 54)
  doc.text(`G.P. : ${grid.registrationGp}`, R.x + 4, R.y + 70)
  doc.text(`The original title diagram is No. ${grid.originalTitleDiagramNo}`, col2, R.y + 6)
  doc.text(`S.R. : ${grid.srNo}`, col2, R.y + 38)
  doc.text('Land Surveyor', col2, R.y + 54)
  doc.text('Surveyor-General', col2, R.y + 70)
  doc.text(`Compilation : ${grid.compilation}`, R.x + 4, R.y + 86)
  doc.restore()
}
```

- [ ] **Step 3: Wire them in**

Inside `generateDiagramPDF`, after the Task-7 draw calls and before `await bufferPromise`:
```js
  drawScaleBar(doc, denom)
  drawStatement(doc, geometry, metadata)
  drawReferenceGrid(doc, buildReferenceGrid(metadata))
```

- [ ] **Step 4: Verify pass**

Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns=diagramPdf`
Expected: PASS (all diagramPdf tests) — valid `%PDF-`, no throw.

- [ ] **Step 5: Visual check + commit**

Generate a real diagram to eyeball against the samples (optional local step; the controller/user does the authoritative visual comparison):
```bash
node --input-type=module -e "import('./src/services/diagramPdf.js').then(async m => { const fs=await import('fs'); const r= await m.generateDiagramPDF({ parcels:{type:'FeatureCollection',features:[{type:'Feature',properties:{id:'A',stand:'302',designation:'STAND 302 BRACKENHURST TOWNSHIP OF STAND 85 BRACKENHURST TOWNSHIP',area_m2:5019},geometry:{type:'Polygon',coordinates:[[[0,0],[0,60],[80,60],[80,0],[0,0]]]}}]}, beacons:{type:'FeatureCollection',features:[]}, metadata:{subjectParcelId:'A',designation:'STAND 302 BRACKENHURST',district:'Gwelo',srNo:'118/2023',fileNo:'8/2916',centralMeridian:29}, projection:'EPSG:22289', scale:'auto', sheetSize:'A4' }, {info(){},warn(){},error(){}}); fs.writeFileSync('/tmp/diagram-sample.pdf', r.pdfBuffer); console.log('wrote /tmp/diagram-sample.pdf', r.scale); })"
```
```bash
git add app-backend/src/services/diagramPdf.js
git commit -m "feat(diagram-2b): scale bar + figure statement + reference grid"
```

---

### Task 9: Route dispatch — /vector renders Diagram via generateDiagramPDF

**Files:**
- Modify: `app-backend/src/routes/geopdf-vector.js`

**Interfaces:**
- Consumes: `generateDiagramPDF` (Tasks 6–8).
- Produces: `POST /api/geopdf/vector` with `planType==='diagram'` returns the diagram PDF; all other plan types are unchanged.

- [ ] **Step 1: Add the dispatch branch**

In `geopdf-vector.js`, inside the `/vector` handler, at the start of the `if (renderEngine === 'pdfkit') {` block (right after the log line at ~`:461`), add:
```js
        if (planType === 'diagram') {
          fastify.log.info('[GeoPDF] 📐 Diagram plan type → single-stand Diagram renderer')
          const { generateDiagramPDF } = await import('../services/diagramPdf.js')
          const diagram = await generateDiagramPDF(
            { parcels: parcelsWithComputedData, beacons, metadata, projection,
              scale, sheetSize: 'A4', orientation: 'portrait' },
            fastify.log
          )
          const ts = Date.now()
          reply
            .type('application/pdf')
            .headers({
              'Content-Disposition': `attachment; filename="diagram-${ts}.pdf"`,
              'X-Used-Scale': diagram.scale,
              'X-Used-Sheet-Size': diagram.sheetSize,
            })
            .send(diagram.pdfBuffer)
          return
        }
```
> `parcelsWithComputedData`, `beacons`, `metadata`, `projection`, `scale`, `planType` are already in scope in this handler (used by the existing `generatePDFKitGeoPDF` call just below). Confirm by reading the surrounding code before inserting.

- [ ] **Step 2: Syntax check**

Run (from `app-backend/`): `node --check src/routes/geopdf-vector.js`
Expected: no output (valid).

- [ ] **Step 3: Backend suite for the diagram modules**

Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns="diagram"`
Expected: PASS — subjectGeometry, sidesTable, referenceGrid, diagramScale, diagramPdf.

- [ ] **Step 4: Manual end-to-end (deferred to controller/user)**

With backend + frontend running: pick Plan Type = **Diagram**, click a stand, Generate. Confirm a diagram PDF downloads (inside the ZIP) and visually matches the samples' structure. Note this as deferred in your report if the servers aren't running in your shell.

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/routes/geopdf-vector.js
git commit -m "feat(diagram-2b): route dispatch — render Diagram plan type via diagramPdf"
```

---

## Self-Review

**Spec coverage:**
- Separate `diagramPdf.js` module, no GP renderer changes → Tasks 6–8. ✓
- Route dispatch on `planType==='diagram'` → Task 9. ✓
- Shell un-filters neighbours + carries `subjectParcelId` → Task 1. ✓
- Top sides/directions/coordinates table (Const 0.00, full coords, Lo NN°, blank S.G. No. box) → Task 3 + Task 7. ✓
- Figure: subject lettered vertices + edge distances; neighbours faint + stand numbers → Task 6. ✓
- Beacon description, north arrow, approval box → Task 7. ✓
- Scale bar + "Scale 1 : N"; "figure represents…" statement; reference grid from 2a metadata (blanks where empty) → Task 8. ✓
- A4 portrait, auto scale from SI 727 ladder, single sheet → Task 5. ✓
- Error handling: subject-not-found throws; <3 vertices tolerated (ring drawing guards `length<3`); missing metadata → blank cells → Tasks 4, 6. ✓
- Testing: pure-helper unit tests (Tasks 2–5), integration `%PDF` (Tasks 6–8), frontend payload test (Task 1), manual visual (Task 8/9). ✓
- Non-goals respected: no DXF, no named roads / connection lines, no tiling, no GP changes. ✓

**Placeholder scan:** No TBD/TODO. The pdfkit drawing coordinates are concrete (explicit pt regions); exact visual fidelity vs the samples is achieved by the manual visual step (Task 8 Step 5 / Task 9 Step 4) — this is the nature of PDF layout, not a placeholder. Two "verify the helper's output shape when wiring" notes (`resolveLoSystem`, in-scope route vars) are real integration checks, each with a concrete fallback instruction.

**Type consistency:** `deriveSubjectGeometry`→`{vertices,sides,area}` consumed by `buildSidesTable`/`buildFigureRepresents` (Task 3) and `diagramPdf` (Task 6). `parcelExtent`/`pickDiagramScale`/`makeTransform` (Task 5) consumed by `diagramPdf` (Task 6). `buildReferenceGrid` (Task 4) consumed in Task 8. `generateDiagramPDF(options,logger)→{pdfBuffer,scale,sheetSize}` produced in Task 6, extended in 7–8, consumed in Task 9. `metadata.subjectParcelId` set in Task 1, read in Task 6. Consistent throughout.

**Note on visual fidelity:** the pt coordinates in Tasks 6–8 produce a correctly-structured, data-correct A4 diagram but are a first pass; matching the samples' exact spacing/fonts is expected to need a round of manual visual adjustment (framed as the authoritative acceptance in Task 8/9), not additional tasks.
