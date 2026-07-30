# DXF Diagram Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Diagram plan type a real DXF export — a line-art twin of `generateDiagramPDF` — instead of silently falling back to the general-plan DXF generator.

**Architecture:** A new `diagramDxf.js` reuses every pure `diagram/*.js` helper `diagramPdf.js` already uses (geometry, scale, layout, `contiguousMarks`, `roadBandRibbon`, …) so the two renderers can never structurally drift. All layout math stays in PDF-point space, computed identically to the PDF path; a single derived conversion (`pageToGround`) maps every point — figure geometry and every annotation block alike — into real Cape Lo ground coordinates, verified algebraically to reproduce `dxfGenerator.js`'s own `capeLoToDxfSouthUp` for the figure while placing the rest of the sheet in correctly-scaled, extent-anchored ground metres (the standard survey-CAD convention). A new self-contained `dxfPrimitives.js` writes the DXF file; `dxfGenerator.js` is not modified.

**Tech Stack:** Node.js ESM (backend, Jest under `--experimental-vm-modules`). No frontend changes.

## Global Constraints

- Backend is ESM (`"type": "module"`). Run backend tests from `app-backend` with:
  `node --experimental-vm-modules node_modules/jest/bin/jest.js <pattern>` (bare `npx jest` fails).
- `dxfGenerator.js`, `adjoiningFeaturesDxf.js`, `diagramPdf.js` are **not modified** by this plan.
- Every block is computed in **PDF-point space first** (identical formulas to `diagramPdf.js`), converted to ground DXF coordinates only at the moment of calling a `dxfPrimitives` emitter, via the `pageToGround`/`groundPerPt` conversion built in Task 2. Text-width measurement in point space uses `textWidth(text, heightPt) = text.length * heightPt * 0.55` (the same 0.55 width-factor the rest of this codebase's DXF text already assumes — see `adjoiningFeaturesDxf.js`), never PDFKit's `doc.widthOfString`.
- DXF contiguous stubs render as **plain (solid) lines** — DXF dash linetypes are not used anywhere in this codebase's existing DXF output (`adjoiningFeaturesDxf.js` draws contiguous stubs as plain `LINE`s); this is an accepted line-art difference from the PDF's dashed stroke, not a defect.
- Beacon circles cannot replicate the PDF's white-fill knockout look (DXF entity draw order doesn't clip in most viewers); a plain open circle is emitted instead, matching `dxfGenerator.js`'s own beacon convention. Accepted difference, not a defect.
- No text word-wrap: any PDF text that used PDFKit's automatic `{width: ...}` wrapping (only the beacon-description lines) renders as a single un-wrapped line in DXF. Accepted simplification.
- End every task by committing. Commit messages end with the repo's trailer:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

### Task 1: `dxfPrimitives.js` — self-contained DXF file writer

**Files:**
- Create: `app-backend/src/services/diagram/dxfPrimitives.js`
- Test: `app-backend/src/services/diagram/__tests__/dxfPrimitives.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `createDxfWriter(layers) -> writer` where `layers` is `Array<{name: string, color: number}>` (ACI colour numbers) and `writer` is:
  - `writer.addLine(layer, x1, y1, x2, y2)`
  - `writer.addPolylineOutline(layer, points, closed = true)` — `points: Array<{x,y}>`; draws consecutive `addLine` segments, plus a closing segment back to `points[0]` when `closed`.
  - `writer.addCircle(layer, cx, cy, r)`
  - `writer.addText(layer, x, y, text, height, rotationDeg = 0)` — left-justified.
  - `writer.addTextC(layer, xc, y, text, height)` — centre-justified (DXF group 72=1).
  - `writer.addTextR(layer, xr, y, text, height)` — right-justified (DXF group 72=2).
  - `writer.addSolidRect(layer, x1, y1, x2, y2)` — filled axis-aligned rectangle (DXF `SOLID` entity).
  - `writer.finish(extMin, extMax) -> Buffer` — assembles HEADER/TABLES/ENTITIES/EOF and returns the DXF file bytes. `extMin`/`extMax` are `{x, y}`.
- Also produces: `textWidth(text, height) -> number` (module-level export, not on `writer`) — `String(text).length * height * 0.55`.

- [ ] **Step 1: Write the failing test**

```js
// app-backend/src/services/diagram/__tests__/dxfPrimitives.test.js
import { describe, test, expect } from '@jest/globals'
import { createDxfWriter, textWidth } from '../dxfPrimitives.js'

const LAYERS = [{ name: 'A', color: 7 }, { name: 'B', color: 1 }]

describe('textWidth', () => {
  test('length * height * 0.55', () => {
    expect(textWidth('ABC', 10)).toBeCloseTo(16.5, 6)
    expect(textWidth('', 10)).toBe(0)
  })
})

