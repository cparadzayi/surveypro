# Diagram Adjoining Features Renderer Implementation Plan (Sub-project A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render adjoining features (contiguous parcels, roads, servitudes) on the diagram from a per-side `metadata.sideAnnotations` contract — burnt-sienna road strips, blue servitude strips of a defined ground width, and dashed contiguous stubs with designation labels.

**Architecture:** A new pure helper `diagram/edgeStrip.js` builds the outward strip quad for a boundary edge. `diagramPdf.js` gains constants + a `drawAdjoiningFeatures` function that resolves each annotation's side letters to a subject edge and draws the strip/stub + places its label, called from `generateDiagramPDF` after the subject figure and before the vertex-label pass.

**Tech Stack:** Node ESM, PDFKit, Jest.

## Global Constraints

- Diagram plan type only (`diagramPdf.js` + `diagram/edgeStrip.js`). No frontend, no DXF.
- Data contract: `metadata.sideAnnotations: { side, role, label?, widthM? }[]`. Absent/empty → nothing new drawn (backward compatible).
- `role` ∈ `contiguous | road | servitude`.
- Colours: `BURNT_SIENNA = '#B7410E'`, `SERVITUDE_BLUE = '#1F6FB2'` (final shade = visual-acceptance item).
- Widths: road = `ROAD_STRIP_PT = 1.3 * PT_PER_MM` (nominal, like the green inner band); servitude = `widthM * ptPerGroundM` where `ptPerGroundM = (72/25.4) * 1000 / denom` (ground metres → page points, same factor the scale bar uses).
- `STRIP_FILL_OPACITY = 0.6` (colour must not obscure detail); `CONTIG_STUB_PT = 6 * PT_PER_MM`.
- "Outward" = the edge-normal direction that moves the edge midpoint **away** from the figure centroid.
- Every fill/dash wrapped in `doc.save()/restore()` so opacity/dash never leak.
- Unmatched `side` and `servitude` without `widthM` are skipped with `logger.warn`, never throw.
- Backend Jest runs via `node --experimental-vm-modules node_modules/jest/bin/jest.js <pattern>` from `app-backend/`.

---

### Task 1: `edgeStrip` pure helper

**Files:**
- Create: `app-backend/src/services/diagram/edgeStrip.js`
- Test: `app-backend/src/services/diagram/__tests__/edgeStrip.test.js`

**Interfaces:**
- Produces: `edgeStrip(p1, p2, widthPt, centroid) → [[x,y], [x,y], [x,y], [x,y]]` where `p1,p2,centroid` are `[x,y]`. Returns the quad `[p1, p2, p2+outward·w, p1+outward·w]`; "outward" is the edge normal pointing away from `centroid`.

- [ ] **Step 1: Write the failing test**

Create `app-backend/src/services/diagram/__tests__/edgeStrip.test.js`:

```js
import { describe, test, expect } from '@jest/globals'
import { edgeStrip } from '../edgeStrip.js'

describe('edgeStrip', () => {
  test('horizontal edge offsets outward, away from the centroid', () => {
    // edge (0,0)→(10,0); centroid below at (5,5) → outward is -y.
    const q = edgeStrip([0, 0], [10, 0], 4, [5, 5])
    expect(q[0]).toEqual([0, 0])
    expect(q[1]).toEqual([10, 0])
    expect(q[2][0]).toBeCloseTo(10, 6); expect(q[2][1]).toBeCloseTo(-4, 6)
    expect(q[3][0]).toBeCloseTo(0, 6);  expect(q[3][1]).toBeCloseTo(-4, 6)
  })

  test('flips to the other side when the centroid is on the other side', () => {
    // centroid above at (5,-5) → outward is +y.
    const q = edgeStrip([0, 0], [10, 0], 4, [5, -5])
    expect(q[2][1]).toBeCloseTo(4, 6)
    expect(q[3][1]).toBeCloseTo(4, 6)
  })

  test('vertical edge offsets in x', () => {
    // edge (0,0)→(0,10); centroid to the right (5,5) → outward is -x.
    const q = edgeStrip([0, 0], [0, 10], 3, [5, 5])
    expect(q[2][0]).toBeCloseTo(-3, 6)
    expect(q[3][0]).toBeCloseTo(-3, 6)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js edgeStrip`
