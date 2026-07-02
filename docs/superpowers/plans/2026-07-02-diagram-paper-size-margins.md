# Diagram Paper Size (A4/A3) + Margins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Diagram renderer honor a chosen A4/A3 portrait sheet with a 35 mm-left / 15 mm-others neat-line margin, and expose A4/A3 in the (plan-type-aware) paper-size dropdown for the Diagram plan type only.

**Architecture:** A new pure helper `diagram/diagramLayout.js` computes all diagram page regions from page dimensions + margins (figure band flexes to fill the middle). `diagramPdf.js` stops hard-coding A4/`REGIONS`, consumes the computed layout, draws the neat-line border, and honors `options.sheetSize`. The `/vector` route forwards the chosen size. The frontend dropdown becomes plan-type-aware via a small pure helper.

**Tech Stack:** Node ESM + pdfkit + Jest (backend); Vue 3 `<script setup lang="ts">` + Vitest (frontend).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-02-diagram-paper-size-margins-design.md`.
- **Diagram plan type only.** No changes to `SI727_SHEET_SIZES`, the general-plan renderer, DXF, or Working Plan. Working Plan A4/A3 is deferred to sub-project #3.
- **Margins:** left = 35 mm, top/right/bottom = 15 mm. `MM_TO_PT = 72 / 25.4`.
- **Page dims (portrait, pt):** A4 = `595.28 × 841.89`; A3 = `841.89 × 1190.55`.
- Margin rendered as a **drawn neat-line border + content inset**. Figure band **flexes**; other bands fixed height.
- Backend Jest: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns=<pat>` (run from `app-backend/`). Frontend Vitest: `npm test -- <pat>`, compile gate `npm run build` (run from `app-frontend/`).
- `sheetSize` codes for the Diagram are `'A4'` (default) and `'A3'`.

---

### Task 1: `diagramLayout.js` — page dims, margins, region layout

**Files:**
- Create: `app-backend/src/services/diagram/diagramLayout.js`
- Test: `app-backend/src/services/diagram/__tests__/diagramLayout.test.js`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `DIAGRAM_MARGINS_MM = { left: 35, top: 15, right: 15, bottom: 15 }`
  - `pageDimsPt(sheetSize) => { width, height }` — A4/A3 portrait; unknown → A4.
  - `marginsPt(mm = DIAGRAM_MARGINS_MM) => { left, top, right, bottom }` (pt).
  - `computeDiagramLayout({ pageWidthPt, pageHeightPt, margins }) => { border, table, sgNoBox, beaconDesc, northArrow, approved, figure, scaleBar, statement, refGrid }` — each `{ x, y, width, height }` in absolute page pt; `figure.height` flexes.

- [ ] **Step 1: Write the failing test**

