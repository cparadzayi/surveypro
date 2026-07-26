/**
 * General-plan adjoining-feature labelling — roads, servitudes and contiguous
 * neighbours drawn against a subject boundary. This ports the diagram's
 * drawAdjoiningFeatures (diagramPdf.js) into a standalone, coordinate-agnostic
 * renderer so the GENERAL PLAN can carry the same annotations.
 *
 * The one deliberate difference from the diagram: on general plans a ROAD is
 * NOT filled burnt-sienna — roads are usually already drawn as named road-reserve
 * parcels, so we only add the road name (reading along the edge). Servitudes keep
 * the blue defined-width strip; contiguous neighbours keep the dashed outward
 * stubs. See SurveyPlanMapView's side-annotation picker for how a surveyor tags
 * a boundary side (letters are assigned by ring index, matching letterAt below).
 *
 * Inputs are already in the target device space (PDF points). The caller
 * transforms each subject ring before calling, so this module never touches the
 * CRS/extent machinery.
 */
import { edgeStrip } from './diagram/edgeStrip.js'
import { contiguousMarks } from './diagram/contiguousMarks.js'
import { formatSI } from './diagram/numberFormat.js'

const PT_PER_MM = 72 / 25.4
const SERVITUDE_BLUE = '#1F6FB2'
const STRIP_FILL_OPACITY = 0.6            // colour must not obscure detail
const CONTIG_STUB_PT = 6 * PT_PER_MM      // dashed outward stub length
const ROAD_LABEL_STANDOFF_PT = 1.3 * PT_PER_MM  // push the road name just off the edge
const LABEL_BAND_PT = 12                  // clear the boundary's vertex/beacon labels
const CONTIG_LABEL_OFF_PT = CONTIG_STUB_PT + 6  // horizontal label beyond the stub
// Match the stand (parcel) number font for a uniform look on the sheet. The PDF
// stand-label placer renders a normal parcel's number at 11 pt (pdfkitLabeling
// analyzeParcelGeom), so road/servitude/contiguous labels use the same size.
const LABEL_FONT_PT = 11

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** A..Z then AA, AB… — mirrors the frontend sideAnnotations.letterAt() and the
 *  backend diagram subjectGeometry.letterAt(), so side keys like 'AB' resolve to
 *  the same ring edge everywhere. */
export function letterAt(i) {
  if (i < 26) return LETTERS[i]
  return LETTERS[Math.floor(i / 26) - 1] + LETTERS[i % 26]
}

/** Resolve a side key (e.g. 'AB') to the ring edge index [i, i+1], or -1. */
export function sideToEdgeIndex(side, n) {
  for (let k = 0; k < n; k++) {
    if (letterAt(k) + letterAt((k + 1) % n) === side) return k
  }
  return -1
}

/**
 * Draw the adjoining features for ONE subject boundary.
 *
 * @param {PDFDocument} doc
 * @param {Object} args
 * @param {Array<{x:number,y:number}>} args.ptRing  Subject ring in PDF points, NOT
 *        closed (no repeated first/last vertex). Vertex order must match the ring
 *        the side letters were assigned against.
 * @param {Array<{side:string,role:string,label?:string,widthM?:number}>} args.annotations
 * @param {number} args.ptPerGroundM  PDF points per ground metre (for servitude width).
 * @param {Object} [logger]
 */
