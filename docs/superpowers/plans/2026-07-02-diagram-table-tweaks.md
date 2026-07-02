# Diagram Table Tweaks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Round diagram directions to the nearest 10″ (<6000 m) / 1″ (else), and add a far-right "Const." column carrying each vertex's actual beacon name (auto-matched from the beacon data), keeping the existing `Const. 0.00 0.00` row.

**Architecture:** A new pure helper `diagram/beaconName.js` resolves a vertex's beacon name from the beacons FeatureCollection by nearest-coordinate match. `diagram/sidesTable.js` rounds directions by distance (via `zim-geo.roundBearingSouth`) and adds `beaconName` to each coordinate row. `drawTable` in `diagramPdf.js` re-spaces the columns and renders the new "Const." beacon-name column.

**Tech Stack:** Node ESM + pdfkit + Jest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-02-diagram-table-tweaks-design.md`.
- Diagram plan type only (`diagram/sidesTable.js`, new `diagram/beaconName.js`, `drawTable` in `diagramPdf.js`). No General/Working/DXF change.
- Directions: banker's rounding to nearest **10″ when side distance < 6000 m**, else **1″** — via `roundBearingSouth(deg, resolutionSeconds)` from `../../utils/zim-geo.js`.
- Keep the `Const. 0.00 0.00` row. Coordinates unchanged (full, signed, 2 dp).
- Beacon names auto-resolved from `options.beacons`; blank (`''`) when no beacon matches within `tolM = 0.5` m.
- Canonical coords are `[Y=Westing, X=Southing]`; normalize beacon points via `normalizeCapeLoYX` (from `../pdfkitGeoPDF/geometry.js`).
- Backend Jest from `app-backend/`: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns=<pat>`.
- A4 layout is tight (the `DIAGRAM S.G. No.` box sits at `layout.sgNoBox.x ≈ R.x + 353`); final column spacing is a **manual-visual acceptance item**.

---

### Task 1: `beaconName.js` — resolve a vertex's beacon name

**Files:**
- Create: `app-backend/src/services/diagram/beaconName.js`
- Test: `app-backend/src/services/diagram/__tests__/beaconName.test.js`

**Interfaces:**
- Consumes: `normalizeCapeLoYX` from `../pdfkitGeoPDF/geometry.js`.
- Produces: `resolveVertexBeaconName(vertexYX, beacons, tolM = 0.5) => string` — `vertexYX` is `[y, x]` canonical metres; `beacons` is a Point FeatureCollection; returns the nearest beacon's name (`properties.name ?? properties.beacon_name ?? properties.id`, stringified) within `tolM` metres, else `''`.

- [ ] **Step 1: Write the failing test**

Create `app-backend/src/services/diagram/__tests__/beaconName.test.js`:
```js
import { describe, test, expect } from '@jest/globals'
import { resolveVertexBeaconName } from '../beaconName.js'

// Beacons stored as [Southing, Westing] (DB order) — helper normalizes.
const beacons = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: '86B' }, geometry: { type: 'Point', coordinates: [2144076.45, -85723.40] } },
    { type: 'Feature', properties: { name: 'SD1' }, geometry: { type: 'Point', coordinates: [2144164.76, -85729.94] } },
  ],
}

describe('resolveVertexBeaconName', () => {
  test('returns the name of the beacon coincident with the vertex', () => {
    // vertex in canonical [Y=Westing, X=Southing]
    expect(resolveVertexBeaconName([-85723.40, 2144076.45], beacons)).toBe('86B')
    expect(resolveVertexBeaconName([-85729.94, 2144164.76], beacons)).toBe('SD1')
  })
  test('matches within tolerance (a few cm of noise)', () => {
    expect(resolveVertexBeaconName([-85723.42, 2144076.44], beacons, 0.5)).toBe('86B')
  })
  test('returns "" when no beacon is within tolerance', () => {
    expect(resolveVertexBeaconName([-85000, 2140000], beacons, 0.5)).toBe('')
  })
  test('returns "" for empty/missing beacons', () => {
    expect(resolveVertexBeaconName([-85723.40, 2144076.45], { features: [] })).toBe('')
    expect(resolveVertexBeaconName([-85723.40, 2144076.45], null)).toBe('')
  })
  test('falls back to beacon_name then id when name is absent', () => {
    const b = { features: [
      { properties: { beacon_name: 'X9' }, geometry: { type: 'Point', coordinates: [2144076.45, -85723.40] } },
    ] }
    expect(resolveVertexBeaconName([-85723.40, 2144076.45], b)).toBe('X9')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run (from `app-backend/`): `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns=beaconName`
Expected: FAIL — cannot find module `../beaconName.js`.

- [ ] **Step 3: Implement**

Create `app-backend/src/services/diagram/beaconName.js`:
```js
import { normalizeCapeLoYX } from '../pdfkitGeoPDF/geometry.js'

