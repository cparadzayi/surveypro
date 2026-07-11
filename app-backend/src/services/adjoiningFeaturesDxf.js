/**
 * DXF port of the general-plan adjoining-feature labelling (see
 * adjoiningFeatures.js for the PDF version and the design rationale). Pure: it
 * receives the DXF primitive emitters (addLine/addText) and geometry already in
 * DXF ground coordinates, so it has no DXF-string or module-state dependency and
 * is unit-testable.
 *
 * Role treatment (matches the PDF):
 *   road       – LABEL ONLY along the edge (no strip; roads are usually already
 *                drawn as named road-reserve parcels — and no burnt-sienna).
 *   servitude  – defined-width strip drawn as an OUTLINE quad (DXF is line art,
 *                not filled) plus a label along the edge.
 *   contiguous – short outward stubs at each endpoint plus an outward label.
 *
 * Lengths are supplied in ground units by the caller (converted from paper points
 * via ptToGround); a servitude's `widthM` is already a real ground width.
 */
import { edgeStrip } from './diagram/edgeStrip.js'
import { formatSI } from './diagram/numberFormat.js'
import { sideToEdgeIndex } from './adjoiningFeatures.js'

/** Approximate DXF TEXT width for centring (STYLE/entity width factor is 0.55). */
function textWidth(text, height) {
  return String(text).length * height * 0.55
}

/**
 * @param {Object} args
 * @param {(layer:string,x1:number,y1:number,x2:number,y2:number)=>void} args.addLine
 * @param {(layer:string,x:number,y:number,text:string,height:number,rotation:number,style?:string)=>void} args.addText
 * @param {Array<{x:number,y:number}>} args.ptRing  Subject ring in DXF ground coords, NOT closed.
 * @param {Array<{side:string,role:string,label?:string,widthM?:number}>} args.annotations
 * @param {{textHeight:number,stubLen:number,bandLen:number,standoff:number}} args.geo  Ground-unit lengths.
 * @param {string} args.servitudeLayer
 * @param {string} args.defaultLayer
 * @param {Object} [logger]
 */
export function emitSubjectAdjoiningFeaturesDxf({
  addLine, addText, ptRing, annotations, geo, servitudeLayer, defaultLayer,
}, logger) {
  if (!Array.isArray(annotations) || annotations.length === 0) return
  if (!Array.isArray(ptRing) || ptRing.length < 3) return
  const n = ptRing.length
  const { textHeight, stubLen, bandLen, standoff } = geo

  const cen = [
    ptRing.reduce((a, p) => a + p.x, 0) / n,
    ptRing.reduce((a, p) => a + p.y, 0) / n,
  ]

  for (const ann of annotations) {
    if (!ann || !ann.side || !ann.role) continue
    const i = sideToEdgeIndex(ann.side, n)
    if (i < 0) { logger?.warn?.(`[DXF-adjoining] side ${ann.side} not found on ${n}-vertex ring`); continue }

    const p1 = ptRing[i]
    const p2 = ptRing[(i + 1) % n]
    const a = [p1.x, p1.y]
    const b = [p2.x, p2.y]
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }

    // Outward unit normal (away from the centroid).
    const ex = p2.x - p1.x, ey = p2.y - p1.y
    const len = Math.hypot(ex, ey) || 1
    let perpX = -ey / len, perpY = ex / len
    if (perpX * (cen[0] - mid.x) + perpY * (cen[1] - mid.y) > 0) { perpX = -perpX; perpY = -perpY }

    // ── Strip / stub geometry ──
    if (ann.role === 'servitude' && ann.widthM > 0) {
      // Defined-width strip as an outline quad (edge + parallel offset).
      const q = edgeStrip(a, b, ann.widthM, cen)
      for (let k = 0; k < q.length; k++) {
        const s = q[k], t = q[(k + 1) % q.length]
        addLine(servitudeLayer, s[0], s[1], t[0], t[1])
      }
    } else if (ann.role === 'contiguous') {
      const st = edgeStrip(a, b, stubLen, cen) // st[3]=a+out, st[2]=b+out
      addLine(defaultLayer, a[0], a[1], st[3][0], st[3][1])
      addLine(defaultLayer, b[0], b[1], st[2][0], st[2][1])
    }

    // ── Label ──
    if (ann.label) {
      const labelText = ann.role === 'road' && ann.widthM > 0
        ? `${ann.label} ${formatSI(ann.widthM, 2)}m`
        : ann.label
      const lw = textWidth(labelText, textHeight)
      const layer = ann.role === 'servitude' ? servitudeLayer : defaultLayer

      if (ann.role === 'road' || ann.role === 'servitude') {
        // Read ALONG the edge, just outside the boundary (past the strip, if any).
        let angleDeg = Math.atan2(ey, ex) * 180 / Math.PI
        if (angleDeg > 90 || angleDeg < -90) angleDeg += 180 // keep text upright
        const stripW = ann.role === 'servitude' && ann.widthM > 0 ? ann.widthM : standoff
        const off = stripW + bandLen
        const cx = mid.x + perpX * off, cy = mid.y + perpY * off
        // Shift the baseline-left insertion back along the reading direction so the
        // text is centred on (cx, cy).
        const aRad = angleDeg * Math.PI / 180
        const ix = cx - Math.cos(aRad) * (lw / 2)
        const iy = cy - Math.sin(aRad) * (lw / 2)
        addText(layer, ix, iy, labelText, textHeight, angleDeg)
      } else {
        // Contiguous: horizontal outward label beyond the stub.
        const off = stubLen + bandLen * 0.5
        const cx = mid.x + perpX * off, cy = mid.y + perpY * off
        addText(defaultLayer, cx - lw / 2, cy - textHeight / 2, labelText, textHeight, 0)
      }
    }
  }
}