Expected: FAIL — `edgeStrip` is not defined (module missing).

- [ ] **Step 3: Implement `edgeStrip.js`**

Create `app-backend/src/services/diagram/edgeStrip.js`:

```js
/**
 * Outward strip quad for a boundary edge, in PDF-point space.
 *
 * Given edge p1→p2 and the figure `centroid`, returns the 4-point quad formed by
 * the edge and a parallel offset by `widthPt` on the side AWAY from the centroid,
 * so road/servitude strips sit OUTSIDE the figure. All points are `[x, y]`.
 */
export function edgeStrip(p1, p2, widthPt, centroid) {
  const [x1, y1] = p1
  const [x2, y2] = p2
  const [cx, cy] = centroid
  const ex = x2 - x1
  const ey = y2 - y1
  const len = Math.hypot(ex, ey) || 1
  // Unit normal (perpendicular to the edge).
  let nx = -ey / len
  let ny = ex / len
  // Flip the normal if it points toward the centroid (we want outward).
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const towardWithN = (mx + nx - cx) ** 2 + (my + ny - cy) ** 2
  const withoutN = (mx - cx) ** 2 + (my - cy) ** 2
  if (towardWithN < withoutN) { nx = -nx; ny = -ny }
  return [
    [x1, y1],
    [x2, y2],
    [x2 + nx * widthPt, y2 + ny * widthPt],
    [x1 + nx * widthPt, y1 + ny * widthPt],
  ]
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js edgeStrip`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/diagram/edgeStrip.js app-backend/src/services/diagram/__tests__/edgeStrip.test.js
git commit -m "feat(diagram): edgeStrip helper — outward strip quad for a boundary edge"
```

---

### Task 2: Render adjoining features in `diagramPdf.js`

**Files:**
- Modify: `app-backend/src/services/diagramPdf.js` (imports ~1-13; constants ~16-18; new `drawAdjoiningFeatures` function; call site in `generateDiagramPDF` just before the vertex-label loop ~line 395)
- Test: `app-backend/src/services/__tests__/diagramPdf.test.js`

**Interfaces:**
- Consumes: `edgeStrip` (Task 1); `placeVertexLabel(anchor, centroid, opts)` (existing); `generateDiagramPDF` locals `geometry`, `subjPt` (`{px,py}[]`), `subjCentroid` (`{px,py}`), `subjSegs`, `neighbourSegs`, `denom`, `labelObstacles`, `boxToSegs`.
- Produces: `metadata.sideAnnotations` rendered.

- [ ] **Step 1: Write the failing test**

In `app-backend/src/services/__tests__/diagramPdf.test.js`, add inside the `describe('generateDiagramPDF', …)` block:

```js
  test('renders adjoining-feature annotations (road/servitude/contiguous), skipping unmatched sides', async () => {
    const withAdjoining = {
      ...options,
      metadata: {
        ...options.metadata,
        sideAnnotations: [
          { side: 'AB', role: 'road', label: 'Klein Road' },
          { side: 'BC', role: 'servitude', label: 'Water servitude', widthM: 3 },
          { side: 'CD', role: 'contiguous', label: 'STAND 303 BRACKENHURST' },
          { side: 'ZZ', role: 'road', label: 'nowhere' }, // no such edge → skipped, no throw
        ],
      },
    }
    const r = await generateDiagramPDF(withAdjoining, logger)
    expect(r.pdfBuffer.slice(0, 5).toString()).toBe('%PDF-')
    expect(r.pdfBuffer.length).toBeGreaterThan(2000)
  })

  test('is unchanged when sideAnnotations is absent (backward compatible)', async () => {
    const r = await generateDiagramPDF(options, logger)
    expect(r.pdfBuffer.slice(0, 5).toString()).toBe('%PDF-')
  })
```

- [ ] **Step 2: Run the tests to verify the new one fails as designed**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js diagramPdf`
Expected: the two new tests **pass trivially today** (annotations are ignored — nothing throws). That is fine: the behavioural assertion (that strips are actually drawn) is a manual visual check; these tests are regression guards that annotations never break generation. Proceed to implement so the render actually happens.

(If you prefer a failing assertion first: temporarily add `expect(r.pdfBuffer.length).toBeGreaterThan(999999)` to see it fail, then remove it. Not required.)

- [ ] **Step 3: Add the imports and constants**

