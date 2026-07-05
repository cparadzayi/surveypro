import PDFDocument from 'pdfkit'
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
import { buildBeaconDescription } from './diagram/beaconDescription.js'
import { formatSI } from './diagram/numberFormat.js'
import {
  resolveLoSystem, snapScaleBarSegment,
} from '../../../app-shared/block-definitions.js'

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
  // Fixed column x-offsets from R.x. The beacon "Const." names live in the
  // rightmost DIAGRAM S.G. No. column (matches the SG diagram samples), so there
  // is no separate Const. column.
  const cSide = 0, cDir = 76, cLetter = 158, cY = 198, cX = 260
  const cSg = layout.sgNoBox.x + 2 // absolute x of the rightmost (SG No.) column
  const rows = Math.max(coordinateRows.length, sideRows.length)
  // Y / X sub-column widths, used to centre the coordinate figures in their cells.
  const yColW = cX - cY
  const xColW = (layout.sgNoBox.x - 4) - (R.x + cX)
  const ctrY = { width: yColW, align: 'center' }
  const ctrX = { width: xColW, align: 'center' }
  // Whole CO-ORDINATES group width (spans the Y and X sub-columns).
  const coordGroupW = (layout.sgNoBox.x - 4) - (R.x + cY)
  const ctrCoord = { width: coordGroupW, align: 'center' }
  // DIRECTIONS column spans the dividers at R.x+70 .. R.x+150. Each data row shows the
  // side (AB/BC…, centred, no header) at the left, then the direction value right-
  // justified; the "° ' \"" units are right-justified too.
  const cDirX = R.x + 70
  const ctrDir = { width: 80, align: 'center' }
  // A divider (dirSplitX) separates the side labels (left) from the direction values.
  // Units + values are right-justified but padded 3pt off the column's right divider.
  const dirSplitX = cDirX + 24
  const rDir = { width: 77, align: 'right' }       // units header, 3pt clear of the right divider
  const dirSide = { width: 22, align: 'center' }    // side label at the left of DIRECTIONS (no header)
  const dirVal = { width: 50, align: 'right' }      // direction value, right-justified, 3pt clear right
  // Vertex-letter column spans the dividers at R.x+150 .. R.x+193; centre its letters.
  const cLetX = R.x + 150
  const ctrLet = { width: 43, align: 'center' }
  // SIDES side-label sub-column: centre AB/BC/CD/DA in a fixed narrow band (kept
  // independent of cMetres so the divider can sit clear of the "SIDES" label).
  const ctrSide = { width: 30, align: 'center' }
  // METRES (distances) sub-column spans the dividers at R.x+32 .. R.x+70; it is a
  // top-row header (peer of SIDES/DIRECTIONS), centred, with centred values.
  const cMetresX = R.x + 32
  const ctrMetres = { width: 38, align: 'center' }

  doc.save().font('Helvetica-Bold').fontSize(7.5).fillColor('#000')
  doc.text('SIDES', R.x + cSide, R.y, ctrSide)
  doc.text('METRES', cMetresX, R.y, ctrMetres)
  doc.text('DIRECTIONS', cDirX, R.y, ctrDir)
  doc.text('CO-ORDINATES', R.x + cY, R.y, ctrCoord) // centred over Lo NN
  doc.text('DIAGRAM S.G. No.', cSg, R.y)
  doc.font('Helvetica').fontSize(7)
  // 'Lo NN' heads the CO-ORDINATES group, between CO-ORDINATES and the Y/X row.
  doc.text(loLabel, R.x + cY, R.y + 10, ctrCoord)
  // ASCII degree/minute/second marks — the prime (′ U+2032) and double-prime
  // (″ U+2033) glyphs are absent from PDFKit's built-in Helvetica and render as
  // garbage; °, ' and " are all in the font.
  doc.text('°  \'  "', cDirX, R.y + 19, rDir)
  // Coordinate sub-headers: Y  Metres  X.
  doc.text('Y', R.x + cY, R.y + 19, ctrY)
  doc.text('Metres', R.x + cY, R.y + 19, ctrCoord)
  doc.text('X', R.x + cX, R.y + 19, ctrX)

  // Constants row + coordinate/side rows. The "Const." label and beacon names
  // are in the rightmost (SG No.) column.
  let ry = R.y + 30
  doc.text(constRow.y, R.x + cY, ry, ctrY)
  doc.text(constRow.x, R.x + cX, ry, ctrX)
  doc.text('Constants', cSg, ry)
  for (let i = 0; i < rows; i++) {
    ry += 11
    if (sideRows[i]) {
      doc.text(sideRows[i].side, R.x + cSide, ry, ctrSide)
      doc.text(sideRows[i].metres, cMetresX, ry, ctrMetres)
      doc.text(sideRows[i].side, cDirX, ry, dirSide)               // side before the direction (no header)
      doc.text(sideRows[i].direction, dirSplitX + 3, ry, dirVal)
    }
    if (coordinateRows[i]) {
      doc.text(coordinateRows[i].letter, cLetX, ry, ctrLet)
      doc.text(coordinateRows[i].y, R.x + cY, ry, ctrY)
      doc.text(coordinateRows[i].x, R.x + cX, ry, ctrX)
      doc.text(coordinateRows[i].beaconName ?? '', cSg, ry)
    }
  }

  // Grid: no outer box — the column dividers run up to the top neat-line border
  // and the header/data rule spans the full width to the left/right neat-lines.
  const B = layout.border
  const boxB = ry + 9
  const hSep = R.y + 28 // header/data separator (below the three header rows)
  // Group dividers + the side-label|Metres split, full height.
  const verticals = [R.x + 32, R.x + 70, R.x + 150, R.x + 193, layout.sgNoBox.x - 4]
  doc.lineWidth(0.5).strokeColor('#000')
  for (const vx of verticals) doc.moveTo(vx, B.y).lineTo(vx, boxB).stroke()
  // Y|X divider — only through the value rows: the "Metres" coords sub-header
  // spans both Y and X, so the divider must not cross the header.
  doc.moveTo(R.x + cX, hSep).lineTo(R.x + cX, boxB).stroke()
  // Side-label | direction-value divider inside DIRECTIONS — through the data rows only
  // (below hSep) so it does not cut the centred "DIRECTIONS" header.
  doc.moveTo(dirSplitX, hSep).lineTo(dirSplitX, boxB).stroke()
  doc.moveTo(B.x, hSep).lineTo(B.x + B.width, hSep).stroke()
  doc.restore()
}