Create `app-backend/src/services/diagram/__tests__/diagramLayout.test.js`:
```js
import { describe, test, expect } from '@jest/globals'
import {
  DIAGRAM_MARGINS_MM, pageDimsPt, marginsPt, computeDiagramLayout,
} from '../diagramLayout.js'

const MM = 72 / 25.4

describe('pageDimsPt', () => {
  test('A4 and A3 portrait; default A4', () => {
    expect(pageDimsPt('A4').width).toBeCloseTo(595.28, 2)
    expect(pageDimsPt('A3').height).toBeCloseTo(1190.55, 1)
    expect(pageDimsPt('bogus')).toEqual(pageDimsPt('A4'))
  })
})

describe('marginsPt', () => {
  test('35mm left, 15mm others in points', () => {
    const m = marginsPt()
    expect(m.left).toBeCloseTo(35 * MM, 3)
    expect(m.top).toBeCloseTo(15 * MM, 3)
    expect(m.right).toBeCloseTo(15 * MM, 3)
    expect(m.bottom).toBeCloseTo(15 * MM, 3)
  })
})

describe('computeDiagramLayout', () => {
  const dims = pageDimsPt('A4')
  const margins = marginsPt()
  const L = computeDiagramLayout({ pageWidthPt: dims.width, pageHeightPt: dims.height, margins })

  test('border is the content box (page minus margins)', () => {
    expect(L.border.x).toBeCloseTo(35 * MM, 3)
    expect(L.border.y).toBeCloseTo(15 * MM, 3)
    expect(L.border.width).toBeCloseTo(dims.width - 50 * MM, 3)   // 35 + 15
    expect(L.border.height).toBeCloseTo(dims.height - 30 * MM, 3) // 15 + 15
  })

  test('figure flexes = content height minus fixed bands', () => {
    const fixed = 150 + 55 + 34 + 64 + 100
    expect(L.figure.height).toBeCloseTo(L.border.height - fixed, 3)
    expect(L.figure.width).toBeCloseTo(L.border.width, 3)
  })

  test('bands stack top-to-bottom without gaps or overlap', () => {
    expect(L.table.y).toBeCloseTo(L.border.y, 3)
    expect(L.figure.y).toBeCloseTo(L.table.y + L.table.height + 55, 3) // header band = 55
    expect(L.scaleBar.y).toBeCloseTo(L.figure.y + L.figure.height, 3)
    expect(L.statement.y).toBeCloseTo(L.scaleBar.y + 34, 3)
    expect(L.refGrid.y).toBeCloseTo(L.statement.y + 64, 3)
    // last band bottom sits within the content box
    expect(L.refGrid.y + L.refGrid.height).toBeLessThanOrEqual(L.border.y + L.border.height + 0.01)
  })

  test('sgNoBox is right-aligned inside the content box', () => {
    expect(L.sgNoBox.x + L.sgNoBox.width).toBeCloseTo(L.border.x + L.border.width, 3)
  })

  test('every region is inside the content box', () => {
    const inside = (r) =>
      r.x >= L.border.x - 0.01 &&
      r.y >= L.border.y - 0.01 &&
      r.x + r.width <= L.border.x + L.border.width + 0.01 &&
      r.y + r.height <= L.border.y + L.border.height + 0.01
    for (const key of ['table', 'beaconDesc', 'northArrow', 'approved', 'figure', 'scaleBar', 'statement', 'refGrid']) {
      expect(inside(L[key])).toBe(true)
    }
  })

  test('A3 gives a taller figure than A4', () => {
    const d3 = pageDimsPt('A3')
    const L3 = computeDiagramLayout({ pageWidthPt: d3.width, pageHeightPt: d3.height, margins })
    expect(L3.figure.height).toBeGreaterThan(L.figure.height)
  })

  test('DIAGRAM_MARGINS_MM is 35 left / 15 others', () => {
    expect(DIAGRAM_MARGINS_MM).toEqual({ left: 35, top: 15, right: 15, bottom: 15 })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run (from `app-backend/`): `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns=diagramLayout`
Expected: FAIL — cannot find module `../diagramLayout.js`.

- [ ] **Step 3: Implement**

Create `app-backend/src/services/diagram/diagramLayout.js`:
```js
/**
 * Compute the S.G. Diagram page layout from page size + margins. All regions are
 * absolute page points. The figure band flexes to fill the space left by the
 * fixed bands (table, header row, scale bar, statement, reference grid).
 */
const MM_TO_PT = 72 / 25.4

export const DIAGRAM_MARGINS_MM = { left: 35, top: 15, right: 15, bottom: 15 }

// Portrait page dimensions in points.
const PAGE_DIMS_PT = {
  A4: { width: 595.28, height: 841.89 },
  A3: { width: 841.89, height: 1190.55 },
}

// Fixed band heights (pt); the figure fills whatever remains.
const BAND = { table: 150, header: 55, scaleBar: 34, statement: 64, refGrid: 100 }

export function pageDimsPt(sheetSize) {
  return PAGE_DIMS_PT[sheetSize] || PAGE_DIMS_PT.A4
}

export function marginsPt(mm = DIAGRAM_MARGINS_MM) {
  return {
    left: mm.left * MM_TO_PT,
    top: mm.top * MM_TO_PT,
    right: mm.right * MM_TO_PT,
    bottom: mm.bottom * MM_TO_PT,
  }
}

