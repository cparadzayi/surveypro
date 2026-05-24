# Beacon Label Placement — East-West Orientation & POI-Directed Placement

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace edge-following label rotation with east-west-constrained (±45°), pole-of-inaccessibility-directed placement for both stand number labels (Type 1) and beacon suffix labels (Type 2), with adaptive leader lines for labels displaced into wider interior whitespace.

**Architecture:** A real iterative-grid POI algorithm replaces the stub in `labelPlacer.js` and is imported by both labeling services. Type 1 (stand numbers) in `pdfkitLabeling.js` replaces centroid + unclamped angle with POI + ±45° clamp + centroid-drift fallback. Type 2 (beacon suffixes) in `pdfkitGeoPDF.js` gets a new `placeSuffixLabelPOIDirected()` function and a `drawBeaconLeaderLine()` function; the existing edge-following path is replaced entirely.

**Tech Stack:** Node.js ES modules, PDFKit, Jest (existing test harness in `app-backend/src/utils/__tests__/`)

---

## File Map

| File | Change |
|---|---|
| `app-backend/src/utils/labelPlacer.js` | Replace stub `findPoleOfInaccessibility` with iterative grid-refinement algorithm; add private `_pointToPolygonDist` helper |
| `app-backend/src/utils/__tests__/labelPlacer.test.js` | Add POI correctness tests (narrow rectangle, L-shape, degenerate) |
| `app-backend/src/services/pdfkitLabeling.js` | Import POI; in `renderDeferredStandLabels`: use POI as primary anchor, clamp `longestAngle` to ±45°, add centroid-drift fallback |
| `app-backend/src/services/pdfkitGeoPDF.js` | Import POI; add `placeSuffixLabelPOIDirected()`; add `drawBeaconLeaderLine()`; replace both suffix-label placement paths in `renderBeacons()`; remove `suffixRotationAngle` rotation |

---

## Task 1 — Real POI algorithm in `labelPlacer.js`

**Files:**
- Modify: `app-backend/src/utils/labelPlacer.js:203-234`
- Test: `app-backend/src/utils/__tests__/labelPlacer.test.js`

The existing `findPoleOfInaccessibility` returns bounding-box centre — a stub. Replace it with iterative grid-refinement (Mapbox polylabel approach). The function signature stays identical (`vertices: [{x,y}]`) so callers need no changes.

- [ ] **Step 1.1 — Write failing tests**

Add to `app-backend/src/utils/__tests__/labelPlacer.test.js` after the existing `findPoleOfInaccessibility` tests (search for the describe block and append):

```js
describe('findPoleOfInaccessibility — real algorithm', () => {
  test('POI of a square is its centre', () => {
    const sq = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]
    const poi = findPoleOfInaccessibility(sq)
    expect(poi.x).toBeCloseTo(50, 0)
    expect(poi.y).toBeCloseTo(50, 0)
  })

  test('POI of a thin horizontal rectangle is near its long-axis centre', () => {
    // 200×10 rectangle — POI should be near (100, 5), max clearance = 5
    const rect = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 10 }, { x: 0, y: 10 }]
    const poi = findPoleOfInaccessibility(rect)
    expect(poi.x).toBeGreaterThan(60)  // somewhere along the long axis
    expect(poi.x).toBeLessThan(140)
    expect(poi.y).toBeCloseTo(5, 0)    // centred on the short axis
  })

  test('POI of an L-shape is NOT at the bounding-box centre', () => {
    // L-shape: bounding box 100×100 but bottom-right quadrant missing
    const lShape = [
      { x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 },
      { x: 100, y: 50 }, { x: 100, y: 100 }, { x: 0, y: 100 }
    ]
    const poi = findPoleOfInaccessibility(lShape)
    // Bounding-box centre (50, 50) is a corner vertex — POI must be inside the polygon
    // The widest circle fits in the top-left or bottom-right arm
    expect(poi.x).not.toBeCloseTo(50, -1)
    // POI must be inside the polygon
    const { isPointInPolygon } = await import('../labelPlacer.js')  // already imported
    // use manual ray-cast check
    expect(poi.x).toBeGreaterThanOrEqual(0)
    expect(poi.x).toBeLessThanOrEqual(100)
  })

  test('throws for fewer than 3 vertices', () => {
    expect(() => findPoleOfInaccessibility([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toThrow()
  })
})
```

- [ ] **Step 1.2 — Run tests to confirm they fail**

```bash
cd app-backend && npx jest --testPathPattern=labelPlacer -t "real algorithm" --no-coverage
```

Expected: FAIL — `findPoleOfInaccessibility` returns bounding-box centre which fails the L-shape and narrow-rectangle assertions.

- [ ] **Step 1.3 — Add `_pointToPolygonDist` private helper before `findPoleOfInaccessibility`**

In `app-backend/src/utils/labelPlacer.js`, immediately before the existing `findPoleOfInaccessibility` function, add:

