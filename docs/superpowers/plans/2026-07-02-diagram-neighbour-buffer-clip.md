# Diagram Neighbour Buffer Clip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the S.G. Diagram, draw only the portion of each abutting property that falls within a true 10 m offset buffer of the subject parcel (labelled), exclude the OUTSIDE FIGURE parcel, and size the figure to that buffer — instead of drawing the whole survey site.

**Architecture:** A new pure helper `diagram/neighbourBuffer.js` uses `clipper-lib` (planar polygon offset + intersection, in Cape Lo metres via integer scaling) to build the 10 m buffer of the subject and clip neighbour polygons to it. `diagramPdf.js` computes the buffer, sizes the figure extent to it, and draws only the clipped neighbour strips (skipping the OUTSIDE FIGURE parcel and non-abutting parcels).

**Tech Stack:** Node ESM + pdfkit + clipper-lib + Jest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-02-diagram-neighbour-buffer-clip-design.md`.
- Diagram plan type only (`diagramPdf.js`). No change to General/Working/DXF.
- Buffer = **true shape-following 10 m outward offset** of the subject (planar, Cape Lo metres). Not a padded bbox. `@turf/buffer` is forbidden (geodesic).
- Dependency: **`clipper-lib@6.4.2`** (pure JS, zero deps). Integer coords via `CLIPPER_SCALE = 1000`.
- `BUFFER_M = 10` (fixed; not configurable).
- OUTSIDE FIGURE parcel excluded entirely.
- All geometry canonical `[Y=Westing, X=Southing]`; normalize each incoming ring point via `normalizeCapeLoYX` (from `../pdfkitGeoPDF/geometry.js`).
- Degrade gracefully: degenerate subject / empty buffer → draw subject only (extent = `parcelExtent(subject)`), no neighbours.
- Backend Jest: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns=<pat>` (run from `app-backend/`).

---

### Task 1: `neighbourBuffer.js` — offset buffer + clip helper (+ clipper-lib)

**Files:**
- Modify: `app-backend/package.json` (add `clipper-lib` dependency)
- Create: `app-backend/src/services/diagram/neighbourBuffer.js`
- Test: `app-backend/src/services/diagram/__tests__/neighbourBuffer.test.js`

**Interfaces:**
- Consumes: `normalizeCapeLoYX` from `../pdfkitGeoPDF/geometry.js`; `clipper-lib`.
- Produces:
  - `BUFFER_M = 10`
  - `bufferRing(ring, distanceM = BUFFER_M) => Array<Array<[y,x]>>` — 10 m outward offset polygon(s) of a raw GeoJSON ring, in canonical `[y,x]` metres.
  - `clipRingToPolygon(neighbourRing, bufferPolys) => Array<Array<[y,x]>>` — neighbour ∩ buffer, largest-area first; `[]` if it doesn't reach the buffer.
  - `ringExtent(polys) => { minY, maxY, minX, maxX, widthM, heightM }` — bbox over `[y,x]` polygons (same shape as `parcelExtent`).
  - `isOutsideFigureFeature(feature) => boolean`.
  - `polygonArea(ring) => number` (abs shoelace; used for strip ordering).

- [ ] **Step 1: Install clipper-lib and verify ESM import**

Run (from `app-backend/`):
```bash
npm install clipper-lib@6.4.2
node --input-type=module -e "import('clipper-lib').then(m => { const C = m.default || m; console.log('Clipper?', typeof C.Clipper, 'Offset?', typeof C.ClipperOffset); })"
```
Expected: prints `Clipper? function Offset? function`. If the default export is undefined, use `import ClipperLib from 'clipper-lib'` (CJS interop) — confirm which form works and use it in Step 4.

- [ ] **Step 2: Write the failing tests**

