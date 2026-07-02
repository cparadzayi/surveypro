# Diagram SI 727 Line Styling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Style the S.G. Diagram per SI 727 — the subject boundary as continuous black lines with a uniform green inner-border band, and contiguous (neighbour) boundaries as broken black lines.

**Architecture:** A new pure helper `diagram/offsetPolygon.js` offsets the subject polygon inward in PDF-point space (`clipper-lib`). `diagramPdf.js` fills the ring between the boundary and that inward offset with green (even-odd rule) to make the inner band, draws the boundary black, and switches neighbour strokes to dashed black.

**Tech Stack:** Node ESM + pdfkit + clipper-lib + Jest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-02-diagram-si727-line-styling-design.md`.
- Diagram plan type only (`diagramPdf.js` + `diagram/*`). No General/Working/DXF change.
- `FIGURE_GREEN = '#2f9e4f'`; `INNER_BAND_PT = 1.3 * (72 / 25.4)` (≈ 3.69 pt); subject boundary `#000000` width `1.2` pt; neighbour boundary `#000000` width `0.5` pt dashed `dash(2, { space: 2 })`.
- **Roads = burnt sienna / servitudes = blue are DEFERRED** (no per-feature typing in the data). Do not implement them.
- Draw order (subject): green band → black boundary → beacon circles → labels.
- Graceful degrade: if the inward offset collapses (figure too small), skip the band, still draw the black boundary.
- Backend Jest from `app-backend/`: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns=<pat>`.

---

### Task 1: `offsetPolygon.js` — inward polygon offset in point space

**Files:**
- Create: `app-backend/src/services/diagram/offsetPolygon.js`
- Test: `app-backend/src/services/diagram/__tests__/offsetPolygon.test.js`

**Interfaces:**
- Consumes: `clipper-lib`.
- Produces: `offsetPolygonPt(points, deltaPt) => Array<Array<[x, y]>>` — offsets the polygon `[[x,y],…]` by `deltaPt` points (negative = inward); returns offset ring(s) as `[[x,y],…]`; `[]` when the polygon has < 3 points or an inward offset collapses it. Orientation-robust (negative delta always shrinks).

- [ ] **Step 1: Write the failing test**

Create `app-backend/src/services/diagram/__tests__/offsetPolygon.test.js`:
```js
import { describe, test, expect } from '@jest/globals'
import { offsetPolygonPt } from '../offsetPolygon.js'

const square = [[0, 0], [100, 0], [100, 100], [0, 100]] // 100pt square

describe('offsetPolygonPt', () => {
  test('inward offset shrinks the bbox by the inset on every side', () => {
    const inner = offsetPolygonPt(square, -10)
    expect(inner.length).toBeGreaterThan(0)
    const xs = inner[0].map(p => p[0]); const ys = inner[0].map(p => p[1])
    expect(Math.abs(Math.min(...xs) - 10)).toBeLessThan(0.5)
    expect(Math.abs(Math.max(...xs) - 90)).toBeLessThan(0.5)
    expect(Math.abs(Math.min(...ys) - 10)).toBeLessThan(0.5)
    expect(Math.abs(Math.max(...ys) - 90)).toBeLessThan(0.5)
  })

  test('reversed winding still shrinks on an inward offset', () => {
    const reversed = square.slice().reverse()
    const inner = offsetPolygonPt(reversed, -10)
    expect(inner.length).toBeGreaterThan(0)
    const xs = inner[0].map(p => p[0])
    expect(Math.abs(Math.min(...xs) - 10)).toBeLessThan(0.5)
    expect(Math.abs(Math.max(...xs) - 90)).toBeLessThan(0.5)
  })

  test('an inward offset that collapses the polygon returns []', () => {
    expect(offsetPolygonPt(square, -60)).toEqual([])
  })

  test('a degenerate polygon returns []', () => {
    expect(offsetPolygonPt([[0, 0], [1, 1]], -1)).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run (from `app-backend/`): `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns=offsetPolygon`
Expected: FAIL — cannot find module `../offsetPolygon.js`.

- [ ] **Step 3: Implement**

Create `app-backend/src/services/diagram/offsetPolygon.js`:
```js
import ClipperLib from 'clipper-lib'

const PT_SCALE = 100 // points → integer (0.01 pt precision)

/**
 * Planar polygon offset in an arbitrary coordinate space (used here in PDF
 * points). `points` is [[x,y], …]; `deltaPt` negative = inward. Returns the
 * offset ring(s) as [[x,y], …]; [] for a degenerate polygon or an inward offset
 * that collapses it. Orientation-robust: a negative delta always shrinks.
 */