In `app-backend/src/services/diagramPdf.js`, add the `edgeStrip` import next to the other `./diagram/*` imports (near line 8-10):

```js
import { edgeStrip } from './diagram/edgeStrip.js'
```

Replace the existing constant block (the `FIGURE_GREEN` / `INNER_BAND_PT` lines, ~16-18) with:

```js
// SI 727 figure styling.
const PT_PER_MM = 72 / 25.4
const FIGURE_GREEN = '#2f9e4f'                 // uniform green inner-border tint (from the sample)
const INNER_BAND_PT = 1.3 * PT_PER_MM          // ≈ 3.69 pt (~1.3 mm), page-relative band width
// Adjoining features (SI 727): roads burnt-sienna, servitudes blue, contiguous dashed.
const BURNT_SIENNA = '#B7410E'
const SERVITUDE_BLUE = '#1F6FB2'
const ROAD_STRIP_PT = 1.3 * PT_PER_MM          // nominal, like the inner band
const STRIP_FILL_OPACITY = 0.6                 // colour must not obscure detail
const CONTIG_STUB_PT = 6 * PT_PER_MM
```

(If `FIGURE_GREEN`/`INNER_BAND_PT` are defined with slightly different comments in your tree, keep their values `#2f9e4f` and `1.3 * PT_PER_MM` and just add the new constants + `PT_PER_MM`.)

- [ ] **Step 4: Add the `drawAdjoiningFeatures` function**

Add this module-level function (place it just above `function drawNorthArrow` or anywhere among the other `draw*` helpers in `diagramPdf.js`):

```js
/**
 * Draw adjoining features from metadata.sideAnnotations: burnt-sienna road strips,
 * blue servitude strips (of a defined ground width), and dashed contiguous stubs,
 * each labelled outside the edge. Strips sit OUTSIDE the subject edge (via edgeStrip).
 */
function drawAdjoiningFeatures(doc, ctx, logger) {
  const {
    annotations, geometry, subjPt, subjCentroid, subjSegs, neighbourSegs,
    denom, labelObstacles, boxToSegs,
  } = ctx
  if (!Array.isArray(annotations) || annotations.length === 0) return
  const n = geometry.vertices.length
  const ptPerGroundM = PT_PER_MM * 1000 / denom
  const cen = [subjCentroid.px, subjCentroid.py]

  for (const ann of annotations) {
    if (!ann || !ann.side || !ann.role) continue
    // Resolve the side letters (e.g. 'AB') to a subject edge index.
    let i = -1
    for (let k = 0; k < n; k++) {
      const s = geometry.vertices[k].letter + geometry.vertices[(k + 1) % n].letter
      if (s === ann.side) { i = k; break }
    }
    if (i < 0) { logger?.warn?.(`[Diagram] adjoining: side ${ann.side} not found`); continue }

    const p1 = subjPt[i]
    const p2 = subjPt[(i + 1) % n]
    const a = [p1.px, p1.py]
    const b = [p2.px, p2.py]
    const mid = { px: (p1.px + p2.px) / 2, py: (p1.py + p2.py) / 2 }

    if (ann.role === 'road' || ann.role === 'servitude') {
      let widthPt = ROAD_STRIP_PT
      if (ann.role === 'servitude') {
        if (!(ann.widthM > 0)) {
          logger?.warn?.(`[Diagram] servitude ${ann.side} has no widthM; drawing label only`)
          widthPt = 0
        } else {
          widthPt = ann.widthM * ptPerGroundM
        }
      }
      if (widthPt > 0) {
        const q = edgeStrip(a, b, widthPt, cen)
        doc.save()
          .fillColor(ann.role === 'road' ? BURNT_SIENNA : SERVITUDE_BLUE)
          .fillOpacity(STRIP_FILL_OPACITY)
        doc.moveTo(q[0][0], q[0][1])
        for (let k = 1; k < q.length; k++) doc.lineTo(q[k][0], q[k][1])
        doc.closePath().fill()
        doc.restore()
      }
    } else if (ann.role === 'contiguous') {
      // Short dashed outward stubs at each endpoint to hint the neighbour continues.
      const st = edgeStrip(a, b, CONTIG_STUB_PT, cen) // st[3]=a+out, st[2]=b+out
      doc.save().dash(3, { space: 2 }).lineWidth(0.6).strokeColor('#000000')
      doc.moveTo(a[0], a[1]).lineTo(st[3][0], st[3][1]).stroke()
      doc.moveTo(b[0], b[1]).lineTo(st[2][0], st[2][1]).stroke()
      doc.undash().restore()
    }

    // Label the feature outside the edge, avoiding drawn lines and placed labels.
    if (ann.label) {
      doc.save().font('Helvetica').fontSize(7).fillColor('#000000')
      const labelW = doc.widthOfString(ann.label)
      const pos = placeVertexLabel(mid, subjCentroid, {
        beaconR: 0, gap: 2, labelW, labelH: 7,
        segments: subjSegs.concat(neighbourSegs, labelObstacles),
      })
      doc.text(ann.label, pos.x, pos.y)
      labelObstacles.push(...boxToSegs({ x: pos.x, y: pos.y, w: labelW, h: 7 }))
      doc.restore()
    }
  }
}
```