export function computeDiagramLayout({ pageWidthPt, pageHeightPt, margins }) {
  const cx = margins.left
  const cy = margins.top
  const cw = pageWidthPt - margins.left - margins.right
  const ch = pageHeightPt - margins.top - margins.bottom
  const contentRight = cx + cw

  const border = { x: cx, y: cy, width: cw, height: ch }

  const fixed = BAND.table + BAND.header + BAND.scaleBar + BAND.statement + BAND.refGrid
  const figureH = ch - fixed

  let y = cy
  const table = { x: cx, y, width: cw, height: BAND.table }
  const sgNoBox = { x: contentRight - 100, y, width: 100, height: 40 }
  y += BAND.table

  const beaconDesc = { x: cx, y, width: cw * 0.45, height: BAND.header }
  const northArrow = { x: cx + cw / 2 - 20, y, width: 40, height: 50 }
  const approved = { x: contentRight - 175, y, width: 175, height: 45 }
  y += BAND.header

  const figure = { x: cx, y, width: cw, height: figureH }
  y += figureH

  const scaleBar = { x: cx + (cw - 160) / 2, y, width: 160, height: BAND.scaleBar }
  y += BAND.scaleBar

  const statement = { x: cx, y, width: cw, height: BAND.statement }
  y += BAND.statement

  const refGrid = { x: cx, y, width: cw, height: BAND.refGrid }

  return { border, table, sgNoBox, beaconDesc, northArrow, approved, figure, scaleBar, statement, refGrid }
}
```

- [ ] **Step 4: Verify pass**

Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns=diagramLayout`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/diagram/diagramLayout.js app-backend/src/services/diagram/__tests__/diagramLayout.test.js
git commit -m "feat(diagram): page layout helper (size + margin aware, flexing figure)"
```

---

### Task 2: `diagramPdf.js` — consume layout, draw border, honor sheetSize

**Files:**
- Modify (full replace): `app-backend/src/services/diagramPdf.js`
- Modify: `app-backend/src/services/__tests__/diagramPdf.test.js`

**Interfaces:**
- Consumes: `computeDiagramLayout`, `pageDimsPt`, `marginsPt` (Task 1).
- Produces: `generateDiagramPDF(options, logger)` unchanged signature; now reads `options.sheetSize` (`'A4'` default / `'A3'`), returns `{ pdfBuffer, scale, sheetSize }` with the resolved size. All draw helpers now take the computed `layout` object.

**Context:** Today `diagramPdf.js` has a module-level `A4` const and exported `REGIONS`, and the draw helpers read `REGIONS` directly. This task removes both and threads `layout` through. First confirm `REGIONS` has no external consumer.

- [ ] **Step 1: Confirm no external `REGIONS` consumer**

Run: `grep -rn "REGIONS" app-backend/src | grep -v "src/services/diagramPdf.js"`
Expected: no matches (the export is internal-only; safe to remove).

- [ ] **Step 2: Update the integration test first (A4 + A3)**

In `app-backend/src/services/__tests__/diagramPdf.test.js`, replace the `throws ...` / existing size assertions area by adding these two tests inside the top `describe('generateDiagramPDF', …)` block (keep the existing tests):
```js
  test('honors A3 sheet size and echoes it', async () => {
    const r = await generateDiagramPDF({ ...options, sheetSize: 'A3' }, logger)
    expect(r.pdfBuffer.slice(0, 5).toString()).toBe('%PDF-')
    expect(r.sheetSize).toBe('A3')
    expect(r.pdfBuffer.length).toBeGreaterThan(2000)
  })

  test('defaults to A4 when sheetSize is missing/unknown', async () => {
    const r = await generateDiagramPDF({ ...options, sheetSize: 'ZZ' }, logger)
    expect(r.sheetSize).toBe('A4')
    expect(r.pdfBuffer.slice(0, 5).toString()).toBe('%PDF-')
  })
```
> The existing `options` fixture already sets `sheetSize: 'A4'`; the first test ("returns a valid PDF buffer") continues to assert `r.sheetSize === 'A4'`.

- [ ] **Step 3: Run to verify current state**

Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns=diagramPdf`
Expected: the new A3 test FAILS (current code hard-codes `sheetSize: 'A4'`).

- [ ] **Step 4: Replace `app-backend/src/services/diagramPdf.js` with:**