export function offsetPolygonPt(points, deltaPt) {
  const path = (points ?? []).map(([x, y]) => ({ X: Math.round(x * PT_SCALE), Y: Math.round(y * PT_SCALE) }))
  if (path.length < 3) return []

  const run = (p) => {
    const co = new ClipperLib.ClipperOffset(2, 0.25 * PT_SCALE)
    co.AddPath(p, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon)
    const sol = new ClipperLib.Paths()
    co.Execute(sol, deltaPt * PT_SCALE)
    return sol
  }
  const areaOf = (s) => s.reduce((a, p) => a + Math.abs(ClipperLib.Clipper.Area(p)), 0)

  const inArea = Math.abs(ClipperLib.Clipper.Area(path))
  let sol = run(path)
  const grew = sol.length > 0 && areaOf(sol) > inArea
  const shrank = sol.length > 0 && areaOf(sol) < inArea
  // Negative delta must shrink, positive must grow — retry reversed if the
  // input winding made it behave the opposite way.
  if ((deltaPt < 0 && grew) || (deltaPt > 0 && shrank)) {
    sol = run(path.slice().reverse())
  }
  return sol.map((p) => p.map((pt) => [pt.X / PT_SCALE, pt.Y / PT_SCALE]))
}
```

- [ ] **Step 4: Verify pass**

Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns=offsetPolygon`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/diagram/offsetPolygon.js app-backend/src/services/diagram/__tests__/offsetPolygon.test.js
git commit -m "feat(diagram): inward polygon offset helper (point space, clipper-lib)"
```

---

### Task 2: `diagramPdf.js` — black boundary + green inner band + dashed neighbours

**Files:**
- Modify: `app-backend/src/services/diagramPdf.js`

**Interfaces:**
- Consumes: `offsetPolygonPt` (Task 1). Existing in-file: `drawRing`, `subjPt`, `beaconRadiusPt`, the neighbour loop.
- Produces: `generateDiagramPDF` unchanged signature/return; the subject figure now renders with a black boundary + green inner band, and neighbour boundaries render dashed black.

**Context:** `.vue`-style caveat: colours/dashes aren't assertable from the PDF binary, so the check is the existing valid-PDF integration tests + the manual visual step. `subjPt` is the array of subject vertex points `{px, py}` in draw order.

- [ ] **Step 1: Add constants + import**

After the existing `import { computeDiagramLayout, pageDimsPt, marginsPt } from './diagram/diagramLayout.js'` line, add:
```js
import { offsetPolygonPt } from './diagram/offsetPolygon.js'
```
After the `const A4 = …` / near the other module constants at the top of the file, add:
```js
// SI 727 figure styling.
const FIGURE_GREEN = '#2f9e4f'                 // uniform green inner-border tint (from the sample)
const INNER_BAND_PT = 1.3 * (72 / 25.4)        // ≈ 3.69 pt (~1.3 mm), page-relative band width
```

- [ ] **Step 2: Neighbour boundaries → dashed black**

In the neighbour loop, change the stroke setup line:
```js
      doc.save().lineWidth(0.5).strokeColor('#999999')
```
to:
```js
      doc.save().dash(2, { space: 2 }).lineWidth(0.5).strokeColor('#000000')