function drawBeaconDescription(doc, layout, groups) {
  const R = layout.beaconDesc
  doc.save().font('Helvetica-Bold').fontSize(8).text('Description of Beacons', R.x, R.y)
  doc.font('Helvetica').fontSize(8)
  if (groups.length === 0) {
    doc.text('All          :', R.x, R.y + 11)
  } else if (groups.length === 1) {
    // All subject beacons share one description.
    doc.text(`All          : ${groups[0].description}`, R.x, R.y + 11)
  } else {
    let y = R.y + 11
    for (const g of groups) {
      doc.text(`${g.names}  :  ${g.description}`, R.x, y, { width: R.width })
      y += 11
    }
  }
  doc.restore()
}

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
  // Road/servitude names sit beyond the vertex-letter band so they clear the letters
  // (which stay snug to their beacons). ~beaconR + gap + letter height ≈ the band.
  const vertexBandPt = beaconRadiusPt(denom) + 14

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

    // Label the feature. Roads read ALONG the edge (rotated), just outside the strip;
    // servitude/contiguous keep the horizontal outward label (avoiding drawn lines).
    if (ann.label) {
      doc.save().font('Helvetica').fontSize(7).fillColor('#000000')
      const labelText = ann.role === 'road' && ann.widthM > 0
        ? `${ann.label} ${formatSI(ann.widthM, 2)}m`
        : ann.label
      const labelW = doc.widthOfString(labelText)
      if (ann.role === 'road' || ann.role === 'servitude') {
        const ex = p2.px - p1.px, ey = p2.py - p1.py
        const len = Math.hypot(ex, ey) || 1
        let perpX = -ey / len, perpY = ex / len
        // Point the perpendicular OUTWARD (away from the figure centroid).
        if (perpX * (subjCentroid.px - mid.px) + perpY * (subjCentroid.py - mid.py) > 0) { perpX = -perpX; perpY = -perpY }
        let angleDeg = Math.atan2(ey, ex) * 180 / Math.PI
        if (angleDeg > 90 || angleDeg < -90) angleDeg += 180 // keep the text upright
        // Push the name out past the strip AND the vertex-letter band, so it clears
        // the figure vertex labels (which stay close to their beacons).
        const stripPt = ann.role === 'servitude' && ann.widthM > 0 ? ann.widthM * ptPerGroundM : ROAD_STRIP_PT
        const off = stripPt + vertexBandPt
        const lx = mid.px + perpX * off, ly = mid.py + perpY * off
        doc.rotate(angleDeg, { origin: [lx, ly] })
        doc.text(labelText, lx - labelW / 2, ly - 3.5, { lineBreak: false })
      } else {
        const pos = placeVertexLabel(mid, subjCentroid, {
          beaconR: 0, gap: 2, labelW, labelH: 7,
          segments: subjSegs.concat(neighbourSegs, labelObstacles),
        })
        doc.text(labelText, pos.x, pos.y)
        labelObstacles.push(...boxToSegs({ x: pos.x, y: pos.y, w: labelW, h: 7 }))
      }
      doc.restore()
    }
  }
}