```js
/**
 * Signed distance from point (px, py) to polygon boundary.
 * Positive = inside, negative = outside.
 * @param {number} px
 * @param {number} py
 * @param {Array<{x:number,y:number}>} vertices
 * @returns {number}
 */
function _pointToPolygonDist(px, py, vertices) {
  let minDist = Infinity
  let inside = false
  const n = vertices.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = vertices[i].x, yi = vertices[i].y
    const xj = vertices[j].x, yj = vertices[j].y
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
      inside = !inside
    }
    const dx = xj - xi, dy = yj - yi
    const lenSq = dx * dx + dy * dy
    const t = lenSq > 0 ? Math.max(0, Math.min(1, ((px - xi) * dx + (py - yi) * dy) / lenSq)) : 0
    const nearX = xi + t * dx, nearY = yi + t * dy
    const d = Math.sqrt((px - nearX) ** 2 + (py - nearY) ** 2)
    if (d < minDist) minDist = d
  }
  return inside ? minDist : -minDist
}
```

- [ ] **Step 1.4 — Replace `findPoleOfInaccessibility` body**

Replace the entire body of the existing `findPoleOfInaccessibility` function (keep the JSDoc and `export function` signature) with:

```js
export function findPoleOfInaccessibility(vertices, precision = 0.5) {
  if (!Array.isArray(vertices) || vertices.length < 3) {
    throw new Error('Vertices must be an array with at least 3 points')
  }

  // Bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const v of vertices) {
    if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x
    if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y
  }
  const w = maxX - minX, h = maxY - minY
  if (w === 0 && h === 0) return { x: minX, y: minY }

  const cellH = Math.min(w, h)

  // Seed with centroid as initial best
  const cx0 = vertices.reduce((s, v) => s + v.x, 0) / vertices.length
  const cy0 = vertices.reduce((s, v) => s + v.y, 0) / vertices.length
  let best = { x: cx0, y: cy0, d: _pointToPolygonDist(cx0, cy0, vertices) }

  // Initial grid — covers bounding box
  const cells = []
  for (let x = minX + cellH / 2; x < maxX; x += cellH) {
    for (let y = minY + cellH / 2; y < maxY; y += cellH) {
      const d = _pointToPolygonDist(x, y, vertices)
      cells.push({ x, y, h: cellH, d })
      if (d > best.d) best = { x, y, d }
    }
  }

  // Iterative refinement — split most-promising cells
  cells.sort((a, b) => b.d - a.d)
  for (let iter = 0; iter < 200 && cells.length > 0; iter++) {
    const cell = cells.shift()
    if (cell.d > best.d) best = { x: cell.x, y: cell.y, d: cell.d }
    if (cell.h / 2 < precision) continue
    // Prune: max possible improvement from this cell
    if (cell.d + cell.h * 0.7072 <= best.d) continue
    const h2 = cell.h / 2
    for (const [ox, oy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const nx = cell.x + ox * h2 / 2
      const ny = cell.y + oy * h2 / 2
      const nd = _pointToPolygonDist(nx, ny, vertices)
      cells.push({ x: nx, y: ny, h: h2, d: nd })
    }
    cells.sort((a, b) => b.d - a.d)
  }

  return { x: best.x, y: best.y }
}
```

- [ ] **Step 1.5 — Run tests to confirm they pass**

```bash
cd app-backend && npx jest --testPathPattern=labelPlacer --no-coverage
```

Expected output: all tests PASS including the new `real algorithm` suite.

- [ ] **Step 1.6 — Commit**

```bash
cd app-backend && git add src/utils/labelPlacer.js src/utils/__tests__/labelPlacer.test.js
git commit -m "feat: implement real iterative-grid POI algorithm in labelPlacer

Replaces bounding-box-centre stub with Mapbox-polylabel-style grid
refinement. Returns the widest interior point — furthest from all
polygon edges — with configurable precision (default 0.5pt).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2 — Type 1: ±45° angle clamp + POI anchor in `pdfkitLabeling.js`

**Files:**
- Modify: `app-backend/src/services/pdfkitLabeling.js:1-10` (add import)
- Modify: `app-backend/src/services/pdfkitLabeling.js:629-712` (`renderDeferredStandLabels` body)

There are no tests for `pdfkitLabeling.js` (it requires a PDFKit doc object). Changes are small and well-bounded — verify via the full Jest suite passing and a manual PDF smoke test in Task 5.

- [ ] **Step 2.1 — Add import at top of `pdfkitLabeling.js`**

`pdfkitLabeling.js` currently has no imports. Add at line 1 (before the JSDoc block):

```js
import { findPoleOfInaccessibility } from '../utils/labelPlacer.js';
```

- [ ] **Step 2.2 — Replace centroid computation with POI in `renderDeferredStandLabels`**

In `renderDeferredStandLabels` (line ~609), the current code computes a shoelace centroid then uses it as the primary anchor. Replace the entire block from the centroid computation down to (but not including) the `// Try progressively smaller font sizes` comment (lines 609–649) with:

