# Diagram Table Grid Lines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rule the diagram's coordinate table and reg-53 endorsement block with grid lines, move the "Metres" sub-header over the distance figures, and merge the beacon "Const." column into the DIAGRAM S.G. No. column to match the SG diagram samples.

**Architecture:** Two drawing-only edits in `app-backend/src/services/diagramPdf.js` — rewrite `drawTable` and `drawReferenceGrid`. Grid lines are stroked with `doc.rect` / `doc.moveTo().lineTo().stroke()` at 0.5 pt. No layout-module, model, or field changes.

**Tech Stack:** Node ESM, PDFKit (built-in Helvetica), Jest.

## Global Constraints

- Diagram plan type only — do not touch General/Working plan or DXF code.
- **Fixed column x-offsets** (no width-relative dynamic offsets) — the beacon/SG
  column anchors on the existing `layout.sgNoBox.x`.
- Grid lines: black, `lineWidth(0.5)`, wrapped in `doc.save()/doc.restore()`.
- Degree/minute/second header stays ASCII `°  '  "` (PDFKit Helvetica lacks the
  prime glyphs U+2032/U+2033).
- Field values, coordinates, and area are unchanged. `coordinateRows[i].beaconName`
  already carries the beacon name — reuse it, do not recompute.
- Verification is the existing `diagramPdf.test.js` suite (valid `%PDF-`, buffer
  > 2000 bytes) plus a manual visual check by the controller — grid line positions
  and colours are not assertable from the PDF binary.

---

### Task 1: `drawTable` — merge Const. column, move "Metres", add grid lines

**Files:**
- Modify: `app-backend/src/services/diagramPdf.js` (function `drawTable`, ~lines 46-92)
- Test: `app-backend/src/services/__tests__/diagramPdf.test.js` (existing, unchanged)

**Interfaces:**
- Consumes: `layout.table` `{x,y,width,height}`, `layout.sgNoBox` `{x,y,width,height}`,
  `table.constRow` `{y,x}`, `table.coordinateRows[]` `{letter,y,x,beaconName}`,
  `table.sideRows[]` `{side,metres,direction}`, `loLabel` string.
- Produces: no new exports — same `drawTable(doc, layout, table, loLabel)` signature.

- [ ] **Step 1: Replace the whole `drawTable` function body**

Replace the entire existing `drawTable` function (from `function drawTable(` through
its closing `}` before `function drawBeaconDescription`) with:

```js
function drawTable(doc, layout, table, loLabel) {
  const { constRow, coordinateRows, sideRows } = table
  const R = layout.table
  // Fixed column x-offsets from R.x. The beacon "Const." names live in the
  // rightmost DIAGRAM S.G. No. column (matches the SG diagram samples), so there
  // is no separate Const. column.
  const cSide = 0, cMetres = 28, cDir = 76, cLetter = 158, cY = 198, cX = 260
  const cSg = layout.sgNoBox.x + 2 // absolute x of the rightmost (SG No.) column
  const rows = Math.max(coordinateRows.length, sideRows.length)

  doc.save().font('Helvetica-Bold').fontSize(7).fillColor('#000')
  doc.text('SIDES', R.x + cSide, R.y)
  doc.text('DIRECTIONS', R.x + cDir, R.y)
  doc.text(loLabel, R.x + cLetter, R.y)
  doc.text('CO-ORDINATES', R.x + cY, R.y)
  doc.text('DIAGRAM S.G. No.', cSg, R.y)
  doc.font('Helvetica').fontSize(6.5)
  doc.text('Metres', R.x + cMetres, R.y + 10) // over the distances, not the sides
  // ASCII degree/minute/second marks — the prime (′ U+2032) and double-prime
  // (″ U+2033) glyphs are absent from PDFKit's built-in Helvetica and render as
  // garbage; °, ' and " are all in the font.
  doc.text('°  \'  "', R.x + cDir, R.y + 10)
  doc.text('Y', R.x + cY, R.y + 10)
  doc.text('X', R.x + cX, R.y + 10)

  // Constants row + coordinate/side rows. The "Const." label and beacon names
  // are in the rightmost (SG No.) column.
  let ry = R.y + 22
  doc.text(constRow.y, R.x + cY, ry)
  doc.text(constRow.x, R.x + cX, ry)
  doc.text('Const.', cSg, ry)
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
      doc.text(coordinateRows[i].beaconName ?? '', cSg, ry)
    }
  }

  // Grid: outer box + column dividers + one header/data rule (no per-row lines).
  const boxL = R.x - 3
  const boxR = R.x + R.width + 3
  const boxT = R.y - 3
  const boxB = ry + 9
  const hSep = R.y + 20 // header/data separator (below the two header sub-rows)
  const verticals = [R.x + 70, R.x + 150, R.x + 193, layout.sgNoBox.x - 4]
  doc.lineWidth(0.5).strokeColor('#000')
  doc.rect(boxL, boxT, boxR - boxL, boxB - boxT).stroke()
  for (const vx of verticals) doc.moveTo(vx, boxT).lineTo(vx, boxB).stroke()
  doc.moveTo(boxL, hSep).lineTo(boxR, hSep).stroke()
  doc.restore()
}
```

- [ ] **Step 2: Run the diagram PDF tests to verify they pass**

Run: `cd app-backend && npx jest --testPathPattern=diagramPdf`
Expected: PASS — all `generateDiagramPDF` tests green (valid `%PDF-`, buffers
> 2000 bytes). The grid drawing must not throw.

- [ ] **Step 3: Commit**

```bash
git add app-backend/src/services/diagramPdf.js
git commit -m "feat(diagram): rule coordinate table, move Metres over distances, merge Const. into SG-No. column"
```