```
and change the closing stroke line:
```js
      doc.stroke().restore()
```
to:
```js
      doc.stroke().undash().restore()
```

- [ ] **Step 3: Subject → green band under a black boundary**

Replace the single line:
```js
  drawRing(doc, subjPt, { color: '#0a7d34', width: 1.5 })
```
with:
```js
  // Green inner figure-border band: fill the ring between the boundary and an
  // inward offset (even-odd rule) so only a ~1.3 mm band inside the edge is tinted.
  const inner = offsetPolygonPt(subjPt.map((p) => [p.px, p.py]), -INNER_BAND_PT)
  if (inner.length) {
    doc.save().fillColor(FIGURE_GREEN)
    doc.moveTo(subjPt[0].px, subjPt[0].py)
    for (let i = 1; i < subjPt.length; i++) doc.lineTo(subjPt[i].px, subjPt[i].py)
    doc.closePath()
    for (const ring of inner) {
      doc.moveTo(ring[0][0], ring[0][1])
      for (let i = 1; i < ring.length; i++) doc.lineTo(ring[i][0], ring[i][1])
      doc.closePath()
    }
    doc.fill('even-odd')
    doc.restore()
  }
  // Continuous, well-defined black boundary on top of the band.
  drawRing(doc, subjPt, { color: '#000000', width: 1.2 })
```
> `doc.fill('even-odd')` uses the current `fillColor` (set to `FIGURE_GREEN`) and the even-odd winding rule, painting only the ring (outer boundary minus the inner offset). The beacon-circle block that follows already draws on top — leave it unchanged.

- [ ] **Step 4: Verify the diagram suite still passes**

Run (from `app-backend/`): `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns="diagram"`
Expected: PASS (all diagram suites — offsetPolygon + the existing ones; diagramPdf still emits a valid `%PDF-`).

- [ ] **Step 5: Manual visual check + commit**

Regenerate a diagram with neighbours (STAND 302/303 style) and confirm: continuous black subject boundary, a green band on the inner side of it, and dashed-black contiguous boundaries — matching `Desktop/tecno 7/IMG-20260630-WA0026.jpg`. Note as deferred if servers/tools aren't running.
```bash
git add app-backend/src/services/diagramPdf.js
git commit -m "feat(diagram): black boundary + green inner border band + dashed neighbour boundaries"
```

---

## Self-Review

**Spec coverage:**
- Subject boundary continuous black → Task 2 Step 3 (`drawRing … #000000`). ✓
- Green inner-border band, page-relative width, even-odd ring fill → Task 1 (`offsetPolygonPt`) + Task 2 Step 3. ✓
- Contiguous (neighbour) boundaries broken black → Task 2 Step 2 (`dash` + `#000000`). ✓
- Roads/servitudes deferred → Global Constraints (explicitly not implemented). ✓
- Draw order green → black → beacons → labels → Task 2 Step 3 (band + boundary before the unchanged beacon/label blocks). ✓
- Graceful degrade (small figure) → Task 2 Step 3 `if (inner.length)` guard. ✓
- Constants `FIGURE_GREEN`, `INNER_BAND_PT`, widths, dash → Global Constraints + Task 2 Step 1/2/3. ✓
- Testing: pure `offsetPolygonPt` unit tests (Task 1), integration valid-PDF + manual visual (Task 2). ✓

**Placeholder scan:** No TBD/TODO. Task 2 is verified by the existing integration tests + manual visual (colours/dashes are not inspectable from the PDF binary) — stated, not a gap.

**Type consistency:** `offsetPolygonPt(points, deltaPt)` returns `Array<[x,y] ring>`; consumed in Task 2 as `inner` (iterated `ring[i][0]/[1]`). `subjPt` (`{px,py}`) mapped to `[[px,py]]` for the helper and used directly for the outer subpath. `FIGURE_GREEN`/`INNER_BAND_PT` defined in Task 2 Step 1, used in Step 3.
