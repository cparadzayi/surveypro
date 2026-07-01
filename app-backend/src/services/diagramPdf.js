import PDFDocument from 'pdfkit'
import { deriveSubjectGeometry } from './diagram/subjectGeometry.js'
import { parcelExtent, pickDiagramScale, makeTransform } from './diagram/diagramScale.js'

// A4 portrait, points.
const A4 = [595.28, 841.89]
// Page regions (pt). Tasks 7–8 add table/reference regions above/below.
export const REGIONS = {
  figure: { x: 40, y: 250, width: 515, height: 360 },
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

  const pdfBuffer = await bufferPromise
  return { pdfBuffer, scale: label, sheetSize: 'A4' }
}