---

### Task 2: `drawReferenceGrid` — 3-column ruled endorsement grid

**Files:**
- Modify: `app-backend/src/services/diagramPdf.js` (function `drawReferenceGrid`, ~lines 171-185)
- Test: `app-backend/src/services/__tests__/diagramPdf.test.js` (existing, unchanged)

**Interfaces:**
- Consumes: `layout.refGrid` `{x,y,width,height}`; `grid` fields `annexedToNo`,
  `annexedToDate`, `parentDiagramNo`, `parentDiagramAnnexedTo`, `deedOfTransferNo`,
  `fileNo`, `registrationGp`, `compilation`, `originalTitleDiagramNo`, `srNo`.
- Produces: no new exports — same `drawReferenceGrid(doc, layout, grid)` signature.

- [ ] **Step 1: Replace the whole `drawReferenceGrid` function body**

Replace the entire existing `drawReferenceGrid` function with:

```js
function drawReferenceGrid(doc, layout, grid) {
  const R = layout.refGrid
  const W = R.width, H = R.height
  // Three columns: left 30% / middle 40% / right 30%.
  const x0 = R.x, x1 = R.x + W * 0.30, x2 = R.x + W * 0.70, x3 = R.x + W
  const midHalf = x1 + (x2 - x1) / 2      // File | G.P. split in the middle column
  const r1 = R.y + H * 0.25, r2 = R.y + H * 0.50, r3 = R.y + H * 0.75

  doc.save().lineWidth(0.5).strokeColor('#000')
  // Outer box + the two column dividers.
  doc.rect(x0, R.y, W, H).stroke()
  doc.moveTo(x1, R.y).lineTo(x1, R.y + H).stroke()
  doc.moveTo(x2, R.y).lineTo(x2, R.y + H).stroke()
  // Left column: one rule at mid height.
  doc.moveTo(x0, r2).lineTo(x1, r2).stroke()
  // Middle column: three rules + the File|G.P. vertical split.
  doc.moveTo(x1, r1).lineTo(x2, r1).stroke()
  doc.moveTo(x1, r2).lineTo(x2, r2).stroke()
  doc.moveTo(x1, r3).lineTo(x2, r3).stroke()
  doc.moveTo(midHalf, r2).lineTo(midHalf, r3).stroke()
  // Right column: one rule at mid height.
  doc.moveTo(x2, r2).lineTo(x3, r2).stroke()

  doc.font('Helvetica').fontSize(6.5).fillColor('#000')
  const pad = 3
  const wL = (x1 - x0) - 2 * pad
  const wM = (x2 - x1) - 2 * pad
  const wR = (x3 - x2) - 2 * pad
  // Left column.
  doc.text(`This diagram is annexed to No. ${grid.annexedToNo}  dated ${grid.annexedToDate}`, x0 + pad, R.y + 5, { width: wL })
  doc.text('Surveyor-General', x0 + pad, r2 + 5, { width: wL })
  // Middle column.
  doc.text(`The immediate parent diagram is No. ${grid.parentDiagramNo}  annexed to ${grid.parentDiagramAnnexedTo}`, x1 + pad, R.y + 4, { width: wM })
  doc.text(`Deed of Transfer No. ${grid.deedOfTransferNo}`, x1 + pad, r1 + 4, { width: wM })
  doc.text(`File : ${grid.fileNo}`, x1 + pad, r2 + 4, { width: (midHalf - x1) - 2 * pad })
  doc.text(`G.P. : ${grid.registrationGp}`, midHalf + pad, r2 + 4, { width: (x2 - midHalf) - 2 * pad })
  doc.text(`Compilation : ${grid.compilation}`, x1 + pad, r3 + 4, { width: wM })
  // Right column.
  doc.text(`The original title diagram is No. ${grid.originalTitleDiagramNo}`, x2 + pad, R.y + 5, { width: wR })
  doc.text(`S.R. : ${grid.srNo}`, x2 + pad, r2 + 5, { width: wR })
  doc.restore()
}
```

- [ ] **Step 2: Run the diagram PDF tests to verify they pass**

Run: `cd app-backend && npx jest --testPathPattern=diagramPdf`
Expected: PASS — all `generateDiagramPDF` tests green; the reg-53 grid draws
without throwing.

- [ ] **Step 3: Commit**

```bash
git add app-backend/src/services/diagramPdf.js
git commit -m "feat(diagram): rule the reg-53 endorsement block into the samples' 3-column grid"
```

---

## Self-Review

**Spec coverage:**
- Spec §1 "Metres over distances" → Task 1 Step 1 (`Metres` at `R.x + cMetres`). ✔
- Spec §2 "table grid + column merge" → Task 1 Step 1 (merged SG column, box +
  4 verticals + header rule). ✔
- Spec §3 "reg-53 3-column grid" → Task 2 Step 1. ✔

**Placeholder scan:** No TBD/TODO; every code step contains full function bodies. ✔

**Type consistency:** `drawTable(doc, layout, table, loLabel)` and
`drawReferenceGrid(doc, layout, grid)` signatures unchanged; field names
(`beaconName`, `constRow.y/x`, `registrationGp`, `annexedToNo`…) match the
consuming code and `referenceGrid.js`. `sgNoBox` is read, not written. ✔

**Visual acceptance (controller, after both tasks):** regenerate a diagram PDF and
confirm — "Metres" sits over the distances; the coordinate table has an outer box,
column dividers, and a header rule; beacon names sit under "DIAGRAM S.G. No." with a
"Const." label; the reg-53 block is a 3-column ruled grid; nothing crosses the
neat-line border.