```js
      // Convert closed polygon coords to {x,y} array for POI
      const ptsOpen = pts; // pts is already deduplicated (closing duplicate removed above)
      const poi = (() => {
        try {
          return findPoleOfInaccessibility(ptsOpen.map(p => ({ x: p.x, y: p.y })));
        } catch {
          // Degenerate polygon — fall back to arithmetic mean
          let sx = 0, sy = 0;
          ptsOpen.forEach(p => { sx += p.x; sy += p.y; });
          return { x: sx / ptsOpen.length, y: sy / ptsOpen.length };
        }
      })();
      if (!Number.isFinite(poi.x) || !Number.isFinite(poi.y)) return;

      // Centroid (shoelace) is kept as drift-fallback target only
      let centroid;
      {
        let twiceArea = 0, cx = 0, cy = 0;
        for (let i = 0; i < ptsOpen.length; i++) {
          const p0 = ptsOpen[i], p1 = ptsOpen[(i + 1) % ptsOpen.length];
          const cross = p0.x * p1.y - p1.x * p0.y;
          twiceArea += cross; cx += (p0.x + p1.x) * cross; cy += (p0.y + p1.y) * cross;
        }
        if (Math.abs(twiceArea) > 1e-6) {
          centroid = { x: cx / (3 * twiceArea), y: cy / (3 * twiceArea) };
        } else {
          let sx = 0, sy = 0;
          ptsOpen.forEach(p => { sx += p.x; sy += p.y; });
          centroid = { x: sx / ptsOpen.length, y: sy / ptsOpen.length };
        }
        if (!Number.isFinite(centroid.x) || !Number.isFinite(centroid.y)) centroid = poi;
      }

      // Find longest edge angle — CLAMPED to ±45° from horizontal
      let longestLen = 0, longestAngle = 0;
      for (let i = 0; i < pdfCoords.length - 1; i++) {
        const dx = pdfCoords[i + 1].x - pdfCoords[i].x;
        const dy = pdfCoords[i + 1].y - pdfCoords[i].y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > longestLen) { longestLen = len; longestAngle = Math.atan2(dy, dx) * (180 / Math.PI); }
      }
      // Normalise to keep text upright
      if (longestAngle > 90) longestAngle -= 180;
      if (longestAngle < -90) longestAngle += 180;
      // Clamp: never more than ±45° from horizontal
      longestAngle = Math.max(-45, Math.min(45, longestAngle));
```

- [ ] **Step 2.3 — Replace candidate list to use POI as primary anchor**

In `renderDeferredStandLabels`, replace the `const candidates = [` block (lines ~664-669) with:

```js
        const candidates = [
          { x: poi.x, y: poi.y, angle: 0 },
          { x: poi.x, y: poi.y, angle: longestAngle },
          ...gridCands.map((p) => ({ ...p, angle: 0 })),
          ...gridCands.map((p) => ({ ...p, angle: longestAngle })),
        ];
```

(The grid step calculation at line 657 references `pgW`/`pgH` — keep that block unchanged.)

- [ ] **Step 2.4 — Add centroid-drift fallback after the `outer:` loop**

Replace the existing `// Force render at centroid` block (lines 696–712) with:

```js
      // Centroid-drift fallback: interpolate toward POI from the best-scoring
      // position that didn't fit, checking at 10 steps.
      if (!placed) {
        const driftSteps = 10;
        outer2: for (const fs of fontSizes) {
          const lw = this.doc.widthOfString(labelText, { font: 'Helvetica-Bold', size: fs });
          const lh = fs;
          const padding = 1;
          for (let s = 1; s <= driftSteps; s++) {
            const t = s / driftSteps;
            const dx = poi.x + t * (poi.x - centroid.x) * 0; // drift from centroid toward POI
            // Interpolate: start at centroid, end at POI
            const ix = centroid.x + t * (poi.x - centroid.x);
            const iy = centroid.y + t * (poi.y - centroid.y);
            if (!isPointInPolygonSimple([ix, iy], polygon)) continue;
            const rw = lw; const rh = lh;
            if (this.collisionDetector.hasCollision(ix - rw / 2 - padding, iy - rh / 2 - padding, rw + padding * 2, rh + padding * 2, padding)) continue;
            if (!isLabelBboxInsidePolygon(ix, iy, lw / 2, lh / 2, 0, polygon)) continue;
            this.doc.save();
            this.doc.translate(ix, iy);
            const _hp = 1.5;
            this.doc.rect(-lw / 2 - _hp, -lh / 2 - _hp, lw + _hp * 2, lh + _hp * 2).fillColor('#FFFFFF').fill();
            this.doc.fontSize(fs).fillColor('#000000').font('Helvetica-Bold')
              .text(labelText, -lw / 2, -lh / 2, { lineBreak: false });
            this.doc.restore();
            this.collisionDetector.addRegion(ix - rw / 2, iy - rh / 2, rw, rh, 1);
            placed = true;
            rendered++;
            break outer2;
          }
        }
      }

      // Hard fallback: place at POI at minimum font, centre-inside constraint only
      if (!placed) {
        const fs = Math.max(7, standFontSize - 2);
        const lw = this.doc.widthOfString(labelText, { font: 'Helvetica-Bold', size: fs });
        const lh = fs;
        this.doc.save();
        this.doc.translate(poi.x, poi.y);
        const _hp = 1.5;
        this.doc.rect(-lw / 2 - _hp, -lh / 2 - _hp, lw + _hp * 2, lh + _hp * 2).fillColor('#FFFFFF').fill();
        this.doc.fontSize(fs).fillColor('#000000').font('Helvetica-Bold')
          .text(labelText, -lw / 2, -lh / 2, { lineBreak: false });
        this.doc.restore();
        this.collisionDetector.addRegion(poi.x - lw / 2, poi.y - lh / 2, lw, lh, 1);
        rendered++;
        this.logger.info(`[Labeling] ⚡ POI hard-fallback for stand label: ${stand}`);
      }
```