export function drawSubjectAdjoiningFeatures(doc, { ptRing, annotations, ptPerGroundM }, logger) {
  if (!Array.isArray(annotations) || annotations.length === 0) return
  if (!Array.isArray(ptRing) || ptRing.length < 3) return
  const n = ptRing.length

  // Subject centroid (vertex mean) — the outward direction reference for strips
  // and labels. Same convention edgeStrip expects.
  const cen = [
    ptRing.reduce((a, p) => a + p.x, 0) / n,
    ptRing.reduce((a, p) => a + p.y, 0) / n,
  ]

  for (const ann of annotations) {
    if (!ann || !ann.side || !ann.role) continue
    const i = sideToEdgeIndex(ann.side, n)
    if (i < 0) { logger?.warn?.(`[GP-adjoining] side ${ann.side} not found on ${n}-vertex ring`); continue }

    const p1 = ptRing[i]
    const p2 = ptRing[(i + 1) % n]
    const a = [p1.x, p1.y]
    const b = [p2.x, p2.y]
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }

    // ── Strip / stub geometry ──
    // Roads: NO strip on general plans (label only). Servitude: blue defined-width
    // strip. Contiguous: dashed outward stubs at each endpoint.
    if (ann.role === 'servitude' && ann.widthM > 0) {
      const widthPt = ann.widthM * ptPerGroundM
      const q = edgeStrip(a, b, widthPt, cen)
      doc.save().fillColor(SERVITUDE_BLUE).fillOpacity(STRIP_FILL_OPACITY)
      doc.moveTo(q[0][0], q[0][1])
      for (let k = 1; k < q.length; k++) doc.lineTo(q[k][0], q[k][1])
      doc.closePath().fill()
      doc.restore()
    } else if (ann.role === 'contiguous') {
      const marks = contiguousMarks(a, b, ann.end)
      const st = edgeStrip(a, b, CONTIG_STUB_PT, cen) // st[3]=a+out, st[2]=b+out
      doc.save().dash(3, { space: 2 }).lineWidth(0.6).strokeColor('#000000')
      if (marks.stubFrom) doc.moveTo(a[0], a[1]).lineTo(st[3][0], st[3][1]).stroke()
      if (marks.stubTo) doc.moveTo(b[0], b[1]).lineTo(st[2][0], st[2][1]).stroke()
      doc.undash().restore()
    }

    // ── Label ──
    if (ann.label) {
      doc.save().font('Helvetica').fontSize(LABEL_FONT_PT).fillColor('#000000')
      const labelText = ann.role === 'road' && ann.widthM > 0
        ? `${ann.label} ${formatSI(ann.widthM, 2)}m`
        : ann.label
      const labelW = doc.widthOfString(labelText)

      // Outward unit normal (away from the centroid).
      const ex = p2.x - p1.x, ey = p2.y - p1.y
      const len = Math.hypot(ex, ey) || 1
      let perpX = -ey / len, perpY = ex / len
      if (perpX * (cen[0] - mid.x) + perpY * (cen[1] - mid.y) > 0) { perpX = -perpX; perpY = -perpY }

      if (ann.role === 'road' || ann.role === 'servitude') {
        // Read ALONG the edge, just outside the boundary (past the strip, if any).
        let angleDeg = Math.atan2(ey, ex) * 180 / Math.PI
        if (angleDeg > 90 || angleDeg < -90) angleDeg += 180 // keep text upright
        const stripPt = ann.role === 'servitude' && ann.widthM > 0
          ? ann.widthM * ptPerGroundM
          : ROAD_LABEL_STANDOFF_PT
        const off = stripPt + LABEL_BAND_PT
        const lx = mid.x + perpX * off, ly = mid.y + perpY * off
        doc.rotate(angleDeg, { origin: [lx, ly] })
        doc.text(labelText, lx - labelW / 2, ly - LABEL_FONT_PT / 2, { lineBreak: false })
      } else {
        // Contiguous: horizontal outward label beyond the dashed stub, centred on the
        // abutting extent (whole side, or the tagged half).
        const m = contiguousMarks([p1.x, p1.y], [p2.x, p2.y], ann.end)
        const off = CONTIG_LABEL_OFF_PT
        const lx = m.labelAnchor[0] + perpX * off, ly = m.labelAnchor[1] + perpY * off
        doc.text(labelText, lx - labelW / 2, ly - LABEL_FONT_PT / 2, { lineBreak: false })
      }
      doc.restore()
    }
  }
}