Create `app-backend/src/services/diagram/__tests__/neighbourBuffer.test.js`:
```js
import { describe, test, expect } from '@jest/globals'
import {
  bufferRing, clipRingToPolygon, ringExtent, isOutsideFigureFeature, polygonArea,
} from '../neighbourBuffer.js'

// 100 m subject square, stored [Southing, Westing] (the DB order); normalized to
// [Y=Westing, X=Southing]: Westing 85000..85100, Southing 2144000..2144100.
const subjectRing = [
  [2144000, 85000], [2144100, 85000], [2144100, 85100], [2144000, 85100], [2144000, 85000],
]

describe('bufferRing', () => {
  test('offsets the subject outward ~10 m on every side', () => {
    const buf = bufferRing(subjectRing, 10)
    expect(buf.length).toBeGreaterThan(0)
    const e = ringExtent(buf)
    expect(Math.abs(e.minY - 84990)).toBeLessThan(1)
    expect(Math.abs(e.maxY - 85110)).toBeLessThan(1)
    expect(Math.abs(e.minX - 2143990)).toBeLessThan(1)
    expect(Math.abs(e.maxX - 2144110)).toBeLessThan(1)
  })
  test('returns [] for a degenerate ring', () => {
    expect(bufferRing([[2144000, 85000], [2144100, 85000]], 10)).toEqual([])
  })
})

describe('clipRingToPolygon', () => {
  const buf = bufferRing(subjectRing, 10)

  test('an abutting neighbour clips to a strip inside the buffer bbox', () => {
    // Neighbour abutting the subject on its Westing=85100 side, extending away.
    const abutting = [
      [2144000, 85100], [2144200, 85100], [2144200, 85500], [2144000, 85500], [2144000, 85100],
    ]
    const strips = clipRingToPolygon(abutting, buf)
    expect(strips.length).toBeGreaterThan(0)
    const se = ringExtent(strips)
    const be = ringExtent(buf)
    expect(se.minY).toBeGreaterThanOrEqual(be.minY - 1)
    expect(se.maxY).toBeLessThanOrEqual(be.maxY + 1)
    expect(se.minX).toBeGreaterThanOrEqual(be.minX - 1)
    expect(se.maxX).toBeLessThanOrEqual(be.maxX + 1)
  })

  test('a far neighbour clips to nothing', () => {
    const far = [
      [2144000, 90000], [2144100, 90000], [2144100, 90100], [2144000, 90100], [2144000, 90000],
    ]
    expect(clipRingToPolygon(far, buf)).toEqual([])
  })
})

describe('polygonArea', () => {
  test('computes the absolute area of a 100 m square', () => {
    expect(polygonArea([[0, 0], [0, 100], [100, 100], [100, 0]])).toBeCloseTo(10000, 6)
  })
})

describe('isOutsideFigureFeature', () => {
  test('detects the OUTSIDE FIGURE parcel by designation/stand/flag', () => {
    expect(isOutsideFigureFeature({ properties: { designation: 'OUTSIDE FIGURE' } })).toBe(true)
    expect(isOutsideFigureFeature({ properties: { stand: 'OF' } })).toBe(true)
    expect(isOutsideFigureFeature({ properties: { metadata: { is_outside_figure: true } } })).toBe(true)
  })
  test('a normal stand is not the outside figure', () => {
    expect(isOutsideFigureFeature({ properties: { stand: '404', designation: 'Stand 404' } })).toBe(false)
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns=neighbourBuffer`
Expected: FAIL — cannot find module `../neighbourBuffer.js`.

- [ ] **Step 4: Implement**