function drawNorthArrow(doc, layout) {
  const R = layout.northArrow
  const cx = R.x + R.width / 2
  doc.save().lineWidth(1).strokeColor('#000')
  doc.moveTo(cx, R.y + R.height).lineTo(cx, R.y).stroke()      // shaft
  doc.moveTo(cx - 4, R.y + 8).lineTo(cx, R.y).lineTo(cx + 4, R.y + 8).stroke() // head
  // "T" and "N" flank the shaft near its base, so the vertical line passes between them.
  doc.font('Helvetica').fontSize(7)
  doc.text('T', cx - 9, R.y + R.height - 14)
  doc.text('N', cx + 4, R.y + R.height - 14)
  doc.restore()
}

function drawApprovedBox(doc, layout) {
  const R = layout.approved
  // No box outline; contents centred within the approval region.
  const ctr = { width: R.width, align: 'center' }
  doc.save().font('Helvetica').fontSize(7).fillColor('#000')
  // Wider gaps leave room to sign above "for Surveyor-General" and to enter the date.
  doc.text('Approved', R.x, R.y + 5, ctr)
  doc.text('for Surveyor-General', R.x, R.y + 31, ctr)
  doc.text('Date ....................', R.x, R.y + 55, ctr)
  doc.restore()
}

function drawScaleBar(doc, layout, denom) {
  const R = layout.scaleBar
  const ptPerM = (72 / 25.4) * 1000 / denom
  const barGroundM = (R.width / (72 / 25.4)) * denom / 1000
  // Bar = 1 subdivided segment LEFT of 0 + 2 equal segments RIGHT of 0 (SG style).
  const seg = snapScaleBarSegment(barGroundM / 3)
  const w = seg * ptPerM
  const barY = R.y + 10
  const x0 = R.x + w // ground zero, after the left (subdivided) segment
  doc.save().lineWidth(1).strokeColor('#000').font('Helvetica').fontSize(6.5)
  // Left segment subdivided into 5 alternating ticks (a fine ruler left of 0).
  const subN = 5
  const subW = w / subN
  for (let i = 0; i < subN; i++) {
    const sx = R.x + i * subW
    if (i % 2 === 0) doc.rect(sx, barY, subW, 4).fillAndStroke('#000', '#000')
    else doc.rect(sx, barY, subW, 4).stroke()
  }
  // Two equal segments right of 0, alternating fill (first empty to alternate).
  for (let i = 0; i < 2; i++) {
    const sx = x0 + i * w
    if (i % 2 === 0) doc.rect(sx, barY, w, 4).stroke()
    else doc.rect(sx, barY, w, 4).fillAndStroke('#000', '#000')
  }
  // Tick labels: seg | 0 | seg | 2*seg, centred under each tick.
  const lbl = (val, cx) => doc.fillColor('#000').text(String(Math.round(val)), cx - 8, R.y, { width: 16, align: 'center' })
  lbl(seg, R.x)
  lbl(0, x0)
  lbl(seg, x0 + w)
  lbl(2 * seg, x0 + 2 * w)
  doc.text('metres', x0 + 2 * w + 6, barY)
  doc.text(`Scale 1 : ${denom}`, R.x + R.width / 2 - 30, R.y + 20)
  doc.restore()
}

