# DXF Outside-Figure Annotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Annotate the outside-figure boundary in the generated DXF with Cape Lo coordinate labels + tick marks at every vertex and distance + bearing labels at every edge midpoint, matching what `pdfkitGeoPDF.js` already draws on the production PDF.

**Architecture:** Extend `app-backend/src/services/dxfGenerator.js` in place (~1,200 → ~1,400 lines). One pure top-level helper (`computeOutsideFigureVertices`) plus three closure-scoped emitters (`addOutsideFigureVertexLabels`, `addOutsideFigureTickMarks`, `addOutsideFigureEdgeLabels`) wired into the existing OF polyline emission block. One new layer (`OUTSIDE_FIGURE_LABELS`, color 8); edge distance/bearing labels reuse the existing `DISTANCES` + `DIRECTIONS` layers so toggling the CAD layer hides parcel + OF labels together. One new warning category (`outsideFigureVertices`) joins the existing aggregator.

**Tech Stack:** Node.js / Fastify backend, Jest 30 with ESM (`--experimental-vm-modules`). DXF R12 (AC1009) unchanged. No new runtime dependencies.

**Branch:** `feature/dxf-outside-figure-annotation` (already created off main; spec committed at `4683779`).

**Spec:** [`docs/superpowers/specs/2026-06-01-dxf-outside-figure-annotation-design.md`](../specs/2026-06-01-dxf-outside-figure-annotation-design.md)

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `app-backend/src/services/dxfGenerator.js` | **modify** | Add the `OUTSIDE_FIGURE_LABELS` layer entry, add `outsideFigureVertices` to the warnings summary initialiser, add the `computeOutsideFigureVertices` top-level helper, add three closure-scoped emitters inside `generateDXF`, wire all three into the existing OF polyline block at lines 585–589. ~180 lines added. |
| `app-backend/src/services/__tests__/dxfGenerator.test.js` | **modify** | Layer 1 unit tests: `computeOutsideFigureVertices` shape + ordering + closing duplicate + non-finite filtering + skipped-count accounting. ~50 lines added. |
| `app-backend/src/services/__tests__/dxfGenerator.integration.test.js` | **modify** | Layer 2 structural integration tests: add `'OUTSIDE_FIGURE_LABELS'` to the required-layers list; add 4 new tests asserting layer declaration, vertex-label + tick counts, vertex coord text presence, edge-label counts on `DISTANCES` + `DIRECTIONS`. Add graceful-degradation regression for NaN-coord OF vertex. ~50 lines added. |
| `docs/superpowers/plans/2026-05-31-survey-plan-dxf-pdf-parity-verification-checklist.md` | **modify** | Append three new tick items + suggested screenshot filename for the manual CAD verification step. ~10 lines added. |

No new files created; no frontend changes; no route changes; no TypeScript surface changes.

---

## Task 1: Add `OUTSIDE_FIGURE_LABELS` layer + `outsideFigureVertices` warning category

**Files:**
- Modify: `app-backend/src/services/dxfGenerator.js`
- Modify: `app-backend/src/services/__tests__/dxfGenerator.test.js`

These two additions are tightly coupled (the warning category will be set by `computeOutsideFigureVertices` in Task 2, and the layer hosts the emitters in Tasks 3+4). Landing them together gives the next tasks a clean foundation.

- [ ] **Step 1: Write the failing test**

Append to `app-backend/src/services/__tests__/dxfGenerator.test.js`:

```js
describe('generateDXF — outside-figure annotation foundation', () => {
  const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} }
  const opts = {
    parcels: { features: [] },
    beacons: { features: [] },
    outsideFigureData: null,
    metadata: {}, scale: '1:500', sheetSize: 'ISO_A2',
  }
  test('declares the OUTSIDE_FIGURE_LABELS layer', () => {
    const { buffer } = generateDXF(opts, fakeLogger)
    expect(countLayerOnTable(buffer.toString(), 'OUTSIDE_FIGURE_LABELS')).toBe(1)
  })
  test('warnings.summary includes outsideFigureVertices counter at zero', () => {
    const { warnings } = generateDXF(opts, fakeLogger)
    expect(warnings.summary.outsideFigureVertices).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app-backend && npm run test -- --testPathPatterns=dxfGenerator`
Expected: 2 new failures. The first because `OUTSIDE_FIGURE_LABELS` isn't in the layers array. The second because `warnings.summary.outsideFigureVertices` is `undefined`.

- [ ] **Step 3: Add the layer entry**

Edit `app-backend/src/services/dxfGenerator.js`. Find the `layers` array (around line 264 — search `{ name: 'MARGIN_GUIDES',   color: 8 }` for the last existing entry).