```js
import PDFDocument from 'pdfkit'
import { deriveSubjectGeometry } from './diagram/subjectGeometry.js'
import { parcelExtent, pickDiagramScale, makeTransform } from './diagram/diagramScale.js'
import { buildSidesTable, buildFigureRepresents } from './diagram/sidesTable.js'
import { buildReferenceGrid } from './diagram/referenceGrid.js'
import { computeDiagramLayout, pageDimsPt, marginsPt } from './diagram/diagramLayout.js'
import {
  resolveLoSystem, classifyBeaconGroups, formatAreaValue, snapScaleBarSegment,
} from '../../../app-shared/block-definitions.js'

function docToBuffer(doc) {
  const chunks = []
  return new Promise((resolve, reject) => {
    doc.on('data', (c) => chunks.push(c))
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

function drawTable(doc, layout, table, loLabel) {
  const { constRow, coordinateRows, sideRows } = table
  const R = layout.table
  doc.save().font('Helvetica-Bold').fontSize(7).fillColor('#000')
  doc.text('SIDES', R.x, R.y)
  doc.text('DIRECTIONS', R.x + 90, R.y)
  doc.text(loLabel, R.x + 190, R.y)
  doc.text('CO-ORDINATES', R.x + 245, R.y)
  doc.text('DIAGRAM S.G. No.', layout.sgNoBox.x, R.y)
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
  doc.rect(layout.sgNoBox.x, layout.sgNoBox.y + 10, layout.sgNoBox.width, layout.sgNoBox.height).stroke()
  doc.restore()
}

function drawBeaconDescription(doc, layout, beacons) {
  const R = layout.beaconDesc
  const groups = classifyBeaconGroups(beacons ?? { features: [] })
  doc.save().font('Helvetica-Bold').fontSize(7).text('Beacon description', R.x, R.y)
  doc.font('Helvetica').fontSize(7)
  const line = groups && groups.length
    ? `All          : ${groups[0].description ?? ''}`
    : 'All          :'
  doc.text(line, R.x, R.y + 11)
  doc.restore()
}

function drawNorthArrow(doc, layout) {
  const R = layout.northArrow
  const cx = R.x + R.width / 2
  doc.save().lineWidth(1).strokeColor('#000')
  doc.moveTo(cx, R.y + R.height).lineTo(cx, R.y).stroke()      // shaft
  doc.moveTo(cx - 4, R.y + 8).lineTo(cx, R.y).lineTo(cx + 4, R.y + 8).stroke() // head
  doc.font('Helvetica').fontSize(7).text('T  N', cx - 8, R.y + R.height + 2)
  doc.restore()
}

function drawApprovedBox(doc, layout) {
  const R = layout.approved
  doc.save().rect(R.x, R.y, R.width, R.height).stroke()
  doc.font('Helvetica').fontSize(7)
  doc.text('Approved', R.x + 8, R.y + 6)
  doc.text('for Surveyor-General', R.x + 8, R.y + 22)
  doc.text('Date ....................', R.x + 8, R.y + 34)
  doc.restore()
}

function drawScaleBar(doc, layout, denom) {
  const R = layout.scaleBar
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

function drawStatement(doc, layout, geometry, metadata) {
  const R = layout.statement
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

function drawReferenceGrid(doc, layout, grid) {
  const R = layout.refGrid
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

export async function generateDiagramPDF(options, logger) {
  const { parcels, metadata = {}, scale: requestedScale } = options
  const sheetSize = options.sheetSize === 'A3' ? 'A3' : 'A4'
  const features = parcels?.features ?? []
  const subjectId = String(metadata.subjectParcelId ?? '')
  const subject = features.find((f) => String(f.properties?.id) === subjectId)
  if (!subject) {
    throw new Error(`Diagram: subject parcel not found (subjectParcelId=${subjectId})`)
  }
  const neighbours = features.filter((f) => f !== subject)

  const dims = pageDimsPt(sheetSize)
  const margins = marginsPt()
  const layout = computeDiagramLayout({ pageWidthPt: dims.width, pageHeightPt: dims.height, margins })

  const geometry = deriveSubjectGeometry(subject)
  const extent = parcelExtent(subject)
  const { denom, label } = pickDiagramScale(extent, layout.figure, requestedScale)
  const tf = makeTransform(extent, layout.figure, denom)

  const doc = new PDFDocument({ size: [dims.width, dims.height], margin: 0 })
  const bufferPromise = docToBuffer(doc)

  // Neat-line border (35mm left, 15mm other margins); content sits inside it.
  doc.save().lineWidth(1).strokeColor('#000')
  doc.rect(layout.border.x, layout.border.y, layout.border.width, layout.border.height).stroke()
  doc.restore()

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

  // resolveLoSystem already returns the full "Lo NN" label.
  const loLabel = resolveLoSystem(null, metadata, options.projection)
  drawTable(doc, layout, buildSidesTable(geometry), loLabel)
  drawBeaconDescription(doc, layout, options.beacons)
  drawNorthArrow(doc, layout)
  drawApprovedBox(doc, layout)
  drawScaleBar(doc, layout, denom)
  drawStatement(doc, layout, geometry, metadata)
  drawReferenceGrid(doc, layout, buildReferenceGrid(metadata))

  doc.end()
  const pdfBuffer = await bufferPromise
  return { pdfBuffer, scale: label, sheetSize }
}
```