/**
 * Name of the beacon coincident with a subject vertex, matched by nearest
 * coordinate within `tolM` metres. `vertexYX` is canonical [Y=Westing, X=Southing];
 * beacon points may be raw [Southing, Westing] (normalized here). Returns '' if none.
 */
export function resolveVertexBeaconName(vertexYX, beacons, tolM = 0.5) {
  const features = beacons?.features ?? []
  if (!features.length || !Array.isArray(vertexYX)) return ''
  const [vy, vx] = vertexYX
  let best = ''
  let bestDist = tolM
  for (const f of features) {
    const c = f?.geometry?.coordinates
    if (!Array.isArray(c)) continue
    const [by, bx] = normalizeCapeLoYX(c[0], c[1])
    const d = Math.hypot(by - vy, bx - vx)
    if (d <= bestDist) {
      const p = f.properties ?? {}
      const name = p.name ?? p.beacon_name ?? p.id
      best = name == null ? '' : String(name)
      bestDist = d
    }
  }
  return best
}
```

- [ ] **Step 4: Verify pass**

Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns=beaconName`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/diagram/beaconName.js app-backend/src/services/diagram/__tests__/beaconName.test.js
git commit -m "feat(diagram): resolve vertex beacon name from beacon data"
```

---

### Task 2: `sidesTable.js` — distance-based direction rounding + beaconName rows

**Files:**
- Modify: `app-backend/src/services/diagram/sidesTable.js`
- Modify: `app-backend/src/services/diagram/__tests__/sidesTable.test.js`

**Interfaces:**
- Consumes: `roundBearingSouth` from `../../utils/zim-geo.js`; `resolveVertexBeaconName` (Task 1).
- Produces: `buildSidesTable(geometry, beacons)` — `sideRows[i].direction` now rounded to 10″ (<6000 m) / 1″; `coordinateRows[i]` gains `beaconName`.

- [ ] **Step 1: Update the tests**

In `app-backend/src/services/diagram/__tests__/sidesTable.test.js`, extend the fixture and add tests. Replace the `const geometry = {…}` block with one whose vertices carry realistic coords and add a beacons object:
```js
const geometry = {
  vertices: [
    { letter: 'A', y: -85728.70, x: 2143972.14 },
    { letter: 'B', y: -85741.41, x: 2143988.59 },
    { letter: 'C', y: -85765.14, x: 2144017.16 },
  ],
  sides: [
    { side: 'AB', distance: 20.79, bearingDeg: 322.30861 }, // ≈ 322°18′31″
    { side: 'BC', distance: 37.14, bearingDeg: 320.28722 },
    { side: 'CA', distance: 5000, bearingDeg: 44.9361 },
  ],
  area: 4047,
}
const beacons = {
  type: 'FeatureCollection',
  features: [
    { properties: { name: '86B' }, geometry: { type: 'Point', coordinates: [2143972.14, -85728.70] } },
  ],
}
```
Then update the existing `side rows` test and add new ones:
```js
describe('buildSidesTable', () => {
  test('const row is 0.00 / 0.00', () => {
    expect(buildSidesTable(geometry, beacons).constRow).toEqual({ y: '0.00', x: '0.00' })
  })
  test('coordinate rows carry full signed coords to 2dp', () => {
    const t = buildSidesTable(geometry, beacons)
    expect(t.coordinateRows[0]).toMatchObject({ letter: 'A', y: '-85728.70', x: '+2143972.14' })
  })
  test('directions round to nearest 10 seconds when distance < 6000 m', () => {
    const t = buildSidesTable(geometry, beacons)
    // AB 322°18′31″ → 322 18 30 (nearest 10″, banker's)
    expect(t.sideRows[0].direction).toBe('322 18 30')
  })
  test('coordinate rows carry the matched beacon name (blank when none)', () => {
    const t = buildSidesTable(geometry, beacons)
    expect(t.coordinateRows[0].beaconName).toBe('86B')
    expect(t.coordinateRows[1].beaconName).toBe('')
  })
})
```
Keep the existing `toDMS`, `formatDiagramArea`, and `buildFigureRepresents` describe blocks unchanged.

- [ ] **Step 2: Run to verify failure**

Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns=sidesTable`
Expected: FAIL — `direction` is `322 18 31` (1″ rounding) and `beaconName` is undefined.