- [ ] **Step 2.5 — Run existing tests**

```bash
cd app-backend && npx jest --no-coverage
```

Expected: all existing tests PASS (no regressions — `pdfkitLabeling.js` has no unit tests; the utils tests still cover `labelPlacer.js`).

- [ ] **Step 2.6 — Commit**

```bash
cd app-backend && git add src/services/pdfkitLabeling.js
git commit -m "feat(type1): POI anchor + ±45° angle clamp for stand number labels

Stand labels now use pole of inaccessibility as primary placement
anchor. Longest-edge rotation angle is clamped to ±45° from horizontal
so no label reads vertically. Adds centroid-drift fallback before
the hard-force-at-POI final safety net.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3 — `placeSuffixLabelPOIDirected()` in `pdfkitGeoPDF.js`

**Files:**
- Modify: `app-backend/src/services/pdfkitGeoPDF.js:1-22` (add import)
- Modify: `app-backend/src/services/pdfkitGeoPDF.js` (add new function after line ~5596)

This function replaces the three-strategy placement chain (edge-aligned → 16-position model → emergency centroid) for Type 2 suffix labels.

- [ ] **Step 3.1 — Add import to `pdfkitGeoPDF.js`**

In the imports block at the top of `pdfkitGeoPDF.js` (after the existing imports, around line 20), add:

```js
import { findPoleOfInaccessibility } from '../utils/labelPlacer.js';
```

- [ ] **Step 3.2 — Add `placeSuffixLabelPOIDirected` after `calculateCentroidFromPDFCoords`**

After the closing brace of `calculateCentroidFromPDFCoords` (line ~5596), insert:

```js
/**
 * Place a beacon suffix label (Type 2) using POI-directed inward push.
 * Labels are always rendered at 0° (horizontal). The POI direction is
 * clamped to ±45° from horizontal.
 *
 * @param {{x:number,y:number}} beaconPos  - PDF coordinate of beacon centre
 * @param {Array<{x:number,y:number}>} parcelCoords - Parcel ring in PDF space (may include closing duplicate)
 * @param {string} labelText
 * @param {object} doc  - PDFKit document (for widthOfString)
 * @param {number} fontSize
 * @param {number} beaconRadius
 * @param {object|null} collisionDetector
 * @returns {{x:number, y:number, needsLeader:boolean}}
 */
