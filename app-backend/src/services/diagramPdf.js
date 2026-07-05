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
import { buildBeaconDescription } from './diagram/beaconDescription.js'
import {
  resolveLoSystem, snapScaleBarSegment,
} from '../../../app-shared/block-definitions.js'

// SI 727 figure styling.
const FIGURE_GREEN = '#2f9e4f'                 // uniform green inner-border tint (from the sample)
const INNER_BAND_PT = 1.3 * (72 / 25.4)        // ≈ 3.69 pt (~1.3 mm), page-relative band width

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
  const cSide = 0, cMetres = 28, cDir = 76, cLetter = 158, cY = 198, cX = 260
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
  // DIRECTIONS column spans the dividers at R.x+70 .. R.x+150; centre its contents.
  const cDirX = R.x + 70
  const ctrDir = { width: 80, align: 'center' }
  // Vertex-letter column spans the dividers at R.x+150 .. R.x+193; centre its letters.
  const cLetX = R.x + 150
  const ctrLet = { width: 43, align: 'center' }
  // SIDES side-label sub-column spans [cSide .. cMetres]; centre AB/BC/CD/DA.
  const ctrSide = { width: cMetres, align: 'center' }

  doc.save().font('Helvetica-Bold').fontSize(7).fillColor('#000')
  doc.text('SIDES', R.x + cSide, R.y, ctrSide)
  doc.text('DIRECTIONS', cDirX, R.y, ctrDir)
  doc.text('CO-ORDINATES', R.x + cY, R.y, ctrCoord) // centred over Lo NN
  doc.text('DIAGRAM S.G. No.', cSg, R.y)
  doc.font('Helvetica').fontSize(6.5)
  // 'Lo NN' heads the CO-ORDINATES group, between CO-ORDINATES and the Y/X row.
  doc.text(loLabel, R.x + cY, R.y + 10, ctrCoord)
  doc.text('Metres', R.x + cMetres, R.y + 19) // sides: over the distances
  // ASCII degree/minute/second marks — the prime (′ U+2032) and double-prime
  // (″ U+2033) glyphs are absent from PDFKit's built-in Helvetica and render as
  // garbage; °, ' and " are all in the font.
  doc.text('°  \'  "', cDirX, R.y + 19, ctrDir)
  // Coordinate sub-headers: Y  Metres  X.
  doc.text('Y', R.x + cY, R.y + 19, ctrY)
  doc.text('Metres', R.x + cY, R.y + 19, ctrCoord)
  doc.text('X', R.x + cX, R.y + 19, ctrX)

  // Constants row + coordinate/side rows. The "Const." label and beacon names
  // are in the rightmost (SG No.) column.
  let ry = R.y + 30
  doc.text(constRow.y, R.x + cY, ry, ctrY)
  doc.text(constRow.x, R.x + cX, ry, ctrX)
  doc.text('Const.', cSg, ry)
  for (let i = 0; i < rows; i++) {
    ry += 11
    if (sideRows[i]) {
      doc.text(sideRows[i].side, R.x + cSide, ry, ctrSide)
      doc.text(sideRows[i].metres, R.x + cMetres, ry)
      doc.text(sideRows[i].direction, cDirX, ry, ctrDir)
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
  const verticals = [R.x + 70, R.x + 150, R.x + 193, layout.sgNoBox.x - 4]
  doc.lineWidth(0.5).strokeColor('#000')
  for (const vx of verticals) doc.moveTo(vx, B.y).lineTo(vx, boxB).stroke()
  doc.moveTo(B.x, hSep).lineTo(B.x + B.width, hSep).stroke()
  doc.restore()
}

function drawBeaconDescription(doc, layout, groups) {
  const R = layout.beaconDesc
  doc.save().font('Helvetica-Bold').fontSize(7).text('Beacon description', R.x, R.y)
  doc.font('Helvetica').fontSize(7)
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
  // Ground metres represented by the bar's width:
  const barGroundM = (R.width / (72 / 25.4)) * denom / 1000
  const seg = snapScaleBarSegment(barGroundM / 4) // ~4 segments
  const ptPerM = (72 / 25.4) * 1000 / denom
  doc.save().lineWidth(1).strokeColor('#000').font('Helvetica').fontSize(6.5)
  let x = R.x, ground = 0
  doc.moveTo(R.x, R.y + 10).lineTo(R.x, R.y + 16).stroke()
  doc.fillColor('#000').text('0', R.x - 6, R.y, { width: 12, align: 'center' }) // bar origin
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
  const area = formatDiagramArea(geometry.area)
  // Name the SELECTED parcel (subject). A bare stand number is expanded to
  // "STAND <n> <locality>" using the project designation's locality suffix.
  const designation = resolveStatementDesignation(geometry.designation, geometry.stand, metadata.designation)
  const parent = metadata.parentProperty ? ` OF ${metadata.parentProperty}` : ''
  // Survey date arrives as metadata.date from the frontend; accept either key.
  const surveyDate = metadata.surveyDate ?? metadata.date
  doc.save().font('Helvetica').fontSize(8).fillColor('#000')
  doc.text('The figure', R.x, R.y)
  doc.text('represents', R.x, R.y + 11)
  doc.text(`${seq}`, R.x + 120, R.y, { width: 260, align: 'center' })
  doc.text(`${area} of land called`, R.x + 120, R.y + 12, { width: 300 })
  doc.font('Helvetica-Bold').text(`${designation}${parent}`, R.x, R.y + 30, { width: R.width })
  doc.font('Helvetica').fontSize(7).text(
    `situate in the district of ${metadata.district ?? ''}.`, R.x, R.y + 44)
  doc.text(`Surveyed in ${surveyDate ? new Date(surveyDate).toLocaleString('en', { month: 'long', year: 'numeric' }) : ''} by me`, R.x, R.y + 53)
  // "Land Surveyor" drops to its own line (right-aligned as before), leaving the
  // row between it and "Surveyed … by me" for the surveyor's signature.
  doc.text('Land Surveyor', R.x, R.y + 73, { width: R.width, align: 'right' })
  doc.restore()
}

function drawReferenceGrid(doc, layout, grid) {
  const R = layout.refGrid
  const W = R.width, H = R.height
  // Three columns: left 30% / middle 40% / right 30%.
  const x0 = R.x, x1 = R.x + W * 0.30, x2 = R.x + W * 0.70, x3 = R.x + W
  const midHalf = x1 + (x2 - x1) / 2      // File | G.P. split in the middle column
  const r1 = R.y + H * 0.25, r2 = R.y + H * 0.50, r3 = R.y + H * 0.75

  const B = layout.border
  const bottom = B.y + B.height
  doc.save().lineWidth(0.5).strokeColor('#000')
  // Top border of the block (full width) + the two column dividers running down to
  // the bottom neat-line border (no bottom line of its own).
  doc.moveTo(B.x, R.y).lineTo(B.x + B.width, R.y).stroke()
  doc.moveTo(x1, R.y).lineTo(x1, bottom).stroke()
  doc.moveTo(x2, R.y).lineTo(x2, bottom).stroke()
  // Left column: single cell (no internal divider).
  // Middle column: rule above File|G.P. and above Compilation + the File|G.P. split.
  doc.moveTo(x1, r2).lineTo(x2, r2).stroke()
  doc.moveTo(x1, r3).lineTo(x2, r3).stroke()
  doc.moveTo(midHalf, r2).lineTo(midHalf, r3).stroke()
  // Right column divider aligned with the line above Compilation (r3), extended to
  // the right neat-line margin.
  doc.moveTo(x2, r3).lineTo(B.x + B.width, r3).stroke()

  doc.font('Helvetica').fontSize(6.5).fillColor('#000')
  const pad = 3
  const wL = (x1 - x0) - 2 * pad
  const wM = (x2 - x1) - 2 * pad
  const wR = (x3 - x2) - 2 * pad
  // Left column. The annexation reference (Deed of Transfer, Certificate of
  // Registered Title, etc.) is filled by the SG office after submission — we print
  // only the lead-in and the "No." / "dated" labels (blank entries, no dots). No
  // deed type is pre-printed, as the target instrument varies.
  doc.text('This diagram is annexed to', x0 + pad, R.y + 6, { width: wL })
  const colMid = x0 + (x1 - x0) / 2
  doc.text('No.', x0 + pad, R.y + 26)
  doc.text('dated', colMid, R.y + 26)
  // Aligned with "Compilation" (middle) and "S.R." (right) on the bottom row.
  doc.text('Surveyor-General', x0 + pad, r3 + 5, { width: wL })
  // Middle column.
  doc.text(`The immediate parent diagram is No. ${grid.parentDiagramNo}  annexed to ${grid.parentDiagramAnnexedTo}`, x1 + pad, R.y + 6, { width: wM })
  doc.text(`Deed of Transfer No. ${grid.deedOfTransferNo}`, x1 + pad, r1 + 4, { width: wM })
  doc.text(`File : ${grid.fileNo}`, x1 + pad, r2 + 4, { width: (midHalf - x1) - 2 * pad })
  doc.text(`G.P. : ${grid.registrationGp}`, midHalf + pad, r2 + 4, { width: (x2 - midHalf) - 2 * pad })
  doc.text(`Compilation : ${grid.compilation}`, x1 + pad, r3 + 4, { width: wM })
  // Right column.
  doc.text(`The original title diagram is No. ${grid.originalTitleDiagramNo}`, x2 + pad, R.y + 6, { width: wR })
  doc.text(`S.R. : ${grid.srNo}`, x2 + pad, r3 + 5, { width: wR })
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
  // Beacon circles drawn ON TOP of the boundary: the white fill knocks out the
  // boundary line inside, so edges appear clipped at the circle edge (the
  // developed-plan technique). Radius is page-relative → visible at print scale.
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