Find:

```js
    { name: 'NORTH_ARROW',     color: 7 },
    { name: 'SCALE_BAR',       color: 7 },
    { name: 'GRID',            color: 8 },
    { name: 'MARGIN_GUIDES',   color: 8 },
  ];
```

Replace with:

```js
    { name: 'NORTH_ARROW',     color: 7 },
    { name: 'SCALE_BAR',       color: 7 },
    { name: 'GRID',            color: 8 },
    { name: 'MARGIN_GUIDES',   color: 8 },
    { name: 'OUTSIDE_FIGURE_LABELS', color: 8 },
  ];
```

- [ ] **Step 4: Add the warnings.summary key**

Still in `app-backend/src/services/dxfGenerator.js`, find the warnings aggregator (around line 168, search `summary: {`).

Find:

```js
    summary: {
      beacons: 0,
      parcels: 0,
      scaleFallback: false,
      beaconDescTruncated: 0,
      priorDiagramsTruncated: 0,
      nonAscii: false,
    },
```

Replace with:

```js
    summary: {
      beacons: 0,
      parcels: 0,
      outsideFigureVertices: 0,
      scaleFallback: false,
      beaconDescTruncated: 0,
      priorDiagramsTruncated: 0,
      nonAscii: false,
    },
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd app-backend && npm run test -- --testPathPatterns=dxfGenerator`
Expected: PASS for both new tests. All previously-passing tests remain green.

- [ ] **Step 6: Commit**

```bash
git add app-backend/src/services/dxfGenerator.js app-backend/src/services/__tests__/dxfGenerator.test.js
git commit -m "feat(dxf): add OUTSIDE_FIGURE_LABELS layer and outsideFigureVertices warning

Foundation for outside-figure annotation. The new layer hosts vertex
coordinate labels and tick marks (emitters land in the next tasks);
the warning counter receives bumps from computeOutsideFigureVertices
when an upstream blunder produces non-finite OF vertex coordinates."
```

---

## Task 2: `computeOutsideFigureVertices` top-level helper

**Files:**
- Modify: `app-backend/src/services/dxfGenerator.js`
- Modify: `app-backend/src/services/__tests__/dxfGenerator.test.js`