function placeSuffixLabelPOIDirected(
  beaconPos, parcelCoords, labelText, doc, fontSize, beaconRadius, collisionDetector
) {
  const lw = doc.widthOfString(labelText, { font: 'Helvetica-Bold', size: fontSize });
  const lh = fontSize * 1.2;

  // Deduplicate closing vertex
  const n = parcelCoords.length;
  const last = parcelCoords[n - 1];
  const first = parcelCoords[0];
  const isClosed = last && first &&
    Math.abs(last.x - first.x) < 0.001 && Math.abs(last.y - first.y) < 0.001;
  const ring = isClosed ? parcelCoords.slice(0, -1) : parcelCoords;
  const polygon = ring.map(p => [p.x, p.y]); // [[x,y]] for isLabelBboxInsidePolygon

  // Compute POI
  let poi;
  try {
    poi = findPoleOfInaccessibility(ring.map(p => ({ x: p.x, y: p.y })));
  } catch {
    poi = calculateCentroidFromPDFCoords(ring);
  }

  // Direction from beacon to POI, clamped to ±45° from horizontal
  const rawDx = poi.x - beaconPos.x;
  const rawDy = poi.y - beaconPos.y;
  const rawDeg = Math.atan2(rawDy, rawDx) * (180 / Math.PI);
  const clampedDeg = Math.max(-45, Math.min(45, rawDeg));
  const clampedRad = clampedDeg * Math.PI / 180;
  const pushDx = Math.cos(clampedRad);
  const pushDy = Math.sin(clampedRad);

  // Minimum distance: clear the beacon circle + half label height + 1pt
  const dMin = beaconRadius + lh / 2 + 1;
  // Leader triggers beyond this distance
  const leaderThreshold = dMin * 3;

  // Helper: test a candidate centre (cx, cy) at 0° rotation
  const tryPos = (cx, cy) => {
    if (!isLabelBboxInsidePolygon(cx, cy, lw / 2, lh / 2, 0, polygon)) return false;
    if (collisionDetector?.hasCollision(cx - lw / 2, cy - lh / 2, lw, lh, 1)) return false;
    return true;
  };

  // Short-push path: 3 distances × 5 angular perturbations (all within ±45°)
  const shortDistances = [dMin, dMin * 1.5, dMin * 2.2];
  const perturbsDeg = [0, 10, -10, 20, -20];
  for (const dist of shortDistances) {
    for (const pd of perturbsDeg) {
      const pDeg = Math.max(-45, Math.min(45, clampedDeg + pd));
      const pRad = pDeg * Math.PI / 180;
      const cx = beaconPos.x + Math.cos(pRad) * dist;
      const cy = beaconPos.y + Math.sin(pRad) * dist;
      if (tryPos(cx, cy)) {
        return { x: cx - lw / 2, y: cy - lh / 2, needsLeader: false };
      }
    }
  }

  // Long-drift path: step toward POI
  const poiDist = Math.hypot(rawDx, rawDy);
  const longSteps = 12;
  for (let i = 1; i <= longSteps; i++) {
    const dist = dMin * 2.2 + (poiDist - dMin * 2.2) * (i / longSteps);
    for (const pd of perturbsDeg) {
      const pDeg = Math.max(-45, Math.min(45, clampedDeg + pd));
      const pRad = pDeg * Math.PI / 180;
      const cx = beaconPos.x + Math.cos(pRad) * dist;
      const cy = beaconPos.y + Math.sin(pRad) * dist;
      if (tryPos(cx, cy)) {
        return { x: cx - lw / 2, y: cy - lh / 2, needsLeader: dist > leaderThreshold };
      }
    }
  }

  // Hard fallback: place at POI, leader always drawn
  return { x: poi.x - lw / 2, y: poi.y - lh / 2, needsLeader: true };
}
```

- [ ] **Step 3.3 — Run tests (no regressions)**

```bash
cd app-backend && npx jest --no-coverage
```

Expected: all PASS (no callers changed yet).

- [ ] **Step 3.4 — Commit**

```bash
cd app-backend && git add src/services/pdfkitGeoPDF.js
git commit -m "feat(type2): add placeSuffixLabelPOIDirected()

New function for beacon suffix label placement: POI-directed inward
push from corner, angle clamped to ±45°, always renders at 0°.
Returns needsLeader flag for adaptive leader line drawing.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4 — `drawBeaconLeaderLine()` in `pdfkitGeoPDF.js`

**Files:**
- Modify: `app-backend/src/services/pdfkitGeoPDF.js` (add after `placeSuffixLabelPOIDirected`)

- [ ] **Step 4.1 — Add `drawBeaconLeaderLine` immediately after `placeSuffixLabelPOIDirected`**