describe('createDxfWriter', () => {
  test('finish() produces a well-formed DXF with declared layers', () => {
    const w = createDxfWriter(LAYERS)
    const buf = w.finish({ x: -10, y: -10 }, { x: 10, y: 10 })
    expect(Buffer.isBuffer(buf)).toBe(true)
    const text = buf.toString('utf8')
    expect(text.startsWith('  0\nSECTION\n')).toBe(true)
    expect(text).toContain('HEADER')
    expect(text).toContain('ENTITIES')
    expect(text.trim().endsWith('0\nEOF')).toBe(true)
    expect(text).toContain('2\nA\n')
    expect(text).toContain('2\nB\n')
  })

  test('addLine emits a LINE entity between the ENTITIES markers', () => {
    const w = createDxfWriter(LAYERS)
    w.addLine('A', 1, 2, 3, 4)
    const text = w.finish({ x: 0, y: 0 }, { x: 5, y: 5 }).toString('utf8')
    expect(text).toContain('LINE')
    expect(text).toContain('1.0000')
    expect(text).toContain('3.0000')
  })

  test('addPolylineOutline draws N segments for a closed ring, N-1 for open', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]
    const wClosed = createDxfWriter(LAYERS)
    wClosed.addPolylineOutline('A', pts, true)
    const closedText = wClosed.finish({ x: 0, y: 0 }, { x: 10, y: 10 }).toString('utf8')
    expect((closedText.match(/\bLINE\b/g) || []).length).toBe(3)

    const wOpen = createDxfWriter(LAYERS)
    wOpen.addPolylineOutline('A', pts, false)
    const openText = wOpen.finish({ x: 0, y: 0 }, { x: 10, y: 10 }).toString('utf8')
    expect((openText.match(/\bLINE\b/g) || []).length).toBe(2)
  })

  test('addCircle emits a CIRCLE entity', () => {
    const w = createDxfWriter(LAYERS)
    w.addCircle('A', 5, 5, 2.5)
    const text = w.finish({ x: 0, y: 0 }, { x: 10, y: 10 }).toString('utf8')
    expect(text).toContain('CIRCLE')
    expect(text).toContain('2.5000')
  })

  test('addText/addTextC/addTextR emit TEXT with the right justification codes', () => {
    const w = createDxfWriter(LAYERS)
    w.addText('A', 0, 0, 'left', 5)
    w.addTextC('A', 10, 0, 'center', 5)
    w.addTextR('A', 20, 0, 'right', 5)
    const text = w.finish({ x: -5, y: -5 }, { x: 25, y: 5 }).toString('utf8')
    expect((text.match(/\bTEXT\b/g) || []).length).toBe(3)
    expect(text).toContain('72\n1\n')  // centre code present
    expect(text).toContain('72\n2\n')  // right code present
  })

  test('addText rotation emits group code 50', () => {
    const w = createDxfWriter(LAYERS)
    w.addText('A', 0, 0, 'tilted', 5, 45)
    const text = w.finish({ x: -5, y: -5 }, { x: 5, y: 5 }).toString('utf8')
    expect(text).toContain('50\n45.0000\n')
  })

  test('addSolidRect emits a SOLID entity with 4 corners', () => {
    const w = createDxfWriter(LAYERS)
    w.addSolidRect('A', 0, 0, 4, 2)
    const text = w.finish({ x: 0, y: 0 }, { x: 4, y: 2 }).toString('utf8')
    expect(text).toContain('SOLID')
  })

  test('degree symbol is encoded as the DXF control code %%d', () => {
    const w = createDxfWriter(LAYERS)
    w.addText('A', 0, 0, '45°', 5)
    const text = w.finish({ x: 0, y: 0 }, { x: 5, y: 5 }).toString('utf8')
    expect(text).toContain('45%%d')
    expect(text).not.toContain('°')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js dxfPrimitives`
Expected: FAIL — `Cannot find module '../dxfPrimitives.js'`.

- [ ] **Step 3: Write the implementation**

```js
// app-backend/src/services/diagram/dxfPrimitives.js
/**
 * Self-contained DXF (AutoCAD R12 ASCII) file writer. Deliberately duplicates the
 * low-level plumbing dxfGenerator.js keeps private (group-code helper, HEADER/
 * TABLES/ENTITIES/EOF assembly, LINE/TEXT/CIRCLE/SOLID emitters) rather than
 * extracting a shared module — dxfGenerator.js has existing snapshot/parity tests
 * and is not touched by this renderer. See the DXF diagram design spec for the
 * rationale.
 */

function p(code, value) {
  return String(code).padStart(3) + '\n' + value + '\n'
}

/** 0.55 is the STYLE width-factor this codebase's DXF text always uses (matches
 *  adjoiningFeaturesDxf.js and dxfGenerator.js's STYLE_WIDTH_FACTOR), so a
 *  measurement here agrees with how the emitted TEXT actually renders. */
export function textWidth(text, height) {
  return String(text).length * height * 0.55
}

export function createDxfWriter(layers) {
  let ent = ''

  function addLine(layer, x1, y1, x2, y2) {
    ent += p(0, 'LINE')
    ent += p(8, layer)
    ent += p(10, x1.toFixed(4))
    ent += p(20, y1.toFixed(4))
    ent += p(11, x2.toFixed(4))
    ent += p(21, y2.toFixed(4))
  }

  function addPolylineOutline(layer, points, closed = true) {
    if (!Array.isArray(points) || points.length < 2) return
    for (let i = 0; i < points.length - 1; i++) {
      addLine(layer, points[i].x, points[i].y, points[i + 1].x, points[i + 1].y)
    }
    if (closed) {
      const a = points[points.length - 1], b = points[0]
      addLine(layer, a.x, a.y, b.x, b.y)
    }
  }

  function addCircle(layer, cx, cy, r) {
    ent += p(0, 'CIRCLE')
    ent += p(8, layer)
    ent += p(10, cx.toFixed(4))
    ent += p(20, cy.toFixed(4))
    ent += p(40, r.toFixed(4))
  }

  function addText(layer, x, y, text, height, rotationDeg = 0) {
    ent += p(0, 'TEXT')
    ent += p(8, layer)
    ent += p(10, x.toFixed(4))
    ent += p(20, y.toFixed(4))
    ent += p(40, height.toFixed(4))
    ent += p(1, String(text))
    if (rotationDeg) ent += p(50, rotationDeg.toFixed(4))
    ent += p(41, '0.55')
  }

  function addTextC(layer, xc, y, text, height) {
    ent += p(0, 'TEXT')
    ent += p(8, layer)
    ent += p(10, xc.toFixed(4))
    ent += p(20, y.toFixed(4))
    ent += p(40, height.toFixed(4))
    ent += p(1, String(text))
    ent += p(41, '0.55')
    ent += p(72, '1')
    ent += p(11, xc.toFixed(4))
    ent += p(21, y.toFixed(4))
  }

  function addTextR(layer, xr, y, text, height) {
    ent += p(0, 'TEXT')
    ent += p(8, layer)
    ent += p(10, xr.toFixed(4))
    ent += p(20, y.toFixed(4))
    ent += p(40, height.toFixed(4))
    ent += p(1, String(text))
    ent += p(41, '0.55')
    ent += p(72, '2')
    ent += p(11, xr.toFixed(4))
    ent += p(21, y.toFixed(4))
  }

  /** Filled axis-aligned rectangle via a DXF SOLID entity. Corner order (bottom-left,
   *  bottom-right, top-left, top-right — the "Z order") is required for an
   *  axis-aligned quad to fill correctly instead of as a bowtie. */
  function addSolidRect(layer, x1, y1, x2, y2) {
    const lo = Math.min(x1, x2), hi = Math.max(x1, x2)
    const bo = Math.min(y1, y2), to = Math.max(y1, y2)
    ent += p(0, 'SOLID')
    ent += p(8, layer)
    ent += p(10, lo.toFixed(4)) + p(20, bo.toFixed(4))
    ent += p(11, hi.toFixed(4)) + p(21, bo.toFixed(4))
    ent += p(12, lo.toFixed(4)) + p(22, to.toFixed(4))
    ent += p(13, hi.toFixed(4)) + p(23, to.toFixed(4))
  }

  function finish(extMin, extMax) {
    let dxf = ''
    dxf += p(0, 'SECTION')
    dxf += p(2, 'HEADER')
    dxf += p(9, '$ACADVER')
    dxf += p(1, 'AC1009')
    dxf += p(9, '$EXTMIN')
    dxf += p(10, extMin.x.toFixed(4))
    dxf += p(20, extMin.y.toFixed(4))
    dxf += p(9, '$EXTMAX')
    dxf += p(10, extMax.x.toFixed(4))
    dxf += p(20, extMax.y.toFixed(4))
    dxf += p(0, 'ENDSEC')

    dxf += p(0, 'SECTION')
    dxf += p(2, 'TABLES')

    dxf += p(0, 'TABLE')
    dxf += p(2, 'LTYPE')
    dxf += p(70, '1')
    dxf += p(0, 'LTYPE')
    dxf += p(2, 'CONTINUOUS')
    dxf += p(70, '0')
    dxf += p(3, 'Solid line')
    dxf += p(72, '65')
    dxf += p(73, '0')
    dxf += p(40, '0.0')
    dxf += p(0, 'ENDTAB')

    dxf += p(0, 'TABLE')
    dxf += p(2, 'LAYER')
    dxf += p(70, String(layers.length))
    for (const layer of layers) {
      dxf += p(0, 'LAYER')
      dxf += p(2, layer.name)
      dxf += p(70, '0')
      dxf += p(62, String(layer.color))
      dxf += p(6, 'CONTINUOUS')
    }
    dxf += p(0, 'ENDTAB')

    const STYLE_WIDTH_FACTOR = '0.55'
    dxf += p(0, 'TABLE')
    dxf += p(2, 'STYLE')
    dxf += p(70, '1')
    dxf += p(0, 'STYLE')
    dxf += p(2, 'STANDARD')
    dxf += p(70, '0')
    dxf += p(40, '0.0')
    dxf += p(41, STYLE_WIDTH_FACTOR)
    dxf += p(50, '0.0')
    dxf += p(71, '0')
    dxf += p(42, '0.0')
    dxf += p(3, 'txt')
    dxf += p(4, '')
    dxf += p(0, 'ENDTAB')

    dxf += p(0, 'ENDSEC')

    dxf += p(0, 'SECTION')
    dxf += p(2, 'ENTITIES')
    dxf += ent
    dxf += p(0, 'ENDSEC')

    dxf += p(0, 'EOF')

    // ASCII-safe degree control code (matches dxfGenerator.js's own encoding).
    dxf = dxf.replace(/°/g, '%%d')

    return Buffer.from(dxf, 'utf8')
  }

  return {
    addLine, addPolylineOutline, addCircle, addText, addTextC, addTextR, addSolidRect, finish,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js dxfPrimitives`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/diagram/dxfPrimitives.js app-backend/src/services/diagram/__tests__/dxfPrimitives.test.js
git commit -m "feat(diagram): self-contained DXF file writer for the diagram renderer

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `diagramDxf.js` skeleton — geometry, scale, layout, ground conversion, border

**Files:**
- Create: `app-backend/src/services/diagramDxf.js`
- Test: `app-backend/src/services/__tests__/diagramDxf.test.js`

**Interfaces:**
- Consumes: `createDxfWriter`, `textWidth` from Task 1. `deriveSubjectGeometry`, `parcelExtent`, `pickDiagramScale`, `makeTransform`, `beaconRadiusPt`, `computeDiagramLayout`, `pageDimsPt`, `marginsPt`, `bufferRing`, `ringExtent`, `buildSidesTable`, `buildBeaconDescription` (all pre-existing `diagram/*.js` exports, identical to `diagramPdf.js`'s imports).
- Produces: `export async function generateDiagramDXF(options, logger) -> { dxfBuffer: Buffer, scale: string, sheetSize: 'A3'|'A4' }` — same shape as `generateDiagramPDF` but `dxfBuffer` instead of `pdfBuffer`. Throws `Error` containing `"subject parcel"` when the subject isn't found (matching `generateDiagramPDF`'s message). Later tasks (3–9) each add one drawing block into this function, called in the same order `generateDiagramPDF` does.
- Also produces (module-internal, not exported, but the shape later tasks rely on): after the scale/layout/reflow block, the function has in scope: `layout` (reflowed, same shape as `diagramPdf.js`'s `layout`), `geometry`, `extent`, `denom`, `label`, `tf` (the PDF-point transform), `sidesTable`, `beaconGroups`, and a **`toG(pagePt) -> {x, y}`** conversion function plus a **`groundPerPt`** scalar — both defined exactly as below, for every later task to convert its own PDF-point positions to ground coordinates.

- [ ] **Step 1: Write the failing tests**

```js
// app-backend/src/services/__tests__/diagramDxf.test.js
import { describe, test, expect } from '@jest/globals'
import { generateDiagramDXF } from '../diagramDxf.js'

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

describe('generateDiagramDXF', () => {
  test('returns a valid DXF buffer', async () => {
    const r = await generateDiagramDXF(options, logger)
    expect(Buffer.isBuffer(r.dxfBuffer)).toBe(true)
    const text = r.dxfBuffer.toString('utf8')
    expect(text).toContain('SECTION')
    expect(text.trim().endsWith('0\nEOF')).toBe(true)
    expect(r.sheetSize).toBe('A4')
    expect(typeof r.scale).toBe('string')
  })

  test('throws a clear error when the subject parcel is missing', async () => {
    await expect(generateDiagramDXF({ ...options, metadata: { subjectParcelId: 'Z' } }, logger))
      .rejects.toThrow(/subject parcel/i)
  })

  test('honors A3 sheet size and echoes it', async () => {
    const r = await generateDiagramDXF({ ...options, sheetSize: 'A3' }, logger)
    expect(r.sheetSize).toBe('A3')
  })

  test('defaults to A4 when sheetSize is missing/unknown', async () => {
    const r = await generateDiagramDXF({ ...options, sheetSize: 'ZZ' }, logger)
    expect(r.sheetSize).toBe('A4')
  })

  test('the border rectangle appears in the DXF output', async () => {
    const r = await generateDiagramDXF(options, logger)
    const text = r.dxfBuffer.toString('utf8')
    expect(text).toContain('BORDER')
    expect((text.match(/\bLINE\b/g) || []).length).toBeGreaterThanOrEqual(4)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js diagramDxf`
Expected: FAIL — `Cannot find module '../diagramDxf.js'`.

- [ ] **Step 3: Write the implementation**

```js
// app-backend/src/services/diagramDxf.js
import { createDxfWriter, textWidth } from './diagram/dxfPrimitives.js'
import { deriveSubjectGeometry } from './diagram/subjectGeometry.js'
import { parcelExtent, pickDiagramScale, makeTransform, beaconRadiusPt } from './diagram/diagramScale.js'
import { buildSidesTable, buildFigureRepresents, formatDiagramArea } from './diagram/sidesTable.js'
import { resolveStatementDesignation } from './diagram/designation.js'
import { buildReferenceGrid } from './diagram/referenceGrid.js'
import { computeDiagramLayout, pageDimsPt, marginsPt } from './diagram/diagramLayout.js'
import { offsetPolygonPt } from './diagram/offsetPolygon.js'
import { bufferRing, clipRingToPolygon, ringExtent, isOutsideFigureFeature, neighbourBoundaryEdges } from './diagram/neighbourBuffer.js'
import { placeVertexLabel } from './diagram/vertexLabel.js'
import { edgeStrip } from './diagram/edgeStrip.js'
import { contiguousMarks } from './diagram/contiguousMarks.js'
import { roadBandRibbon } from './diagram/roadBandRibbon.js'
import { buildBeaconDescription } from './diagram/beaconDescription.js'
import { formatSI } from './diagram/numberFormat.js'
import { resolveLoSystem, snapScaleBarSegment } from '../../../app-shared/block-definitions.js'

/** ground metres per PDF point at SI 727 scale denominator S. */
function ptToGround(pt, S) { return pt * S * 0.000352778 }

// SI 727 figure styling — mirrors diagramPdf.js's constants exactly (kept in
// PDF-point units; converted to ground only at the point of emission).
const INNER_BAND_PT = 1.3 * (72 / 25.4)
const ROAD_STRIP_PT = 1.3 * (72 / 25.4)
const CONTIG_STUB_PT = 6 * (72 / 25.4)
const CONTIG_LABEL_MARGIN = 5

const LAYERS = [
  { name: 'BORDER', color: 7 },
  { name: 'FIGURE', color: 7 },
  { name: 'FIGURE_BAND', color: 3 },
  { name: 'FIGURE_LABELS', color: 7 },
  { name: 'BEACONS', color: 7 },
  { name: 'NEIGHBOURS', color: 8 },
  { name: 'DIAGRAM_ROAD', color: 1 },
  { name: 'ADJOINING', color: 7 },
  { name: 'ADJOINING_SERVITUDE', color: 5 },
  { name: 'TABLE', color: 7 },
  { name: 'BEACON_DESC', color: 7 },
  { name: 'NORTH_ARROW', color: 7 },
  { name: 'APPROVED', color: 7 },
  { name: 'SCALE_BAR', color: 7 },
  { name: 'STATEMENT', color: 7 },
  { name: 'GRID', color: 7 },
]

function centroidPt(ptRing) {
  const n = ptRing.length || 1
  return {
    px: ptRing.reduce((a, p) => a + p.px, 0) / n,
    py: ptRing.reduce((a, p) => a + p.py, 0) / n,
  }
}

// Same ruled-table bottom-Y formula as diagramPdf.js's tableBottomY.
function tableBottomY(tableY, rowCount) {
  return tableY + 39 + rowCount * 11
}

export async function generateDiagramDXF(options, logger) {
  const { parcels, metadata = {}, scale: requestedScale } = options
  const sheetSize = options.sheetSize === 'A3' ? 'A3' : 'A4'
  const features = parcels?.features ?? []
  const subjectId = String(metadata.subjectParcelId ?? '')
  const subject = features.find((f) => String(f.properties?.id) === subjectId)
  if (!subject) {
    throw new Error(`Diagram DXF: subject parcel not found (subjectParcelId=${subjectId})`)
  }
  const neighbours = features.filter((f) => f !== subject)

  const dims = pageDimsPt(sheetSize)
  const margins = marginsPt()
  const layout = computeDiagramLayout({ pageWidthPt: dims.width, pageHeightPt: dims.height, margins })

  const geometry = deriveSubjectGeometry(subject)
  let buffer = []
  try {
    buffer = bufferRing(subject?.geometry?.coordinates?.[0] ?? [])
  } catch (e) {
    logger?.warn?.(`[DiagramDXF] buffer failed: ${e?.message}`)
  }
  const extent = buffer.length ? ringExtent(buffer) : parcelExtent(subject)

  // --- Reflow the mid-page blocks around the actual table height (verbatim port
  // of diagramPdf.js's reflow — pure PDF-point layout math, no drawing calls). ---
  const sidesTable = buildSidesTable(geometry, options.beacons)
  const beaconGroups = buildBeaconDescription(geometry, options.beacons)
  const tableRows = Math.max(sidesTable.coordinateRows.length, sidesTable.sideRows.length)
  const tableBottom = tableBottomY(layout.table.y, tableRows)
  const BEACON_DESC_GAP = 8
  layout.beaconDesc = { ...layout.beaconDesc, y: tableBottom + BEACON_DESC_GAP }
  layout.approved = { ...layout.approved, y: tableBottom + BEACON_DESC_GAP }
  const approvalContentH = 63
  const beaconContentH = 11 + Math.max(1, beaconGroups.length) * 11
  const blocksBottom = tableBottom + BEACON_DESC_GAP + Math.max(approvalContentH, beaconContentH)
  const REGION_MARGIN = 10
  const FIG_SCALE_GAP = 6
  const scaleBarH = layout.scaleBar.height
  const regionH = layout.statement.y - blocksBottom
  const figureH = Math.max(140, regionH - 2 * REGION_MARGIN - FIG_SCALE_GAP - scaleBarH)
  layout.figure = { ...layout.figure, y: blocksBottom + REGION_MARGIN, height: figureH }
  layout.scaleBar = { ...layout.scaleBar, y: layout.figure.y + figureH + FIG_SCALE_GAP }
  layout.northArrow = { ...layout.northArrow, y: layout.figure.y + 8 }

  const { denom, label } = pickDiagramScale(extent, layout.figure, requestedScale)
  const tf = makeTransform(extent, layout.figure, denom)

  // --- Ground conversion: maps EVERY page-point coordinate (figure geometry and
  // every annotation block alike) into real Cape Lo ground coordinates. Verified
  // algebraically to reproduce dxfGenerator.js's own capeLoToDxfSouthUp(y,x) for
  // any subject vertex transformed by `tf` — see the design spec. ---
  const groundPerPt = ptToGround(1, denom)
  const figCenterPx = layout.figure.x + layout.figure.width / 2
  const figCenterPy = layout.figure.y + layout.figure.height / 2
  const centerY = (extent.minY + extent.maxY) / 2
  const centerX = (extent.minX + extent.maxX) / 2
  const groundCenter = { x: -centerY, y: -centerX }
  function toG(pagePt) {
    return {
      x: groundCenter.x + (pagePt.px - figCenterPx) * groundPerPt,
      y: groundCenter.y - (pagePt.py - figCenterPy) * groundPerPt,
    }
  }
  function toGLen(sizePt) { return sizePt * groundPerPt }

  const w = createDxfWriter(LAYERS)

  // Neat-line border.
  const b0 = toG({ px: layout.border.x, py: layout.border.y })
  const b1 = toG({ px: layout.border.x + layout.border.width, py: layout.border.y })
  const b2 = toG({ px: layout.border.x + layout.border.width, py: layout.border.y + layout.border.height })
  const b3 = toG({ px: layout.border.x, py: layout.border.y + layout.border.height })
  w.addPolylineOutline('BORDER', [b0, b1, b2, b3], true)

  // --- Tasks 3-9 insert their drawing blocks here, in generateDiagramPDF's order:
  //   3. subject figure (boundary, band, beacons, letters, neighbours)
  //   4. adjoining features (road/servitude/contiguous)
  //   5. sides/directions/co-ordinates table
  //   6. description of beacons
  //   7. north arrow, approved box, scale bar
  //   8. statement
  //   9. reference grid
  // ---

  const allPoints = [b0, b1, b2, b3]
  const extMin = { x: Math.min(...allPoints.map((p) => p.x)), y: Math.min(...allPoints.map((p) => p.y)) }
  const extMax = { x: Math.max(...allPoints.map((p) => p.x)), y: Math.max(...allPoints.map((p) => p.y)) }
  const dxfBuffer = w.finish(extMin, extMax)

  return { dxfBuffer, scale: label, sheetSize }
}
```

> Note: `neighbours`, `centroidPt`, `tableBottomY`, `textWidth`, `edgeStrip`, `contiguousMarks`,
> `roadBandRibbon`, `resolveLoSystem`, `snapScaleBarSegment`, `formatSI`, `offsetPolygonPt`,
> `clipRingToPolygon`, `isOutsideFigureFeature`, `neighbourBoundaryEdges`, `placeVertexLabel`,
> `beaconRadiusPt`, `buildFigureRepresents`, `formatDiagramArea`, `resolveStatementDesignation`,
> `buildReferenceGrid`, `CONTIG_STUB_PT`, `ROAD_STRIP_PT`, `INNER_BAND_PT`, `CONTIG_LABEL_MARGIN`
> are imported/defined here unused until Tasks 3–9 consume them — this keeps every later task a
> pure insertion with no import-list changes. (An unused-import lint warning, if the repo's
> linter is strict about it, is expected and resolved automatically as each task starts using
> its imports — not a defect to fix in this task.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js diagramDxf`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/diagramDxf.js app-backend/src/services/__tests__/diagramDxf.test.js
git commit -m "feat(diagram): DXF diagram skeleton (geometry, scale, layout, ground conversion, border)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Figure block — boundary, green band, beacons, vertex letters, neighbours

**Files:**
- Modify: `app-backend/src/services/diagramDxf.js` (insert after the border, before the "Tasks 4-9" comment)
- Test: `app-backend/src/services/__tests__/diagramDxf.test.js` (extend)

**Interfaces:**
- Consumes: `offsetPolygonPt`, `centroidPt`, `placeVertexLabel`, `textWidth`, `bufferRing`/`clipRingToPolygon`/`isOutsideFigureFeature`/`neighbourBoundaryEdges` (all already imported in Task 2).
- Produces: in-scope locals later tasks (4+) rely on: `subjPt` (`Array<{px,py}>`, the subject's transformed vertices), `subjCentroid` (`{px,py}`), `subjSegs` (`Array<[{px,py},{px,py}]>`), `neighbourSegs` (same shape), `labelObstacles` (`Array<[{px,py},{px,py}]>`, mutated by push), `boxToSegs(box) -> segs` (function).

- [ ] **Step 1: Write the failing test**

```js
// append to app-backend/src/services/__tests__/diagramDxf.test.js
test('draws the subject figure: boundary, beacons, vertex letters', async () => {
  const r = await generateDiagramDXF(options, logger)
  const text = r.dxfBuffer.toString('utf8')
  expect(text).toContain('FIGURE\n')
  expect(text).toContain('FIGURE_BAND\n')
  expect(text).toContain('BEACONS\n')
  expect(text).toContain('CIRCLE')
  expect(text).toContain('FIGURE_LABELS\n')
  // 4 vertex letters A/B/C/D for the rectangular subject fixture.
  for (const letter of ['A', 'B', 'C', 'D']) {
    expect(text).toContain(`1\n${letter}\n`)
  }
})

test('clips neighbours to the buffer and omits the outside figure (realistic coords)', async () => {
  const subj = { type: 'Feature', properties: { id: 'S', stand: '403', designation: 'STAND 403', area_m2: 10000 },
    geometry: { type: 'Polygon', coordinates: [[[2144000, 85000], [2144100, 85000], [2144100, 85100], [2144000, 85100], [2144000, 85000]]] } }
  const abut = { type: 'Feature', properties: { id: 'N', stand: '404' },
    geometry: { type: 'Polygon', coordinates: [[[2144000, 85100], [2144200, 85100], [2144200, 85500], [2144000, 85500], [2144000, 85100]]] } }
  const far = { type: 'Feature', properties: { id: 'F', stand: '999' },
    geometry: { type: 'Polygon', coordinates: [[[2144000, 90000], [2144100, 90000], [2144100, 90100], [2144000, 90100], [2144000, 90000]]] } }
  const of = { type: 'Feature', properties: { id: 'OF', designation: 'OUTSIDE FIGURE' },
    geometry: { type: 'Polygon', coordinates: [[[2143000, 84000], [2145000, 84000], [2145000, 86000], [2143000, 86000], [2143000, 84000]]] } }
  const r = await generateDiagramDXF({
    parcels: { type: 'FeatureCollection', features: [subj, abut, far, of] },
    beacons: { type: 'FeatureCollection', features: [] },
    metadata: { subjectParcelId: 'S', designation: 'STAND 403', centralMeridian: 29 },
    projection: 'EPSG:22289', scale: 'auto', sheetSize: 'A4',
  }, logger)
  const text = r.dxfBuffer.toString('utf8')
  expect(text).toContain('NEIGHBOURS\n')
  expect(text.trim().endsWith('0\nEOF')).toBe(true)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js diagramDxf`
Expected: FAIL — no `FIGURE`/`BEACONS`/`FIGURE_LABELS`/`NEIGHBOURS` content yet.

- [ ] **Step 3: Insert the figure block**

In `diagramDxf.js`, replace the border-drawing lines with the border PLUS this block immediately after (still before the "Tasks 3-9" comment, which now becomes "Tasks 4-9"):

```js
  w.addPolylineOutline('BORDER', [b0, b1, b2, b3], true)

  // Abutting neighbours: clip to the 10m buffer, faint outline + label.
  const neighbourSegs = []
  const neighbourLabels = []
  if (buffer.length) {
    for (const nb of neighbours) {
      if (isOutsideFigureFeature(nb)) continue
      const nbRing = nb?.geometry?.coordinates?.[0] ?? []
      const strips = clipRingToPolygon(nbRing, buffer)
      if (!strips.length) continue
      for (const strip of strips) {
        for (const [a, b2s] of neighbourBoundaryEdges(strip, nbRing)) {
          const pa = tf(a), pb = tf(b2s)
          w.addLine('NEIGHBOURS', ...Object.values(toG(pa)), ...Object.values(toG(pb)))
          neighbourSegs.push([pa, pb])
        }
      }
      const stand = nb.properties?.stand ?? nb.properties?.designation ?? ''
      if (stand) {
        neighbourLabels.push({ anchor: centroidPt(strips[0].map((pt) => tf(pt))), text: String(stand) })
      }
    }
  }

  // Subject: boundary + inner green figure-band (outline only — DXF has no fill).
  const subjPt = geometry.vertices.map((v) => tf([v.y, v.x]))
  const inner = offsetPolygonPt(subjPt.map((pt) => [pt.px, pt.py]), -INNER_BAND_PT)
  w.addPolylineOutline('FIGURE', subjPt.map((pt) => toG(pt)), true)
  for (const ring of inner) {
    w.addPolylineOutline('FIGURE_BAND', ring.map(([x, y]) => toG({ px: x, py: y })), true)
  }

  const subjCentroid = centroidPt(subjPt)
  const subjSegs = subjPt.map((pt, i) => [pt, subjPt[(i + 1) % subjPt.length]])
  const labelObstacles = []
  const boxToSegs = (bx) => {
    const c1 = { px: bx.x, py: bx.y }, c2 = { px: bx.x + bx.w, py: bx.y }
    const c3 = { px: bx.x + bx.w, py: bx.y + bx.h }, c4 = { px: bx.x, py: bx.y + bx.h }
    return [[c1, c2], [c2, c3], [c3, c4], [c4, c1], [c1, c3], [c2, c4]]
  }

  // Beacon circles (plain open circle — DXF cannot replicate the PDF's white-fill
  // knockout look; accepted difference, see Global Constraints).
  const beaconR = beaconRadiusPt(denom)
  for (const pt of subjPt) {
    const g = toG(pt)
    w.addCircle('BEACONS', g.x, g.y, toGLen(beaconR))
  }

  // Vertex letters — reuses placeVertexLabel UNCHANGED (PDF-point collision math);
  // only the final emitted position is converted to ground.
  geometry.vertices.forEach((v, i) => {
    const pt = subjPt[i]
    const labelW = textWidth(v.letter, 8)
    const pos = placeVertexLabel(pt, subjCentroid, {
      beaconR, labelW, labelH: 8, gap: 2, segments: subjSegs.concat(neighbourSegs, labelObstacles),
    })
    const g = toG({ px: pos.x, py: pos.y + 8 }) // DXF TEXT insertion is baseline, PDF's is top-left
    w.addText('FIGURE_LABELS', g.x, g.y, v.letter, toGLen(8))
    labelObstacles.push(...boxToSegs({ x: pos.x, y: pos.y, w: labelW, h: 8 }))
  })

  // Neighbour stand labels.
  for (const nl of neighbourLabels) {
    const labelW = textWidth(nl.text, 7)
    const pos = placeVertexLabel(nl.anchor, subjCentroid, {
      beaconR: 0, gap: 1, labelW, labelH: 7, segments: subjSegs.concat(neighbourSegs, labelObstacles),
    })
    const g = toG({ px: pos.x, py: pos.y + 7 })
    w.addText('NEIGHBOURS', g.x, g.y, nl.text, toGLen(7))
    labelObstacles.push(...boxToSegs({ x: pos.x, y: pos.y, w: labelW, h: 7 }))
  }
```

> `addLine` takes `(layer, x1, y1, x2, y2)`, not two point objects — `...Object.values(toG(pa))`
> spreads `{x,y}` into `x, y` in declaration order (safe: `dxfPrimitives.js`'s `toG` always
> returns a literal `{x, y}`, so key order is guaranteed). Later tasks use the clearer
> `const g = toG(pt); w.addLine(layer, g.x, g.y, ...)` form instead — this task uses the
> spread once for brevity and is not a pattern to repeat.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js diagramDxf`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/diagramDxf.js app-backend/src/services/__tests__/diagramDxf.test.js
git commit -m "feat(diagram): DXF figure block (boundary, band, beacons, letters, neighbours)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Adjoining features block (road / servitude / contiguous)

**Files:**
- Modify: `app-backend/src/services/diagramDxf.js`
- Test: `app-backend/src/services/__tests__/diagramDxf.test.js` (extend)

**Interfaces:**
- Consumes: `subjPt`, `subjCentroid`, `subjSegs`, `neighbourSegs`, `labelObstacles`, `boxToSegs`, `denom`, `geometry` (Task 3); `edgeStrip`, `contiguousMarks`, `roadBandRibbon`, `formatSI`, `beaconRadiusPt`, `textWidth`, `toG`, `toGLen` (Task 2/3).
- Produces: nothing new for later tasks (this block only draws).

- [ ] **Step 1: Write the failing test**

```js
// append to app-backend/src/services/__tests__/diagramDxf.test.js
test('renders adjoining-feature annotations (road/servitude/contiguous), skipping unmatched sides', async () => {
  const withAdjoining = {
    ...options,
    metadata: {
      ...options.metadata,
      sideAnnotations: [
        { side: 'AB', role: 'road', label: 'Klein Road' },
        { side: 'BC', role: 'servitude', label: 'Water servitude', widthM: 3 },
        { side: 'CD', role: 'contiguous', label: 'STAND 303 BRACKENHURST' },
        { side: 'ZZ', role: 'road', label: 'nowhere' },
      ],
    },
  }
  const r = await generateDiagramDXF(withAdjoining, logger)
  const text = r.dxfBuffer.toString('utf8')
  expect(text).toContain('DIAGRAM_ROAD\n')
  expect(text).toContain('ADJOINING_SERVITUDE\n')
  expect(text).toContain('ADJOINING\n')
  expect(text).toContain('Klein Road')
  expect(text).toContain('Water servitude')
  expect(text).toContain('STAND 303 BRACKENHURST')
})

test('is unchanged (no crash) when sideAnnotations is absent', async () => {
  const r = await generateDiagramDXF(options, logger)
  expect(r.dxfBuffer.toString('utf8').trim().endsWith('0\nEOF')).toBe(true)
})

test('renders single-terminal and both contiguous annotations without error', async () => {
  for (const end of ['from', 'to', 'both', undefined]) {
    const withContig = {
      ...options,
      metadata: { ...options.metadata, sideAnnotations: [{ side: 'AB', role: 'contiguous', label: 'STAND 86', end }] },
    }
    const r = await generateDiagramDXF(withContig, logger)
    expect(r.dxfBuffer.toString('utf8')).toContain('STAND 86')
  }
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js diagramDxf`
Expected: FAIL — no `DIAGRAM_ROAD`/`ADJOINING`/label text present.

- [ ] **Step 3: Add the `drawAdjoiningFeaturesDxf` function and call it**

Add this function above `generateDiagramDXF` in `diagramDxf.js` (it is a direct DXF port of
`diagramPdf.js`'s `drawAdjoiningFeatures`, with every drawing call converted via `toG`/`toGLen`
and text measured via `textWidth` instead of `doc.widthOfString`):

```js
function drawAdjoiningFeaturesDxf(w, ctx, logger) {
  const { annotations, geometry, subjPt, subjCentroid, subjSegs, neighbourSegs, denom, labelObstacles, boxToSegs, toG, toGLen } = ctx
  if (!Array.isArray(annotations) || annotations.length === 0) return
  const n = geometry.vertices.length
  const PT_PER_MM = 72 / 25.4
  const ptPerGroundM = PT_PER_MM * 1000 / denom
  const cen = [subjCentroid.px, subjCentroid.py]
  const vertexBandPt = beaconRadiusPt(denom) + 14
  const contiguousSides = new Set(annotations.filter((x) => x && x.role === 'contiguous' && x.side).map((x) => x.side))
  const roadSides = new Set(annotations.filter((x) => x && x.role === 'road' && x.side).map((x) => x.side))

  for (const ann of annotations) {
    if (!ann || !ann.side || !ann.role) continue
    let i = -1
    for (let k = 0; k < n; k++) {
      if (geometry.vertices[k].letter + geometry.vertices[(k + 1) % n].letter === ann.side) { i = k; break }
    }
    if (i < 0) { logger?.warn?.(`[DiagramDXF] adjoining: side ${ann.side} not found`); continue }

    const p1 = subjPt[i]
    const p2 = subjPt[(i + 1) % n]
    const a = [p1.px, p1.py]
    const b = [p2.px, p2.py]
    const mid = { px: (p1.px + p2.px) / 2, py: (p1.py + p2.py) / 2 }

    if (ann.role === 'road' || ann.role === 'servitude') {
      let q = null
      if (ann.role === 'servitude') {
        if (ann.widthM > 0) q = edgeStrip(a, b, ann.widthM * ptPerGroundM, cen)
        else logger?.warn?.(`[DiagramDXF] servitude ${ann.side} has no widthM; drawing label only`)
      } else {
        const flankA = geometry.vertices[(i - 1 + n) % n].letter + geometry.vertices[i].letter
        const flankB = geometry.vertices[(i + 1) % n].letter + geometry.vertices[(i + 2) % n].letter
        const axLen = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
        const ax = [(b[0] - a[0]) / axLen, (b[1] - a[1]) / axLen]
        const inner = []
        if (!roadSides.has(flankA)) {
          if (contiguousSides.has(flankA)) {
            const prev = subjPt[(i - 1 + n) % n]
            inner.push(edgeStrip([prev.px, prev.py], a, CONTIG_STUB_PT, cen)[2])
          } else {
            inner.push([a[0] - ax[0] * CONTIG_STUB_PT, a[1] - ax[1] * CONTIG_STUB_PT])
          }
        }
        inner.push(a, b)
        if (!roadSides.has(flankB)) {
          if (contiguousSides.has(flankB)) {
            const next = subjPt[(i + 2) % n]
            inner.push(edgeStrip(b, [next.px, next.py], CONTIG_STUB_PT, cen)[3])
          } else {
            inner.push([b[0] + ax[0] * CONTIG_STUB_PT, b[1] + ax[1] * CONTIG_STUB_PT])
          }
        }
        q = roadBandRibbon(inner, ROAD_STRIP_PT, cen)
      }
      if (q && q.length >= 3) {
        const layer = ann.role === 'road' ? 'DIAGRAM_ROAD' : 'ADJOINING_SERVITUDE'
        const gPts = q.map(([x, y]) => toG({ px: x, py: y }))
        w.addPolylineOutline(layer, gPts, true)
        for (let k = 0; k < q.length; k++) {
          const s = q[k], t = q[(k + 1) % q.length]
          labelObstacles.push([{ px: s[0], py: s[1] }, { px: t[0], py: t[1] }])
        }
      }
    } else if (ann.role === 'contiguous') {
      const marks = contiguousMarks(a, b, ann.end)
      const st = edgeStrip(a, b, CONTIG_STUB_PT, cen)
      if (marks.stubFrom) {
        const g1 = toG({ px: a[0], py: a[1] }), g2 = toG({ px: st[3][0], py: st[3][1] })
        w.addLine('ADJOINING', g1.x, g1.y, g2.x, g2.y)
        labelObstacles.push([{ px: a[0], py: a[1] }, { px: st[3][0], py: st[3][1] }])
      }
      if (marks.stubTo) {
        const g1 = toG({ px: b[0], py: b[1] }), g2 = toG({ px: st[2][0], py: st[2][1] })
        w.addLine('ADJOINING', g1.x, g1.y, g2.x, g2.y)
        labelObstacles.push([{ px: b[0], py: b[1] }, { px: st[2][0], py: st[2][1] }])
      }
    }

    if (ann.label) {
      const labelText = ann.role === 'road' && ann.widthM > 0 ? `${ann.label} ${formatSI(ann.widthM, 2)}m` : ann.label
      const labelH = 7
      const labelW = textWidth(labelText, labelH)
      if (ann.role === 'road' || ann.role === 'servitude') {
        const ex = p2.px - p1.px, ey = p2.py - p1.py
        const len = Math.hypot(ex, ey) || 1
        let perpX = -ey / len, perpY = ex / len
        if (perpX * (subjCentroid.px - mid.px) + perpY * (subjCentroid.py - mid.py) > 0) { perpX = -perpX; perpY = -perpY }
        let angleDeg = Math.atan2(ey, ex) * 180 / Math.PI
        if (angleDeg > 90 || angleDeg < -90) angleDeg += 180
        const stripPt = ann.role === 'servitude' && ann.widthM > 0 ? ann.widthM * ptPerGroundM : ROAD_STRIP_PT
        const off = stripPt + vertexBandPt
        const lx = mid.px + perpX * off, ly = mid.py + perpY * off
        // Centred + rotated: pre-shift the LEFT-justified insertion point back along the
        // reading direction by half the text width (the technique adjoiningFeaturesDxf.js
        // already uses for this exact case — DXF's justification codes don't combine
        // reliably with rotation across viewers).
        const aRad = angleDeg * Math.PI / 180
        const ix = lx - Math.cos(aRad) * (labelW / 2)
        const iy = ly - Math.sin(aRad) * (labelW / 2)
        const g = toG({ px: ix, py: iy })
        w.addText(ann.role === 'servitude' ? 'ADJOINING_SERVITUDE' : 'DIAGRAM_ROAD', g.x, g.y, labelText, toGLen(labelH), -angleDeg)
      } else {
        const m = contiguousMarks(a, b, ann.end)
        const anchor = { px: m.labelAnchor[0], py: m.labelAnchor[1] }
        let ox = anchor.px - subjCentroid.px, oy = anchor.py - subjCentroid.py
        const ol = Math.hypot(ox, oy) || 1; ox /= ol; oy /= ol
        const extent = (labelW / 2) * Math.abs(ox) + (labelH / 2) * Math.abs(oy)
        const half = Math.max(labelW, labelH) / 2
        const gap = Math.max(2, CONTIG_LABEL_MARGIN + extent - half)
        const pos = placeVertexLabel(anchor, subjCentroid, {
          beaconR: 0, gap, labelW, labelH, segments: subjSegs.concat(neighbourSegs, labelObstacles),
        })
        const g = toG({ px: pos.x, py: pos.y + labelH })
        w.addText('ADJOINING', g.x, g.y, labelText, toGLen(labelH))
        labelObstacles.push(...boxToSegs({ x: pos.x, y: pos.y, w: labelW, h: labelH }))
      }
    }
  }
}
```

Note: DXF's rotation angle is counter-clockwise from the X axis in a Y-up system, while
`angleDeg` was computed in PDF's Y-down page space; passing `-angleDeg` to `addText` corrects
for the sign flip `toG` applies to Y, so the emitted text reads in the same visual direction
as the PDF along the (now ground-space) edge.

In `generateDiagramDXF`, insert the call right after the figure block (Task 3's last line,
the neighbour-labels loop), before the "Tasks 5-9" comment:

```js
  drawAdjoiningFeaturesDxf(w, {
    annotations: metadata.sideAnnotations,
    geometry, subjPt, subjCentroid, subjSegs, neighbourSegs, denom, labelObstacles, boxToSegs, toG, toGLen,
  }, logger)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js diagramDxf`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/diagramDxf.js app-backend/src/services/__tests__/diagramDxf.test.js
git commit -m "feat(diagram): DXF adjoining-features block (road/servitude/contiguous)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Sides/Directions/Co-ordinates table

**Files:**
- Modify: `app-backend/src/services/diagramDxf.js`
- Test: `app-backend/src/services/__tests__/diagramDxf.test.js` (extend)

**Interfaces:**
- Consumes: `sidesTable`, `layout`, `resolveLoSystem`, `toG`, `toGLen`, `w` (writer).
- Produces: `tableBottomYAbs` — the table's actual ground-space bottom row Y is not needed by later tasks (they use `layout` positions, already reflowed in Task 2), so nothing new is produced.

- [ ] **Step 1: Write the failing test**

```js
// append to app-backend/src/services/__tests__/diagramDxf.test.js
test('renders the sides/directions/co-ordinates table', async () => {
  const r = await generateDiagramDXF(options, logger)
  const text = r.dxfBuffer.toString('utf8')
  expect(text).toContain('TABLE\n')
  expect(text).toContain('SIDES')
  expect(text).toContain('DIRECTIONS')
  expect(text).toContain('CO-ORDINATES')
  expect(text).toContain('DIAGRAM S.G. No.')
  expect(text).toContain('Constants')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js diagramDxf`
Expected: FAIL — no table headers present.

- [ ] **Step 3: Add `drawTableDxf` and call it**

Add above `generateDiagramDXF` (a DXF port of `diagramPdf.js`'s `drawTable`, one `addText`/
`addTextC`/`addTextR` per PDFKit `doc.text` call, ruling lines via `addLine`):

```js
function drawTableDxf(w, layout, table, loLabel, toG, toGLen) {
  const { constRow, coordinateRows, sideRows } = table
  const R = layout.table
  const cSide = 0, cDir = 76, cLetter = 158, cY = 198, cX = 260
  const cSg = layout.sgNoBox.x + 2
  const rows = Math.max(coordinateRows.length, sideRows.length)
  const cDirX = R.x + 70
  const dirSplitX = cDirX + 24
  const xDeg = R.x + 97, xMin = R.x + 119, xSec = R.x + 133
  const cLetX = R.x + 150
  const cMetresX = R.x + 32
  const yColMidX = R.x + cY + (cX - cY) / 2
  const xColMidX = R.x + cX + ((layout.sgNoBox.x - 4) - (R.x + cX)) / 2
  const coordMidX = R.x + cY + ((layout.sgNoBox.x - 4) - (R.x + cY)) / 2
  const sideMidX = R.x + cSide + 15
  const metresMidX = cMetresX + 19
  const dirMidX = cDirX + 40
  const letMidX = cLetX + 21.5

  const gT = (x, y) => toG({ px: x, py: y })
  const H = 7.5, h = 7

  w.addTextC('TABLE', gT(sideMidX, R.y).x, gT(sideMidX, R.y).y, 'SIDES', toGLen(H))
  w.addTextC('TABLE', gT(metresMidX, R.y).x, gT(metresMidX, R.y).y, 'METRES', toGLen(H))
  w.addTextC('TABLE', gT(dirMidX, R.y).x, gT(dirMidX, R.y).y, 'DIRECTIONS', toGLen(H))
  w.addTextC('TABLE', gT(coordMidX, R.y).x, gT(coordMidX, R.y).y, 'CO-ORDINATES', toGLen(H))
  { const g = gT(cSg, R.y); w.addText('TABLE', g.x, g.y, 'DIAGRAM S.G. No.', toGLen(H)) }

  { const g = gT(coordMidX, R.y + 10); w.addTextC('TABLE', g.x, g.y, loLabel, toGLen(h)) }
  { const g = gT(xDeg, R.y + 19); w.addTextC('TABLE', g.x, g.y, '°', toGLen(h)) }
  { const g = gT(xMin, R.y + 19); w.addTextC('TABLE', g.x, g.y, "'", toGLen(h)) }
  { const g = gT(xSec, R.y + 19); w.addTextC('TABLE', g.x, g.y, '"', toGLen(h)) }
  { const g = gT(yColMidX, R.y + 19); w.addTextC('TABLE', g.x, g.y, 'Y', toGLen(h)) }
  { const g = gT(coordMidX, R.y + 19); w.addTextC('TABLE', g.x, g.y, 'Metres', toGLen(h)) }
  { const g = gT(xColMidX, R.y + 19); w.addTextC('TABLE', g.x, g.y, 'X', toGLen(h)) }

  let ry = R.y + 30
  { const g = gT(yColMidX, ry); w.addTextC('TABLE', g.x, g.y, constRow.y, toGLen(h)) }
  { const g = gT(xColMidX, ry); w.addTextC('TABLE', g.x, g.y, constRow.x, toGLen(h)) }
  { const g = gT(cSg, ry); w.addText('TABLE', g.x, g.y, 'Constants', toGLen(h)) }

  for (let i = 0; i < rows; i++) {
    ry += 11
    if (sideRows[i]) {
      { const g = gT(sideMidX, ry); w.addTextC('TABLE', g.x, g.y, sideRows[i].side, toGLen(h)) }
      { const g = gT(metresMidX, ry); w.addTextC('TABLE', g.x, g.y, sideRows[i].metres, toGLen(h)) }
      { const g = gT(cDirX + 11, ry); w.addTextC('TABLE', g.x, g.y, sideRows[i].side, toGLen(h)) }
      const [dd, mm, ss] = String(sideRows[i].direction).split(' ')
      { const g = gT(xDeg, ry); w.addTextC('TABLE', g.x, g.y, dd ?? '', toGLen(h)) }
      { const g = gT(xMin, ry); w.addTextC('TABLE', g.x, g.y, mm ?? '', toGLen(h)) }
      { const g = gT(xSec, ry); w.addTextC('TABLE', g.x, g.y, ss ?? '', toGLen(h)) }
    }
    if (coordinateRows[i]) {
      { const g = gT(letMidX, ry); w.addTextC('TABLE', g.x, g.y, coordinateRows[i].letter, toGLen(h)) }
      { const g = gT(yColMidX, ry); w.addTextC('TABLE', g.x, g.y, coordinateRows[i].y, toGLen(h)) }
      { const g = gT(xColMidX, ry); w.addTextC('TABLE', g.x, g.y, coordinateRows[i].x, toGLen(h)) }
      { const g = gT(cSg, ry); w.addText('TABLE', g.x, g.y, coordinateRows[i].beaconName ?? '', toGLen(h)) }
    }
  }

  const B = layout.border
  const boxB = R.y + 39 + rows * 11
  const hSep = R.y + 28
  const verticals = [R.x + 70, R.x + 150, R.x + 193, layout.sgNoBox.x - 4]
  for (const vx of verticals) { const g1 = gT(vx, B.y), g2 = gT(vx, boxB); w.addLine('TABLE', g1.x, g1.y, g2.x, g2.y) }
  { const g1 = gT(R.x + cX, hSep), g2 = gT(R.x + cX, boxB); w.addLine('TABLE', g1.x, g1.y, g2.x, g2.y) }
  { const g1 = gT(R.x + 32, hSep), g2 = gT(R.x + 32, boxB); w.addLine('TABLE', g1.x, g1.y, g2.x, g2.y) }
  { const g1 = gT(dirSplitX, hSep), g2 = gT(dirSplitX, boxB); w.addLine('TABLE', g1.x, g1.y, g2.x, g2.y) }
  { const g1 = gT(B.x, hSep), g2 = gT(B.x + B.width, hSep); w.addLine('TABLE', g1.x, g1.y, g2.x, g2.y) }
}
```

> `dirSide` (side letters left-of-value in the DIRECTIONS column) was centred in a 22pt band
> starting at `cDirX` in the PDF; this port centres at `cDirX + 11` (the same band's midpoint)
> using `addTextC`, giving an equivalent visual result without needing PDFKit's `{width,
> align}` option object.

In `generateDiagramDXF`, insert the call after the adjoining-features call:

```js
  const loLabel = resolveLoSystem(null, metadata, options.projection)
  drawTableDxf(w, layout, sidesTable, loLabel, toG, toGLen)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js diagramDxf`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/diagramDxf.js app-backend/src/services/__tests__/diagramDxf.test.js
git commit -m "feat(diagram): DXF sides/directions/co-ordinates table

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Description of Beacons block

**Files:**
- Modify: `app-backend/src/services/diagramDxf.js`
- Test: `app-backend/src/services/__tests__/diagramDxf.test.js` (extend)

**Interfaces:**
- Consumes: `beaconGroups`, `layout.beaconDesc`, `toG`, `toGLen`.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

```js
// append to app-backend/src/services/__tests__/diagramDxf.test.js
test('renders the Description of Beacons block', async () => {
  const withBeacons = {
    ...options,
    beacons: { type: 'FeatureCollection', features: [
      { type: 'Feature', properties: { name: '302A', description: '12mm iron peg' }, geometry: { type: 'Point', coordinates: [0, 0] } },
    ] },
  }
  const r = await generateDiagramDXF(withBeacons, logger)
  const text = r.dxfBuffer.toString('utf8')
  expect(text).toContain('BEACON_DESC\n')
  expect(text).toContain('Description of Beacons')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js diagramDxf`
Expected: FAIL — no `BEACON_DESC` content.

- [ ] **Step 3: Add `drawBeaconDescriptionDxf` and call it**

```js
function drawBeaconDescriptionDxf(w, layout, groups, toG, toGLen) {
  const R = layout.beaconDesc
  const g0 = toG({ px: R.x, py: R.y })
  w.addText('BEACON_DESC', g0.x, g0.y, 'Description of Beacons', toGLen(8))
  if (groups.length === 0) {
    const g = toG({ px: R.x, py: R.y + 11 })
    w.addText('BEACON_DESC', g.x, g.y, 'All          :', toGLen(8))
  } else if (groups.length === 1) {
    const g = toG({ px: R.x, py: R.y + 11 })
    w.addText('BEACON_DESC', g.x, g.y, `All          : ${groups[0].description}`, toGLen(8))
  } else {
    let y = R.y + 11
    for (const grp of groups) {
      const g = toG({ px: R.x, py: y })
      w.addText('BEACON_DESC', g.x, g.y, `${grp.names}  :  ${grp.description}`, toGLen(8))
      y += 11
    }
  }
}
```

Insert the call after `drawTableDxf(...)`:

```js
  drawBeaconDescriptionDxf(w, layout, beaconGroups, toG, toGLen)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js diagramDxf`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/diagramDxf.js app-backend/src/services/__tests__/diagramDxf.test.js
git commit -m "feat(diagram): DXF Description of Beacons block

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: North arrow, Approved box, Scale bar

**Files:**
- Modify: `app-backend/src/services/diagramDxf.js`
- Test: `app-backend/src/services/__tests__/diagramDxf.test.js` (extend)

**Interfaces:**
- Consumes: `layout.northArrow`, `layout.approved`, `layout.scaleBar`, `denom`, `snapScaleBarSegment`, `toG`, `toGLen`.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

```js
// append to app-backend/src/services/__tests__/diagramDxf.test.js
test('renders north arrow, approved box, and scale bar', async () => {
  const r = await generateDiagramDXF(options, logger)
  const text = r.dxfBuffer.toString('utf8')
  expect(text).toContain('NORTH_ARROW\n')
  expect(text).toContain('APPROVED\n')
  expect(text).toContain('for Surveyor-General')
  expect(text).toContain('SCALE_BAR\n')
  expect(text).toContain('SOLID')
  expect(text).toMatch(/Scale 1 : \d+/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js diagramDxf`
Expected: FAIL — no `NORTH_ARROW`/`APPROVED`/`SCALE_BAR` content.

- [ ] **Step 3: Add the three draw functions and call them**

```js
function drawNorthArrowDxf(w, layout, toG, toGLen) {
  const R = layout.northArrow
  const cx = R.x + R.width / 2
  const shaftTop = toG({ px: cx, py: R.y }), shaftBottom = toG({ px: cx, py: R.y + R.height })
  w.addLine('NORTH_ARROW', shaftBottom.x, shaftBottom.y, shaftTop.x, shaftTop.y)
  const headL = toG({ px: cx - 4, py: R.y + 8 }), headTip = toG({ px: cx, py: R.y }), headR = toG({ px: cx + 4, py: R.y + 8 })
  w.addLine('NORTH_ARROW', headL.x, headL.y, headTip.x, headTip.y)
  w.addLine('NORTH_ARROW', headTip.x, headTip.y, headR.x, headR.y)
  const gT = toG({ px: cx - 9, py: R.y + R.height - 14 + 7 })
  w.addText('NORTH_ARROW', gT.x, gT.y, 'T', toGLen(7))
  const gN = toG({ px: cx + 4, py: R.y + R.height - 14 + 7 })
  w.addText('NORTH_ARROW', gN.x, gN.y, 'N', toGLen(7))
}

function drawApprovedBoxDxf(w, layout, toG, toGLen) {
  const R = layout.approved
  const cx = R.x + R.width / 2
  const g1 = toG({ px: cx, py: R.y + 5 }); w.addTextC('APPROVED', g1.x, g1.y, 'Approved', toGLen(7))
  const g2 = toG({ px: cx, py: R.y + 31 }); w.addTextC('APPROVED', g2.x, g2.y, 'for Surveyor-General', toGLen(7))
  const g3 = toG({ px: cx, py: R.y + 55 }); w.addTextC('APPROVED', g3.x, g3.y, 'Date ....................', toGLen(7))
}

function drawScaleBarDxf(w, layout, denom, toG, toGLen) {
  const R = layout.scaleBar
  const PT_PER_MM = 72 / 25.4
  const ptPerM = PT_PER_MM * 1000 / denom
  const barGroundM = (R.width / PT_PER_MM) * denom / 1000
  const seg = snapScaleBarSegment(barGroundM / 3)
  const segW = seg * ptPerM
  const barY = R.y + 10
  const bx = R.x + R.width / 2 - 1.5 * segW
  const x0 = bx + segW
  const barH = 4
  const subN = 5, subW = segW / subN

  for (let idx = 0; idx < subN; idx += 2) {
    const c1 = toG({ px: bx + idx * subW, py: barY }), c2 = toG({ px: bx + (idx + 1) * subW, py: barY + barH })
    w.addSolidRect('SCALE_BAR', c1.x, c1.y, c2.x, c2.y)
  }
  { const c1 = toG({ px: x0 + segW, py: barY }), c2 = toG({ px: x0 + 2 * segW, py: barY + barH })
    w.addSolidRect('SCALE_BAR', c1.x, c1.y, c2.x, c2.y) }
  const f0 = toG({ px: bx, py: barY }), f1 = toG({ px: bx + 3 * segW, py: barY })
  const f2 = toG({ px: bx + 3 * segW, py: barY + barH }), f3 = toG({ px: bx, py: barY + barH })
  w.addPolylineOutline('SCALE_BAR', [f0, f1, f2, f3], true)

  const lbl = (val, cxPt) => { const g = toG({ px: cxPt, py: R.y }); w.addTextC('SCALE_BAR', g.x, g.y, String(Math.round(val)), toGLen(6.5)) }
  lbl(seg, bx)
  lbl(0, x0)
  lbl(seg, x0 + segW)
  lbl(2 * seg, x0 + 2 * segW)
  { const g = toG({ px: x0 + 2 * segW + 6, py: barY }); w.addText('SCALE_BAR', g.x, g.y, 'metres', toGLen(6.5)) }
  { const g = toG({ px: R.x + R.width / 2, py: R.y + 20 }); w.addTextC('SCALE_BAR', g.x, g.y, `Scale 1 : ${denom}`, toGLen(6.5)) }
}
```

Insert the calls after `drawBeaconDescriptionDxf(...)`:

```js
  drawNorthArrowDxf(w, layout, toG, toGLen)
  drawApprovedBoxDxf(w, layout, toG, toGLen)
  drawScaleBarDxf(w, layout, denom, toG, toGLen)
```

> Note: the PDF's checkerboard fills alternate cells `i=0,2,4` (of 5) black, leaving `i=1,3`
> white/unfilled — this port fills the same `i=0,2,4` cells via `addSolidRect` and leaves the
> others as gaps in the outer frame outline, matching the PDF's visual result (uniform
> graduations, see the earlier scale-bar fix this codebase already shipped).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js diagramDxf`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/diagramDxf.js app-backend/src/services/__tests__/diagramDxf.test.js
git commit -m "feat(diagram): DXF north arrow, approved box, scale bar

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Statement block

**Files:**
- Modify: `app-backend/src/services/diagramDxf.js`
- Test: `app-backend/src/services/__tests__/diagramDxf.test.js` (extend)

**Interfaces:**
- Consumes: `layout.statement`, `geometry`, `metadata`, `buildFigureRepresents`, `formatDiagramArea`, `resolveStatementDesignation`, `textWidth`, `toG`, `toGLen`.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

```js
// append to app-backend/src/services/__tests__/diagramDxf.test.js
test('renders the statement block', async () => {
  const r = await generateDiagramDXF(options, logger)
  const text = r.dxfBuffer.toString('utf8')
  expect(text).toContain('STATEMENT\n')
  expect(text).toContain('The figure')
  expect(text).toContain('represents')
  expect(text).toContain('of land called')
  expect(text).toContain('STAND 302 BRACKENHURST')
  expect(text).toContain('Land Surveyor')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js diagramDxf`
Expected: FAIL — no `STATEMENT` content.

- [ ] **Step 3: Add `drawStatementDxf` and call it**

```js
function drawStatementDxf(w, layout, geometry, metadata, toG, toGLen) {
  const R = layout.statement
  const seq = buildFigureRepresents(geometry)
  const area = formatDiagramArea(geometry.area)
  const designation = resolveStatementDesignation(geometry.designation, geometry.stand, metadata.designation)
  const parent = metadata.parentProperty ? ` OF ${metadata.parentProperty}` : ''
  const surveyDate = metadata.surveyDate ?? metadata.date

  { const g = toG({ px: R.x, py: R.y + 9 }); w.addText('STATEMENT', g.x, g.y, 'The figure', toGLen(9)) }
  { const g = toG({ px: R.x, py: R.y + 20 }); w.addText('STATEMENT', g.x, g.y, 'represents', toGLen(9)) }
  { const g = toG({ px: R.x + R.width / 2, py: R.y + 9 }); w.addTextC('STATEMENT', g.x, g.y, seq, toGLen(9)) }
  { const g = toG({ px: R.x + R.width / 2, py: R.y + 21 }); w.addTextC('STATEMENT', g.x, g.y, area, toGLen(9)) }
  { const g = toG({ px: R.x + R.width, py: R.y + 21 }); w.addTextR('STATEMENT', g.x, g.y, 'of land called', toGLen(9)) }

  const desigText = `${designation}${parent}`
  let desigSize = 11
  while (desigSize > 7.5 && textWidth(desigText, desigSize) > R.width) desigSize -= 0.5
  { const g = toG({ px: R.x, py: R.y + 30 + desigSize }); w.addText('STATEMENT', g.x, g.y, desigText, toGLen(desigSize)) }

  { const g = toG({ px: R.x, py: R.y + 53 }); w.addText('STATEMENT', g.x, g.y, `situate in the district of ${metadata.district ?? ''}.`, toGLen(9)) }
  const surveyedLine = `Surveyed in ${surveyDate ? new Date(surveyDate).toLocaleString('en', { month: 'long', year: 'numeric' }) : ''} by me`
  { const g = toG({ px: R.x, py: R.y + 70 }); w.addText('STATEMENT', g.x, g.y, surveyedLine, toGLen(9)) }
  { const g = toG({ px: R.x + R.width, py: R.y + 90 }); w.addTextR('STATEMENT', g.x, g.y, 'Land Surveyor', toGLen(9)) }
}
```

> Y offsets add each font's own height (e.g. `R.y + 9` for a 9pt line, `R.y + 30 + desigSize`
> for the designation) because DXF `TEXT` positions its **baseline**, whereas PDFKit's
> `doc.text(x, y, …)` positions the **top** of the text box — a fixed, deliberate offset
> difference from the PDF's raw `R.y + …` values throughout every block in this plan.

Insert the call after `drawScaleBarDxf(...)`:

```js
  drawStatementDxf(w, layout, geometry, metadata, toG, toGLen)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js diagramDxf`
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/diagramDxf.js app-backend/src/services/__tests__/diagramDxf.test.js
git commit -m "feat(diagram): DXF statement block

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Reference grid (reg-53)

**Files:**
- Modify: `app-backend/src/services/diagramDxf.js`
- Test: `app-backend/src/services/__tests__/diagramDxf.test.js` (extend)

**Interfaces:**
- Consumes: `layout.refGrid`, `layout.border`, `buildReferenceGrid`, `textWidth`, `toG`, `toGLen`.
- Produces: nothing new (final block).

- [ ] **Step 1: Write the failing test**

```js
// append to app-backend/src/services/__tests__/diagramDxf.test.js
test('renders the reference grid (reg-53)', async () => {
  const r = await generateDiagramDXF({
    ...options,
    metadata: { ...options.metadata, fileNo: '5/2023', srNo: '118/2023' },
  }, logger)
  const text = r.dxfBuffer.toString('utf8')
  expect(text).toContain('GRID\n')
  expect(text).toContain('This diagram is annexed to')
  expect(text).toContain('The immediate parent diagram is')
  expect(text).toContain('The original title diagram is')
  expect(text).toContain('File : 5/2023')
  expect(text).toContain('S.R. : 118/2023')
  expect(text).toContain('Surveyor-General')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js diagramDxf`
Expected: FAIL — no `GRID`/reference-grid text.

- [ ] **Step 3: Add the reference-grid functions and call them**

```js
// Spread a single line's words across `width` via manual per-word spacing (no native
// DXF justify-across-width primitive — mirrors diagramPdf.js's drawJustifiedLine).
function justifiedLineDxf(w, layer, text, x, y, width, height, toG, toGLen) {
  const words = String(text).split(/\s+/).filter(Boolean)
  if (words.length === 0) return
  if (words.length === 1) { const g = toG({ px: x, py: y }); w.addText(layer, g.x, g.y, words[0], toGLen(height)); return }
  const wordsW = words.reduce((s, wd) => s + textWidth(wd, height), 0)
  const gap = Math.max(0, (width - wordsW) / (words.length - 1))
  let cx = x
  for (const wd of words) {
    const g = toG({ px: cx, py: y })
    w.addText(layer, g.x, g.y, wd, toGLen(height))
    cx += textWidth(wd, height) + gap
  }
}

function refRowY(top, bottom) {
  const row = (bottom - top) / 4
  return (i) => top + row * i + (row - 7) / 2 + 7 // +7: DXF baseline vs. PDF top-left
}

function drawDiagramRefCellDxf(w, { xLeft, xRight, top, bottom, pad, line1, no, annexedTo, deedNo }, toG, toGLen) {
  const cx = xLeft + pad
  const cw = (xRight - xLeft) - 2 * pad
  const y = refRowY(top, bottom)
  const rightPad = 4
  justifiedLineDxf(w, 'GRID', line1, cx, y(0), cw, 7, toG, toGLen)
  { const g = toG({ px: cx, py: y(1) }); w.addText('GRID', g.x, g.y, `No. ${no}`, toGLen(7)) }
  { const g = toG({ px: xRight - rightPad, py: y(1) }); w.addTextR('GRID', g.x, g.y, 'annexed to', toGLen(7)) }
  if (annexedTo) { const g = toG({ px: cx, py: y(2) }); w.addText('GRID', g.x, g.y, annexedTo, toGLen(7)) }
  { const g = toG({ px: xLeft + (xRight - xLeft) / 2, py: y(3) }); w.addText('GRID', g.x, g.y, `No. ${deedNo}`, toGLen(7)) }
}

function drawReferenceGridDxf(w, layout, grid, toG, toGLen) {
  const R = layout.refGrid
  const W = R.width
  const B = layout.border
  const bottom = B.y + B.height
  const x0 = R.x, x1 = R.x + W / 3, xR = B.x + B.width
  const x2 = x1 + (xR - x1) / 2
  const t1 = x1 + (xR - x1) / 3, t2 = x1 + 2 * (xR - x1) / 3
  const COMP_H = 14
  const r3 = bottom - COMP_H
  const r2 = r3 - R.height * 0.25
  const compCenterY = r3 + (COMP_H - 7) / 2 + 7

  const line = (px1, py1, px2, py2) => { const g1 = toG({ px: px1, py: py1 }), g2 = toG({ px: px2, py: py2 }); w.addLine('GRID', g1.x, g1.y, g2.x, g2.y) }
  line(B.x, R.y, B.x + B.width, R.y)
  line(x1, R.y, x1, bottom)
  line(x2, R.y, x2, r2)
  line(x1, r2, xR, r2)
  line(x1, r3, xR, r3)
  line(t1, r2, t1, r3)
  line(t2, r2, t2, r3)

  const pad = 3
  const wL = (x1 - x0) - 2 * pad
  const lY = refRowY(R.y, r2)
  const colMid = x0 + (x1 - x0) / 2
  { const g = toG({ px: x0 + pad, py: lY(0) }); w.addText('GRID', g.x, g.y, 'This diagram is annexed to', toGLen(7)) }
  { const g = toG({ px: x0 + pad, py: lY(1) }); w.addText('GRID', g.x, g.y, 'No.', toGLen(7)) }
  { const g = toG({ px: colMid, py: lY(1) }); w.addText('GRID', g.x, g.y, 'dated', toGLen(7)) }
  { const g = toG({ px: x0 + wL + pad, py: compCenterY }); w.addTextR('GRID', g.x, g.y, 'Surveyor-General', toGLen(7)) }

  drawDiagramRefCellDxf(w, {
    xLeft: x1, xRight: x2, top: R.y, bottom: r2, pad,
    line1: 'The immediate parent diagram is', no: grid.parentDiagramNo,
    annexedTo: grid.parentDiagramAnnexedTo, deedNo: grid.deedOfTransferNo,
  }, toG, toGLen)
  drawDiagramRefCellDxf(w, {
    xLeft: x2, xRight: xR, top: R.y, bottom: r2, pad,
    line1: 'The original title diagram is', no: grid.originalTitleDiagramNo,
    annexedTo: grid.parentDiagramAnnexedTo, deedNo: grid.deedOfTransferNo,
  }, toG, toGLen)

  const fileCenterY = r2 + ((r3 - r2) - 7) / 2 + 7
  { const g = toG({ px: x1 + pad, py: fileCenterY }); w.addText('GRID', g.x, g.y, `File : ${grid.fileNo}`, toGLen(7)) }
  { const g = toG({ px: t1 + pad, py: fileCenterY }); w.addText('GRID', g.x, g.y, `G.P. : ${grid.registrationGp}`, toGLen(7)) }
  { const g = toG({ px: t2 + pad, py: fileCenterY }); w.addText('GRID', g.x, g.y, `S.R. : ${grid.srNo}`, toGLen(7)) }
  { const g = toG({ px: x1 + pad, py: compCenterY }); w.addText('GRID', g.x, g.y, `Compilation : ${grid.compilation}`, toGLen(7)) }
}
```

Insert the call after `drawStatementDxf(...)`, and remove the now-obsolete "Tasks 5-9" placeholder comment:

```js
  drawReferenceGridDxf(w, layout, buildReferenceGrid(metadata), toG, toGLen)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js diagramDxf`
Expected: PASS (15 tests).

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/diagramDxf.js app-backend/src/services/__tests__/diagramDxf.test.js
git commit -m "feat(diagram): DXF reference grid (reg-53) — completes the diagram DXF renderer

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: Full-suite regression pass (mirror every `diagramPdf.test.js` case)

**Files:**
- Modify: `app-backend/src/services/__tests__/diagramDxf.test.js` (extend)

**Interfaces:**
- Consumes: `generateDiagramDXF` (complete as of Task 9).
- Produces: nothing new — this task is verification-only, no production code changes.

- [ ] **Step 1: Write the additional tests (parity with `diagramPdf.test.js`'s remaining cases)**

```js
// append to app-backend/src/services/__tests__/diagramDxf.test.js
test('renders with beacons + Lo system without error and stays a well-formed DXF', async () => {
  const withBeacons = {
    ...options,
    beacons: { type: 'FeatureCollection', features: [
      { type: 'Feature', properties: { name: '302A', description: '12mm iron peg' }, geometry: { type: 'Point', coordinates: [0, 0] } },
    ] },
  }
  const r = await generateDiagramDXF(withBeacons, logger)
  const text = r.dxfBuffer.toString('utf8')
  expect(text.startsWith('  0\nSECTION\n')).toBe(true)
  expect(text.trim().endsWith('0\nEOF')).toBe(true)
  expect(r.dxfBuffer.length).toBeGreaterThan(2000)
})
```

- [ ] **Step 2: Run the full `diagramDxf` suite**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js diagramDxf`
Expected: PASS (16 tests) — every case from `diagramPdf.test.js` now has a DXF equivalent
(valid-output, throws-on-missing-subject, beacons+Lo, A3/A4 sheet size, neighbour clipping,
adjoining annotations incl. skip-unmatched, sideAnnotations-absent, single/both-terminal
contiguous, plus the DXF-specific structural checks from Tasks 2–9).

- [ ] **Step 3: Run the full backend suite to confirm no regressions elsewhere**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js`
Expected: All pre-existing suites still pass; only `diagramDxf.test.js` and
`dxfPrimitives.test.js` are new. `dxfGenerator.js`'s own suites (snapshot/parity/integration)
are untouched and must show zero diff from before this plan started.

- [ ] **Step 4: Commit**

```bash
git add app-backend/src/services/__tests__/diagramDxf.test.js
git commit -m "test(diagram): DXF diagram renderer full regression parity with the PDF suite

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 11: Route wiring — `/dxf` branches on `planType === 'diagram'`

**Files:**
- Modify: `app-backend/src/routes/geopdf-vector.js` (`/dxf` handler, lines ~159–205)
- Test: `app-backend/src/routes/__tests__/geopdf-vector.dxf.test.js` (new)

**Interfaces:**
- Consumes: `generateDiagramDXF` from `../services/diagramDxf.js` (Task 9's complete function).
- Produces: no new exports — route behaviour only.

- [ ] **Step 1: Write the failing test**

```js
// app-backend/src/routes/__tests__/geopdf-vector.dxf.test.js
import { describe, test, expect, jest } from '@jest/globals'
import Fastify from 'fastify'

// Mock BOTH generators so the route test never touches real geometry/DB logic —
// it only proves the planType branch calls the right one and returns its buffer.
const mockGenerateDiagramDXF = jest.fn(async () => ({ dxfBuffer: Buffer.from('DIAGRAM-DXF'), scale: '1:500', sheetSize: 'A4' }))
const mockGenerateDXF = jest.fn(() => ({ buffer: Buffer.from('GENERAL-PLAN-DXF'), warnings: { count: 0, summary: {} } }))

jest.unstable_mockModule('../../services/diagramDxf.js', () => ({ generateDiagramDXF: mockGenerateDiagramDXF }))
jest.unstable_mockModule('../../services/dxfGenerator.js', () => ({ generateDXF: mockGenerateDXF }))

const { default: geopdfVectorRoutes } = await import('../geopdf-vector.js')

function buildApp() {
  const app = Fastify()
  app.decorate('authenticate', async () => {})
  app.decorate('log', { info() {}, warn() {}, error() {} })
  app.addHook('preHandler', async (request) => { request.body = request.body ?? {} })
  // authenticateWithSchema is imported inside the route file from a real module;
  // the route test only needs the /dxf handler reachable, so register it directly
  // bypassing the schema-auth preHandler chain via a minimal decorator stand-in.
  app.register(geopdfVectorRoutes)
  return app
}

const basePayload = { parcels: { type: 'FeatureCollection', features: [] }, beacons: { type: 'FeatureCollection', features: [] } }

describe('/api/geopdf/dxf planType branch', () => {
  test("planType: 'diagram' calls generateDiagramDXF and returns its buffer", async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'POST', url: '/dxf', payload: { ...basePayload, planType: 'diagram' } })
    expect(mockGenerateDiagramDXF).toHaveBeenCalledTimes(1)
    expect(mockGenerateDXF).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(200)
    expect(res.rawPayload.toString()).toBe('DIAGRAM-DXF')
  })

  test('any other planType still calls generateDXF unchanged', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'POST', url: '/dxf', payload: { ...basePayload, planType: 'general-undeveloped' } })
    expect(mockGenerateDXF).toHaveBeenCalledTimes(1)
    expect(mockGenerateDiagramDXF).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(200)
    expect(res.rawPayload.toString()).toBe('GENERAL-PLAN-DXF')
  })
})
```

> If `app.register(geopdfVectorRoutes)` fails because the route file's `preHandler:
> [fastify.authenticate, authenticateWithSchema]` requires `authenticateWithSchema` to be a
> real decorator/import this minimal harness doesn't provide, the implementer should mock
> `../../utils/schemaAuth.js`'s `authenticateWithSchema` the same way (`jest.unstable_mockModule`
> exporting a no-op `async (request, reply) => {}`) before importing the route file — add that
> mock alongside the two above rather than restructuring the test's intent.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js geopdf-vector.dxf`
Expected: FAIL — `generateDXF` is currently called unconditionally, so the first test's
`expect(mockGenerateDXF).not.toHaveBeenCalled()` fails.

- [ ] **Step 3: Add the branch**

In `app-backend/src/routes/geopdf-vector.js`, replace the `/dxf` handler's body:

```js
      const { generateDXF } = await import('../services/dxfGenerator.js')

      const { buffer, warnings } = generateDXF(
        { parcels, beacons, outsideFigureData, metadata, projection, scale, sheetSize, orientation, planType, beaconLabels, beaconGroups: request.body.beaconGroups },
        fastify.log
      )

      const filename = `survey-plan-${Date.now()}.dxf`
      reply
        .type('application/dxf')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .header('X-DXF-Warning-Count', String(warnings.count))
      if (warnings.count > 0) {
        reply.header('X-DXF-Warnings', JSON.stringify(warnings.summary))
      }
      reply.send(buffer)
```

with:

```js
      if (planType === 'diagram') {
        fastify.log.info('[DXF] 📐 Diagram plan type → single-stand Diagram DXF renderer')
        const { generateDiagramDXF } = await import('../services/diagramDxf.js')
        const diagram = await generateDiagramDXF(
          { parcels, beacons, metadata, projection, scale, sheetSize: (sheetSize === 'A3' ? 'A3' : 'A4'), orientation: 'portrait' },
          fastify.log
        )
        const ts = Date.now()
        reply
          .type('application/dxf')
          .headers({
            'Content-Disposition': `attachment; filename="diagram-${ts}.dxf"`,
            'X-Used-Scale': diagram.scale,
            'X-Used-Sheet-Size': diagram.sheetSize,
          })
          .send(diagram.dxfBuffer)
        return
      }

      const { generateDXF } = await import('../services/dxfGenerator.js')

      const { buffer, warnings } = generateDXF(
        { parcels, beacons, outsideFigureData, metadata, projection, scale, sheetSize, orientation, planType, beaconLabels, beaconGroups: request.body.beaconGroups },
        fastify.log
      )

      const filename = `survey-plan-${Date.now()}.dxf`
      reply
        .type('application/dxf')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .header('X-DXF-Warning-Count', String(warnings.count))
      if (warnings.count > 0) {
        reply.header('X-DXF-Warnings', JSON.stringify(warnings.summary))
      }
      reply.send(buffer)
```

This mirrors the `/vector` handler's existing `if (planType === 'diagram')` branch exactly:
same `sheetSize` normalization (`'A3'|'A4'`), same hardcoded `orientation: 'portrait'` (the
frontend's diagram-mode `orientation` field is not necessarily `'portrait'` — see the plan's
research; the PDF branch already ignores it the same way), same header/filename pattern.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js geopdf-vector.dxf`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full backend suite**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js`
Expected: all suites green, no regressions.

- [ ] **Step 6: Commit**

```bash
git add app-backend/src/routes/geopdf-vector.js app-backend/src/routes/__tests__/geopdf-vector.dxf.test.js
git commit -m "feat(diagram): wire /api/geopdf/dxf to the diagram DXF renderer for planType='diagram'

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Full 1:1 block fidelity (border, figure+band+beacons+letters, adjoining features, table,
  beacon description, north arrow, approved box, scale bar, statement, reference grid) →
  Tasks 2–9, one block per task, in `generateDiagramPDF`'s exact draw order. ✓
- Shared pure helper reuse (no structural drift from the PDF) → Task 2 imports every helper
  `diagramPdf.js` imports; Tasks 3–9 consume `contiguousMarks`/`roadBandRibbon`/`edgeStrip`/
  `placeVertexLabel`/etc. unchanged, in PDF-point space. ✓
- Self-contained DXF writer, `dxfGenerator.js` untouched → Task 1 + Global Constraints;
  verified untouched by Task 10 Step 3's full-suite run. ✓
- Corrected ground-coordinate design (`pageToGround`, extent-anchored, algebraically
  verified against `capeLoToDxfSouthUp`) → Task 2. ✓
- Colour/layer conventions (`DIAGRAM_ROAD` ACI 1, `ADJOINING_SERVITUDE` ACI 5 reused,
  `ADJOINING` ACI 7 reused) → Task 2's `LAYERS` array + Task 4. ✓
- Route wiring mirroring `/vector`'s existing branch → Task 11. ✓
- Route test (confirmed no pre-existing test file) → Task 11. ✓
- Full regression parity with every `diagramPdf.test.js` case → Task 3 (neighbour clipping),
  Task 4 (adjoining incl. skip-unmatched, single/both-terminal), Task 10 (beacons+Lo,
  remaining structural checks); A3/A4 + missing-subject + default-sheet-size covered in
  Task 2. ✓

**Placeholder scan:** No TBD/TODO; every code step is complete, runnable code with real
values (not "similar to Task N" — Tasks 4–9 each restate their full function body even
where the porting pattern repeats, per the No-Placeholders rule).

**Type/signature consistency:** `toG({px,py}) -> {x,y}` and `toGLen(pt) -> number` are
defined once in Task 2 and used with identical signatures in every later task.
`createDxfWriter(layers)`'s returned method names (`addLine`, `addPolylineOutline`,
`addCircle`, `addText`, `addTextC`, `addTextR`, `addSolidRect`, `finish`) are used
identically from Task 2 onward — no renamed or reshaped calls in later tasks.
`generateDiagramDXF(options, logger) -> {dxfBuffer, scale, sheetSize}` matches the route
wiring in Task 11 (`diagram.dxfBuffer`, `diagram.scale`, `diagram.sheetSize`).

**Scope check:** Single cohesive subsystem (one new renderer + one route branch), sized
proportionately to the ~800-line PDF renderer it mirrors. Not decomposed into separate
specs/plans — the blocks are tightly coupled (shared `layout`/`toG`/`labelObstacles` state
threaded through every task), which is why they're tasks within one plan rather than
independent projects.