- [ ] **Step 5: Call it from `generateDiagramPDF`**

In `generateDiagramPDF`, insert the call **immediately before** the vertex-label loop
`geometry.vertices.forEach((v, i) => {` (i.e. after `boxToSegs` is defined and before
any labels are placed):

```js
  // Adjoining features (roads/servitudes/contiguous) from metadata.sideAnnotations —
  // drawn outside the figure, before labels so their designations become obstacles.
  drawAdjoiningFeatures(doc, {
    annotations: metadata.sideAnnotations,
    geometry, subjPt, subjCentroid, subjSegs, neighbourSegs, denom, labelObstacles, boxToSegs,
  }, logger)

  geometry.vertices.forEach((v, i) => {
```

- [ ] **Step 6: Run the diagram tests to verify they pass**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js diagramPdf`
Expected: PASS — all `generateDiagramPDF` tests green, including the two new ones; no throw.

- [ ] **Step 7: Manual visual acceptance (controller does this)**

Generate a diagram with `metadata.sideAnnotations` (one road, one servitude with `widthM`,
one contiguous) into the scratchpad and read the PDF back. Confirm: a burnt-sienna road
strip along the road side, a blue servitude strip of the right width, a dashed contiguous
stub + designation label, none obscuring the figure, labels not colliding.

- [ ] **Step 8: Commit**

```bash
git add app-backend/src/services/diagramPdf.js app-backend/src/services/__tests__/diagramPdf.test.js
git commit -m "feat(diagram): render adjoining features (road/servitude/contiguous) from sideAnnotations"
```

---

## Self-Review

**Spec coverage:**
- Data contract `metadata.sideAnnotations` → Task 2 (read + rendered; backward-compat test). ✔
- `edgeStrip` outward quad → Task 1. ✔
- Road burnt-sienna nominal strip; servitude blue `widthM·ptPerGroundM` strip; contiguous dashed stub + label → Task 2 Step 4. ✔
- Outward = away from centroid → Task 1 impl + tests. ✔
- Constants (`BURNT_SIENNA`, `SERVITUDE_BLUE`, `ROAD_STRIP_PT`, `STRIP_FILL_OPACITY`, `CONTIG_STUB_PT`) → Task 2 Step 3. ✔
- Skip unmatched side / servitude w/o `widthM`, never throw → Task 2 Step 4 + test's `'ZZ'` case. ✔
- Draw order (after subject, before labels; save/restore) → Task 2 Step 5. ✔
- Testing (edgeStrip unit; diagramPdf valid-PDF; manual visual) → Tasks 1-2 + Step 7. ✔

**Placeholder scan:** none — every code step is complete. (Colour hex + widths are concrete; final shade is an explicit visual-acceptance item, not a TODO.)

**Type consistency:** `edgeStrip(p1,p2,widthPt,centroid)` with `[x,y]` args is defined in Task 1 and called in Task 2 with `a=[p1.px,p1.py]`, `cen=[subjCentroid.px,subjCentroid.py]`. `placeVertexLabel(mid, subjCentroid, {segments,…})` matches the existing vertex/neighbour call sites. `ptPerGroundM = PT_PER_MM*1000/denom` matches the spec's scale-bar factor.

**Note:** Sub-project B (map side-classification UI producing `sideAnnotations`) is a separate spec/plan; nothing here depends on it, and the renderer degrades to a no-op without it.