function drawStatement(doc, layout, geometry, metadata) {
  const R = layout.statement
  const seq = buildFigureRepresents(geometry)
  const area = formatDiagramArea(geometry.area)
  // Name the SELECTED parcel (subject). A bare stand number is expanded to
  // "STAND <n> <locality>" using the project designation's locality suffix.
  const designation = resolveStatementDesignation(geometry.designation, geometry.stand, metadata.designation)
  const parent = metadata.parentProperty ? ` OF ${metadata.parentProperty}` : ''
  // Survey date arrives as metadata.date from the frontend; accept either key.
  const surveyDate = metadata.surveyDate ?? metadata.date
  doc.save().font('Helvetica').fontSize(9).fillColor('#000')
  doc.text('The figure', R.x, R.y)
  doc.text('represents', R.x, R.y + 11)
  // Sequence and area figure are centred over the full statement width, which shares
  // the content axis with the scale bar above — so both sit directly under it (area
  // under "A.B.C…A"); "of land called" is right-aligned on the area line.
  doc.text(`${seq}`, R.x, R.y, { width: R.width, align: 'center' })
  doc.text(area, R.x, R.y + 12, { width: R.width, align: 'center' })
  doc.text('of land called', R.x, R.y + 12, { width: R.width, align: 'right' })
  // Designation dominates at 11pt, but must stay on ONE row: shrink to fit R.width
  // (down to a 7.5pt floor) so a long name never wraps into the "situate" line below.
  const desigText = `${designation}${parent}`
  doc.font('Helvetica-Bold')
  let desigSize = 11
  doc.fontSize(desigSize)
  while (desigSize > 7.5 && doc.widthOfString(desigText) > R.width) {
    desigSize -= 0.5
    doc.fontSize(desigSize)
  }
  doc.text(desigText, R.x, R.y + 30, { width: R.width, lineBreak: false })
  doc.font('Helvetica').fontSize(8).text(
    `situate in the district of ${metadata.district ?? ''}.`, R.x, R.y + 44)
  // Extra row above "Surveyed … by me" (below "situate in the district of …") for
  // visual separation.
  doc.text(`Surveyed in ${surveyDate ? new Date(surveyDate).toLocaleString('en', { month: 'long', year: 'numeric' }) : ''} by me`, R.x, R.y + 61)
  // "Land Surveyor" drops to its own line (right-aligned as before), leaving the
  // row between it and "Surveyed … by me" for the surveyor's signature.
  doc.text('Land Surveyor', R.x, R.y + 81, { width: R.width, align: 'right' })
  doc.restore()
}