Create `app-backend/src/services/diagram/neighbourBuffer.js` (use the import form confirmed in Step 1):
```js
import ClipperLib from 'clipper-lib'
import { normalizeCapeLoYX } from '../pdfkitGeoPDF/geometry.js'

export const BUFFER_M = 10
const SCALE = 1000                 // metres → integer (mm) for Clipper
const ARC_TOLERANCE = 0.5 * SCALE  // 0.5 m smoothness on round joins

// [y,x] metres → Clipper integer point (X=Westing, Y=Southing).
function pt(y, x) { return { X: Math.round(y * SCALE), Y: Math.round(x * SCALE) } }
function unpt(p) { return [p.X / SCALE, p.Y / SCALE] }

function dropClose(pts) {
  if (pts.length > 1) {
    const a = pts[0], b = pts[pts.length - 1]
    if (a[0] === b[0] && a[1] === b[1]) return pts.slice(0, -1)
  }
  return pts
}

// Raw GeoJSON ring → Clipper path in canonical [Y=Westing, X=Southing].
function geoToPath(ring) {
  const norm = dropClose((ring ?? []).map((p) => normalizeCapeLoYX(p[0], p[1])))
  return norm.map(([y, x]) => pt(y, x))
}
// [y,x] ring (already normalized) → Clipper path.
function yxToPath(ring) {
  return dropClose(ring ?? []).map(([y, x]) => pt(y, x))
}
function pathToYX(path) { return path.map(unpt) }

export function polygonArea(ring) {
  let a = 0
  for (let i = 0; i < ring.length; i++) {
    const [y1, x1] = ring[i]
    const [y2, x2] = ring[(i + 1) % ring.length]
    a += y1 * x2 - y2 * x1
  }
  return Math.abs(a) / 2
}

function offsetOnce(path, deltaScaled) {
  const co = new ClipperLib.ClipperOffset(2, ARC_TOLERANCE)
  co.AddPath(path, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon)
  const sol = new ClipperLib.Paths()
  co.Execute(sol, deltaScaled)
  return sol
}

/** 10 m outward offset of a raw subject ring → array of [y,x] rings. */
export function bufferRing(ring, distanceM = BUFFER_M) {
  const path = geoToPath(ring)
  if (path.length < 3) return []
  const delta = distanceM * SCALE
  let sol = offsetOnce(path, delta)
  // Guarantee OUTWARD growth regardless of the ring's winding: the offset area
  // must exceed the input area; if not, the orientation made +delta shrink — retry
  // with the path reversed.
  const inArea = Math.abs(ClipperLib.Clipper.Area(path))
  const outArea = sol.reduce((s, p) => s + Math.abs(ClipperLib.Clipper.Area(p)), 0)
  if (!sol.length || outArea < inArea) {
    sol = offsetOnce(path.slice().reverse(), delta)
  }
  return sol.map(pathToYX)
}

/**
 * Intersect a raw neighbour ring with the buffer ([y,x] rings). Returns clipped
 * [y,x] rings, largest-area first; [] when the neighbour doesn't reach the buffer.
 */
export function clipRingToPolygon(neighbourRing, bufferPolys) {
  const subj = geoToPath(neighbourRing)
  if (subj.length < 3 || !bufferPolys?.length) return []
  const clip = bufferPolys.map(yxToPath).filter((p) => p.length >= 3)
  if (!clip.length) return []
  const c = new ClipperLib.Clipper()
  c.AddPath(subj, ClipperLib.PolyType.ptSubject, true)
  c.AddPaths(clip, ClipperLib.PolyType.ptClip, true)
  const sol = new ClipperLib.Paths()
  c.Execute(
    ClipperLib.ClipType.ctIntersection, sol,
    ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero,
  )
  const rings = sol.map(pathToYX).filter((r) => r.length >= 3)
  rings.sort((a, b) => polygonArea(b) - polygonArea(a))
  return rings
}

export function ringExtent(polys) {
  let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity
  for (const ring of polys) {
    for (const [y, x] of ring) {
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      if (x < minX) minX = x
      if (x > maxX) maxX = x
    }
  }
  return { minY, maxY, minX, maxX, widthM: maxY - minY, heightM: maxX - minX }
}

export function isOutsideFigureFeature(feature) {
  const p = feature?.properties ?? {}
  const has = (v) => typeof v === 'string' && (
    v.toLowerCase().includes('outside figure') ||
    v.toLowerCase().includes('outside_figure') ||
    v.toLowerCase().includes('outsidefigure'))
  return (
    has(p.designation) || has(p.stand) || has(p.description) ||
    (typeof p.stand === 'string' && p.stand.toLowerCase() === 'of') ||
    p.is_outside_figure === true ||
    p.metadata?.is_outside_figure === true ||
    p.metadata?.isOutsideFigure === true
  )
}
```

