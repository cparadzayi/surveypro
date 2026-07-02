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