- [ ] **Step 5: Verify pass**

Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns=diagramPdf`
Expected: PASS (existing tests + the two new A3/default tests).

- [ ] **Step 6: Visual sanity (optional) + commit**

Optionally regenerate a sample to eyeball the 35/15 border and A3:
```bash
node --input-type=module -e "import('./src/services/diagramPdf.js').then(async m=>{const fs=await import('fs');for(const sz of ['A4','A3']){const r=await m.generateDiagramPDF({parcels:{type:'FeatureCollection',features:[{type:'Feature',properties:{id:'A',stand:'302',designation:'STAND 302 BRACKENHURST',area_m2:5019},geometry:{type:'Polygon',coordinates:[[[0,0],[0,60],[80,60],[80,0],[0,0]]]}}]},beacons:{type:'FeatureCollection',features:[]},metadata:{subjectParcelId:'A',designation:'STAND 302',district:'Gwelo',centralMeridian:29},projection:'EPSG:22289',scale:'auto',sheetSize:sz},{info(){},warn(){},error(){}});fs.writeFileSync('diagram-'+sz+'.pdf',r.pdfBuffer);console.log(sz,r.scale,r.pdfBuffer.length)}})"
```
```bash
git add app-backend/src/services/diagramPdf.js app-backend/src/services/__tests__/diagramPdf.test.js
git commit -m "feat(diagram): size + margin aware layout, neat-line border, honor A4/A3"
```

---

### Task 3: Route forwards the chosen sheet size

**Files:**
- Modify: `app-backend/src/routes/geopdf-vector.js`

**Interfaces:**
- Consumes: `generateDiagramPDF` (Task 2). `sheetSize` is already in scope in the handler.
- Produces: the diagram branch passes the request's sheet size (A4/A3) instead of a hard-coded `'A4'`.

- [ ] **Step 1: Edit the diagram dispatch**

In the `if (planType === 'diagram') {` branch, change the `generateDiagramPDF` options from:
```js
            { parcels: parcelsWithComputedData, beacons, metadata, projection,
              scale, sheetSize: 'A4', orientation: 'portrait' },
```
to:
```js
            { parcels: parcelsWithComputedData, beacons, metadata, projection,
              scale, sheetSize: (sheetSize === 'A3' ? 'A3' : 'A4'), orientation: 'portrait' },
```

- [ ] **Step 2: Syntax check**

Run (from `app-backend/`): `node --check src/routes/geopdf-vector.js`
Expected: no output (valid).

- [ ] **Step 3: Diagram suite green**

Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns="diagram"`
Expected: PASS (diagramLayout, diagramPdf, subjectGeometry, sidesTable, referenceGrid, diagramScale).

- [ ] **Step 4: Commit**

```bash
git add app-backend/src/routes/geopdf-vector.js
git commit -m "feat(diagram): forward selected A4/A3 sheet size to diagram renderer"
```

---

### Task 4: Frontend paper-size options helper

**Files:**
- Create: `app-frontend/src/views/modules/cadastral-standard/paperSizeOptions.ts`
- Test: `app-frontend/src/views/modules/cadastral-standard/__tests__/paperSizeOptions.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces: `interface PaperSizeOption { value: string; label: string }` and `paperSizeOptionsFor(planType: string): PaperSizeOption[]` — `diagram` → A4/A3; everything else → the existing auto/ISO list.

- [ ] **Step 1: Write the failing test**

Create `app-frontend/src/views/modules/cadastral-standard/__tests__/paperSizeOptions.test.ts`:
```ts
import { paperSizeOptionsFor } from '../paperSizeOptions'

describe('paperSizeOptionsFor', () => {
  it('offers A4 then A3 for the diagram plan type', () => {
    expect(paperSizeOptionsFor('diagram').map(o => o.value)).toEqual(['A4', 'A3'])
  })
  it('offers auto + ISO sizes for general and working plans', () => {
    const expected = ['auto', 'ISO_A2', 'ISO_A1', 'ISO_A0']
    expect(paperSizeOptionsFor('general-undeveloped').map(o => o.value)).toEqual(expected)
    expect(paperSizeOptionsFor('general-developed').map(o => o.value)).toEqual(expected)
    expect(paperSizeOptionsFor('working-plan').map(o => o.value)).toEqual(expected)
  })
  it('every option has a non-empty label', () => {
    for (const pt of ['diagram', 'general-undeveloped']) {
      for (const o of paperSizeOptionsFor(pt)) expect(o.label.length).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run (from `app-frontend/`): `npm test -- paperSizeOptions`
Expected: FAIL — cannot resolve `../paperSizeOptions`.

- [ ] **Step 3: Implement**

Create `app-frontend/src/views/modules/cadastral-standard/paperSizeOptions.ts`:
```ts
export interface PaperSizeOption {
  value: string
  label: string
}

// Diagram sheets are portrait A4/A3; other plan types use the SI 727 ISO ladder.
const DIAGRAM: PaperSizeOption[] = [
  { value: 'A4', label: 'A4 (210×297mm)' },
  { value: 'A3', label: 'A3 (297×420mm)' },
]

const GENERAL: PaperSizeOption[] = [
  { value: 'auto', label: 'Auto (Recommended)' },
  { value: 'ISO_A2', label: 'ISO A2 (594×420mm)' },
  { value: 'ISO_A1', label: 'ISO A1 (841×594mm)' },
  { value: 'ISO_A0', label: 'ISO A0 (1189×841mm)' },
]

export function paperSizeOptionsFor(planType: string): PaperSizeOption[] {
  return planType === 'diagram' ? DIAGRAM : GENERAL
}
```

- [ ] **Step 4: Verify pass**

Run: `npm test -- paperSizeOptions`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/paperSizeOptions.ts app-frontend/src/views/modules/cadastral-standard/__tests__/paperSizeOptions.test.ts
git commit -m "feat(diagram): plan-type-aware paper size options helper"
```

---

### Task 5: Frontend dropdown wiring + config type + plan-type reset

**Files:**
- Modify: `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue`

**Interfaces:**
- Consumes: `paperSizeOptionsFor` (Task 4). Existing in-file symbols: `config` (ref; `config.sheetSize`, `config.planType`), the sheet-size `<select>` (`:348-353`), the `watch(() => config.value.planType, …)` (`:5558`).
- Produces: the dropdown lists plan-type-aware options; `config.sheetSize` accepts `'A4'|'A3'`; switching plan type keeps the size valid.

**Context:** No DOM test infra; this task is verified by `npm run build` + manual. The pure options logic is already tested (Task 4).

- [ ] **Step 1: Add the import**

After the existing `import { pickDiagramSubjectId } from './diagramSubjectPick'` line (near the other module imports), add:
```ts
import { paperSizeOptionsFor } from './paperSizeOptions'
```

- [ ] **Step 2: Widen the `config.sheetSize` type**

At `:665`, change:
```ts
  sheetSize: 'auto' as 'auto' | 'ISO_A2' | 'ISO_A1' | 'ISO_A0',
```
to:
```ts
  sheetSize: 'auto' as 'auto' | 'ISO_A2' | 'ISO_A1' | 'ISO_A0' | 'A4' | 'A3',
```

- [ ] **Step 3: Make the dropdown options plan-type-aware**

Replace the four hard-coded `<option>` lines (`:349-352`):
```html
              <option value="auto">Auto (Recommended)</option>
              <option value="ISO_A2">ISO A2 (594×420mm)</option>
              <option value="ISO_A1">ISO A1 (841×594mm)</option>
              <option value="ISO_A0">ISO A0 (1189×841mm)</option>
```
with:
```html
              <option
                v-for="opt in paperSizeOptionsFor(config.planType)"
                :key="opt.value"
                :value="opt.value"
              >{{ opt.label }}</option>
```

- [ ] **Step 4: Keep the selected size valid when plan type changes**

Immediately after the existing `watch(() => config.value.planType, …)` block (ends at `:5563`), add a new immediate watcher:
```ts
// Keep the paper size valid for the plan type: Diagram → A4/A3; others → auto/ISO.
watch(() => config.value.planType, (pt) => {
  if (pt === 'diagram') {
    if (config.value.sheetSize !== 'A4' && config.value.sheetSize !== 'A3') {
      config.value.sheetSize = 'A4'
    }
  } else if (config.value.sheetSize === 'A4' || config.value.sheetSize === 'A3') {
    config.value.sheetSize = 'auto'
  }
}, { immediate: true })
```

- [ ] **Step 5: Compile gate**

Run (from `app-frontend/`): `npm run build`
Expected: build succeeds (pre-existing unrelated warnings are fine).

- [ ] **Step 6: Manual verification (deferred to controller if servers not running)**

With dev servers running: select Plan Type = **Diagram** → the Sheet Size "Change" dropdown shows **A4 / A3** (defaulting to A4); generate → the diagram downloads at the chosen size with a 35 mm-left / 15 mm-others neat-line border and content inside it. Switch to a General plan → the dropdown returns to Auto/ISO A2/A1/A0 and any stale A4/A3 resets to Auto.

- [ ] **Step 7: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue
git commit -m "feat(diagram): plan-type-aware sheet-size dropdown (A4/A3 for Diagram)"
```

---

## Self-Review

**Spec coverage:**
- Size + margin aware layout with flexing figure, 35/15 margins, A4/A3 dims → Task 1 (`diagramLayout.js`). ✓
- Diagram renderer honors A4/A3, draws neat-line border, returns resolved size → Task 2. ✓
- Route forwards chosen size (A4/A3, default A4) → Task 3. ✓
- Plan-type-aware dropdown (Diagram → A4/A3; others → auto/ISO), `config.sheetSize` widened, stale-size reset on plan-type change → Tasks 4 + 5. ✓
- Diagram-only scope; no `SI727_SHEET_SIZES`/general/DXF/Working changes → Global Constraints; Task 3 only forwards A4/A3 inside the diagram branch. ✓
- Testing: pure helpers unit-tested (Tasks 1, 4), integration `%PDF-` for A4/A3 (Task 2), `.vue` via build + manual (Task 5). ✓

**Placeholder scan:** No TBD/TODO. `.vue` task (5) uses build + manual by design (no DOM test infra), consistent with the repo. The one `grep` step (Task 2 Step 1) is a concrete pre-flight check with a stated expected result.

**Type consistency:** `computeDiagramLayout`/`pageDimsPt`/`marginsPt` (Task 1) are consumed with matching names/shapes in Task 2. The layout object keys (`border, table, sgNoBox, beaconDesc, northArrow, approved, figure, scaleBar, statement, refGrid`) produced in Task 1 are exactly the keys read by the Task 2 draw helpers. `generateDiagramPDF` returns `{ pdfBuffer, scale, sheetSize }` (Task 2), asserted in Task 2 tests and relied on by the route (Task 3). `paperSizeOptionsFor(planType)` → `PaperSizeOption[]` (Task 4) is consumed by the template `v-for` (Task 5). `sheetSize` request field read in Task 3 matches the `config.sheetSize` values produced in Task 5 (`A4`/`A3`).