- [ ] **Step 5: Verify pass**

Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns=neighbourBuffer`
Expected: PASS (all cases). If `bufferRing` bbox comes back ~10 m *smaller* instead of larger, the offset shrank — the reverse-retry guard should prevent this; if a test still shows shrinkage, confirm Step 1's import exposes `ClipperLib.Clipper.Area` and `ClipperOffset`.

- [ ] **Step 6: Commit**

```bash
git add app-backend/package.json app-backend/package-lock.json app-backend/src/services/diagram/neighbourBuffer.js app-backend/src/services/diagram/__tests__/neighbourBuffer.test.js
git commit -m "feat(diagram): 10m offset-buffer + neighbour clip helper (clipper-lib)"
```

---

### Task 2: Wire buffer clip into `diagramPdf.js`

**Files:**
- Modify: `app-backend/src/services/diagramPdf.js`
- Modify: `app-backend/src/services/__tests__/diagramPdf.test.js`

**Interfaces:**
- Consumes: `bufferRing`, `clipRingToPolygon`, `ringExtent`, `isOutsideFigureFeature` (Task 1). Existing in-file: `deriveSubjectGeometry`, `parcelExtent`, `pickDiagramScale`, `makeTransform`, `drawRing`, `centroidPt`, `layout`, `neighbours`.
- Produces: `generateDiagramPDF` unchanged signature/return; neighbours now drawn as clipped strips within the 10 m buffer, OUTSIDE FIGURE excluded, figure sized to the buffer.

**Context:** `.vue`-style caveat: PDF geometry can't be asserted from the binary, so the integration test guards "valid PDF, no throw"; the behavioural correctness is covered by Task 1's unit tests + the manual visual step.

- [ ] **Step 1: Add the import**

After the existing `import { computeDiagramLayout, pageDimsPt, marginsPt } from './diagram/diagramLayout.js'` line, add:
```js
import { bufferRing, clipRingToPolygon, ringExtent, isOutsideFigureFeature } from './diagram/neighbourBuffer.js'
```

- [ ] **Step 2: Compute the buffer + size the figure to it**

Replace this block (currently at ~`:186-189`):
```js
  const geometry = deriveSubjectGeometry(subject)
  const extent = parcelExtent(subject)
  const { denom, label } = pickDiagramScale(extent, layout.figure, requestedScale)
  const tf = makeTransform(extent, layout.figure, denom)
```
with:
```js
  const geometry = deriveSubjectGeometry(subject)
  // 10 m offset buffer of the subject; the figure is sized to it so only a thin
  // ring of surrounding context is shown (falls back to the subject extent).
  let buffer = []
  try {
    buffer = bufferRing(subject?.geometry?.coordinates?.[0] ?? [])
  } catch (e) {
    logger?.warn?.(`[Diagram] buffer failed: ${e?.message}`)
  }
  const extent = buffer.length ? ringExtent(buffer) : parcelExtent(subject)
  const { denom, label } = pickDiagramScale(extent, layout.figure, requestedScale)
  const tf = makeTransform(extent, layout.figure, denom)
```

- [ ] **Step 3: Replace the neighbour loop with clipped strips**

Replace this block (currently at ~`:199-207`):
```js
  // Neighbours: faint outline + stand-number label at centroid.
  doc.font('Helvetica').fontSize(7).fillColor('#555555')
  for (const nb of neighbours) {
    const pr = ringToPt(nb, tf)
    drawRing(doc, pr, { color: '#999999', width: 0.5 })
    const c = centroidPt(pr)
    const stand = nb.properties?.stand ?? nb.properties?.designation ?? ''
    if (stand) doc.text(String(stand), c.px - 15, c.py - 4, { width: 30, align: 'center' })
  }
```
with:
```js
  // Abutting neighbours: clip to the 10 m buffer, faint outline + label at the
  // clipped strip. The whole-site OUTSIDE FIGURE parcel is excluded; parcels that
  // don't reach the buffer clip to nothing and are omitted.
  doc.font('Helvetica').fontSize(7).fillColor('#555555')
  if (buffer.length) {
    for (const nb of neighbours) {
      if (isOutsideFigureFeature(nb)) continue
      const strips = clipRingToPolygon(nb?.geometry?.coordinates?.[0] ?? [], buffer)
      if (!strips.length) continue
      for (const strip of strips) {
        drawRing(doc, strip.map((p) => tf(p)), { color: '#999999', width: 0.5 })
      }
      const stand = nb.properties?.stand ?? nb.properties?.designation ?? ''
      if (stand) {
        const c = centroidPt(strips[0].map((p) => tf(p)))
        doc.text(String(stand), c.px - 15, c.py - 4, { width: 30, align: 'center' })
      }
    }
  }