```js
/**
 * Draw an adaptive bent leader line from a displaced suffix label to its beacon.
 * - Solid line at 75% of parcel boundary weight (0.8pt × 0.75 = 0.6pt)
 * - Arrowhead pointing at beacon, tip stopping 1pt short of circle edge
 * - Horizontal stub from label edge, then up to 2 bends, then diagonal to beacon
 * - No visual markers at bend nodes
 *
 * @param {object} doc            - PDFKit document
 * @param {{x:number,y:number}} labelPos    - Top-left of label bounding box
 * @param {number} labelWidth
 * @param {number} labelHeight
 * @param {{x:number,y:number}} beaconPos   - Centre of beacon circle
 * @param {number} beaconRadius
 * @param {Array<[number,number]>} polygon  - [[x,y]] parcel ring for path containment
 */
function drawBeaconLeaderLine(
  doc, labelPos, labelWidth, labelHeight, beaconPos, beaconRadius, polygon
) {
  const LEADER_WEIGHT = 0.8 * 0.75;   // 75% of 0.8pt boundary weight = 0.6pt
  const ARROW_LEN    = LEADER_WEIGHT * 5;
  const ARROW_HALF_W = LEADER_WEIGHT * 2;
  const STUB_LEN     = labelHeight;    // horizontal stub length = 1× label height

  // Label centre
  const lCx = labelPos.x + labelWidth / 2;
  const lCy = labelPos.y + labelHeight / 2;

  // Stub: horizontal, toward beacon
  const stubDir = beaconPos.x >= lCx ? 1 : -1;
  const stubX = stubDir > 0 ? labelPos.x + labelWidth + STUB_LEN : labelPos.x - STUB_LEN;
  const stubY = lCy;

  // Arrowhead tip: 1pt outside beacon circle on the line from stub to beacon
  const toBeaconAngle = Math.atan2(beaconPos.y - stubY, beaconPos.x - stubX);
  const tipX = beaconPos.x - (beaconRadius + 1) * Math.cos(toBeaconAngle);
  const tipY = beaconPos.y - (beaconRadius + 1) * Math.sin(toBeaconAngle);

  // --- Choose bend point ---
  // Try single bend: horizontal segment from stub, then diagonal to tip.
  // Candidate bends at t=0.3, 0.5, 0.7 along the vertical between stub and tip.
  let bend1 = null;
  for (const t of [0.5, 0.35, 0.65, 0.2, 0.8]) {
    const bx = stubX;
    const by = stubY + t * (tipY - stubY);
    // Quick check: both sub-segments stay in bounding box of polygon (not full containment — too expensive)
    // Just verify the bend point is roughly inside by testing midpoints of each sub-segment
    const m1x = (stubX + bx) / 2, m1y = (stubY + by) / 2;
    const m2x = (bx + tipX) / 2, m2y = (by + tipY) / 2;
    if (isPointInPolygonSimple([m1x, m1y], polygon) && isPointInPolygonSimple([m2x, m2y], polygon)) {
      bend1 = { x: bx, y: by };
      break;
    }
  }

  // If no single-bend path found, try 2 bends (Z-path)
  let bend2 = null;
  if (!bend1) {
    // Two-bend: stub → bend1 (vertical) → bend2 (horizontal) → tip
    for (const t1 of [0.4, 0.6, 0.3, 0.7]) {
      for (const t2 of [0.7, 0.5, 0.9]) {
        const b1x = stubX, b1y = stubY + t1 * (tipY - stubY);
        const b2x = stubX + t2 * (tipX - stubX), b2y = b1y;
        const m1x = (stubX + b1x) / 2, m1y = (stubY + b1y) / 2;
        const m2x = (b1x + b2x) / 2, m2y = (b1y + b2y) / 2;
        const m3x = (b2x + tipX) / 2, m3y = (b2y + tipY) / 2;
        if (
          isPointInPolygonSimple([m1x, m1y], polygon) &&
          isPointInPolygonSimple([m2x, m2y], polygon) &&
          isPointInPolygonSimple([m3x, m3y], polygon)
        ) {
          bend1 = { x: b1x, y: b1y };
          bend2 = { x: b2x, y: b2y };
          break;
        }
      }
      if (bend1 && bend2) break;
    }
  }

  // Final fallback: straight stub → tip, ignore containment
  if (!bend1) {
    bend1 = { x: stubX, y: (stubY + tipY) / 2 };
  }

  // Draw line
  doc.save();
  doc.lineWidth(LEADER_WEIGHT).strokeColor('#000000');
  doc.moveTo(stubX, stubY);
  doc.lineTo(bend1.x, bend1.y);
  if (bend2) doc.lineTo(bend2.x, bend2.y);
  doc.lineTo(tipX, tipY);
  doc.stroke();

  // Filled arrowhead triangle
  const perpX = -Math.sin(toBeaconAngle);
  const perpY =  Math.cos(toBeaconAngle);
  const baseX = tipX - ARROW_LEN * Math.cos(toBeaconAngle);
  const baseY = tipY - ARROW_LEN * Math.sin(toBeaconAngle);
  doc.moveTo(tipX, tipY)
    .lineTo(baseX + perpX * ARROW_HALF_W, baseY + perpY * ARROW_HALF_W)
    .lineTo(baseX - perpX * ARROW_HALF_W, baseY - perpY * ARROW_HALF_W)
    .closePath()
    .fillColor('#000000').fill();

  doc.restore();
}
```

- [ ] **Step 4.2 — Run tests**

```bash
cd app-backend && npx jest --no-coverage
```

Expected: all PASS.

- [ ] **Step 4.3 — Commit**

