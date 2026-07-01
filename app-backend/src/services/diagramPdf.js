import PDFDocument from 'pdfkit'
import { deriveSubjectGeometry } from './diagram/subjectGeometry.js'
import { parcelExtent, pickDiagramScale, makeTransform } from './diagram/diagramScale.js'
import { buildSidesTable } from './diagram/sidesTable.js'
import { resolveLoSystem, classifyBeaconGroups } from '../../../app-shared/block-definitions.js'

// A4 portrait, points.
const A4 = [595.28, 841.89]
// Page regions (pt). Tasks 7–8 add table/reference regions above/below.
export const REGIONS = {
  figure: { x: 40, y: 250, width: 515, height: 360 },
  table: { x: 40, y: 40, width: 515, height: 150 },
  sgNoBox: { x: 455, y: 40, width: 100, height: 40 },
  beaconDesc: { x: 40, y: 195, width: 250, height: 40 },
  approved: { x: 380, y: 195, width: 175, height: 45 },
  northArrow: { x: 300, y: 195, width: 40, height: 50 },
}

function docToBuffer(doc) {
  const chunks = []
  doc.on('data', (c) => chunks.push(c))
  doc.end()
  return new Promise((resolve, reject) => {
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

function drawTable(doc, table, loLabel) {
  const { constRow, coordinateRows, sideRows } = table
  const R = REGIONS.table
  doc.save().font('Helvetica-Bold').fontSize(7).fillColor('#000')
  doc.text('SIDES', R.x, R.y)
  doc.text('DIRECTIONS', R.x + 90, R.y)
  doc.text(loLabel, R.x + 190, R.y)
  doc.text('CO-ORDINATES', R.x + 245, R.y)
  doc.text('DIAGRAM S.G. No.', REGIONS.sgNoBox.x, R.y)
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
  doc.rect(REGIONS.sgNoBox.x, REGIONS.sgNoBox.y + 10, REGIONS.sgNoBox.width, REGIONS.sgNoBox.height).stroke()
  doc.restore()
}

function drawBeaconDescription(doc, beacons) {
  const R = REGIONS.beaconDesc
  const groups = classifyBeaconGroups(beacons ?? { features: [] })
  doc.save().font('Helvetica-Bold').fontSize(7).text('Beacon description', R.x, R.y)
  doc.font('Helvetica').fontSize(7)
  const line = groups && groups.length
    ? `All          : ${groups[0].description ?? ''}`
    : 'All          :'
  doc.text(line, R.x, R.y + 11)
  doc.restore()
}

function drawNorthArrow(doc) {
  const R = REGIONS.northArrow
  const cx = R.x + R.width / 2
  doc.save().lineWidth(1).strokeColor('#000')
  doc.moveTo(cx, R.y + R.height).lineTo(cx, R.y).stroke()      // shaft
  doc.moveTo(cx - 4, R.y + 8).lineTo(cx, R.y).lineTo(cx + 4, R.y + 8).stroke() // head
  doc.font('Helvetica').fontSize(7).text('T  N', cx - 8, R.y + R.height + 2)
  doc.restore()
}

function drawApprovedBox(doc) {
  const R = REGIONS.approved
  doc.save().rect(R.x, R.y, R.width, R.height).stroke()
  doc.font('Helvetica').fontSize(7)
  doc.text('Approved', R.x + 8, R.y + 6)
  doc.text('for Surveyor-General', R.x + 8, R.y + 22)
  doc.text('Date ....................', R.x + 8, R.y + 34)
  doc.restore()
}

export async function generateDiagramPDF(options, logger) {
  const { parcels, metadata = {}, scale: requestedScale } = options
  const features = parcels?.features ?? []
  const subjectId = String(metadata.subjectParcelId ?? '')
  const subject = features.find((f) => String(f.properties?.id) === subjectId)
  if (!subject) {
    throw new Error(`Diagram: subject parcel not found (subjectParcelId=${subjectId})`)
  }
  const neighbours = features.filter((f) => f !== subject)

  const geometry = deriveSubjectGeometry(subject)
  const extent = parcelExtent(subject)
  const { denom, label } = pickDiagramScale(extent, REGIONS.figure, requestedScale)
  const tf = makeTransform(extent, REGIONS.figure, denom)

  const doc = new PDFDocument({ size: A4, margin: 0 })
  const bufferPromise = docToBuffer(doc)

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
  drawTable(doc, buildSidesTable(geometry), loLabel)
  drawBeaconDescription(doc, options.beacons)
  drawNorthArrow(doc)
  drawApprovedBox(doc)

  const pdfBuffer = await bufferPromise
  return { pdfBuffer, scale: label, sheetSize: 'A4' }
}