- [ ] **Step 3: Implement**

In `app-backend/src/services/diagram/sidesTable.js`, update the imports and `buildSidesTable`:
```js
import { bankersRound, roundBearingSouth } from '../../utils/zim-geo.js'
import { resolveVertexBeaconName } from './beaconName.js'
```
Replace the whole `buildSidesTable` function with:
```js
export function buildSidesTable(geometry, beacons) {
  const constRow = { y: '0.00', x: '0.00' }
  const coordinateRows = geometry.vertices.map(v => ({
    letter: v.letter,
    y: signed(v.y),
    x: signed(v.x),
    beaconName: resolveVertexBeaconName([v.y, v.x], beacons),
  }))
  const sideRows = geometry.sides.map(s => {
    // SI 727: nearest 10″ for sights under 6000 m, else nearest 1″ (banker's).
    const res = Number(s.distance) < 6000 ? 10 : 1
    const { d, m, s: sec } = toDMS(roundBearingSouth(s.bearingDeg, res))
    return {
      side: s.side,
      metres: Number(s.distance).toFixed(2),
      direction: `${d} ${pad2(m)} ${pad2(sec)}`,
    }
  })
  return { constRow, coordinateRows, sideRows }
}
```
> `toDMS`, `formatDiagramArea`, `signed`, `pad2`, `buildFigureRepresents` are unchanged. `roundBearingSouth` returns a south-oriented degree already rounded to the resolution; `toDMS` then formats it (its 1″ banker's rounding is a no-op on the rounded value).

- [ ] **Step 4: Verify pass**

Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns=sidesTable`
Expected: PASS (all sidesTable tests).

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/diagram/sidesTable.js app-backend/src/services/diagram/__tests__/sidesTable.test.js
git commit -m "feat(diagram): distance-based direction rounding + beacon-name coordinate rows"
```

---

### Task 3: `drawTable` — pass beacons, re-space columns, add "Const." beacon-name column

**Files:**
- Modify: `app-backend/src/services/diagramPdf.js`

**Interfaces:**
- Consumes: `buildSidesTable(geometry, beacons)` (Task 2) — `coordinateRows[i].beaconName`.
- Produces: the diagram table with a far-right "Const." beacon-name column; `Const. 0.00 0.00` row retained.

**Context:** `drawTable(doc, layout, table, loLabel)` currently draws columns at `R.x` offsets `0/30/90/190/245/320` with the S.G.-No. box at `layout.sgNoBox.x`. The caller builds the table via `buildSidesTable(geometry)`.

- [ ] **Step 1: Pass beacons into the table model**

Find the `drawTable(doc, layout, buildSidesTable(geometry), loLabel)` call in `generateDiagramPDF` and change it to:
```js
  drawTable(doc, layout, buildSidesTable(geometry, options.beacons), loLabel)
```

- [ ] **Step 2: Replace `drawTable` with the re-spaced 7-column layout**

Replace the entire `drawTable` function with:
```js
function drawTable(doc, layout, table, loLabel) {
  const { constRow, coordinateRows, sideRows } = table
  const R = layout.table
  // Column x-offsets (from R.x). Compressed so the beacon-name "Const." column
  // sits left of the DIAGRAM S.G. No. box on A4 (sgNoBox.x ≈ R.x + 353).
  const cSide = 0, cMetres = 28, cDir = 76, cLetter = 158, cY = 198, cX = 260, cConst = 330
  doc.save().font('Helvetica-Bold').fontSize(7).fillColor('#000')
  doc.text('SIDES', R.x + cSide, R.y)
  doc.text('DIRECTIONS', R.x + cDir, R.y)
  doc.text(loLabel, R.x + cLetter, R.y)
  doc.text('CO-ORDINATES', R.x + cY, R.y)
  doc.text('Const.', R.x + cConst, R.y)
  doc.text('DIAGRAM S.G. No.', layout.sgNoBox.x, R.y)
  doc.font('Helvetica').fontSize(6.5)
  doc.text('Metres', R.x + cSide, R.y + 10)
  doc.text('°  \'  "', R.x + cDir, R.y + 10)
  doc.text('Y', R.x + cY, R.y + 10)
  doc.text('X', R.x + cX, R.y + 10)
  // Const. 0.00/0.00 row (retained)
  let ry = R.y + 22
  doc.text('Const.', R.x + cLetter, ry)
  doc.text(constRow.y, R.x + cY, ry)
  doc.text(constRow.x, R.x + cX, ry)
  // Coordinate rows + side rows in parallel
  const rows = Math.max(coordinateRows.length, sideRows.length)
  for (let i = 0; i < rows; i++) {
    ry += 11
    if (sideRows[i]) {
      doc.text(sideRows[i].side, R.x + cSide, ry)
      doc.text(sideRows[i].metres, R.x + cMetres, ry)
      doc.text(sideRows[i].direction, R.x + cDir, ry)
    }
    if (coordinateRows[i]) {
      doc.text(coordinateRows[i].letter, R.x + cLetter, ry)
      doc.text(coordinateRows[i].y, R.x + cY, ry)
      doc.text(coordinateRows[i].x, R.x + cX, ry)
      doc.text(coordinateRows[i].beaconName ?? '', R.x + cConst, ry)
    }
  }
  // SG No. box outline (blank)
  doc.rect(layout.sgNoBox.x, layout.sgNoBox.y + 10, layout.sgNoBox.width, layout.sgNoBox.height).stroke()
  doc.restore()
}
```

- [ ] **Step 3: Verify the diagram suite still passes**

Run (from `app-backend/`): `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns="diagram"`
Expected: PASS (all diagram suites; diagramPdf still emits a valid `%PDF-`).

- [ ] **Step 4: Manual visual check (tune A4 spacing) + commit**

Regenerate the STANDS 403-405 diagram. Confirm: directions to 10″ (`322 18 30`, `320 17 10`, `50 05 40`, `134 57 10`, `224 56 30`), a right-hand `Const.` column reading `86B / 87B / SD1 / SD5 / SD4`, the `Const. 0.00 0.00` row retained, and **no collision** between the `Const.` column and the `DIAGRAM S.G. No.` box on A4 (and A3). If the `Const.` header/values crowd the S.G.-No. box on A4, reduce the coordinate-column font to 6 pt or nudge `cX`/`cConst` left, and re-check. Note as deferred if tools aren't running in your shell.
```bash
git add app-backend/src/services/diagramPdf.js
git commit -m "feat(diagram): Const. beacon-name column + re-spaced coordinate table"
```

---

## Self-Review

**Spec coverage:**
- Directions 10″/1″ by distance, banker's → Task 2 (`roundBearingSouth(deg, dist<6000?10:1)`). ✓
- Beacon names auto from data, blank when none → Task 1 (`resolveVertexBeaconName`) + Task 2 (`coordinateRows[].beaconName`). ✓
- Far-right "Const." column + retained `Const. 0.00 0.00` row → Task 3 (`cConst` column + retained const row). ✓
- A4 layout fit (left of S.G.-No. box), visual acceptance → Task 3 Step 4. ✓
- Diagram-only; coords unchanged → Global Constraints + Task 2 (coordinateRows y/x unchanged). ✓
- Testing: pure unit tests (Tasks 1–2), integration valid-PDF + manual visual (Task 3). ✓

**Placeholder scan:** No TBD/TODO. Task 3's A4 spacing is an explicit visual-tuning step with concrete fallback instructions (font 6 pt / nudge left), not a placeholder — colours/positions aren't assertable from the PDF binary.

**Type consistency:** `resolveVertexBeaconName(vertexYX, beacons, tolM)` (Task 1) is consumed by `buildSidesTable(geometry, beacons)` (Task 2). `buildSidesTable`'s new second arg `beacons` and `coordinateRows[i].beaconName` (Task 2) are consumed by `drawTable` (Task 3) via `options.beacons` and `coordinateRows[i].beaconName ?? ''`. `roundBearingSouth` name matches the `zim-geo` export used elsewhere.