function drawReferenceGrid(doc, layout, grid) {
  const R = layout.refGrid
  const W = R.width, H = R.height
  const B = layout.border
  const bottom = B.y + B.height
  // Left column takes ~33%; the remaining ~67% runs to the right neat-line (xR) and
  // holds a parent | original-title band on top, then the full-width File|G.P.|S.R.
  // and Compilation rows.
  const x0 = R.x, x1 = R.x + W / 3, xR = B.x + B.width
  const x2 = x1 + (xR - x1) / 2                              // parent | original-title (top band)
  const t1 = x1 + (xR - x1) / 3, t2 = x1 + 2 * (xR - x1) / 3 // File | G.P. | S.R. thirds
  const r1 = R.y + H * 0.25, r2 = R.y + H * 0.50, r3 = R.y + H * 0.75

  doc.save().lineWidth(0.5).strokeColor('#000')
  // Top border (full width) + the left-column divider (full height).
  doc.moveTo(B.x, R.y).lineTo(B.x + B.width, R.y).stroke()
  doc.moveTo(x1, R.y).lineTo(x1, bottom).stroke()
  // Parent | original-title split — top band only (down to r2).
  doc.moveTo(x2, R.y).lineTo(x2, r2).stroke()
  // Full-width rules above File|G.P.|S.R. (r2) and above Compilation (r3), and the
  // two dividers splitting the File|G.P.|S.R. row into three equal cells.
  doc.moveTo(x1, r2).lineTo(xR, r2).stroke()
  doc.moveTo(x1, r3).lineTo(xR, r3).stroke()
  doc.moveTo(t1, r2).lineTo(t1, r3).stroke()
  doc.moveTo(t2, r2).lineTo(t2, r3).stroke()

  doc.font('Helvetica').fontSize(7).fillColor('#000')
  const pad = 3
  const wL = (x1 - x0) - 2 * pad
  // Left column. The annexation reference (Deed of Transfer, Certificate of
  // Registered Title, etc.) is filled by the SG office after submission — we print
  // only the lead-in and the "No." / "dated" labels (blank entries, no dots). No
  // deed type is pre-printed, as the target instrument varies.
  doc.text('This diagram is annexed to', x0 + pad, R.y + 6, { width: wL })
  const colMid = x0 + (x1 - x0) / 2
  doc.text('No.', x0 + pad, R.y + 26)
  doc.text('dated', colMid, R.y + 26)
  // Right-aligned within the left column, level with "Compilation" on the bottom row.
  doc.text('Surveyor-General', x0 + pad, r3 + 5, { width: wL, align: 'right' })
  // Top band: parent (+ Deed of Transfer) on the left, original title on the right.
  doc.text(`The immediate parent diagram is No. ${grid.parentDiagramNo}  annexed to ${grid.parentDiagramAnnexedTo}`, x1 + pad, R.y + 6, { width: (x2 - x1) - 2 * pad })
  doc.text(`Deed of Transfer No. ${grid.deedOfTransferNo}`, x1 + pad, r1 + 4, { width: (x2 - x1) - 2 * pad })
  doc.text(`The original title diagram is No. ${grid.originalTitleDiagramNo}`, x2 + pad, R.y + 6, { width: (xR - x2) - 2 * pad })
  // Full-width File | G.P. | S.R. row, then Compilation — both run to the right neat-line.
  doc.text(`File : ${grid.fileNo}`, x1 + pad, r2 + 4, { width: (t1 - x1) - 2 * pad })
  doc.text(`G.P. : ${grid.registrationGp}`, t1 + pad, r2 + 4, { width: (t2 - t1) - 2 * pad })
  doc.text(`S.R. : ${grid.srNo}`, t2 + pad, r2 + 4, { width: (xR - t2) - 2 * pad })
  doc.text(`Compilation : ${grid.compilation}`, x1 + pad, r3 + 4, { width: (xR - x1) - 2 * pad })
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

  const doc = new PDFDocument({ size: [dims.width, dims.height], margin: 0 })
  const bufferPromise = docToBuffer(doc)

  // Neat-line border (35mm left, 15mm other margins); content sits inside it.
  doc.save().lineWidth(1).strokeColor('#000')
  doc.rect(layout.border.x, layout.border.y, layout.border.width, layout.border.height).stroke()
  doc.restore()

  // Abutting neighbours: clip to the 10 m buffer, faint outline + label at the
  // clipped strip. The whole-site OUTSIDE FIGURE parcel is excluded; parcels that
  // don't reach the buffer clip to nothing and are omitted.
  doc.font('Helvetica').fontSize(7).fillColor('#555555')
  const neighbourSegs = [] // drawn neighbour line segments (pt) — labels avoid these
  const neighbourLabels = [] // { anchor, text } drawn after the subject, placed outward
  if (buffer.length) {
    for (const nb of neighbours) {
      if (isOutsideFigureFeature(nb)) continue
      const nbRing = nb?.geometry?.coordinates?.[0] ?? []
      const strips = clipRingToPolygon(nbRing, buffer)
      if (!strips.length) continue
      // Draw only the real neighbour boundary edges within the buffer — not the
      // artificial clip line along the buffer boundary.
      doc.save().dash(4, { space: 2.5 }).lineWidth(1).strokeColor('#000000')
      for (const strip of strips) {
        for (const [a, b] of neighbourBoundaryEdges(strip, nbRing)) {
          const pa = tf(a), pb = tf(b)
          doc.moveTo(pa.px, pa.py).lineTo(pb.px, pb.py)
          neighbourSegs.push([pa, pb])
        }
      }
      doc.stroke().undash().restore()
      const stand = nb.properties?.stand ?? nb.properties?.designation ?? ''
      if (stand) {
        // Defer drawing: placed outward, line-avoiding, once all segments are known.
        neighbourLabels.push({ anchor: centroidPt(strips[0].map((p) => tf(p))), text: String(stand) })
      }
    }
  }

  // Subject: bold outline, beacon circles at each vertex, lettered vertices.
  const subjPt = geometry.vertices.map((v) => tf([v.y, v.x]))
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
  // Vertex letters placed OUTSIDE the figure, clear of the beacon circle, and not
  // overriding the subject or adjoining-property lines. (No edge-distance labels.)
  doc.fillColor('#000000').fontSize(8)
  const subjCentroid = centroidPt(subjPt)
  const subjSegs = subjPt.map((p, i) => [p, subjPt[(i + 1) % subjPt.length]])
  // Already-placed label boxes become obstacles too, so labels don't collide with
  // each other. A box is represented by its 4 edges + 2 diagonals (the diagonals
  // catch a smaller candidate that would sit fully inside a larger placed box).
  const labelObstacles = []
  const boxToSegs = (b) => {
    const c1 = { px: b.x, py: b.y }, c2 = { px: b.x + b.w, py: b.y }
    const c3 = { px: b.x + b.w, py: b.y + b.h }, c4 = { px: b.x, py: b.y + b.h }
    return [[c1, c2], [c2, c3], [c3, c4], [c4, c1], [c1, c3], [c2, c4]]
  }

  // Adjoining features (roads/servitudes/contiguous) from metadata.sideAnnotations —
  // drawn outside the figure, before labels so their designations become obstacles.
  drawAdjoiningFeatures(doc, {
    annotations: metadata.sideAnnotations,
    geometry, subjPt, subjCentroid, subjSegs, neighbourSegs, denom, labelObstacles, boxToSegs,
  }, logger)

  // Beacon circles drawn ON TOP of the boundary AND the adjoining features: the white
  // fill knocks out the lines inside, so edges (incl. road/servitude strips) appear
  // clipped at the circle edge (the developed-plan technique). Page-relative → visible.
  const beaconR = beaconRadiusPt(denom)
  for (const p of subjPt) {
    doc.save()
      .circle(p.px, p.py, beaconR)
      .lineWidth(0.8)
      .fillColor('#FFFFFF')
      .strokeColor('#000000')
      .fillAndStroke()
    doc.restore()
  }

  geometry.vertices.forEach((v, i) => {
    const p = subjPt[i]
    const labelW = doc.widthOfString(v.letter)
    const pos = placeVertexLabel(p, subjCentroid, {
      beaconR, labelW, labelH: 8, gap: 2, segments: subjSegs.concat(neighbourSegs, labelObstacles),
    })
    doc.text(v.letter, pos.x, pos.y)
    labelObstacles.push(...boxToSegs({ x: pos.x, y: pos.y, w: labelW, h: 8 }))
  })

  // Neighbour stand labels: same outward (away from the subject centroid),
  // line-avoiding placement, clear of the drawn lines AND the vertex labels.
  doc.font('Helvetica').fontSize(7).fillColor('#555555')
  for (const nl of neighbourLabels) {
    const labelW = doc.widthOfString(nl.text)
    const pos = placeVertexLabel(nl.anchor, subjCentroid, {
      beaconR: 0, gap: 1, labelW, labelH: 7, segments: subjSegs.concat(neighbourSegs, labelObstacles),
    })
    doc.text(nl.text, pos.x, pos.y)
    labelObstacles.push(...boxToSegs({ x: pos.x, y: pos.y, w: labelW, h: 7 }))
  }

  // resolveLoSystem already returns the full "Lo NN" label.
  const loLabel = resolveLoSystem(null, metadata, options.projection)
  drawTable(doc, layout, buildSidesTable(geometry, options.beacons), loLabel)
  drawBeaconDescription(doc, layout, buildBeaconDescription(geometry, options.beacons))
  drawNorthArrow(doc, layout)
  drawApprovedBox(doc, layout)
  drawScaleBar(doc, layout, denom)
  drawStatement(doc, layout, geometry, metadata)
  drawReferenceGrid(doc, layout, buildReferenceGrid(metadata))

  doc.end()
  const pdfBuffer = await bufferPromise
  return { pdfBuffer, scale: label, sheetSize }
}