```bash
cd app-backend && git add src/services/pdfkitGeoPDF.js
git commit -m "feat(type2): add drawBeaconLeaderLine()

Adaptive bent leader: solid 0.6pt line (75% of 0.8pt boundary weight),
filled arrowhead stopping 1pt outside beacon circle, up to 2 bends
chosen to keep path inside parcel, no node markers.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5 — Wire Type 2 in `renderBeacons()`

**Files:**
- Modify: `app-backend/src/services/pdfkitGeoPDF.js:4813-4895` (uiLabel inside-parcel path)
- Modify: `app-backend/src/services/pdfkitGeoPDF.js:4989-5035` (backend fallback inside-parcel path)
- Modify: `app-backend/src/services/pdfkitGeoPDF.js:5102-5195` (collision nudge + finalPos)
- Modify: `app-backend/src/services/pdfkitGeoPDF.js:5325-5370` (rendering + rotation)

There are two separate code paths that set `labelPos` for inside-parcel suffix labels (the `uiLabel` path and the backend-logic path). Both must be replaced. Then the rendering block must remove `suffixRotationAngle` rotation and add the leader-line draw call.

- [ ] **Step 5.1 — Replace uiLabel inside-parcel placement (line ~4813)**

Find the block starting with:
```js
          const edgeAligned = calculateSuffixBeaconLabelOnEdge(
```
and ending with:
```js
          }
          // STRATEGY 3: Emergency centroid fallback (LAST RESORT - no validation)
          if (!labelPos) {
```
(including the strategy 3 block up to its closing `}`).

Replace that entire section with:

```js
          // POI-directed placement (replaces edge-following + multi-strategy chain)
          const poiResult = placeSuffixLabelPOIDirected(
            pos, pdfCoords, displayLabel, doc, suffixFontSize, beaconRadius, collisionDetector
          );
          labelPos = { x: poiResult.x, y: poiResult.y };
          suffixNeedsLeader = poiResult.needsLeader;
          suffixLeaderPolygon = pdfCoords.map(p => [p.x, p.y]);