```

- [ ] **Step 4: Remove the now-unused `ringToPt` helper**

`ringToPt` was only used by the old neighbour loop. Delete its definition (currently near the top of the file):
```js
function ringToPt(feature, tf) {
  const ring = feature?.geometry?.coordinates?.[0] ?? []
  return ring.map((p) => tf(p))
}
```
Run `grep -n "ringToPt" app-backend/src/services/diagramPdf.js` first — expect no other references before deleting.

- [ ] **Step 5: Add the integration guard test**

Add to `app-backend/src/services/__tests__/diagramPdf.test.js`, inside the top `describe('generateDiagramPDF', …)`:
```js
  test('clips neighbours to the buffer and omits the outside figure (realistic coords)', async () => {
    const subj = { type: 'Feature', properties: { id: 'S', stand: '403', designation: 'STAND 403', area_m2: 10000 },
      geometry: { type: 'Polygon', coordinates: [[[2144000, 85000], [2144100, 85000], [2144100, 85100], [2144000, 85100], [2144000, 85000]]] } }
    const abut = { type: 'Feature', properties: { id: 'N', stand: '404' },
      geometry: { type: 'Polygon', coordinates: [[[2144000, 85100], [2144200, 85100], [2144200, 85500], [2144000, 85500], [2144000, 85100]]] } }
    const far = { type: 'Feature', properties: { id: 'F', stand: '999' },
      geometry: { type: 'Polygon', coordinates: [[[2144000, 90000], [2144100, 90000], [2144100, 90100], [2144000, 90100], [2144000, 90000]]] } }
    const of = { type: 'Feature', properties: { id: 'OF', designation: 'OUTSIDE FIGURE' },
      geometry: { type: 'Polygon', coordinates: [[[2143000, 84000], [2145000, 84000], [2145000, 86000], [2143000, 86000], [2143000, 84000]]] } }
    const r = await generateDiagramPDF({
      parcels: { type: 'FeatureCollection', features: [subj, abut, far, of] },
      beacons: { type: 'FeatureCollection', features: [] },
      metadata: { subjectParcelId: 'S', designation: 'STAND 403', centralMeridian: 29 },
      projection: 'EPSG:22289', scale: 'auto', sheetSize: 'A4',
    }, logger)
    expect(r.pdfBuffer.slice(0, 5).toString()).toBe('%PDF-')
    expect(r.pdfBuffer.length).toBeGreaterThan(2000)
  })
```

- [ ] **Step 6: Verify pass**

Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns="diagram"`
Expected: PASS — neighbourBuffer, diagramPdf (incl. new test), and the other diagram suites.

- [ ] **Step 7: Manual visual check + commit**

Regenerate the STANDS 403-405 diagram (or any project with neighbours) and confirm only a ~10 m ring of 404/405/REM/87 shows around the subject, labelled, with no OUTSIDE FIGURE and no whole-site sprawl. Note as deferred if servers aren't running.
```bash
git add app-backend/src/services/diagramPdf.js app-backend/src/services/__tests__/diagramPdf.test.js
git commit -m "feat(diagram): draw only 10m-buffer-clipped neighbours, exclude outside figure"
```

---

## Self-Review

**Spec coverage:**
- True 10 m offset buffer via clipper-lib (offset + intersection, integer scaling) → Task 1. ✓
- `neighbourBuffer.js` API (`bufferRing`, `clipRingToPolygon`, `ringExtent`, `isOutsideFigureFeature`) → Task 1. ✓
- OUTSIDE FIGURE excluded; non-abutting parcels omitted → Task 1 (`isOutsideFigureFeature`, empty clip) + Task 2 loop. ✓
- Figure sized to buffer, subject-extent fallback → Task 2 Step 2. ✓
- Clipped strips drawn + labelled at clipped centroid (largest strip) → Task 2 Step 3. ✓
- Degrade gracefully (degenerate subject/empty buffer → subject only) → Task 1 (`bufferRing` returns `[]`) + Task 2 (`buffer.length` guard). ✓
- `@turf/buffer` not used; `clipper-lib` added; `BUFFER_M=10`, `CLIPPER_SCALE=1000` → Global Constraints + Task 1. ✓
- Testing: pure unit tests (Task 1), integration guard + manual visual (Task 2). ✓

**Placeholder scan:** No TBD/TODO. Step 1 (import form) and Step 5-note (shrinkage) are concrete verification checks with stated expected output and fallback. The integration test is a guard by necessity (PDF binary isn't geometry-inspectable) — the behavioural assertions live in Task 1's unit tests + the manual step, as stated.

**Type consistency:** `bufferRing` → `Array<[y,x] ring>` consumed by `ringExtent` and `clipRingToPolygon` (Task 1) and by `diagramPdf.js` (Task 2). `ringExtent` returns `{minY,maxY,minX,maxX,widthM,heightM}` — same shape as `parcelExtent`, so `pickDiagramScale`/`makeTransform` accept either. `clipRingToPolygon` → `Array<[y,x] ring>` whose points are fed to the existing `tf(coord)` (which normalizes + maps) and `centroidPt` (over `{px,py}` points) in Task 2. `isOutsideFigureFeature(feature)` consumed in the Task 2 loop.