Pure top-level function — same place in the file as `shoelaceCentroid` (line 37) and `normalizeCapeLoYX` (line 26). Returns `{ vertices, skippedCount }` so the call site (inside `generateDXF`'s closure, in Task 3) can drive the `warn()` aggregator.

- [ ] **Step 1: Write the failing tests**

Append to `app-backend/src/services/__tests__/dxfGenerator.test.js`:

```js
import { computeOutsideFigureVertices } from '../dxfGenerator.js'

describe('computeOutsideFigureVertices', () => {
  test('walks edges in order and returns the closing duplicate', () => {
    const ofd = {
      edges: [
        { pointId: 'A', y: 50000, x: 2200000 },
        { pointId: 'B', y: 50100, x: 2200000 },
        { pointId: 'C', y: 50100, x: 2200100 },
        { pointId: 'D', y: 50000, x: 2200100 },
      ],
      constants: { pointId: 'A', y: 50000, x: 2200000 },
    }
    const result = computeOutsideFigureVertices(ofd)
    expect(result.vertices).toHaveLength(5)
    expect(result.vertices.map(v => v.pointId)).toEqual(['A', 'B', 'C', 'D', 'A'])
    expect(result.skippedCount).toBe(0)
  })

  test('returns { vertices: [], skippedCount: 0 } when edges missing', () => {
    expect(computeOutsideFigureVertices({})).toEqual({ vertices: [], skippedCount: 0 })
    expect(computeOutsideFigureVertices({ edges: [] })).toEqual({ vertices: [], skippedCount: 0 })
    expect(computeOutsideFigureVertices(null)).toEqual({ vertices: [], skippedCount: 0 })
  })

  test('filters non-finite vertices and counts them in skippedCount', () => {
    const ofd = {
      edges: [
        { pointId: 'A', y: 50000, x: 2200000 },
        { pointId: 'B', y: NaN,   x: 2200000 },
        { pointId: 'C', y: 50100, x: Infinity },
        { pointId: 'D', y: 50000, x: 2200100 },
      ],
      constants: { pointId: 'A', y: 50000, x: 2200000 },
    }
    const result = computeOutsideFigureVertices(ofd)
    expect(result.vertices.map(v => v.pointId)).toEqual(['A', 'D', 'A'])
    expect(result.skippedCount).toBe(2)
  })

  test('filters vertices with coordinate magnitudes above 1e7', () => {
    const ofd = {
      edges: [
        { pointId: 'A', y: 50000, x: 2200000 },
        { pointId: 'X', y: 5e7, x: 2200000 },  // implausibly large westing
      ],
      constants: { pointId: 'A', y: 50000, x: 2200000 },
    }
    const result = computeOutsideFigureVertices(ofd)
    expect(result.vertices.find(v => v.pointId === 'X')).toBeUndefined()
    expect(result.skippedCount).toBe(1)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd app-backend && npm run test -- --testPathPatterns=dxfGenerator`
Expected: All 4 new tests fail with `SyntaxError: The requested module '../dxfGenerator.js' does not provide an export named 'computeOutsideFigureVertices'`.

- [ ] **Step 3: Implement the helper**

Edit `app-backend/src/services/dxfGenerator.js`. Find the `shoelaceCentroid` function (around line 37, search `function shoelaceCentroid`). Immediately AFTER it (and BEFORE `polygonAreaGround` or whichever helper comes next), insert:

```js
/**
 * Walk outsideFigureData.edges and return the ordered vertex list around the
 * outside-figure boundary, with a closing duplicate appended so callers can
 * pair vertices[i] with vertices[i+1] for edge geometry without index-modulo
 * wraparound.
 *
 * Each edge in edges[] carries the START vertex of that edge as { pointId, y, x }.
 * Non-finite vertices (NaN / Infinity / |coord| > 1e7 plausibility bound) are
 * filtered out and counted via skippedCount so the caller can bump
 * warnings.summary.outsideFigureVertices.
 *
 * @param {Object|null} outsideFigureData  May be null/undefined; empty .edges OK.
 * @returns {{ vertices: Array<{y:number,x:number,pointId:string}>, skippedCount: number }}
 *   vertices: ordered around the boundary, with closing duplicate.
 *   skippedCount: how many edges had non-finite vertex coords.
 */
export function computeOutsideFigureVertices(outsideFigureData) {
  const edges = outsideFigureData?.edges
  if (!Array.isArray(edges) || edges.length === 0) {
    return { vertices: [], skippedCount: 0 }
  }
  const vertices = []
  let skippedCount = 0
  for (const e of edges) {
    if (!Number.isFinite(e.y) || !Number.isFinite(e.x)
        || Math.abs(e.y) > 1e7 || Math.abs(e.x) > 1e7) {
      skippedCount++
      continue
    }
    vertices.push({ y: e.y, x: e.x, pointId: e.pointId || '' })
  }
  // Append closing duplicate (first valid vertex) so consumers can iterate
  // vertices[i] / vertices[i+1] without wraparound.
  if (vertices.length > 0) {
    vertices.push({ ...vertices[0] })
  }
  return { vertices, skippedCount }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd app-backend && npm run test -- --testPathPatterns=dxfGenerator`
Expected: PASS for all 4 new tests. Total dxfGenerator count rises by 4.

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/dxfGenerator.js app-backend/src/services/__tests__/dxfGenerator.test.js
git commit -m "feat(dxf): computeOutsideFigureVertices helper — ordered vertex list with closing duplicate

Pure top-level helper that walks outsideFigureData.edges and returns
the boundary vertex list { y, x, pointId } with a closing duplicate
appended so emitters can pair vertices[i] with vertices[i+1] without
wraparound. Non-finite vertices are filtered and counted via
skippedCount so the closure-scoped emitter (next task) can bump
warnings.summary.outsideFigureVertices via warn()."
```

---

## Task 3: `addOutsideFigureVertexLabels` emitter + initial wiring block

**Files:**
- Modify: `app-backend/src/services/dxfGenerator.js`
- Modify: `app-backend/src/services/__tests__/dxfGenerator.integration.test.js`

The wiring block from §Components/e of the spec lands here in skeleton form (with the vertex-labels call only). Tasks 4 and 5 extend the same block.

- [ ] **Step 1: Update the integration test's required-layers array**

Edit `app-backend/src/services/__tests__/dxfGenerator.integration.test.js`. Find the required-layers list (search `'OUTSIDE_FIGURE','PARCELS','BEACONS'`).

Find:

```js
    const required = [
      'OUTSIDE_FIGURE', 'PARCELS', 'BEACONS', 'BEACON_LABELS',
      'DISTANCES', 'DIRECTIONS', 'STAND_NUMBERS', 'TITLE_BLOCK',
      'NORTH_ARROW', 'SCALE_BAR', 'GRID', 'MARGIN_GUIDES',
    ]
```

Replace with:

```js
    const required = [
      'OUTSIDE_FIGURE', 'OUTSIDE_FIGURE_LABELS', 'PARCELS', 'BEACONS', 'BEACON_LABELS',
      'DISTANCES', 'DIRECTIONS', 'STAND_NUMBERS', 'TITLE_BLOCK',
      'NORTH_ARROW', 'SCALE_BAR', 'GRID', 'MARGIN_GUIDES',
    ]
```

- [ ] **Step 2: Add a failing integration test for vertex labels**

In the same file, immediately AFTER the `test('all 12 required layers are declared exactly once', …)` block (search for it), append:

```js
  test('emits 4 vertex coord TEXT entities on OUTSIDE_FIGURE_LABELS', () => {
    expect(entityCount(dxf, 'TEXT', 'OUTSIDE_FIGURE_LABELS')).toBe(4)
  })

  test('vertex labels contain the Cape Lo coordinates from the fixture', () => {
    for (const v of sampleFixture.outsideFigureData.edges) {
      expect(dxf).toMatch(new RegExp(`Y=${Math.round(v.y)}.*?X=${Math.round(v.x)}`))
    }
  })
```

Also update the "all 12 required layers" test name in that same file (search for `'all 12 required layers are declared exactly once'`):

Find: `test('all 12 required layers are declared exactly once', () => {`
Replace with: `test('all 13 required layers are declared exactly once', () => {`

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd app-backend && npm run test -- --testPathPatterns=dxfGenerator`
Expected: 2 new failures (TEXT count = 0, the vertex-label regex misses).

- [ ] **Step 4: Add the `addOutsideFigureVertexLabels` emitter**

Edit `app-backend/src/services/dxfGenerator.js`. Find the existing chrome emitters cluster (around line 364, search for the `addBeaconSymbol` function that lives at the start of the cluster, OR around line 685–700 for the existing `addNorthArrow` you can use as anchor).

Insert this function as a SIBLING of the existing `addNorthArrow` / `addScaleBar` / etc. — anywhere inside `generateDXF()`'s closure that has `addText`, `addLine`, `mm()`, `capeLoToDxfSouthUp` already in scope. A clean place is immediately after `addMarginGuides`:

```js
  /**
   * For each non-duplicate vertex of the outside figure, emit one TEXT entity
   * reading "Y=<westing> X=<southing>" (whole metres) on the OUTSIDE_FIGURE_LABELS
   * layer, offset 5 mm outward from the polygon centroid.
   *
   * @param {string} layer  Target layer name.
   * @param {Array<{y:number,x:number,pointId:string}>} vertices  From
   *   computeOutsideFigureVertices(); last entry is the closing duplicate.
   * @param {{x:number,y:number}} centroidGround  In DXF (south-up) coords.
   */
  function addOutsideFigureVertexLabels(layer, vertices, centroidGround) {
    const offset = mm(5)
    const height = mm(2)
    // Iterate vertices[0 .. length-2] — skip the closing duplicate at the end.
    for (let i = 0; i < vertices.length - 1; i++) {
      const v = vertices[i]
      const dxfV = capeLoToDxfSouthUp(v.y, v.x)
      let nx = dxfV.x - centroidGround.x
      let ny = dxfV.y - centroidGround.y
      const mag = Math.sqrt(nx * nx + ny * ny)
      if (mag < 1e-6) {
        // Degenerate centroid: fall back to fixed direction (DXF +X).
        nx = 1; ny = 0
        logger.warn(`[DXF] OF vertex ${v.pointId}: degenerate centroid, using +X fallback`)
      } else {
        nx /= mag; ny /= mag
      }
      const label = `Y=${Math.round(v.y)} X=${Math.round(v.x)}`
      addText(layer, dxfV.x + nx * offset, dxfV.y + ny * offset, label, height, 0)
    }
  }
```

- [ ] **Step 5: Wire the emitter into the OF block**

In the same file, find the existing OF emission block (around line 585, search `if (outsideFigureData?.edges?.length > 0) {`).

Find:

```js
  if (outsideFigureData?.edges?.length > 0) {
    const ofPts = outsideFigureData.edges.map((e) => {
```

Look further down — the block emits the polyline and ends. Just BEFORE the closing `}` of the `if (outsideFigureData?.edges?.length > 0)` block (which should be at or near line 590), add:

```js

    // ── Outside-figure annotation ──
    const ofResult = computeOutsideFigureVertices(outsideFigureData)
    if (ofResult.skippedCount > 0) {
      warn('outsideFigureVertices', ofResult.skippedCount)
    }
    if (ofResult.vertices.length >= 3) {
      const ofDxfPts = ofResult.vertices.slice(0, -1)
        .map(v => capeLoToDxfSouthUp(v.y, v.x))
      const ofCentroid = shoelaceCentroid(ofDxfPts)
      addOutsideFigureVertexLabels('OUTSIDE_FIGURE_LABELS', ofResult.vertices, ofCentroid)
    }
```

(The function `computeOutsideFigureVertices` is a top-level export and is callable from inside `generateDXF`'s closure without import.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd app-backend && npm run test -- --testPathPatterns=dxfGenerator`
Expected: PASS for the 2 vertex-label integration tests and the renamed "all 13 required layers" test. All previously-passing tests stay green.

- [ ] **Step 7: Commit**

```bash
git add app-backend/src/services/dxfGenerator.js app-backend/src/services/__tests__/dxfGenerator.integration.test.js
git commit -m "feat(dxf): emit Cape Lo coordinate labels at every OF vertex

addOutsideFigureVertexLabels writes one TEXT 'Y=<westing> X=<southing>'
per OF vertex on the new OUTSIDE_FIGURE_LABELS layer, offset 5 mm
outward from the polygon centroid. Wiring in the existing OF emission
block invokes computeOutsideFigureVertices, bumps warnings if any
vertices were filtered, and calls the emitter when 3+ valid vertices
remain. Degenerate centroid case falls back to a fixed +X direction
and logs once."
```

---

## Task 4: `addOutsideFigureTickMarks` emitter

**Files:**
- Modify: `app-backend/src/services/dxfGenerator.js`
- Modify: `app-backend/src/services/__tests__/dxfGenerator.integration.test.js`

- [ ] **Step 1: Add the failing test**

Edit `app-backend/src/services/__tests__/dxfGenerator.integration.test.js`. Immediately AFTER the vertex-label tests added in Task 3, append:

```js
  test('emits 4 tick LINE entities on OUTSIDE_FIGURE_LABELS', () => {
    expect(entityCount(dxf, 'LINE', 'OUTSIDE_FIGURE_LABELS')).toBe(4)
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd app-backend && npm run test -- --testPathPatterns=dxfGenerator`
Expected: 1 new failure (LINE count = 0).

- [ ] **Step 3: Add the emitter**

In `app-backend/src/services/dxfGenerator.js`, immediately AFTER the `addOutsideFigureVertexLabels` function defined in Task 3, insert:

```js
  /**
   * For each non-duplicate vertex of the outside figure, emit one short LINE
   * tick on `layer` pointing outward from the polygon centroid. The
   * centroid-to-vertex direction matches the vertex-label placement so each
   * tick + label pair reads as a coherent "I am here at Y=… X=…" marker.
   *
   * Functional-minimum: uses centroid direction. Pdfkit reference uses an
   * angle-bisector for concave outside figures — deferred.
   *
   * @param {string} layer
   * @param {Array<{y,x,pointId}>} vertices  From computeOutsideFigureVertices().
   * @param {{x,y}} centroidGround
   */
  function addOutsideFigureTickMarks(layer, vertices, centroidGround) {
    const tickLen = mm(3)
    for (let i = 0; i < vertices.length - 1; i++) {
      const v = vertices[i]
      const dxfV = capeLoToDxfSouthUp(v.y, v.x)
      let nx = dxfV.x - centroidGround.x
      let ny = dxfV.y - centroidGround.y
      const mag = Math.sqrt(nx * nx + ny * ny)
      if (mag < 1e-6) { nx = 1; ny = 0 } else { nx /= mag; ny /= mag }
      addLine(layer, dxfV.x, dxfV.y, dxfV.x + nx * tickLen, dxfV.y + ny * tickLen)
    }
  }
```

- [ ] **Step 4: Wire the new emitter into the OF block**

In the same file, find the wiring block added at the end of Task 3 (search `addOutsideFigureVertexLabels('OUTSIDE_FIGURE_LABELS'`).

Find:

```js
      addOutsideFigureVertexLabels('OUTSIDE_FIGURE_LABELS', ofResult.vertices, ofCentroid)
    }
```

Replace with:

```js
      addOutsideFigureVertexLabels('OUTSIDE_FIGURE_LABELS', ofResult.vertices, ofCentroid)
      addOutsideFigureTickMarks('OUTSIDE_FIGURE_LABELS', ofResult.vertices, ofCentroid)
    }
```

- [ ] **Step 5: Run tests to verify pass**

Run: `cd app-backend && npm run test -- --testPathPatterns=dxfGenerator`
Expected: PASS for the new LINE-count test. All others remain green.

- [ ] **Step 6: Commit**

```bash
git add app-backend/src/services/dxfGenerator.js app-backend/src/services/__tests__/dxfGenerator.integration.test.js
git commit -m "feat(dxf): emit tick marks at every OF vertex

addOutsideFigureTickMarks writes one 3 mm LINE per OF vertex on the
OUTSIDE_FIGURE_LABELS layer, pointing outward in the centroid-to-vertex
direction (same direction as the vertex coordinate label so the tick +
label pair reads as a coherent corner marker). Functional minimum;
angle-bisector for concave OFs deferred to a later iteration."
```

---

## Task 5: `addOutsideFigureEdgeLabels` emitter (distance + bearing on shared DISTANCES + DIRECTIONS layers)

**Files:**
- Modify: `app-backend/src/services/dxfGenerator.js`
- Modify: `app-backend/src/services/__tests__/dxfGenerator.integration.test.js`

This is the last visual emitter. It reuses existing layers (`DISTANCES` and `DIRECTIONS`) so the test assertion is on a delta: pre-task counts were 7 + 7 (parcel edges); post-task should be 11 + 11 (parcel + 4 OF edges).

- [ ] **Step 1: Add the failing test**

Edit `app-backend/src/services/__tests__/dxfGenerator.integration.test.js`. Immediately AFTER the tick-marks test from Task 4, append:

```js
  test('outside-figure edges contribute distance + bearing on the existing layers', () => {
    // Pre-OF-annotation: parcel edges emitted 7 TEXTs each on DISTANCES and
    // DIRECTIONS. The 4 OF edges add one of each per edge, total 11+11.
    expect(entityCount(dxf, 'TEXT', 'DISTANCES')).toBe(11)
    expect(entityCount(dxf, 'TEXT', 'DIRECTIONS')).toBe(11)
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `cd app-backend && npm run test -- --testPathPatterns=dxfGenerator`
Expected: 1 new failure — DISTANCES count = 7, DIRECTIONS count = 7 (only parcel edges).

- [ ] **Step 3: Add the emitter**

In `app-backend/src/services/dxfGenerator.js`, immediately AFTER the `addOutsideFigureTickMarks` function from Task 4, insert:

```js
  /**
   * For each edge of the outside figure, emit a distance TEXT on `distLayer`
   * and a South-oriented bearing TEXT on `dirLayer`, placed at the edge
   * midpoint offset outward from the polygon centroid.
   *
   * Distance text format: "<m>.<cm>" via toFixed(2).
   * Bearing text: preserves edges[i].direction when it parses as DMS, else
   * derives via degToDMS() from the vertex delta.
   *
   * @param {string} distLayer  Existing DISTANCES layer.
   * @param {string} dirLayer   Existing DIRECTIONS layer.
   * @param {Array<{y,x,pointId}>} vertices  From computeOutsideFigureVertices()
   *   (with closing duplicate so vertices[i+1] is always valid).
   * @param {Array} edges  Raw outsideFigureData.edges array (parallel to
   *   vertices[0..length-2] — edges[i] starts at vertices[i]).
   * @param {{x,y}} centroidGround
   */
  function addOutsideFigureEdgeLabels(distLayer, dirLayer, vertices, edges, centroidGround) {
    const distOffset = mm(3)
    const bearOffset = mm(6)
    for (let i = 0; i < vertices.length - 1; i++) {
      const a = capeLoToDxfSouthUp(vertices[i].y, vertices[i].x)
      const b = capeLoToDxfSouthUp(vertices[i + 1].y, vertices[i + 1].x)
      const dx = b.x - a.x, dy = b.y - a.y
      const len = Math.sqrt(dx * dx + dy * dy)
      if (len < 1e-6) continue   // degenerate edge — skip silently
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
      // Counter-clockwise 90° rotation of the edge direction, then flip
      // toward the outside (away from polygon centre).
      let nx = -dy / len, ny = dx / len
      if (nx * (mx - centroidGround.x) + ny * (my - centroidGround.y) < 0) {
        nx = -nx; ny = -ny
      }
      // Edge angle for upright text.
      let ang = Math.atan2(dy, dx) * (180 / Math.PI)
      if (ang > 90 || ang < -90) ang += 180

      // Distance text — prefer edges[i].distance if numeric, else derive from len.
      const edge = edges[i] || {}
      const givenDist = typeof edge.distance === 'number'
        ? edge.distance
        : parseFloat(edge.distance)
      const distVal = Number.isFinite(givenDist) ? givenDist : len
      const distText = distVal.toFixed(2)

      // Bearing text — prefer edges[i].direction when it looks like DMS,
      // else derive South-oriented bearing from the vertex delta.
      const dirStr = typeof edge.direction === 'string' ? edge.direction : ''
      const dirText = /\d+\D+\d+\D+\d+/.test(dirStr)
        ? dirStr
        : degToDMS((((Math.atan2(
            vertices[i + 1].y - vertices[i].y,
            vertices[i + 1].x - vertices[i].x
          ) * 180 / Math.PI) % 360) + 360) % 360)

      addText(distLayer, mx + nx * distOffset, my + ny * distOffset, distText, distHeight, ang)
      addText(dirLayer, mx + nx * bearOffset, my + ny * bearOffset, dirText, bearHeight, ang)
    }
  }
```

- [ ] **Step 4: Wire the new emitter into the OF block**

In the same file, find the wiring block last extended in Task 4 (search `addOutsideFigureTickMarks('OUTSIDE_FIGURE_LABELS'`).

Find:

```js
      addOutsideFigureVertexLabels('OUTSIDE_FIGURE_LABELS', ofResult.vertices, ofCentroid)
      addOutsideFigureTickMarks('OUTSIDE_FIGURE_LABELS', ofResult.vertices, ofCentroid)
    }
```

Replace with:

```js
      addOutsideFigureVertexLabels('OUTSIDE_FIGURE_LABELS', ofResult.vertices, ofCentroid)
      addOutsideFigureTickMarks('OUTSIDE_FIGURE_LABELS', ofResult.vertices, ofCentroid)
      addOutsideFigureEdgeLabels('DISTANCES', 'DIRECTIONS',
                                  ofResult.vertices, outsideFigureData.edges, ofCentroid)
    }
```

- [ ] **Step 5: Run tests to verify pass**

Run: `cd app-backend && npm run test -- --testPathPatterns=dxfGenerator`
Expected: PASS for the new DISTANCES + DIRECTIONS count test. All others remain green.

If the DISTANCES count returns 12 or 10 instead of 11, the parcel-edge label emission may have produced a different count than the spec assumed (8 not 7, or 6 not 7) — open the fixture at `app-backend/src/services/__tests__/fixtures/sampleDxfPlan.js`, count the parcel edges (each parcel's `coordinates[0]` minus the closing duplicate = unique vertices = edges), accounting for the existing shared-edge logic in `dxfGenerator.js`, and adjust the test's expected count to match `<parcel count> + 4`. The OF contribution is always exactly 4 (one per OF edge); only the parcel baseline can shift.

- [ ] **Step 6: Commit**

```bash
git add app-backend/src/services/dxfGenerator.js app-backend/src/services/__tests__/dxfGenerator.integration.test.js
git commit -m "feat(dxf): emit distance + bearing labels on every OF edge

addOutsideFigureEdgeLabels writes one TEXT per edge on the existing
DISTANCES layer and one TEXT per edge on the existing DIRECTIONS
layer, both at the edge midpoint offset outward. Reusing the shared
layers means surveyors can toggle DISTANCES off in CAD to hide every
distance label at once (parcel + OF). Distance and bearing values
prefer edges[i].distance / edges[i].direction from the input data
when available, with geometry-derived fallbacks via degToDMS()."
```

---

## Task 6: Graceful-degradation regression — NaN OF vertex

**Files:**
- Modify: `app-backend/src/services/__tests__/dxfGenerator.integration.test.js`

The integration suite already has a graceful-degradation test for parcels + beacons (Plan Task 15 from the prior parity work). Extends it with a sibling for the OF code path.

- [ ] **Step 1: Add the failing test**

Edit `app-backend/src/services/__tests__/dxfGenerator.integration.test.js`. Find the existing `describe('dxfGenerator integration — graceful degradation', …)` block.

Inside it, immediately AFTER the existing `test('one bad beacon + one bad parcel …', …)`, append:

```js
  test('NaN OF vertex bumps warnings.summary.outsideFigureVertices and does not throw', () => {
    const bad = JSON.parse(JSON.stringify(sampleFixture))
    bad.outsideFigureData.edges[1].y = NaN
    const { buffer, warnings } = generateDXF(bad, fakeLogger)
    expect(Buffer.isBuffer(buffer)).toBe(true)
    expect(warnings.summary.outsideFigureVertices).toBe(1)
    expect(warnings.count).toBeGreaterThanOrEqual(1)
  })
```

- [ ] **Step 2: Run to verify it passes immediately**

Run: `cd app-backend && npm run test -- --testPathPatterns=dxfGenerator`
Expected: PASS on the first run. The warning category and skippedCount accounting were both implemented in Tasks 1+2; the wiring in Task 3 already calls `warn('outsideFigureVertices', ofResult.skippedCount)` when `skippedCount > 0`. This test is a guard that proves the contract end-to-end.

If it fails (warning count is 0 not 1), the bug is in Task 3's wiring — re-check that the `if (ofResult.skippedCount > 0) { warn(...) }` block was added BEFORE the `if (ofResult.vertices.length >= 3)` block.

- [ ] **Step 3: Commit**

```bash
git add app-backend/src/services/__tests__/dxfGenerator.integration.test.js
git commit -m "test(dxf): regression — NaN OF vertex bumps outsideFigureVertices warning

End-to-end guard that proves the contract from the spec: a fixture
mutated to inject a NaN-coord OF vertex returns a valid Buffer +
warnings.summary.outsideFigureVertices === 1, with no throw. Catches
any future regression where the warn() call in the OF wiring block
is dropped or the skippedCount accounting in
computeOutsideFigureVertices stops working."
```

---

## Task 7: Extend the manual-verification checklist

**Files:**
- Modify: `docs/superpowers/plans/2026-05-31-survey-plan-dxf-pdf-parity-verification-checklist.md`

Three new tick items + one screenshot filename. Documentation only; no tests.

- [ ] **Step 1: Find the existing checklist section**

Open `docs/superpowers/plans/2026-05-31-survey-plan-dxf-pdf-parity-verification-checklist.md`. Locate the section starting with `## Visual checklist` (the bulleted list of items the surveyor ticks off in CAD).

- [ ] **Step 2: Append the new items**

At the END of the visual checklist (before the `## After verification` section), insert three new items:

```markdown
- [ ] Each outside-figure vertex carries a small tick mark pointing outward plus a Cape Lo coordinate label (`Y=… X=…`) just outside the boundary. *(Screenshot: `12-outside-figure-annotation.png`)*
- [ ] Each outside-figure edge has a distance label (metres, 2 dp) and a bearing label (DMS) at its midpoint, offset outward from the boundary. *(Screenshot: `12-outside-figure-annotation.png` covers this too)*
- [ ] Toggling the CAD `DISTANCES` layer off hides BOTH parcel edge distances AND outside-figure edge distances simultaneously (proves they share the layer).
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-05-31-survey-plan-dxf-pdf-parity-verification-checklist.md
git commit -m "docs(verification): add outside-figure annotation checks to the manual CAD checklist

Three new tick items for the Layer 3 manual verification step that
ships with each PR: confirm vertex coord labels + ticks land outside
the OF boundary, confirm edge distance + bearing labels appear at
each midpoint, and confirm toggling the DISTANCES CAD layer hides
parcel + OF distance labels together (proving the layer-reuse
decision). One new suggested screenshot filename
(12-outside-figure-annotation.png)."
```

---

## Self-Review Checklist (run after all tasks merged)

1. **Spec coverage** — every spec section mapped to a task:
   - §Architecture — Tasks 1 (layer), 2 (helper), 3 (first emitter + wiring), 4 (second emitter), 5 (third emitter)
   - §Components/a `computeOutsideFigureVertices` — Task 2
   - §Components/b `addOutsideFigureVertexLabels` — Task 3
   - §Components/c `addOutsideFigureTickMarks` — Task 4
   - §Components/d `addOutsideFigureEdgeLabels` — Task 5
   - §Components/e wiring block — Tasks 3, 4, 5 (incrementally extended)
   - §Data flow — no implementation change; covered by the spec's "no new fields" decision
   - §Error handling — per-vertex guards in Task 2 helper + warning bump in Task 3 wiring + graceful-degradation regression in Task 6
   - §Testing Layer 1 — Tasks 1, 2 (unit tests)
   - §Testing Layer 2 — Tasks 3, 4, 5 (integration tests) + Task 6 (regression)
   - §Testing Layer 3 — Task 7 (checklist extension)
2. **No placeholders** — every step has concrete code; every file path is exact; every commit message complete.
3. **Type consistency** — `computeOutsideFigureVertices` signature `{ vertices, skippedCount }` consistent across Tasks 2, 3, 6. Emitter signatures `addOutsideFigure*(layer, vertices, centroidGround)` consistent across Tasks 3, 4. `addOutsideFigureEdgeLabels(distLayer, dirLayer, vertices, edges, centroidGround)` consistent in Task 5.
4. **TDD discipline maintained** — every task starts with a failing test (Task 6 is the exception: it deliberately passes on first run as a contract guard, with a documented escape hatch if the upstream wiring is broken).
5. **Frequent commits** — seven commits across the task set; each commit produces a working backend (tests stay green).