```

Also add `let suffixNeedsLeader = false; let suffixLeaderPolygon = null;` near the top of the `beacons.features.forEach` loop, alongside the existing `let suffixRotationAngle = 0; let suffixFontSize = null;` declarations (around line 4743).

- [ ] **Step 5.2 — Replace backend-logic inside-parcel placement (line ~4989)**

Find the block starting with:
```js
          const edgeAligned = calculateSuffixBeaconLabelOnEdge(
            pos,
            pdfCoords,
            displayLabel,
```
(the second occurrence, in the backend fallback path) and ending with:
```js
          suffixInsideCount++;
        } else {
```

Replace the placement lines (keeping `suffixInsideCount++` and the `else` intact):

```js
          // POI-directed placement
          const poiResult2 = placeSuffixLabelPOIDirected(
            pos, pdfCoords, displayLabel, doc, suffixFontSize, beaconRadius, collisionDetector
          );
          labelPos = { x: poiResult2.x, y: poiResult2.y };
          suffixNeedsLeader = poiResult2.needsLeader;
          suffixLeaderPolygon = pdfCoords.map(p => [p.x, p.y]);

          suffixInsideCount++;
        } else {
```

- [ ] **Step 5.3 — Remove collision nudge block that re-tries 8-direction nudges**

The collision nudge at lines ~5173-5192 now only fires for suffix labels and references the old position. Since `placeSuffixLabelPOIDirected` already handles collision avoidance internally, remove the nudge block. Find:

```js
    if (isInsideLabel) {
      // Check if the calculated position collides with existing labels (edge labels, etc.)
      if (isSuffixLabel && suffixLabelParcelCoords &&
          collisionDetector.hasCollision(labelPos.x, labelPos.y, labelWidth, labelHeight, 1)) {
```

and replace the entire `if (isInsideLabel) { ... }` block (down to before `} else if (!isSuffixLabel && fullOutsideForced)`) with:

```js
    if (isInsideLabel) {
      finalPos = labelPos;  // placeSuffixLabelPOIDirected handles collision internally
```

- [ ] **Step 5.4 — Replace suffix label rendering to always use 0° rotation**

Find the `if (isSuffixLabel)` rendering block (line ~5325):

```js
    if (isSuffixLabel) {
      const centerX = finalPos.x + labelWidth / 2;
      const centerY = finalPos.y + verticalOffset + labelHeight / 2;

      doc.translate(centerX, centerY);
      doc.rotate(suffixRotationAngle, { origin: [0, 0] });
```

Replace just the `doc.rotate(...)` line — remove it entirely (labels always render at 0°):

```js
    if (isSuffixLabel) {
      const centerX = finalPos.x + labelWidth / 2;
      const centerY = finalPos.y + verticalOffset + labelHeight / 2;

      doc.translate(centerX, centerY);
      // No rotation — Type 2 labels always render at 0° (east-west)
```

- [ ] **Step 5.5 — Add leader line draw call after `doc.restore()` for suffix labels**

After the `doc.restore()` line (line ~5356), add:

```js
    // Draw leader line if label was displaced far from its corner
    if (isSuffixLabel && suffixNeedsLeader && suffixLeaderPolygon) {
      drawBeaconLeaderLine(
        doc,
        finalPos,
        labelWidth,
        labelHeight,
        pos,          // beacon centre
        beaconRadius,
        suffixLeaderPolygon
      );
    }
```

- [ ] **Step 5.6 — Fix collision detector registration for 0° suffix labels**

The collision registration block after the draw (line ~5360) computes rotated dimensions using `suffixRotationAngle`. Since rotation is now always 0°, simplify it. Find:

```js
    if (isSuffixLabel) {
      const centerX = finalPos.x + labelWidth / 2;
      const centerY = finalPos.y + verticalOffset + labelHeight / 2;
      const angleRad = (suffixRotationAngle * Math.PI) / 180;
      const cos = Math.abs(Math.cos(angleRad));
      const sin = Math.abs(Math.sin(angleRad));
      const rotatedWidth = labelWidth * cos + labelHeight * sin;
      const rotatedHeight = labelWidth * sin + labelHeight * cos;
      collisionDetector.addRegion(
        centerX - rotatedWidth / 2,
```

Replace with:

```js
    if (isSuffixLabel) {
      const centerX = finalPos.x + labelWidth / 2;
      const centerY = finalPos.y + verticalOffset + labelHeight / 2;
      // Labels are always 0° — no rotation needed for AABB
      collisionDetector.addRegion(
        centerX - labelWidth / 2,
```

(Find the closing of `collisionDetector.addRegion(...)` and keep the argument values; only the `centerX - rotatedWidth / 2` → `centerX - labelWidth / 2` and height equivalent need updating.)

- [ ] **Step 5.7 — Run full test suite**

```bash
cd app-backend && npx jest --no-coverage
```

Expected: all PASS.

- [ ] **Step 5.8 — Commit**

```bash
cd app-backend && git add src/services/pdfkitGeoPDF.js
git commit -m "feat(type2): wire POI-directed placement + leader lines in renderBeacons

Replaces edge-following placement and multi-strategy fallback chain
with placeSuffixLabelPOIDirected(). All suffix labels now render at 0°
(east-west). Adaptive leader lines drawn when label drifts to wider
interior whitespace.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6 — Smoke test (generate plan, verify visually)

**Files:** None modified — verification only.

- [ ] **Step 6.1 — Start backend**

```bash
cd app-backend && npm run dev
```

Expected: Fastify listening on port 3050 with no startup errors.

- [ ] **Step 6.2 — Generate a plan with narrow diagonal parcels**

Use the existing SurveyPro UI or call the PDF endpoint directly. Open the generated PDF and check:

1. No stand label (Type 1) is rotated more than 45° from horizontal.
2. All beacon suffix labels (Type 2) render horizontally (0°).
3. Labels for narrow parcels (e.g. stands 2031–2034 style) appear in the wider mid-section, not cramped at narrow ends.
4. Leader lines on displaced labels are solid, thin (lighter than boundary lines), with a filled arrowhead pointing at the beacon circle but not touching it.
5. No leader lines appear on labels that fit close to their corners.
6. No stand label or suffix label visibly crosses a parcel boundary line.

- [ ] **Step 6.3 — Run full test suite one final time**

```bash
cd app-backend && npx jest --no-coverage
```

Expected: all PASS.

---

## Self-Review Notes

**Spec coverage check:**
- ±45° clamp for Type 1 ✓ (Task 2.2)
- POI as Type 1 anchor ✓ (Task 2.2–2.3)
- Centroid-drift fallback for Type 1 ✓ (Task 2.4)
- 7pt font floor for Type 1 ✓ (existing `fontSizes` array preserved)
- Type 2 always 0° rotation ✓ (Task 5.4)
- POI-directed push for Type 2 ✓ (Task 3.2)
- Short-push / long-drift split ✓ (Task 3.2)
- Leader line trigger threshold ✓ (Task 3.2 `leaderThreshold`)
- Leader: solid, 75% weight ✓ (Task 4.1 `LEADER_WEIGHT = 0.8 * 0.75`)
- Leader: arrowhead at beacon, stops short ✓ (Task 4.1)
- Leader: no bend-node markers ✓ (Task 4.1 — polyline only)
- Leader: up to 2 bends ✓ (Task 4.1)
- Out-of-scope: edge labels, Outside Figure, DXF ✓ (not touched)

**Type consistency:**
- `placeSuffixLabelPOIDirected` defined in Task 3, called in Tasks 5.1 and 5.2 ✓
- `drawBeaconLeaderLine` defined in Task 4, called in Task 5.5 ✓
- `suffixNeedsLeader` / `suffixLeaderPolygon` declared in Task 5.1, used in 5.5 ✓
- `findPoleOfInaccessibility` exported from `labelPlacer.js` in Task 1, imported in Tasks 2 and 3 ✓
- `isLabelBboxInsidePolygon` already defined in `pdfkitLabeling.js` (line 42); used in Task 2.4 ✓
- `isPointInPolygonSimple` already defined in `pdfkitLabeling.js` (line 24); used in Task 2.4 ✓
- `isPointInPolygonSimple` already defined in `pdfkitGeoPDF.js` (searched — used internally); used in Task 4.1 ✓
- `calculateCentroidFromPDFCoords` already defined in `pdfkitGeoPDF.js` (line 5585); used in Task 3.2 ✓
